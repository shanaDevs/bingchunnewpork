import { config } from '../config';
import { logger } from '../utils/logger';

export interface SmsPayload {
  to: string;
  message: string;
}

interface SmsAdapter {
  send(payload: SmsPayload): Promise<void>;
}

const SMS_MAX_CHARS = 1500;

/** Cap concurrent SmsLenz HTTP calls (burst of 1000+ must queue, not fire at once). */
const SMS_OUTBOUND_MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.SMS_OUTBOUND_MAX_CONCURRENT || '2', 10) || 2,
);
/** Minimum gap between starting outbound SMS requests. */
const SMS_OUTBOUND_MIN_INTERVAL_MS = Math.max(
  0,
  parseInt(process.env.SMS_OUTBOUND_MIN_INTERVAL_MS || '200', 10) || 200,
);
/** Retries on gateway rate-limit / transient failures. */
const SMS_OUTBOUND_MAX_RETRIES = Math.max(
  0,
  parseInt(process.env.SMS_OUTBOUND_MAX_RETRIES || '5', 10) || 5,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSmsRateLimitedError(err: unknown): boolean {
  const detail = err instanceof Error ? err.message : String(err);
  return /too many|rate.?limit|429|throttl|slow down|try again/i.test(detail);
}

function isSmsTransientError(err: unknown): boolean {
  if (isSmsRateLimitedError(err)) return true;
  const detail = err instanceof Error ? err.message : String(err);
  return /timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|HTTP 5\d\d/i.test(detail);
}

/**
 * Process-wide SMS outbound gate: serializes/pace sends so a burst of 1000+
 * messages is drained at a SmsLenz-safe rate instead of all in one second.
 */
class SmsOutboundGate {
  private active = 0;
  private lastStartedAt = 0;
  private readonly waiters: Array<() => void> = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryStart = () => {
        if (this.active >= SMS_OUTBOUND_MAX_CONCURRENT) {
          this.waiters.push(tryStart);
          return;
        }
        const waitMs = Math.max(0, SMS_OUTBOUND_MIN_INTERVAL_MS - (Date.now() - this.lastStartedAt));
        if (waitMs > 0) {
          setTimeout(() => {
            if (this.active >= SMS_OUTBOUND_MAX_CONCURRENT) {
              this.waiters.push(tryStart);
              return;
            }
            this.active += 1;
            this.lastStartedAt = Date.now();
            resolve();
          }, waitMs);
          return;
        }
        this.active += 1;
        this.lastStartedAt = Date.now();
        resolve();
      };
      tryStart();
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

const smsOutboundGate = new SmsOutboundGate();

async function sendWithRetry(adapter: SmsAdapter, payload: SmsPayload): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await smsOutboundGate.run(() => adapter.send(payload));
      return;
    } catch (err) {
      if (attempt >= SMS_OUTBOUND_MAX_RETRIES || !isSmsTransientError(err)) throw err;
      attempt += 1;
      const backoffMs = Math.min(30_000, SMS_OUTBOUND_MIN_INTERVAL_MS * 2 ** attempt);
      logger.warn('SMS send retrying after transient failure', {
        to: payload.to,
        attempt,
        backoffMs,
        detail: err instanceof Error ? err.message : String(err),
      });
      await sleep(backoffMs);
    }
  }
}

