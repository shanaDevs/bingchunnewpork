import { prisma } from './prisma';
import { getPaymentAdapter } from '../integrations/paymentAdapter';
import { getPaymentSettings } from './paymentSettings';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { cancelOrderOnPaymentFailure } from './orderSchema';
import { gatewayAmountMatchesOrder, markOnlineOrderPaid } from './onlineOrderPayment';
import { logger } from '../utils/logger';
import { logWalletSecurityEvent } from './walletSecurityAudit';

export interface PayHereNotificationInput {
  merchant_id?: string;
  order_id?: string;
  payment_id?: string;
  payhere_amount?: string | number;
  payhere_currency?: string;
  status_code?: string | number;
  md5sig?: string;
  status_message?: string;
}

export type PayHereProcessResult = 'PAID' | 'FAILED' | 'PENDING' | 'INVALID';

function isPaidStatus(statusCode: string | number | undefined): boolean {
  return statusCode === '2' || statusCode === 2;
}

function isFailedStatus(statusCode: string | number | undefined): boolean {
  if (statusCode == null) return false;
  const code = String(statusCode);
  return code !== '2' && code !== '0' && code !== '';
}

export function formatPayHereFailureMessage(
  statusCode: string | number | undefined,
  statusMessage?: string,
): string {
  const message = statusMessage?.trim();
  if (message) return message;

  const code = String(statusCode ?? '');
  const labels: Record<string, string> = {
    '-1': 'Payment was cancelled',
    '-2': 'Payment failed',
    '-3': 'Payment was charged back',
    '0': 'Payment is still pending',
  };
  return labels[code] || (code ? `Payment declined (code ${code})` : 'Payment failed');
}

/** Hash candidates from the signed PayHere amount only — never the order total. */
function amountCandidates(payhereAmount: string | number | undefined): string[] {
  const out = new Set<string>();
  if (payhereAmount == null) return [];
  const raw = String(payhereAmount).trim();
  if (!raw) return [];
  out.add(raw);
  const parsed = parseFloat(raw);
  if (!Number.isNaN(parsed)) {
    out.add(parsed.toFixed(2));
    if (Number.isInteger(parsed)) out.add(String(Math.trunc(parsed)));
  }
  return [...out];
}

async function verifyPayhereSignature(input: PayHereNotificationInput): Promise<boolean> {
  const { merchant_id, order_id, payment_id, payhere_amount, payhere_currency, status_code, md5sig } =
    input;

  if (md5sig == null || status_code == null) return false;
  if (String(md5sig) === 'mock_sig') {
    return config.nodeEnv !== 'production';
  }

  const settings = await getPaymentSettings();
  const adapter = await getPaymentAdapter();
  const currency = String(payhere_currency ?? 'LKR');
  const merchantId = String(merchant_id ?? settings.payhere.merchantId);
  const orderId = String(order_id);
  const status = String(status_code);

  if (
    'verifyNotifyHash' in adapter &&
    typeof adapter.verifyNotifyHash === 'function'
  ) {
    for (const amount of amountCandidates(payhere_amount)) {
      if (
        adapter.verifyNotifyHash(
          merchantId,
          orderId,
          amount,
          currency,
          status,
          String(md5sig),
          settings.payhere.merchantSecret,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  return adapter.verify(String(payment_id), String(md5sig));
}

/**
 * After PayHere popup onCompleted — poll for webhook confirmation only; never mark paid without proof.
 */
export async function confirmPayherePopupPayment(
  orderNumber: string,
): Promise<'PAID' | 'FAILED' | 'NOT_FOUND' | 'PENDING'> {
  const order = await prisma.order.findFirst({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      storeId: true,
      total: true,
      paymentMethod: true,
      userId: true,
      orderMode: true,
      paymentStatus: true,
      status: true,
      createdAt: true,
    },
  });
  if (!order) return 'NOT_FOUND';
  if (order.paymentStatus === 'PAID') return 'PAID';
  if (order.paymentStatus === 'FAILED' || order.status === 'CANCELLED') return 'FAILED';

  const ageMs = Date.now() - order.createdAt.getTime();
  if (ageMs > 2 * 60 * 60 * 1000) return 'FAILED';

  return 'PENDING';
}

/** Verify PayHere notify / return payload and update order payment status. */
export async function processPayHerePaymentNotification(
  input: PayHereNotificationInput,
): Promise<PayHereProcessResult> {
  const {
    merchant_id,
    order_id,
    payment_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
    status_message,
  } = input;

  if (md5sig == null || status_code == null) {
    return 'PENDING';
  }

  const orderId = String(order_id);
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
  });
  if (!order) throw new AppError('Order not found', 404);

  const isValid = await verifyPayhereSignature(input);
  if (!isValid) {
    logWalletSecurityEvent({
      event: 'payment.payhere.notify_invalid',
      outcome: 'denied',
      orderNumber: order.orderNumber,
      reason: 'signature',
    });
    return 'INVALID';
  }

  const currency = String(payhere_currency ?? '').trim().toUpperCase();
  if (currency !== 'LKR' || !gatewayAmountMatchesOrder(payhere_amount, order.total)) {
    logger.warn('PayHere amount or currency does not match the order', {
      orderNumber: order.orderNumber,
      payhereAmount: payhere_amount,
      payhereCurrency: payhere_currency,
      orderTotal: order.total,
    });
    logWalletSecurityEvent({
      event: 'payment.payhere.notify_invalid',
      outcome: 'denied',
      orderNumber: order.orderNumber,
      reason: 'amount_mismatch',
    });
    return 'INVALID';
  }

  if (order.paymentStatus === 'PAID') return 'PAID';

  if (isPaidStatus(status_code)) {
    await markOnlineOrderPaid(order, { paymentRef: payment_id ?? null });
    return 'PAID';
  }

  if (isFailedStatus(status_code)) {
    await cancelOrderOnPaymentFailure(order.id, formatPayHereFailureMessage(status_code, status_message));
    return 'FAILED';
  }

  return 'PENDING';
}
