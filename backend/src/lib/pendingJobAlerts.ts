import { prisma } from './prisma';
import { todayDateRange } from './datetime';
import { isDriverAlertEligible, jobOrdersWithDetails } from './deliveryJobHelpers';
import {
  buildNewJobBroadcastPayload,
  buildNewJobPushFromBroadcast,
} from './newJobBroadcast';
import { sendPushToDriver } from './driverPush';
import {
  broadcastJobAssignedToDriver,
  emitNewJobToDriver,
  type JobAssignedToDriverPayload,
} from './socket';
import { logger } from '../utils/logger';

type PendingJobRow = Awaited<ReturnType<typeof loadPendingJobs>>[number];

async function loadPendingJobs(driverId: string, accessibleStoreIds: string[]) {
  if (accessibleStoreIds.length === 0) return [];

  const { from: todayFrom, to: todayTo } = todayDateRange();

  const jobs = await prisma.deliveryJob.findMany({
    where: {
      storeId: { in: accessibleStoreIds },
      status: 'SCHEDULED',
      broadcastedAt: { not: null },
      scheduledAt: { gte: todayFrom, lte: todayTo },
      OR: [{ driverId: null }, { driverId }],
    },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          city: true,
          lat: true,
          lng: true,
        },
      },
      jobOrders: jobOrdersWithDetails,
    },
    orderBy: { scheduledAt: 'desc' },
  });

  if (jobs.length === 0) return [];

  const rejections = await prisma.deliveryJobRejection.findMany({
    where: { driverId, jobId: { in: jobs.map((j) => j.id) } },
    select: { jobId: true },
  });
  const rejected = new Set(rejections.map((r) => r.jobId));

  return jobs.filter((j) => !rejected.has(j.id));
}

function toAssignedPayload(
  offer: ReturnType<typeof buildNewJobBroadcastPayload>,
): JobAssignedToDriverPayload {
  return {
    jobId: offer.id,
    title: offer.title,
    status: offer.status,
    storeId: offer.storeId,
    storeName: offer.storeName,
    storeCity: offer.storeCity,
    orderCount: offer.orderCount,
    rideCode: offer.rideCode,
    totalCups: offer.totalCups ?? undefined,
    estimatedDistanceKm: offer.estimatedDistanceKm ?? undefined,
    estimatedMinutes: offer.estimatedMinutes ?? undefined,
    deliveryFee: offer.deliveryFee ?? undefined,
    previewStops: offer.previewStops,
    orderPreviews: offer.orderPreviews,
    forceRing: true,
  };
}

async function notifyDriverOfJob(driverId: string, job: PendingJobRow): Promise<void> {
  const offer = buildNewJobBroadcastPayload(
    {
      id: job.id,
      title: job.title,
      status: job.status,
      scheduledAt: job.scheduledAt,
      storeId: job.storeId,
      rideCode: job.rideCode,
      totalCups: job.totalCups,
      estimatedDistanceKm: job.estimatedDistanceKm,
      estimatedMinutes: job.estimatedMinutes,
      totalDistanceKm: job.totalDistanceKm,
      totalDeliveryFees: job.totalDeliveryFees,
      store: job.store,
      jobOrders: job.jobOrders.map((jo) => ({
        sequence: jo.sequence,
        order: jo.order,
      })),
    },
    { broadcastedAt: job.broadcastedAt ?? new Date(), forceRing: true },
  );

  const preAssigned = job.driverId === driverId;
  if (preAssigned) {
    broadcastJobAssignedToDriver(driverId, toAssignedPayload(offer));
  } else {
    emitNewJobToDriver(driverId, offer);
  }

  const push = buildNewJobPushFromBroadcast(offer, { forceRing: true });
  await sendPushToDriver(driverId, push);
}

/**
 * Re-deliver today's unclaimed (or pre-assigned) branch jobs that were broadcast
 * while this rider was offline — socket to driver:{id} + FCM.
 */
export async function replayPendingJobsForDriverGoingOnline(
  driverId: string,
  accessibleStoreIds: string[],
): Promise<{ jobsNotified: number }> {
  if (!(await isDriverAlertEligible(driverId))) {
    return { jobsNotified: 0 };
  }

  const jobs = await loadPendingJobs(driverId, accessibleStoreIds);
  if (jobs.length === 0) return { jobsNotified: 0 };

  let jobsNotified = 0;
  for (const job of jobs) {
    try {
      await notifyDriverOfJob(driverId, job);
      jobsNotified += 1;
    } catch (err) {
      logger.warn('Pending job replay failed for job', { driverId, jobId: job.id, err });
    }
  }

  logger.debug(`Replayed ${jobsNotified}/${jobs.length} pending jobs for driver ${driverId} going online`);
  return { jobsNotified };
}