/** SMSlenz requires E.164 Sri Lankan numbers, e.g. +94771234567. */
export function toSmsLenzContact(phone: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+94${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `+94${digits}`;
  return null;
}

export function orderSmsPhone(order: {
  guestPhone?: string | null;
  user?: { phone?: string | null } | null;
}): string | null {
  const phone = order.guestPhone || order.user?.phone || null;
  return phone?.trim() || null;
}

function orderTrackUrl(orderNumber: string): string {
  return `${config.frontendUrl.replace(/\/$/, '')}/track/${orderNumber}`;
}

function formatLkr(amount: number): string {
  return Math.round(amount).toLocaleString('en-LK');
}

function truncateSms(message: string): string {
  if (message.length <= SMS_MAX_CHARS) return message;
  return message.slice(0, SMS_MAX_CHARS - 1) + '…';
}

class MockSmsAdapter implements SmsAdapter {
  async send(payload: SmsPayload) {
    await new Promise((r) => setTimeout(r, 200));
    logger.info(`[SMS MOCK] To: ${payload.to} | Message: ${payload.message}`);
  }
}

class DialogAxiataSmsAdapter implements SmsAdapter {
  async send(payload: SmsPayload) {
    logger.info(`[SMS] Sending to ${payload.to}`);
    throw new Error('Dialog SMS not yet configured');
  }
}

interface SmsLenzResponse {
  success?: boolean;
  message?: string;
  data?: { status?: string; campaign_id?: number };
}

export type SmsLenzSendConfig = {
  baseUrl: string;
  userId: string;
  apiKey: string;
  senderId: string;
  connectionTimeoutMs: number;
  readTimeoutMs: number;
};

export class SmsLenzSmsAdapter implements SmsAdapter {
  constructor(
    private readonly httpFetch: typeof fetch = fetch,
    private readonly runtime?: SmsLenzSendConfig,
  ) {}

  async send(payload: SmsPayload) {
    const contact = toSmsLenzContact(payload.to);
    if (!contact) {
      throw new Error(`Invalid SMS recipient number: ${payload.to}`);
    }

    const creds = this.runtime ?? (await resolveSmsLenzCreds());
    if (!creds.userId || !creds.apiKey || !creds.senderId) {
      throw new Error('SMSlenz is not configured (user id, api key, and sender id are required)');
    }

    const url = `${creds.baseUrl.replace(/\/$/, '')}/api/send-sms`;
    const timeoutMs = Math.max(1, creds.connectionTimeoutMs) + Math.max(0, creds.readTimeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await this.httpFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          user_id: String(creds.userId),
          api_key: creds.apiKey,
          sender_id: creds.senderId,
          contact,
          message: truncateSms(payload.message),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`SMSlenz request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    let body: SmsLenzResponse = {};
    try {
      body = raw ? (JSON.parse(raw) as SmsLenzResponse) : {};
    } catch {
      body = { message: raw };
    }

    if (!res.ok || body.success === false) {
      const detail = body.message || raw || `HTTP ${res.status}`;
      if (res.status === 429 || /too many|rate.?limit|throttl/i.test(detail)) {
        throw new Error(`SMSlenz send failed: too many requests (${detail})`);
      }
      throw new Error(`SMSlenz send failed: ${detail}`);
    }

    logger.info(`[SMS] SMSlenz accepted message to ${contact}`, {
      campaignId: body.data?.campaign_id,
    });
  }
}

async function resolveSmsLenzCreds(): Promise<SmsLenzSendConfig> {
  const { getSmsRuntimeConfig } = await import('../lib/smsSettings');
  const runtime = await getSmsRuntimeConfig();
  return {
    baseUrl: runtime.baseUrl,
    userId: runtime.userId,
    apiKey: runtime.apiKey,
    senderId: runtime.senderId,
    connectionTimeoutMs: runtime.connectionTimeoutMs,
    readTimeoutMs: runtime.readTimeoutMs,
  };
}

class RoutingSmsAdapter implements SmsAdapter {
  private readonly live = new SmsLenzSmsAdapter();
  private readonly mock = new MockSmsAdapter();
  private readonly dialog = new DialogAxiataSmsAdapter();

  async send(payload: SmsPayload) {
    if (process.env.NODE_ENV === 'test' && process.env.SMSLENZ_ALLOW_TEST_SEND !== 'true') {
      return this.mock.send(payload);
    }
    const { getSmsRuntimeConfig } = await import('../lib/smsSettings');
    const runtime = await getSmsRuntimeConfig();
    if (!runtime.enabled || runtime.provider === 'mock') {
      return sendWithRetry(this.mock, payload);
    }
    if (runtime.provider === 'dialog') {
      return sendWithRetry(this.dialog, payload);
    }
    return sendWithRetry(this.live, payload);
  }
}

function createSmsAdapter(): SmsAdapter {
  return new RoutingSmsAdapter();
}

export const smsAdapter = createSmsAdapter();

/** @param _appSignature Ignored; kept so mobile clients can send it without API churn. */
export async function sendOtp(phone: string, code: string, _appSignature?: string) {
  try {
    await smsAdapter.send({
      to: phone,
      message: `Your Bing Chun verification code is: ${code}. Valid for 10 minutes.`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error('OTP SMS send failed', { phone, detail });
    // Avoid opaque 500s on the public /api/auth/otp/request path.
    const { AppError } = await import('../middleware/errorHandler');
    if (/insufficient|credit|balance/i.test(detail)) {
      throw new AppError(
        'SMS service is temporarily unavailable. Please try again later.',
        503,
        'SMS_CREDIT_EXHAUSTED',
      );
    }
    throw new AppError(
      'Failed to send verification code. Please try again later.',
      503,
      'SMS_SEND_FAILED',
    );
  }
}

export async function sendDeliveryCodeSms(phone: string, orderNumber: string, code: string) {
  await smsAdapter.send({
    to: phone,
    message: `Your Bing Chun delivery code for order #${orderNumber} is: ${code}. Give it to the rider on arrival.`,
  });
}

export type DeliveryStartedSmsDriver = {
  name: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  vehicleColor?: string | null;
};

/** Rider picked up at branch and started the run — includes delivery PIN + vehicle details. */
export async function sendDeliveryStartedSms(
  phone: string,
  orderNumber: string,
  code: string,
  driver: DeliveryStartedSmsDriver,
) {
  const vehicleBits = [driver.vehicleColor, driver.vehicleType, driver.vehicleNumber]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
  const vehiclePart = vehicleBits.length ? ` Vehicle: ${vehicleBits.join(' ')}.` : '';
  const telPart = driver.phone?.trim() ? ` Rider phone: ${driver.phone.trim()}.` : '';
  await smsAdapter.send({
    to: phone,
    message: `Bing Chun: rider picked up order #${orderNumber} from the branch and is on the way. Delivery PIN: ${code}. Rider: ${driver.name}.${vehiclePart}${telPart} Track: ${orderTrackUrl(orderNumber)}`,
  });
}

export async function sendOrderConfirmationSms(phone: string, orderNumber: string, eta: number, total?: number) {
  const totalPart = total != null ? ` Total LKR ${formatLkr(total)}.` : '';
  await smsAdapter.send({
    to: phone,
    message: `Bing Chun: order #${orderNumber} confirmed.${totalPart} Est. ${eta} min. Track: ${orderTrackUrl(orderNumber)}`,
  });
}

export async function sendOrderReceiptSms(phone: string, orderNumber: string, total: number, eta?: number | null) {
  const etaPart = eta != null ? ` Est. ${eta} min.` : '';
  await smsAdapter.send({
    to: phone,
    message: `Bing Chun: payment received for order #${orderNumber}. Total LKR ${formatLkr(total)}.${etaPart} Track: ${orderTrackUrl(orderNumber)}`,
  });
}

/**
 * Status SMS — takeaway READY, and delivery DELIVERED after customer verification.
 * Delivery OUT_FOR_DELIVERY is sent via sendDeliveryStartedSms (PIN + rider details) from the OTP/start-run path.
 */
export async function sendOrderStatusSms(
  phone: string,
  orderNumber: string,
  status: string,
  orderMode?: string,
  opts?: { nextOfferHint?: string | null },
) {
  let message: string | null = null;
  const track = orderTrackUrl(orderNumber);
  const nextHint = opts?.nextOfferHint?.trim();
  const encourage = nextHint
    ? ` ${nextHint}`
    : ' Thanks for choosing Bing Chun — see you on your next order!';

  if (status === 'READY' && orderMode !== 'DELIVERY') {
    message = `Bing Chun: order #${orderNumber} is ready for pickup. Track: ${track}`;
  }
  if (status === 'DELIVERED' && orderMode === 'DELIVERY') {
    message = `Bing Chun: order #${orderNumber} has been delivered. Receipt: ${track}.${encourage}`;
  }
  if (status === 'DELIVERED' && orderMode !== 'DELIVERY') {
    message = `Bing Chun: order #${orderNumber} pickup complete. Receipt: ${track}.${encourage}`;
  }
  if (!message) return;
  await smsAdapter.send({ to: phone, message: truncateSms(message) });
}
