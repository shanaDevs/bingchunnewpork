import { prisma } from './prisma';
import { getIo } from './socket';
import { logger } from '../utils/logger';
import { sendPushToUser } from './fcm';
import { formatTime } from './datetime';
import { config } from '../config';
import { clearLiveDeliveryCode, upsertDeliveryCodeLive } from './deliveryCodeLive';
import { orderSmsPhone, sendOrderStatusSms } from '../integrations/smsAdapter';

let tablesReady = false;

export async function ensureCustomerNotificationTables(): Promise<void> {
  tablesReady = true;
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Order received',
  PREPARING: 'Preparing your order',
  READY: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Order cancelled',
};

function statusMessage(status: string, orderMode: string, orderNumber: string, note?: string | null): string {
  const mode = orderMode === 'DELIVERY' ? 'delivery' : 'pickup';
  const base: Record<string, string> = {
    RECEIVED: `We received order #${orderNumber}.`,
    PREPARING: `Your ${mode} order #${orderNumber} is being prepared.`,
    READY: `Order #${orderNumber} is ready — come collect it!`,
    OUT_FOR_DELIVERY: `Order #${orderNumber} is on the way to you!`,
    DELIVERED: `Order #${orderNumber} has been delivered. Enjoy!`,
    CANCELLED: `Order #${orderNumber} was cancelled.`,
  };
  const msg = base[status] || `Order #${orderNumber} status: ${status}`;
  return note ? `${msg} ${note}` : msg;
}

function emitOrderStatusSockets(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: string;
  note?: string | null;
}): void {
  try {
    const io = getIo();
    const statusPayload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      note: order.note,
    };
    io.to(`order:${order.id}`).emit('orderStatus', statusPayload);
    io.to(`order:${order.orderNumber}`).emit('orderStatus', statusPayload);
    if (order.userId) {
      io.to(`user:${order.userId}`).emit('orderStatusUpdate', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        note: order.note,
      });
    }
  } catch {
    /* socket not ready */
  }
}

async function persistOrderStatusNotification(order: {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  orderMode: string;
  note?: string | null;
}, title: string, message: string): Promise<void> {
  await ensureCustomerNotificationTables();

  const notification = await prisma.customerNotification.create({
    data: {
      userId: order.userId,
      type: 'ORDER_STATUS',
      title,
      message,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
    },
  });

  const payload = {
    id: notification.id,
    type: 'ORDER_STATUS',
    title,
    message,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    note: order.note ?? null,
    read: false,
    createdAt: notification.createdAt.toISOString(),
  };

  try {
    getIo().to(`user:${order.userId}`).emit('customerNotification', payload);
  } catch {
    /* socket not ready */
  }

  sendPushToUser(order.userId, title, message, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: 'ORDER_STATUS',
  }, 'order_update').catch(() => {});
}

export async function notifyCustomerOrderStatus(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: string;
  orderMode: string;
  note?: string | null;
}): Promise<void> {
  const title = STATUS_LABELS[order.status] || 'Order update';
  const message = statusMessage(order.status, order.orderMode, order.orderNumber, order.note);

  // Fan-out sockets first so track pages update instantly (before DB/push work).
  emitOrderStatusSockets(order);

  if (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') {
    // Delivery OUT_FOR_DELIVERY SMS (PIN + rider) is sent from createDeliveryOtp / startJob.
    // Delivery READY intentionally has no SMS — only paid/received confirmation + start-run SMS.
    if (order.status === 'READY' && order.orderMode === 'DELIVERY') {
      /* skip */
    } else if (order.status === 'OUT_FOR_DELIVERY' && order.orderMode === 'DELIVERY') {
      /* skip — handled by delivery-started SMS with PIN */
    } else {
      await sendOrderStatusSmsForOrder(order).catch((err) =>
        logger.error('Failed to SMS order status', err),
      );
    }
  }

  // Completion SMS with receipt link — delivery and takeaway pickup complete.
  if (order.status === 'DELIVERED') {
    await sendOrderStatusSmsForOrder(order).catch((err) =>
      logger.error('Failed to SMS order status', err),
    );
  }

  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
    clearLiveDeliveryCode(order.id).catch(() => {});
  }

  if (!order.userId) return;

  try {
    await persistOrderStatusNotification(
      { ...order, userId: order.userId },
      title,
      message,
    );
  } catch (err) {
    logger.error('Failed to create customer notification', err);
  }
}

async function sendOrderStatusSmsForOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  orderMode: string;
}): Promise<void> {
  const row = await prisma.order.findUnique({
    where: { id: order.id },
    select: { guestPhone: true, user: { select: { phone: true } } },
  });
  const phone = orderSmsPhone(row ?? {});
  if (!phone) {
    logger.warn(`No phone on order ${order.orderNumber} — skipping status SMS`);
    return;
  }
  await sendOrderStatusSms(phone, order.orderNumber, order.status, order.orderMode);
}

