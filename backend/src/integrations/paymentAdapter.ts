import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  getPaymentSettings,
  isValidPayHereCredentials,
  isValidWebXPayCredentials,
} from '../lib/paymentSettings';
import { webxpayCheckoutPageUrl } from '../lib/payhereUrls';
import { AppError } from '../middleware/errorHandler';

export interface PaymentInitParams {
  orderId: string;
  orderNumber: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  itemDescription: string;
  address?: string;
  city?: string;
}

export interface PayHereCheckoutSession {
  sandbox: boolean;
  merchant_id: string;
  /** Omit or undefined for PayHere popup (onsite) checkout */
  return_url?: string;
  cancel_url?: string;
  notify_url: string;
  order_id: string;
  items: string;
  amount: string;
  currency: string;
  hash: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
}

export interface PaymentInitResult {
  paymentUrl: string;
  paymentId: string;
  payhere?: PayHereCheckoutSession;
  webxpay?: { action: string; fields: Record<string, string> };
}

interface PaymentAdapter {
  initiate(params: PaymentInitParams): Promise<PaymentInitResult>;
  verify(paymentId: string, signature: string): boolean;
  verifyNotifyHash(
    merchantId: string,
    orderId: string,
    amount: string,
    currency: string,
    statusCode: string,
    md5sig: string,
    merchantSecret: string
  ): boolean;
}

export function generatePayHereHash(
  merchantId: string,
  orderId: string,
  amount: number,
  currency: string,
  merchantSecret: string
): string {
  const formatted = amount.toFixed(2);
  const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  return crypto
    .createHash('md5')
    .update(`${merchantId}${orderId}${formatted}${currency}${secretHash}`)
    .digest('hex')
    .toUpperCase();
}

export interface PayHereCheckoutFields {
  sandbox: boolean;
  action: string;
  fields: Record<string, string>;
}

/** Build PayHere Checkout POST fields (shared by adapter + redirect page). */
export function buildPayHereCheckoutFields(input: {
  merchantId: string;
  merchantSecret: string;
  sandbox: boolean;
  orderNumber: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  itemDescription: string;
  address?: string;
  city?: string;
}): PayHereCheckoutFields {
  const currency = 'LKR';
  const amount = input.amount.toFixed(2);
  const hash = generatePayHereHash(
    input.merchantId,
    input.orderNumber,
    input.amount,
    currency,
    input.merchantSecret
  );
  const nameParts = input.customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || 'Guest';

  return {
    sandbox: input.sandbox,
    action: input.sandbox
      ? 'https://sandbox.payhere.lk/pay/checkout'
      : 'https://www.payhere.lk/pay/checkout',
    fields: {
      merchant_id: input.merchantId,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      notify_url: input.notifyUrl,
      order_id: input.orderNumber,
      items: input.itemDescription,
      currency,
      amount,
      hash,
      first_name: firstName,
      last_name: lastName,
      email: input.customerEmail || 'customer@bingchun.lk',
      phone: input.customerPhone.replace(/\D/g, '').slice(0, 15) || '0770000000',
      address: input.address || 'Colombo',
      city: input.city || 'Colombo',
      country: 'Sri Lanka',
    },
  };
}

class MockPaymentAdapter implements PaymentAdapter {
  async initiate(params: PaymentInitParams): Promise<PaymentInitResult> {
    await new Promise((r) => setTimeout(r, 300));
    const paymentId = `mock_pay_${Date.now()}`;
    logger.info(`[PAYMENT MOCK] Initiated for order ${params.orderNumber}: LKR ${params.amount}`);
    return {
      paymentId,
      paymentUrl: `${config.frontendUrl}/mock-payment?orderId=${params.orderId}&orderNumber=${encodeURIComponent(params.orderNumber)}&paymentId=${paymentId}&amount=${params.amount}&returnUrl=${encodeURIComponent(params.returnUrl)}`,
    };
  }

  verify(): boolean {
    return true;
  }

  verifyNotifyHash(): boolean {
    return true;
  }
}

