import { prisma } from './prisma';
import { mapNotifyOrderItems, notifyBranchNewOrder } from './branchNotifications';
import { orderSmsPhone, sendOrderReceiptSms } from '../integrations/smsAdapter';
import { sendOrderConfirmationEmail } from '../integrations/emailAdapter';
import { calcLoyaltyPointsEarned, resolveLoyaltySettings } from './loyalty';
import { deductOrderItemsOnce } from './stockEngine';
import { completeReservationsForOrder } from '../repositories/inventoryReservationRepository';
import { logger } from '../utils/logger';

import { reverseOrderPlacementSideEffects } from './orderPlacementReversal';

const PAYMENT_FINALIZED_NOTE = 'Payment confirmed — order sent to store';

function isDeductibleOrderItem(item: { quantity: number }): boolean {
  return item.quantity > 0;
}

/** Run once after online payment succeeds (PayHere notify / mock payment). Idempotent. */
export async function finalizeOrderAfterOnlinePayment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { select: { name: true } },
      items: { include: { product: { select: { imageUrl: true } } } },
      user: { select: { id: true, phone: true, email: true, name: true } },
    },
  });

  if (!order || order.paymentStatus !== 'PAID') return;

  // Stock first — must succeed (or already be deducted) even if side effects partially ran.
  const deductibleItems = order.items.filter(isDeductibleOrderItem);
  if (deductibleItems.length > 0) {
    await deductOrderItemsOnce(
      order.storeId,
      deductibleItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        orderItemId: item.id,
      })),
      order.id,
    );
  }

  await completeReservationsForOrder(order.id).catch((err) =>
    logger.warn('Reservation completion failed after online payment', err),
  );

  const alreadyFinalized = await prisma.orderStatusEvent.findFirst({
    where: { orderId: order.id, note: PAYMENT_FINALIZED_NOTE },
  });
  if (alreadyFinalized) return;

  await prisma.orderStatusEvent.create({
    data: {
      orderId: order.id,
      status: order.status,
      note: PAYMENT_FINALIZED_NOTE,
    },
  });

  if (order.userId) {
    const cart = await prisma.cart.findUnique({ where: { userId: order.userId }, select: { id: true } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } }).catch((err) =>
        logger.warn('Cart clear failed after online payment', err),
      );
    }
  }

  notifyBranchNewOrder({
    orderId: order.id,
    orderNumber: order.orderNumber,
    storeId: order.storeId,
    storeName: order.store.name,
    orderMode: order.orderMode,
    total: order.total,
    guestName: order.guestName,
    userName: order.user?.name,
    phone: order.guestPhone ?? order.user?.phone,
    itemCount: order.items.length,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    queuePosition: order.queuePosition ?? null,
    pickupTime: order.pickupTime,
    scheduledPickupAt: order.scheduledPickupAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: mapNotifyOrderItems(order.items),
  }).catch(() => {});

  const phone = orderSmsPhone(order);
  if (phone) {
    sendOrderReceiptSms(phone, order.orderNumber, order.total, order.estimatedMinutes).catch(() => {});
  }

  const email = order.user?.email ?? order.guestEmail;
  if (email) {
    sendOrderConfirmationEmail(email, order.orderNumber, [], order.total).catch(() => {});
  }

  if (order.userId && order.paymentMethod !== 'LOYALTY_POINTS') {
    const existingEarn = await prisma.loyaltyTransaction.findFirst({
      where: { orderId: order.id, type: 'EARN' },
    });
    const setting = resolveLoyaltySettings(await prisma.loyaltySetting.findUnique({ where: { id: 'default' } }));
    const earned = calcLoyaltyPointsEarned(order.total, setting);
    if (!existingEarn && earned > 0) {
      await prisma.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: { increment: earned } },
      });
      await prisma.loyaltyTransaction.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          points: earned,
          type: 'EARN',
          note: `Order ${order.orderNumber}`,
        },
      });
    }
  }
}
