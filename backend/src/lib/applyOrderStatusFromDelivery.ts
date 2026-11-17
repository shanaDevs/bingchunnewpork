import { z } from 'zod';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import { assertValidStatusTransition, type OrderStatus } from './orderStatus';
import { paymentStatusOnOrderStatus } from './orderPayment';
import { notifyCustomerOrderStatus, notifyDeliveryCode } from './customerNotifications';
import { maybeAutoCompleteDeliveryJobsForOrder } from './deliveryJobHelpers';
import { parseLatLngPair } from '@bingchun/delivery-domain';
import { notifyDriverOrderCancelled } from './driverOrderAlerts';
import { logger } from '../utils/logger';
import { orderSmsPhone, sendDeliveryCodeSms, sendOrderReceiptSms } from '../integrations/smsAdapter';

export const deliveryOrderStatusPayloadSchema = z.object({
  orderId: z.string(),
  status: z.enum(['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  note: z.string().optional(),
  orderNumber: z.string().optional(),
  userId: z.string().nullable().optional(),
  orderMode: z.string().optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  dropoffAt: z.string().optional().nullable(),
});

export type DeliveryOrderStatusPayload = z.infer<typeof deliveryOrderStatusPayloadSchema>;

export type ApplyOrderStatusResult =
  | { alreadyApplied: true }
  | { skipped: true; reason: string }
  | { updated: true; order: { id: string; status: string } };

/** Single writer for order status transitions initiated by the delivery service. */
export async function applyOrderStatusFromDelivery(
  body: DeliveryOrderStatusPayload,
): Promise<ApplyOrderStatusResult> {
  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: { user: { select: { phone: true } } },
  });
  if (!order) throw new AppError('Order not found', 404);

  if (order.status === body.status) {
    return { alreadyApplied: true };
  }

  try {
    assertValidStatusTransition(
      { status: order.status as OrderStatus, orderMode: order.orderMode as 'DELIVERY' | 'TAKEAWAY' },
      body.status as OrderStatus,
    );
  } catch (e) {
    logger.warn(
      `Internal order-status: skipping ${order.id} ${order.status} -> ${body.status}: ${e instanceof Error ? e.message : e}`,
    );
    return { skipped: true, reason: e instanceof Error ? e.message : 'invalid transition' };
  }

  const paidOnFulfillment = paymentStatusOnOrderStatus(order, body.status);
  const dropoff = body.status === 'DELIVERED' ? parseLatLngPair(body.lat, body.lng) : null;
  const dropoffAt = body.dropoffAt ? new Date(body.dropoffAt) : new Date();

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: body.status as OrderStatus,
      ...(paidOnFulfillment ? { paymentStatus: paidOnFulfillment } : {}),
        ...(dropoff
        ? ({
            actualDropoffLat: dropoff.lat,
            actualDropoffLng: dropoff.lng,
            actualDropoffAt: Number.isNaN(dropoffAt.getTime()) ? new Date() : dropoffAt,
          } as Record<string, unknown>)
        : {}),
      statusEvents: {
        create: { status: body.status as OrderStatus, note: body.note ?? 'Updated by delivery service' },
      },
    },
  });

  if (paidOnFulfillment === 'PAID') {
    const phone = orderSmsPhone(order);
    if (phone) {
      sendOrderReceiptSms(phone, updated.orderNumber, updated.total, updated.estimatedMinutes).catch(() => {});
    }
  }

  if (body.status === 'CANCELLED' && order.orderMode === 'DELIVERY') {
    await notifyDriverOrderCancelled(order.id, { cancelledBy: 'customer' });
  }

  await maybeAutoCompleteDeliveryJobsForOrder(order.id).catch((err) =>
    logger.error('maybeAutoCompleteDeliveryJobsForOrder failed', err),
  );

  notifyCustomerOrderStatus({
    id: updated.id,
    orderNumber: updated.orderNumber,
    userId: updated.userId,
    status: body.status,
    orderMode: updated.orderMode,
    note: body.note,
  }).catch(() => {});

  return { updated: true, order: { id: updated.id, status: updated.status } };
}

export async function sendDeliveryCodeFromDelivery(body: { orderId: string; code: string }): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      guestPhone: true,
      user: { select: { phone: true } },
    },
  });
  if (!order) throw new AppError('Order not found', 404);

  const phone = order.guestPhone || order.user?.phone;
  if (phone) {
    await sendDeliveryCodeSms(phone, order.orderNumber, body.code).catch((err) =>
      logger.error('Failed to SMS delivery code', err),
    );
  } else {
    logger.warn(`No phone on order ${order.orderNumber} — skipping SMS`);
  }

  await notifyDeliveryCode({
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    code: body.code,
  });
}
