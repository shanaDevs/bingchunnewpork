import { prisma } from '@bingchun/db';
import { logger } from '../utils/logger';
import { heldJobStatuses, maybeEnterReturningPhase } from './deliveryJobHelpers';
import { sendOrderCancelledToDriver } from './fcm';
import { getEventPublisher } from '../sockets/eventPublisher';

type OrderCancelledPayload = {
  orderId?: string;
  orderMode?: string;
  cancelledBy?: string;
};

/**
 * Core published `order.cancelled`. Ring the rider who is holding the order
 * (socket on the core server, plus a data-only push) and move an in-progress
 * ride to RETURNING when every stop is already done.
 *
 * No-op for takeaway and for jobs nobody has claimed. Never throws.
 */
export async function handleCoreOrderCancelled(payload: unknown): Promise<void> {
  try {
    const body = (payload ?? {}) as OrderCancelledPayload;
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId) return;
    if (body.orderMode && body.orderMode !== 'DELIVERY') return;

    const held = await heldJobStatuses();
    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: {
          driverId: { not: null },
          status: { in: held },
        },
      },
      select: {
        jobId: true,
        job: { select: { driverId: true, storeId: true } },
        order: { select: { orderNumber: true } },
      },
    });

    const driverId = link?.job.driverId;
    if (!link || !driverId) return;

    const cancelledBy = body.cancelledBy || 'customer';
    const orderNumber = link.order.orderNumber;
    const socketPayload = {
      jobId: link.jobId,
      orderId,
      orderNumber,
      storeId: link.job.storeId,
      cancelledBy,
      cancelledAt: new Date().toISOString(),
    };

    try {
      await getEventPublisher().publish(`driver:${driverId}`, 'orderCancelled', socketPayload);
    } catch (err) {
      logger.error('orderCancelled socket publish failed', { orderId, err });
    }

    try {
      await sendOrderCancelledToDriver(driverId, {
        jobId: link.jobId,
        orderId,
        orderNumber,
        cancelledBy,
      });
    } catch (err) {
      logger.error('orderCancelled push failed', { orderId, err });
    }

    try {
      await maybeEnterReturningPhase(link.jobId);
    } catch (err) {
      logger.error('maybeEnterReturningPhase after cancel failed', { orderId, jobId: link.jobId, err });
    }
  } catch (err) {
    logger.error('handleCoreOrderCancelled failed', err);
  }
}
