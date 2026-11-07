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
    if (!runtime.enabled || runtime.provider === 'mock') return this.mock.send(payload);
    if (runtime.provider === 'dialog') return this.dialog.send(payload);
    return this.live.send(payload);
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