class PayHereAdapter implements PaymentAdapter {
  async initiate(params: PaymentInitParams): Promise<PaymentInitResult> {
    const settings = await getPaymentSettings();
    const merchantId = settings.payhere.merchantId || process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = settings.payhere.merchantSecret || process.env.PAYHERE_MERCHANT_SECRET;
    const sandbox = settings.payhere.mode !== 'live';
    const paymentId = `ph_${Date.now()}`;
    const amountStr = params.amount.toFixed(2);
    const currency = 'LKR';
    // PayHere order_id must match hash; use human-readable order number
    const payhereOrderId = params.orderNumber;
    const hash = generatePayHereHash(
      merchantId,
      payhereOrderId,
      params.amount,
      currency,
      merchantSecret
    );

    const nameParts = params.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'Guest';

    // Popup checkout: return_url / cancel_url must be undefined (PayHere docs)
    const payhere: PayHereCheckoutSession = {
      sandbox,
      merchant_id: merchantId,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      notify_url: params.notifyUrl,
      order_id: payhereOrderId,
      items: params.itemDescription,
      amount: amountStr,
      currency,
      hash,
      first_name: firstName,
      last_name: lastName,
      email: params.customerEmail || 'customer@bingchun.lk',
      phone: params.customerPhone.replace(/\D/g, '').slice(0, 15) || '0770000000',
      address: params.address || 'Colombo',
      city: params.city || 'Colombo',
      country: 'Sri Lanka',
    };

    const base = sandbox ? 'https://sandbox.payhere.lk' : 'https://www.payhere.lk';
    const qs = new URLSearchParams({
      merchant_id: merchantId,
      order_id: payhereOrderId,
      items: params.itemDescription,
      currency,
      amount: amountStr,
      first_name: firstName,
      last_name: lastName,
      email: payhere.email,
      phone: payhere.phone,
      address: payhere.address,
      city: payhere.city,
      country: payhere.country,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      notify_url: params.notifyUrl,
      hash,
    });

    return {
      paymentId,
      paymentUrl: `${base}/pay/checkout?${qs.toString()}`,
      payhere,
    };
  }

  verify(paymentId: string, signature: string): boolean {
    logger.info(`[PAYHERE] Verify payment ${paymentId}`);
    return Boolean(signature);
  }

  verifyNotifyHash(
    merchantId: string,
    orderId: string,
    amount: string,
    currency: string,
    statusCode: string,
    md5sig: string,
    merchantSecret: string
  ): boolean {
    const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const sig = String(md5sig).toUpperCase();
    const candidates = new Set<string>([amount]);
    const parsed = parseFloat(amount);
    if (!Number.isNaN(parsed)) {
      candidates.add(parsed.toFixed(2));
      if (Number.isInteger(parsed)) candidates.add(String(Math.trunc(parsed)));
    }

    for (const amt of candidates) {
      const local = crypto
        .createHash('md5')
        .update(`${merchantId}${orderId}${amt}${currency}${statusCode}${secretHash}`)
        .digest('hex')
        .toUpperCase();
      if (local === sig) return true;
    }
    return false;
  }
}

class WebXPayAdapter implements PaymentAdapter {
  async initiate(params: PaymentInitParams): Promise<PaymentInitResult> {
    const paymentId = `wxp_${Date.now()}`;
    return {
      paymentId,
      paymentUrl: webxpayCheckoutPageUrl(params.orderNumber),
    };
  }

  verify(): boolean {
    return true;
  }

  verifyNotifyHash(): boolean {
    return true;
  }
}

function createPaymentAdapter(): PaymentAdapter {
  return new PayHereAdapter();
}

let adapterInstance: PaymentAdapter | null = null;

export async function getPaymentAdapter(forOnline = false): Promise<PaymentAdapter> {
  const settings = await getPaymentSettings();
  const gateway = settings.activeOnlineGateway;

  if (gateway === 'WEBXPAY') {
    const valid = isValidWebXPayCredentials(settings.webxpay.publicKey, settings.webxpay.secretKey);
    if (forOnline && !valid) {
      throw new AppError(
        'Online payment is not configured. Add your Public Key and Secret Key in Admin → Settings.',
        400,
      );
    }
    if (valid) return new WebXPayAdapter();
    return new MockPaymentAdapter();
  }

  const valid = isValidPayHereCredentials(
    settings.payhere.merchantId,
    settings.payhere.merchantSecret,
  );

  if (forOnline && !valid) {
    throw new AppError(
      'Online payment is not configured. Add your sandbox Merchant ID and Secret in Admin → Settings (from sandbox.payhere.lk).',
      400,
    );
  }

  if (valid) {
    return new PayHereAdapter();
  }

  return new MockPaymentAdapter();
}

/** @deprecated use getPaymentAdapter() */
export const paymentAdapter = {
  initiate: async (params: PaymentInitParams) => (await getPaymentAdapter()).initiate(params),
  verify: (paymentId: string, signature: string) =>
    createPaymentAdapter().verify(paymentId, signature),
};
