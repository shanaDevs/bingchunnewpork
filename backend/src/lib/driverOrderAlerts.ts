import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { DRIVER_HELD_JOB_STATUSES } from './deliveryJobHelpers';
import { broadcastOrderCancelledToDriver } from './socket';
import { sendOrderCancelledToDriver } from './driverPush';

/**
 * Alert the rider holding an order that it has just been cancelled.
 *
 * The cancelled stop already shows up in the driver app on its next poll (formatJob
 * keeps CANCELLED orders and counts them as resolved), but silently — this is what
 * makes the phone ring so a rider mid-run doesn't drive to a dead stop.
 *
 * No-op when nobody is holding the order: an unclaimed SCHEDULED job has no driver to
 * tell, and a finished job no longer matters.
 *
 * Never throws — callers treat alerting as best-effort, like every other notify path.
 */
export async function notifyDriverOrderCancelled(
  orderId: string,
  opts: { cancelledBy?: string | null } = {},
): Promise<void> {
  try {
    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: {
          driverId: { not: null },
          status: { in: [...DRIVER_HELD_JOB_STATUSES] },
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

    const cancelledBy = opts.cancelledBy ?? 'customer';
    const orderNumber = link.order.orderNumber;

    broadcastOrderCancelledToDriver(driverId, {
      jobId: link.jobId,
      orderId,
      orderNumber,
      storeId: link.job.storeId,
      cancelledBy,
      cancelledAt: new Date().toISOString(),
    });

    await sendOrderCancelledToDriver(driverId, {
      jobId: link.jobId,
      orderId,
      orderNumber,
      cancelledBy,
    });
  } catch (err) {
    logger.error('notifyDriverOrderCancelled failed', { orderId, err });
  }
}
