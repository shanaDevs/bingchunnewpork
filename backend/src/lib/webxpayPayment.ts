import crypto, { type KeyObject } from 'crypto';
import { prisma } from './prisma';
import { getPaymentSettings, isValidWebXPayCredentials } from './paymentSettings';
import { AppError } from '../middleware/errorHandler';
import { cancelOrderOnPaymentFailure } from './orderSchema';
import { markOnlineOrderPaid } from './onlineOrderPayment';
import { logger } from '../utils/logger';

export type OnlineGateway = 'PAYHERE' | 'WEBXPAY';

/** Fixed RSA PKCS#1 encryption mechanism identifier from WebXPay redirect integration docs. */
export const WEBXPAY_ENC_METHOD = 'JCs3J+6oSz4V0LgE0zi/Bg==';

export interface WebXPayCheckoutFields {
  action: string;
  fields: Record<string, string>;
}

export interface WebXPayReturnInput {
  payment?: string;
  signature?: string;
  custom_fields?: string;
}

export type WebXPayProcessResult = 'PAID' | 'FAILED' | 'INVALID';

export interface WebXPayDecryptedPayment {
  orderId: string;
  reference: string;
  timestamp: string;
  statusCode: string;
  comment: string;
  gatewayUsed: string;
}

function normalizePublicKey(raw: string): string {
  let key = raw.trim();
  key = key.replace(/^["']|["']$/g, '');
  key = key.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  key = key.replace(/\r\n/g, '\n');

  if (key.includes('BEGIN PUBLIC KEY') || key.includes('BEGIN RSA PUBLIC KEY')) {
    return key.trim();
  }

  const body = key.replace(/\s+/g, '');
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

function formatWebXPayAmount(amount: number): string {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return normalized.toFixed(2);
}

export function encryptWebXPayPayment(publicKeyPem: string, orderNumber: string, amount: number): string {
  const plaintext = `${orderNumber}|${formatWebXPayAmount(amount)}`;
  const keyPem = normalizePublicKey(publicKeyPem);

  let keyObject: KeyObject;
  try {
    keyObject = crypto.createPublicKey(keyPem);
  } catch {
    throw new AppError(
      'WebXPay public key is invalid. Paste the full PEM block from Dashboard → Settings → Integration Information.',
      400,
    );
  }

  try {
    const encrypted = crypto.publicEncrypt(
      { key: keyObject, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(plaintext, 'utf8'),
    );
    return encrypted.toString('base64');
  } catch {
    throw new AppError('Failed to encrypt WebXPay payment payload. Check your public key.', 400);
  }
}

function normalizeWebXPayBase64(value: string): string {
  let normalized = value.trim();
  try {
    if (normalized.includes('%')) normalized = decodeURIComponent(normalized);
  } catch {
    /* keep original */
  }
  // application/x-www-form-urlencoded turns '+' into spaces in base64 payloads
  return normalized.replace(/ /g, '+');
}

function decodeWebXPayReturnPayment(publicKeyPem: string, encoded: string): string | null {
  const normalized = normalizeWebXPayBase64(encoded);

  // Official php-response callback: payment is base64(plaintext), not RSA-encrypted.
  try {
    const plain = Buffer.from(normalized, 'base64').toString('utf8');
    if (plain.includes('|') && plain.split('|').length >= 6) {
      return plain;
    }
  } catch {
    /* fall through */
  }

  // Some doc versions describe RSA-encrypted payment blobs on return.
  return decryptWithPublicKey(publicKeyPem, normalized);
}

function decryptWithPublicKey(publicKeyPem: string, encoded: string): string | null {
  try {
    const keyObject = crypto.createPublicKey(normalizePublicKey(publicKeyPem));
    const decrypted = crypto.publicDecrypt(
      { key: keyObject, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(normalizeWebXPayBase64(encoded), 'base64'),
    );
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function parseWebXPayPaymentPayload(decrypted: string): WebXPayDecryptedPayment | null {
  const parts = decrypted.split('|');
  if (parts.length < 6) return null;

  const p3 = parts[3].trim();
  const p4 = parts[4].trim();
  const p3Num = /^\d+$/.test(p3);
  const p4Num = /^\d+$/.test(p4);

  // php-response sample: order|ref|time|gateway|status|comment
  if (p3Num && p4Num) {
    return {
      orderId: parts[0],
      reference: parts[1],
      timestamp: parts[2],
      gatewayUsed: parts[3],
      statusCode: parts[4],
      comment: parts[5],
    };
  }

  // redirect guide: order|ref|time|status|comment|gateway
  return {
    orderId: parts[0],
    reference: parts[1],
    timestamp: parts[2],
    statusCode: parts[3],
    comment: parts[4],
    gatewayUsed: parts[5],
  };
}

export function isWebXPaySuccessStatus(statusCode: string): boolean {
  return statusCode === '0' || statusCode === '00';
}

export function formatWebXPayFailureMessage(payload: WebXPayDecryptedPayment): string {
  const comment = payload.comment?.trim();
  if (comment && comment !== payload.statusCode) return comment;

  const code = payload.statusCode?.trim();
  if (code === '15') return 'No such issuer — check your card details or try another card';
  if (code && code !== '0' && code !== '00') return `Payment declined (code ${code})`;
  return 'Payment was declined by the bank';
}

export function verifyWebXPayReturn(
  input: WebXPayReturnInput,
  publicKeyPem: string,
): { valid: boolean; payload: WebXPayDecryptedPayment | null } {
  if (!input.payment || !input.signature) {
    return { valid: false, payload: null };
  }

  const paymentPlain = decodeWebXPayReturnPayment(publicKeyPem, input.payment);
  const signaturePlain = decryptWithPublicKey(publicKeyPem, input.signature);
  if (!paymentPlain || !signaturePlain) {
    return { valid: false, payload: null };
  }

  if (paymentPlain !== signaturePlain) {
    return { valid: false, payload: null };
  }

  return { valid: true, payload: parseWebXPayPaymentPayload(paymentPlain) };
}

export function webxpayBillingUrl(mode: 'sandbox' | 'live'): string {
  return mode === 'live'
    ? 'https://webxpay.com/index.php?route=checkout/billing'
    : 'https://stagingxpay.info/index.php?route=checkout/billing';
}

/** CSP form-action allowlist for WebXPay checkout redirect pages served by this API. */
export const WEBXPAY_FORM_ACTIONS = [
  webxpayBillingUrl('sandbox'),
  webxpayBillingUrl('live'),
] as const;

export function buildWebXPayCheckoutFields(input: {
  publicKey: string;
  secretKey: string;
  mode: 'sandbox' | 'live';
  orderNumber: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address?: string;
  city?: string;
}): WebXPayCheckoutFields {
  const nameParts = input.customerName.trim().split(/\s+/);
  const firstName = (nameParts[0] || 'Customer').slice(0, 30);
  const lastName = (nameParts.slice(1).join(' ') || 'Guest').slice(0, 30);
  const phone = input.customerPhone.replace(/[^\d+]/g, '').slice(0, 20) || '0770000000';

  return {
    action: webxpayBillingUrl(input.mode),
    fields: {
      first_name: firstName,
      last_name: lastName,
      email: input.customerEmail || 'customer@bingchun.lk',
      contact_number: phone,
      address_line_one: input.address || 'Colombo',
      address_line_two: '',
      city: input.city || 'Colombo',
      state: 'Western',
      postal_code: '10300',
      country: 'Sri Lanka',
      process_currency: 'LKR',
      payment_gateway_id: '',
      multiple_payment_gateway_ids: '',
      cms: 'PHP',
      custom_fields: '',
      enc_method: WEBXPAY_ENC_METHOD,
      secret_key: input.secretKey,
      payment: encryptWebXPayPayment(input.publicKey, input.orderNumber, input.amount),
    },
  };
}

export async function lockOnlineChargeAmount(orderId: string, amount: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "orders" SET "onlineChargeAmount" = ${amount} WHERE "id" = ${orderId}
  `;
}

export async function readOnlineChargeAmount(orderId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ onlineChargeAmount: number | null }>>`
    SELECT "onlineChargeAmount" FROM "orders" WHERE "id" = ${orderId}
  `;
  const value = rows[0]?.onlineChargeAmount;
  return value == null ? null : Number(value);
}

export async function processWebXPayReturn(input: WebXPayReturnInput): Promise<WebXPayProcessResult> {
  const settings = await getPaymentSettings();
  if (!isValidWebXPayCredentials(settings.webxpay.publicKey, settings.webxpay.secretKey)) {
    throw new AppError('Online payment is not configured', 503);
  }

  const { valid, payload } = verifyWebXPayReturn(input, settings.webxpay.publicKey);
  if (!valid || !payload) return 'INVALID';

  const order = await prisma.order.findFirst({
    where: { orderNumber: payload.orderId },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      userId: true,
      orderMode: true,
    },
  });

  if (!order) return 'INVALID';
  if (order.paymentStatus === 'PAID') return 'PAID';

  const lockedAmount = await readOnlineChargeAmount(order.id);
  if (lockedAmount == null || lockedAmount !== order.total) {
    logger.warn('WebXPay return rejected: locked charge amount does not match the order total', {
      orderNumber: order.orderNumber,
      onlineChargeAmount: lockedAmount,
      orderTotal: order.total,
    });
    return 'INVALID';
  }

  if (!isWebXPaySuccessStatus(payload.statusCode)) {
    await cancelOrderOnPaymentFailure(order.id, formatWebXPayFailureMessage(payload));
    return 'FAILED';
  }

  await markOnlineOrderPaid(order, { paymentRef: payload.reference || null });
  return 'PAID';
}
