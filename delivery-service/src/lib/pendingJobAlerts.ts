import { prisma } from '@bingchun/db';
import { getEventPublisher } from '../sockets/eventPublisher';
import { todayDateRange } from './datetime';
import {
  buildJobRoutePreview,
  isDriverAlertEligible,
  jobOrdersWithDetails,
  type JobPreviewStop,
} from './deliveryJobHelpers';
import { sendNewJobDataPushToDriver, type NewJobPushPayload } from './fcm';
import { logger } from '../utils/logger';

type PendingJobRow = Awaited<ReturnType<typeof loadPendingJobs>>[number];

function cupsFromJobOrders(
  jobOrders: Array<{ order: { items: { quantity: number }[] } }>,
  totalCups: number | null,
): number {
  if (totalCups != null) return totalCups;
  return jobOrders.reduce(
    (sum, jo) => sum + jo.order.items.reduce((n, item) => n + item.quantity, 0),
    0,
  );
}

function deliveryFeesFromJobOrders(
  jobOrders: Array<{ order: { deliveryFee: number } }>,
  totalDeliveryFees: unknown,
): number {
  if (totalDeliveryFees != null) {
    const raw = totalDeliveryFees as { toNumber?: () => number };
    if (typeof raw.toNumber === 'function') return Math.round(raw.toNumber());
    const n = Number(totalDeliveryFees);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0);
}

function buildSocketOffer(job: PendingJobRow, previewStops: JobPreviewStop[]) {
  const orders = job.jobOrders.map((jo) => jo.order);
  const preview = buildJobRoutePreview(job.store, orders, false);
  const cups = cupsFromJobOrders(job.jobOrders, job.totalCups);
  const fees = deliveryFeesFromJobOrders(job.jobOrders, job.totalDeliveryFees);
  const sorted = [...job.jobOrders].sort((a, b) => a.sequence - b.sequence);
  const orderPreviews = sorted.slice(0, 3).map((jo) => ({
    orderNumber: jo.order.orderNumber,
    deliveryFee: jo.order.deliveryFee,
  }));

  return {
    id: job.id,
    rideCode: job.rideCode ?? null,
    title: job.title,
    status: job.status,
    scheduledAt: job.scheduledAt,
    storeId: job.storeId,
    storeName: job.store.name,
    storeCity: job.store.city,
    orderCount: job.jobOrders.length,
    totalCups: cups,
    estimatedDistanceKm: job.estimatedDistanceKm ?? job.totalDistanceKm ?? preview.estimatedDistanceKm,
    estimatedMinutes: job.estimatedMinutes ?? preview.estimatedMinutes,
    deliveryFee: fees,
    previewStops,
    orderPreviews,
    broadcastedAt: job.broadcastedAt ?? new Date(),
    forceRing: true,
  };
}

function buildPushPayload(job: PendingJobRow, offer: ReturnType<typeof buildSocketOffer>): NewJobPushPayload {
  const first = offer.previewStops[0];
  const dropoffAddress = first
    ? [first.addressLine, first.city, first.district].filter(Boolean).join(', ')
    : undefined;
  return {
    jobId: job.id,
    rideCode: job.rideCode ?? undefined,
    title: job.title,
    storeName: job.store.name,
    storeId: job.storeId,
    storeCity: job.store.city,
    orderCount: job.jobOrders.length,
    totalCups: offer.totalCups,
    estimatedDistanceKm: offer.estimatedDistanceKm ?? undefined,
    estimatedMinutes: offer.estimatedMinutes ?? undefined,
    deliveryFee: offer.deliveryFee,
    dropoffName: first?.customerName,
    dropoffAddress,
    extraStopCount: Math.max(0, job.jobOrders.length - 1),
    orderPreviewsJson: JSON.stringify(offer.orderPreviews),
    forceRing: true,
  };
}

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

async function notifyDriverOfJob(driverId: string, job: PendingJobRow): Promise<void> {
  const orders = job.jobOrders.map((jo) => jo.order);
  const { previewStops } = buildJobRoutePreview(job.store, orders, false);
  const offer = buildSocketOffer(job, previewStops);
  const preAssigned = job.driverId === driverId;

  const publisher = getEventPublisher();
  if (preAssigned) {
    await publisher.publish(`driver:${driverId}`, 'jobAssignedToDriver', { ...offer, jobId: job.id });
  } else {
    await publisher.publish(`driver:${driverId}`, 'newDeliveryJob', offer);
  }

  await sendNewJobDataPushToDriver(driverId, buildPushPayload(job, offer));
}

/**
 * Re-deliver today's unclaimed (or pre-assigned) branch jobs that were broadcast
 * while this rider was offline — socket to driver:{id} + data-only FCM.
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