export async function notifyDeliveryCode(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  code: string;
  expiresAt?: Date;
}): Promise<void> {
  const title = 'Your delivery code';
  const message = `Give code ${order.code} to the rider when order #${order.orderNumber} arrives.`;

  const socketPayload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    code: order.code,
    title,
    message,
  };

  // Persist so GET /orders/:id can hydrate the track page if the socket event is missed.
  await upsertDeliveryCodeLive({
    orderId: order.id,
    orderNumber: order.orderNumber,
    code: order.code,
    expiresAt: order.expiresAt ?? new Date(Date.now() + config.otpTtlMinutes * 60_000),
  }).catch(() => {});

  try {
    const io = getIo();
    if (order.userId) io.to(`user:${order.userId}`).emit('deliveryCode', socketPayload);
  } catch {
    /* socket not ready */
  }

  if (!order.userId) return;

  await ensureCustomerNotificationTables();

  try {
    const notification = await prisma.customerNotification.create({
      data: {
        userId: order.userId,
        type: 'DELIVERY_CODE',
        title,
        message,
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    });

    try {
      const io = getIo();
      io.to(`user:${order.userId}`).emit('customerNotification', {
        id: notification.id,
        type: 'DELIVERY_CODE',
        title,
        message,
        orderId: order.id,
        orderNumber: order.orderNumber,
        read: false,
        createdAt: notification.createdAt.toISOString(),
      });
    } catch {
      /* socket not ready */
    }

    sendPushToUser(order.userId, title, message, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'DELIVERY_CODE',
    }, 'order_update').catch(() => {});
  } catch (err) {
    logger.error('Failed to send delivery code notification', err);
  }
}

export async function notifyPickupSoon(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  queuePosition: number | null;
  scheduledPickupAt: Date | null;
}): Promise<void> {
  if (!order.scheduledPickupAt) return;

  const pickupTime = formatTime(order.scheduledPickupAt);
  const queueLabel = order.queuePosition ? `Queue #${order.queuePosition}` : 'Your order';
  const title = 'Pickup in 5 minutes!';
  const message = `${queueLabel} — order #${order.orderNumber} is almost ready. Please head to the counter by ${pickupTime}.`;

  const socketPayload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    queuePosition: order.queuePosition,
    scheduledPickupAt: order.scheduledPickupAt.toISOString(),
    title,
    message,
  };

  try {
    const io = getIo();
    io.to(`order:${order.id}`).emit('pickupSoon', socketPayload);
    io.to(`order:${order.orderNumber}`).emit('pickupSoon', socketPayload);
    if (order.userId) {
      io.to(`user:${order.userId}`).emit('pickupSoon', socketPayload);
    }
  } catch {
    /* socket not ready */
  }

  if (!order.userId) return;

  await ensureCustomerNotificationTables();

  try {
    const notification = await prisma.customerNotification.create({
      data: {
        userId: order.userId,
        type: 'PICKUP_SOON',
        title,
        message,
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    });

    try {
      const io = getIo();
      io.to(`user:${order.userId}`).emit('customerNotification', {
        id: notification.id,
        type: 'PICKUP_SOON',
        title,
        message,
        orderId: order.id,
        orderNumber: order.orderNumber,
        read: false,
        createdAt: notification.createdAt.toISOString(),
      });
    } catch {
      /* socket not ready */
    }

    // Push notification
    sendPushToUser(order.userId, title, message, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: 'PICKUP_SOON',
    }, 'order_update').catch(() => {});
  } catch (err) {
    logger.error('Failed to send pickup reminder', err);
  }
}

export async function sendTestCustomerNotification(
  userId: string,
  title = 'Test notification',
  message = 'This is a test push from the Bing Chun admin panel.',
): Promise<{
  notificationId: string;
  fcmConfigured: boolean;
  pushTokensTargeted: number;
  pushTokensSent: number;
  socketEmitted: boolean;
}> {
  await ensureCustomerNotificationTables();

  const notification = await prisma.customerNotification.create({
    data: {
      userId,
      type: 'TEST',
      title,
      message,
    },
  });

  const payload = {
    id: notification.id,
    type: 'TEST',
    title,
    message,
    orderId: null,
    orderNumber: null,
    status: null,
    read: false,
    createdAt: notification.createdAt.toISOString(),
  };

  let socketEmitted = false;
  try {
    const io = getIo();
    io.to(`user:${userId}`).emit('customerNotification', payload);
    socketEmitted = true;
  } catch {
    /* socket not ready */
  }

  const { isFcmConfigured, sendPushToUser } = await import('./fcm');
  const push = await sendPushToUser(userId, title, message, { type: 'TEST' }, 'order_update');

  return {
    notificationId: notification.id,
    fcmConfigured: isFcmConfigured(),
    pushTokensTargeted: push.tokensTargeted,
    pushTokensSent: push.tokensSent,
    socketEmitted,
  };
}

export async function notifyCustomerOrderPlaced(order: {
  id: string;
  orderNumber: string;
  userId: string | null;
  orderMode: string;
}): Promise<void> {
  if (!order.userId) return;

  await ensureCustomerNotificationTables();

  const mode = order.orderMode === 'DELIVERY' ? 'delivery' : 'pickup';
  const title = 'Order placed successfully!';
  const message = `Your ${mode} order #${order.orderNumber} is confirmed. We'll keep you updated.`;

  try {
    const notification = await prisma.customerNotification.create({
      data: {
        userId: order.userId,
        type: 'ORDER_PLACED',
        title,
        message,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: 'PLACED',
      },
    });

    const payload = {
      id: notification.id,
      type: 'ORDER_PLACED',
      title,
      message,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'PLACED',
      read: false,
      createdAt: notification.createdAt.toISOString(),
    };

    try {
      const io = getIo();
      io.to(`user:${order.userId}`).emit('customerNotification', payload);
    } catch {
      /* socket not ready */
    }

    sendPushToUser(
      order.userId,
      title,
      message,
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: 'ORDER_PLACED',
      },
      'order_placed',
    ).catch(() => {});
  } catch (err) {
    logger.error('Failed to create order placed notification', err);
  }
}
