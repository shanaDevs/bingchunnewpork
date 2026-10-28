import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import { whatsAppChannel } from './whatsappChannel';
import { telegramChannel } from './telegramChannel';
import { logOutboundMessage } from './channelMessageService';
import { getEffectiveFrontendUrl } from '../../lib/resolveFrontendUrl';
import { randomUUID } from 'crypto';

const STATUS_COPY: Record<string, string> = {
  RECEIVED: '📦 Order received — we have your order.',
  PREPARING: '👨‍🍳 Your order is now being prepared.',
  READY: '✅ Your order is ready.',
  OUT_FOR_DELIVERY: '🚚 Your order is out for delivery.',
  DELIVERED: '🎉 Your order has been delivered.\nThank you!',
  CANCELLED: '❌ Your order was cancelled.',
};

function publicOrderUrl(orderNumber: string): string {
  const base = getEffectiveFrontendUrl() || 'https://bing-chung.mp.dartcodes.com';
  return `${base.replace(/\/$/, '')}/order/${encodeURIComponent(orderNumber)}`;
}

/**
 * Notify the customer on the original messaging channel when admin changes order status.
 */
export async function notifyMessagingOrderStatus(order: {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  userId?: string | null;
}): Promise<void> {
  if (order.channel !== 'WHATSAPP' && order.channel !== 'TELEGRAM') return;

  const statusLine = STATUS_COPY[order.status] || `Status update: ${order.status}`;
  const details = await prisma.order.findFirst({
    where: { id: order.id },
    select: {
      total: true,
      orderMode: true,
      deliveryAddressLine: true,
      deliveryCity: true,
      store: { select: { name: true } },
      items: { select: { productName: true, quantity: true, totalPrice: true } },
    },
  });

  const money = (n: number) => `Rs. ${n.toLocaleString('en-LK')}`;
  const text = [
    `📦 Order #${order.orderNumber}`,
    '',
    statusLine,
    ...(details
      ? [
          '',
          `Store: ${details.store.name}`,
          'Products:',
          ...details.items.map((i) => `• ${i.productName} × ${i.quantity} — ${money(i.totalPrice)}`),
          '',
          `Total: ${money(details.total)}`,
          ...(details.deliveryAddressLine
            ? [
                `Address: ${details.deliveryAddressLine}${
                  details.deliveryCity ? `, ${details.deliveryCity}` : ''
                }`,
              ]
            : []),
        ]
      : []),
    '',
    'Tap below for full order details.',
  ].join('\n');

  const link = await prisma.customerChannel.findFirst({
    where: {
      channel: order.channel,
      ...(order.userId ? { customerId: order.userId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Fallback: last inbound message for this order's conversation
  let externalUserId = link?.externalUserId;
  if (!externalUserId) {
    const lastMsg = await prisma.channelMessage.findFirst({
      where: { channel: order.channel, orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { externalUserId: true },
    });
    externalUserId = lastMsg?.externalUserId;
  }

  if (!externalUserId && order.userId) {
    const anyLink = await prisma.customerChannel.findFirst({
      where: { customerId: order.userId, channel: order.channel },
      orderBy: { updatedAt: 'desc' },
    });
    externalUserId = anyLink?.externalUserId;
  }

  if (!externalUserId) {
    logger.warn('messaging.status_notify_no_recipient', {
      orderNumber: order.orderNumber,
      channel: order.channel,
    });
    return;
  }

  const adapter = order.channel === 'WHATSAPP' ? whatsAppChannel : telegramChannel;
  try {
    const sendResult = await adapter.send(externalUserId, {
      text,
      ctaUrl: {
        label: 'Visit order details',
        url: publicOrderUrl(order.orderNumber),
      },
    });
    await logOutboundMessage({
      channel: order.channel,
      externalUserId,
      externalMessageId: sendResult.waMessageId || `status:${order.id}:${order.status}:${randomUUID()}`,
      bodyText: text,
      orderId: order.id,
      messageType: 'status',
      senderType: 'SYSTEM',
    });
    logger.info('messaging.status_notified', {
      channel: order.channel,
      orderNumber: order.orderNumber,
      status: order.status,
    });
  } catch (err) {
    logger.error('messaging.status_notify_failed', { error: String(err) });
  }
}
