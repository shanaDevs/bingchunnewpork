import type { PaymentMethod } from '@prisma/client';
import { prisma } from './prisma';
import { creditWalletForOrder } from '../controllers/walletController';
import { finalizeOrderAfterOnlinePayment } from './orderPlacement';
import { notifyCustomerOrderPlaced } from './customerNotifications';
import { clearOrderPaymentFailure, stampCancelWindowStart } from './orderSchema';
import { logger } from '../utils/logger';

export type OnlineOrderForPayment = {
  id: string;
  orderNumber: string;
  storeId: string;
  total: number;
  paymentMethod: PaymentMethod;
  userId: string | null;
  orderMode: string;
};

/**
 * Mark an online order paid exactly once, then run post-payment side effects.
 * Only the request that flips the row credits the wallet. Retries still finalize stock.
 */
export async function markOnlineOrderPaid(
  order: OnlineOrderForPayment,
  opts?: { paymentRef?: string | null },
): Promise<void> {
  const paymentRef = opts?.paymentRef?.trim() || null;
  if (paymentRef) {
    const duplicate = await prisma.order.findFirst({
      where: { paymentRef, NOT: { id: order.id } },
      select: { id: true, orderNumber: true },
    });
    if (duplicate && duplicate.id !== order.id) {
      logger.warn('Rejected marking order paid: payment reference already used', {
        orderNumber: order.orderNumber,
        paymentRef,
        existingOrderId: duplicate.id,
        existingOrderNumber: duplicate.orderNumber,
      });
      return;
    }
  }

  let flipped: { count: number };
  try {
    flipped = await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: { not: 'PAID' } },
      data: {
        paymentStatus: 'PAID',
        paymentRef,
        prepaidAmount: order.total,
      },
    });
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code === 'P2002') {
      logger.warn('Rejected marking order paid: payment reference unique constraint', {
        orderNumber: order.orderNumber,
        paymentRef,
      });
      return;
    }
    throw err;
  }
  const won = flipped.count === 1;

  if (won) {
    await clearOrderPaymentFailure(order.id);
    await stampCancelWindowStart(order.id);
    creditWalletForOrder(order.id, order.storeId, order.total, order.paymentMethod).catch((err) => {
      logger.error('Wallet credit failed after online payment marked PAID', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeId: order.storeId,
        amount: order.total,
        paymentMethod: order.paymentMethod,
        err,
      });
    });
  }

  await finalizeOrderAfterOnlinePayment(order.id);

  if (won && order.userId) {
    notifyCustomerOrderPlaced({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      orderMode: order.orderMode,
    }).catch(() => {});
  }
}

/** True when the gateway amount matches the order total to two decimal places. */
export function gatewayAmountMatchesOrder(
  paid: string | number | undefined | null,
  orderTotal: number,
): boolean {
  if (paid == null) return false;
  const raw = String(paid).trim();
  if (!raw) return false;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || !Number.isFinite(orderTotal)) return false;
  return parsed.toFixed(2) === Number(orderTotal).toFixed(2);
}
