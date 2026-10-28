import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

type Tx = Prisma.TransactionClient;

/** Undo promo/spin/loyalty side effects applied during placeOrder. */
export async function reverseOrderPlacementSideEffects(
  orderId: string,
  db: Tx | typeof prisma = prisma,
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, promoCode: true },
  });
  if (!order) return;

  if (order.promoCode) {
    const promo = await db.promoCode.findUnique({ where: { code: order.promoCode } });
    if (promo && promo.usedCount > 0) {
      await db.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { decrement: 1 } },
      });
    }
  }

  await db.promotionUsage.deleteMany({ where: { orderId } });

  await db.spinResult.updateMany({
    where: { orderId, status: 'REDEEMED' },
    data: {
      status: 'CLAIMED',
      redeemedAt: null,
      orderId: null,
    },
  });

  const loyaltyTxs = await db.loyaltyTransaction.findMany({ where: { orderId } });
  for (const tx of loyaltyTxs) {
    if (tx.points < 0) {
      await db.user.update({
        where: { id: tx.userId },
        data: { loyaltyPoints: { increment: -tx.points } },
      });
    } else if (tx.points > 0) {
      await db.user.update({
        where: { id: tx.userId },
        data: { loyaltyPoints: { decrement: tx.points } },
      });
    }
  }
  await db.loyaltyTransaction.deleteMany({ where: { orderId } });
}

/** Roll back a partially-created checkout order (reservation link / payment init failure). */
export async function compensateFailedPlaceOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, status: true },
  });
  if (!order || order.paymentStatus === 'PAID' || order.status === 'CANCELLED') return;

  try {
    await prisma.$transaction(async (tx) => {
      await reverseOrderPlacementSideEffects(orderId, tx);

      await tx.storeProductReservation.deleteMany({
        where: { orderId, status: 'ACTIVE' },
      });

      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { paymentStatus: true, status: true },
      });
      if (!fresh || fresh.paymentStatus === 'PAID' || fresh.status === 'CANCELLED') return;

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelReason: 'PAYMENT_OR_SYSTEM_ISSUE',
          cancelledBy: 'system',
          paymentStatus: fresh.paymentStatus === 'PENDING' ? 'FAILED' : fresh.paymentStatus,
          statusEvents: {
            create: {
              status: 'CANCELLED',
              note: 'Order rolled back — checkout could not be completed',
            },
          },
        },
      });
    });
  } catch (err) {
    logger.warn('Failed to compensate failed place order', { orderId, err });
  }
}
