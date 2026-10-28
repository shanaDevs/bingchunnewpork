import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '@bingchun/db';
import {
  buildDeliveryRoutePayload,
  creditedDeliveredTotals,
  groupFailedOrderIdsByJob,
  optimizeDeliveryStops,
  invalidateJobRoute,
  isRejectAllowed,
  type RouteStop,
  type DeliveryDomainStateValue,
  patchDriverOpsProfile,
} from '@bingchun/delivery-domain';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { retryOnceOnDisconnect } from '../utils/prismaErrors';
import {
  jobOrdersWithDetails,
  formatJob,
  finalizeDeliveryJob,
  orderStopImageMeta,
  jobHasPickedUp,
  promoteNextQueuedJob,
  heldJobStatuses,
  prismaKnowsDeliveryJobStatus,
  assignedOrQueuedStatuses,
  REJECT_JOB_BEFORE_FAILURE_MESSAGE,
  driverHasUnpickedHeldJob,
  buildJobRoutePreview,
  countComplaintsForOrderIds,
  fetchDriverComplaintsByOrderIds,
  canDriverClaimMore,
  resolveCompletionRadiusM,
  distanceMeters,
  classifyIncompleteJob,
  type JobWithOrders,
} from '../lib/deliveryJobHelpers';
import { dateStringInColombo, todayDateRange, todayDateString } from '../lib/datetime';
import { enqueueOrderStatusOutbox } from '../lib/outbox';
import { ensureOtpForOrder, isOtpRequiredForStore } from '../lib/otp';
import { sendPushToDriver, sendPushToBranchDrivers } from '../lib/fcm';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';
import { getEventPublisher } from '../sockets/eventPublisher';
import { applyMeritDelta } from '../lib/meritPoints';
import { logger } from '../utils/logger';

async function requireAccessibleStores(driverId: string, jwtStoreId?: string | null): Promise<string[]> {
  const accessibleStoreIds = await getDriverAccessibleStoreIds(driverId, jwtStoreId);
  if (accessibleStoreIds.length === 0) {
    throw new AppError('Driver account is not linked to a branch', 403);
  }
  return accessibleStoreIds;
}

async function getDriverJobOrThrow(
  jobId: string,
  driverId: string,
  accessibleStoreIds: string[],
): Promise<JobWithOrders> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          addressLine: true,
          city: true,
          deliveryOtpRequired: true,
          completionRadiusM: true,
        },
      },
      jobOrders: jobOrdersWithDetails,
    },
  });
  if (!job || !accessibleStoreIds.includes(job.storeId)) throw new AppError('Job not found', 404);
  const claimableUnowned = job.status === 'SCHEDULED' && !job.driverId;
  if (job.driverId !== driverId && !claimableUnowned) {
    throw new AppError('Job assigned to another driver', 403);
  }
  return job as unknown as JobWithOrders;
}

export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const { from: todayFrom, to: todayTo } = todayDateRange();

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        storeId: { in: accessibleStoreIds },
        OR: [
          // Only today's unclaimed jobs are pickable — past-day jobs nobody
          // took are surfaced to admins as "Missed", not offered here.
          { status: 'SCHEDULED', driverId: null, scheduledAt: { gte: todayFrom, lte: todayTo } },
          // A job pre-targeted at this driver (e.g. a failure redelivery) — sits
          // SCHEDULED with driverId already set until they explicitly claim it.
          { status: 'SCHEDULED', driverId },
          { driverId, status: { in: await heldJobStatuses() } },
        ],
      },
      include: {
        store: { select: { name: true, city: true, lat: true, lng: true } },
        jobOrders: {
          select: {
            orderId: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                deliveryFee: true,
                deliveryLat: true,
                deliveryLng: true,
                deliveryAddressLine: true,
                deliveryCity: true,
                deliveryDistrict: true,
                guestName: true,
                user: { select: { name: true } },
                address: { select: { lat: true, lng: true, addressLine: true, city: true, district: true } },
              },
            },
          },
        },
      },
      // Newest first so fresh alerts appear at the top of the available list.
      orderBy: { scheduledAt: 'desc' },
    });

    return success(
      res,
      jobs.map((j) => {
        const isMine = j.driverId === driverId;
        const preview = buildJobRoutePreview(
          j.store,
          j.jobOrders.map((jo) => jo.order),
          isMine,
        );
        return {
          id: j.id,
          title: j.title,
          status: j.status,
          scheduledAt: j.scheduledAt,
          assignedAt: j.assignedAt,
          storeId: j.storeId,
          storeName: j.store.name,
          storeCity: j.store.city,
          orderCount: j.jobOrders.length,
          totalDeliveryFees: j.jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0),
          isMine,
          estimatedDistanceKm: preview.estimatedDistanceKm,
          estimatedMinutes: preview.estimatedMinutes,
          previewStops: preview.previewStops,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

/** Completed runs for this driver — powers the driver app History tab. */
export async function getMyJobHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        driverId,
        OR: [
          { status: 'COMPLETED' },
          ...(prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE') ? [{ status: 'VEHICLE_FAILURE' as const }] : []),
          // Own past-due held jobs (never finished) surface here as Incomplete
          // instead of lingering in the active pick list indefinitely.
          { status: { in: await heldJobStatuses() }, scheduledAt: { lt: todayDateRange().from } },
        ],
      },
      include: {
        store: { select: { name: true, city: true } },
        jobOrders: {
          select: {
            orderId: true,
            order: { select: { status: true, total: true, deliveryFee: true, cancelledAtStatus: true } },
          },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { scheduledAt: 'desc' }],
      take: limit,
    });

    const allOrderIds = jobs.flatMap((j) => j.jobOrders.map((jo) => jo.orderId));
    const [complaintsByOrder, failedAttempts] = await Promise.all([
      fetchDriverComplaintsByOrderIds(driverId, allOrderIds),
      jobs.length === 0
        ? Promise.resolve([])
        : prisma.deliveryAttempt.findMany({
            where: {
              jobId: { in: jobs.map((j) => j.id) },
              outcome: { not: 'DELIVERED' },
            },
            select: { jobId: true, orderId: true },
            distinct: ['jobId', 'orderId'],
          }),
    ]);
    const failedByJob = groupFailedOrderIdsByJob(failedAttempts);

    return success(
      res,
      jobs.map((j) => {
        const { deliveredCount, deliveredTotal } = creditedDeliveredTotals(
          j.jobOrders,
          failedByJob.get(j.id) ?? new Set(),
        );
        const jobOrderIds = j.jobOrders.map((jo) => jo.orderId);
        return {
          id: j.id,
          title: j.title,
          status: j.status,
          displayStatus:
            j.status === 'COMPLETED'
              ? 'COMPLETED'
              : j.status === 'VEHICLE_FAILURE'
                ? 'VEHICLE_FAILURE'
                : classifyIncompleteJob(j, deliveredCount),
          scheduledAt: j.scheduledAt,
          completedAt: j.completedAt,
          storeName: j.store.name,
          storeCity: j.store.city,
          orderCount: j.jobOrders.length,
          deliveredCount,
          deliveredTotal,
          totalDeliveryFees: j.totalDeliveryFees,
          complaintCount: countComplaintsForOrderIds(complaintsByOrder, jobOrderIds),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function getActiveJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        driverId,
        storeId: { in: accessibleStoreIds },
        status: { in: await heldJobStatuses() },
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            addressLine: true,
            city: true,
            deliveryOtpRequired: true,
            completionRadiusM: true,
          },
        },
        jobOrders: jobOrdersWithDetails,
      },
      orderBy: [{ status: 'asc' }, { assignedAt: 'asc' }],
    });

    // Prefer IN_PROGRESS, then ASSIGNED, then QUEUED.
    const priority = (s: string) => (s === 'IN_PROGRESS' ? 0 : s === 'ASSIGNED' ? 1 : 2);
    const sorted = [...jobs].sort((a, b) => priority(a.status) - priority(b.status));
    const job = sorted[0];
    if (!job) return success(res, null);
    return success(res, await formatJob(job as unknown as JobWithOrders, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (job.status === 'SCHEDULED' && (job as { driverId?: string | null }).driverId) {
      throw new AppError('Job assigned to another driver', 403);
    }
    return success(res, await formatJob(job, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

export async function getJobRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (!['SCHEDULED', 'ASSIGNED', 'QUEUED', 'IN_PROGRESS'].includes(job.status)) {
      throw new AppError('Route not available for this job', 400);
    }

    const isMine = !!(job as { driverId?: string | null }).driverId &&
      (job as { driverId?: string | null }).driverId === driverId;

    const pendingOrders = job.jobOrders
      .filter((jo) => jo.order.status !== 'DELIVERED' && jo.order.status !== 'CANCELLED')
      .map((jo) => jo.order);

    type RawStop = Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>;
    const routingRawStops: RawStop[] = [];

    for (const order of pendingOrders) {
      const lat = order.deliveryLat ?? order.address?.lat;
      const lng = order.deliveryLng ?? order.address?.lng;
      if (lat == null || lng == null) continue;
      routingRawStops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: isMine ? (order.user?.name ?? order.guestName ?? 'Guest') : 'Customer',
        customerPhone: isMine ? (order.user?.phone ?? order.guestPhone ?? '') : '',
        addressLine: isMine ? (order.deliveryAddressLine ?? order.address?.addressLine ?? '') : '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: 0,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        ...orderStopImageMeta(order.items),
        lat,
        lng,
      });
    }

    // Vehicle-failure redeliveries pick up from the stranded rider's breakdown spot, not
    // the outlet — route origin (and the "store" pin the app draws) follows the rider.
    const routeOrigin =
      job.pickupLat != null && job.pickupLng != null
        ? {
            id: 'pickup',
            name: job.pickupLabel ?? 'Pickup location',
            addressLine: '',
            city: '',
            lat: job.pickupLat,
            lng: job.pickupLng,
          }
        : job.store;

    const routingStops = optimizeDeliveryStops({ lat: routeOrigin.lat, lng: routeOrigin.lng }, routingRawStops);
    // Customer identity is already redacted in routingRawStops when !isMine. Geometry stays real
    // either way so a driver can judge the run on the map before claiming it.
    const payload = await buildDeliveryRoutePayload(routeOrigin, routingStops, job.id);

    return success(res, {
      jobId: job.id,
      ...payload,
    });
  } catch (err) {
    next(err);
  }
}

async function takeScheduledJob(req: Request, res: Response) {
  const driverId = req.user!.sub;
  const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
  const jobId = req.params.id as string;

  const activeRuns = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: await heldJobStatuses() } },
    select: { id: true, status: true },
  });
  const hasInProgress = activeRuns.some((j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');
  // Cap at one held run plus one queued-next job — a driver already holding a
  // QUEUED job (e.g. claimed while RETURNING) can't stack a further claim on
  // top of it until that queue slot is promoted/cleared.
  const hasQueuedRun = activeRuns.some((j) => j.status === 'QUEUED');

  const driver = await prisma.adminUser.findFirst({
    where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
    select: { isActive: true, dutyStatus: true, name: true },
  });
  if (!driver?.isActive) throw new AppError('Driver account is suspended', 403);
  if (driver.dutyStatus !== 'ONLINE' && driver.dutyStatus !== 'ON_DELIVERY') {
    throw new AppError('You must be online and available to accept jobs', 400);
  }

  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: { jobOrders: { select: { orderId: true } }, store: { select: { name: true } } },
  });
  if (!job || !accessibleStoreIds.includes(job.storeId)) throw new AppError('Job not found', 404);
  if (job.status !== 'SCHEDULED') throw new AppError('Job is not available for assignment', 400);
  // A job pre-targeted at this driver (e.g. a failure redelivery) already has driverId
  // set — only reject when it belongs to someone else.
  if (job.driverId && job.driverId !== driverId) throw new AppError('Job already assigned', 400);
  const isPreTargetedToMe = job.driverId === driverId;
  if (!isPreTargetedToMe && dateStringInColombo(job.scheduledAt) !== todayDateString()) {
    throw new AppError('This job is no longer available to claim', 400);
  }

  // Claiming stays blocked until the held run reaches RETURNING or completes —
  // no more picking up a next job mid-delivery.
  if (hasInProgress) {
    throw new AppError('Finish your current delivery before claiming another job', 409, 'ACTIVE_JOB');
  }
  if (hasQueuedRun) {
    throw new AppError(
      'You already have a queued job — finish your current delivery before claiming another',
      409,
      'ACTIVE_JOB',
    );
  }
  const nextStatus = 'ASSIGNED';

  const result = await prisma.deliveryJob.updateMany({
    where: { id: job.id, status: 'SCHEDULED', OR: [{ driverId: null }, { driverId }] },
    data: {
      driverId,
      status: nextStatus,
      assignedAt: new Date(),
    },
  });
  if (result.count === 0) throw new AppError('Job already assigned', 400);

  const updated = await prisma.deliveryJob.findUnique({
    where: { id: job.id },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          addressLine: true,
          city: true,
          deliveryOtpRequired: true,
          completionRadiusM: true,
        },
      },
      jobOrders: jobOrdersWithDetails,
    },
  });
  if (!updated) throw new AppError('Job not found', 404);

  await prisma.deliveryEvent.createMany({
    data: job.jobOrders.map((jo) => ({
      orderId: jo.orderId,
      jobId: job.id,
      driverId,
      state: 'ASSIGNED' as const,
      note: 'Job assigned to driver',
    })),
  });

  await patchDriverOpsProfile(driverId, { dutyStatus: 'ON_DELIVERY' }).catch(() => {});

  getEventPublisher()
    .publish(`branch-pool:${job.storeId}`, 'deliveryJobClaimed', {
      jobId: job.id,
      driverId,
      driverName: driver.name,
    })
    .catch(() => {});

  getEventPublisher()
    .publish(`store:${job.storeId}`, 'deliveryJobUpdated', {
      jobId: job.id,
      status: nextStatus,
    })
    .catch(() => {});

  sendPushToDriver(driverId, 'New delivery job', `You have ${job.jobOrders.length} order(s) to deliver`, {
    jobId: job.id,
    type: 'JOB_ASSIGNED',
  }).catch(() => {});

  return success(res, await formatJob(updated as unknown as JobWithOrders, { viewerDriverId: driverId }));
}

export async function assignJob(req: Request, res: Response, next: NextFunction) {
  try {
    await takeScheduledJob(req, res);
  } catch (err) {
    next(err);
  }
}

/** App uses claim; same rules as assign across accessible branches. */
export async function claimJob(req: Request, res: Response, next: NextFunction) {
  try {
    await takeScheduledJob(req, res);
  } catch (err) {
    next(err);
  }
}

const rejectSchema = z.object({
  reason: z.string().min(3).max(500),
});

/**
 * Pre-pickup reject/cancel: unassign driver, record audit, re-broadcast to branch pool.
 */
export async function rejectJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const { reason } = rejectSchema.parse(req.body);
    const jobId = req.params.id as string;

    const job = await getDriverJobOrThrow(jobId, driverId, accessibleStoreIds);
    if (!['ASSIGNED', 'QUEUED'].includes(job.status)) {
      throw new AppError('Only assigned or queued jobs can be rejected before pickup', 400);
    }
    if ((job as { driverId?: string | null }).driverId !== driverId) {
      throw new AppError('Job is not assigned to you', 403);
    }

    const events = await prisma.deliveryEvent.findMany({
      where: { jobId },
      select: { state: true },
    });
    if (!isRejectAllowed(events.map((e) => e.state as DeliveryDomainStateValue))) {
      throw new AppError('Cannot reject after pickup — use delivery failure or complaint', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const unassigned = await tx.deliveryJob.updateMany({
        where: {
          id: jobId,
          driverId,
          status: { in: await assignedOrQueuedStatuses() },
        },
        data: {
          driverId: null,
          status: 'SCHEDULED',
          assignedAt: null,
          broadcastedAt: new Date(),
        },
      });
      if (unassigned.count === 0) throw new AppError('Job could not be unassigned', 409);

      await tx.deliveryJobRejection.create({
        data: {
          id: randomUUID(),
          jobId,
          driverId,
          reason,
        },
      });

      await tx.deliveryEvent.createMany({
        data: job.jobOrders.map((jo) => ({
          orderId: jo.orderId,
          jobId,
          driverId,
          state: 'PENDING_ASSIGNMENT' as const,
          note: `Rejected by driver: ${reason}`,
        })),
      });

      return unassigned;
    });

    if (result.count === 0) throw new AppError('Job could not be unassigned', 409);

    await applyMeritDelta({
      driverId,
      orderId: job.jobOrders[0]?.orderId,
      delta: -5,
      eventType: 'CANCEL_BEFORE_PICKUP',
      reason: `Accepted order cancelled before pickup: ${reason}`,
    }).catch(() => {});

    const remaining = await prisma.deliveryJob.count({
      where: { driverId, status: { in: await heldJobStatuses() } },
    });
    if (remaining === 0) {
      await patchDriverOpsProfile(driverId, { dutyStatus: 'ONLINE' }).catch(() => {});
    }

    getEventPublisher()
      .publish(`store:${job.store.id}`, 'deliveryJobUpdated', {
        jobId: job.id,
        status: 'SCHEDULED',
      })
      .catch(() => {});

    const broadcastedAt = new Date();
    // Only ring drivers if the job is still claimable today — otherwise it just
    // sits SCHEDULED/unassigned and surfaces as "Missed" in the admin Incomplete tab.
    if (dateStringInColombo(job.scheduledAt) === todayDateString()) {
      // Re-broadcast so eligible online drivers (including this one) can claim again.
      getEventPublisher()
        .publish(`branch-pool:${job.store.id}`, 'newDeliveryJob', {
          id: job.id,
          title: job.title,
          status: 'SCHEDULED',
          scheduledAt: job.scheduledAt,
          storeId: job.store.id,
          storeName: job.store.name,
          orderCount: job.jobOrders.length,
          broadcastedAt,
        })
        .catch(() => {});

      sendPushToBranchDrivers(job.store.id, {
        jobId: job.id,
        title: job.title,
        storeName: job.store.name,
        storeId: job.store.id,
        orderCount: job.jobOrders.length,
      }).catch(() => {});
    }

    return success(res, { rejected: true, jobId });
  } catch (err) {
    next(err);
  }
}

const pickupJobSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Mark job as picked up at the outlet. Job stays ASSIGNED until the driver starts the run. */
export async function pickupJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const body = pickupJobSchema.parse(req.body ?? {});
    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(job.status)) {
      throw new AppError('Job must be assigned or in progress to mark pickup', 400);
    }

    const hasPickupOverride = job.pickupLat != null && job.pickupLng != null;
    if (!hasPickupOverride) {
      // Same branch geofence as ride completion. Jobs with a pickup override (e.g.
      // vehicle-failure redeliveries) skip this — the admin already hand-picked this
      // rider for this job, so pickup is trusted without a GPS check.
      const radiusM = await resolveCompletionRadiusM(job.store.completionRadiusM);
      const distanceM = distanceMeters(body.lat, body.lng, job.store.lat, job.store.lng);
      if (distanceM > radiusM) {
        throw new AppError(
          `You must be within ${radiusM}m of the branch to confirm pickup (currently ${Math.round(distanceM)}m away)`,
          400,
          'OUTSIDE_BRANCH_RADIUS',
          { distanceM: Math.round(distanceM), radiusM },
        );
      }
    }

    const alreadyPickedUp = await jobHasPickedUp(job.id, job.status);
    if (!alreadyPickedUp) {
      await prisma.deliveryEvent.createMany({
        data: job.jobOrders
          .filter((jo) => jo.order.status !== 'DELIVERED' && jo.order.status !== 'CANCELLED')
          .map((jo) => ({
            orderId: jo.orderId,
            jobId: job.id,
            driverId,
            state: 'PICKED_UP' as const,
            note: 'Driver confirmed pickup from branch',
          })),
      });
    }

    getEventPublisher()
      .publish(`store:${job.store.id}`, 'deliveryJobUpdated', { jobId: job.id, status: job.status })
      .catch(() => {});

    const refreshed = await getDriverJobOrThrow(job.id, driverId, accessibleStoreIds);
    return success(res, await formatJob(refreshed, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

export async function startJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (job.status === 'IN_PROGRESS') {
      return success(res, await formatJob(job, { viewerDriverId: driverId }));
    }
    if (job.status === 'COMPLETED') {
      throw new AppError('This run is already completed', 400);
    }
    if (job.status !== 'ASSIGNED' && job.status !== 'QUEUED') {
      throw new AppError(
        job.status === 'SCHEDULED'
          ? 'Claim this job before starting the run'
          : `Job cannot be started while ${job.status.toLowerCase().replace(/_/g, ' ')}`,
        400,
      );
    }

    if (!(await jobHasPickedUp(job.id, job.status))) {
      throw new AppError('Confirm pickup at the outlet before starting the delivery run', 400);
    }

    // Only one IN_PROGRESS at a time — promote this one and keep others queued.
    const otherActive = await prisma.deliveryJob.findFirst({
      where: {
        driverId,
        status: 'IN_PROGRESS',
        id: { not: job.id },
      },
      select: { id: true },
    });
    if (otherActive) {
      throw new AppError('Finish or pause your current run before starting another', 400);
    }

    await prisma.deliveryJob.update({
      where: { id: job.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });

    invalidateJobRoute(job.id);

    const store = await prisma.store.findUnique({
      where: { id: job.store.id },
      select: { deliveryOtpRequired: true },
    });
    const otpRequired = isOtpRequiredForStore(store);

    const pendingOrders = job.jobOrders.filter(
      (jo) => jo.order.status !== 'DELIVERED' && jo.order.status !== 'CANCELLED',
    );

    await Promise.all(
      pendingOrders.map(async (jo) => {
        if (jo.order.status === 'READY') {
          await enqueueOrderStatusOutbox({
            orderId: jo.orderId,
            status: 'OUT_FOR_DELIVERY',
            note: 'Driver started delivery run',
            orderNumber: jo.order.orderNumber,
            userId: jo.order.userId,
            orderMode: jo.order.orderMode,
          });
        }

        await prisma.deliveryEvent.create({
          data: {
            orderId: jo.orderId,
            jobId: job.id,
            driverId,
            state: 'EN_ROUTE',
            note: 'Driver started delivery run',
          },
        });

        if (otpRequired) {
          await ensureOtpForOrder(jo.orderId);
          await prisma.deliveryEvent.create({
            data: {
              orderId: jo.orderId,
              jobId: job.id,
              driverId,
              state: 'AWAITING_OTP',
              note: 'OTP required for this branch',
            },
          });
        }
      }),
    );

    getEventPublisher()
      .publish(`store:${job.store.id}`, 'deliveryJobUpdated', { jobId: job.id, status: 'IN_PROGRESS' })
      .catch(() => {});

    const refreshed = await getDriverJobOrThrow(job.id, driverId, accessibleStoreIds);
    return success(res, { ...await formatJob(refreshed, { viewerDriverId: driverId }), otpRequired });
  } catch (err) {
    next(err);
  }
}

const completeJobSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function completeJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const body = completeJobSchema.parse(req.body ?? {});

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (job.status === 'VEHICLE_FAILURE') {
      throw new AppError('This ride ended due to vehicle failure and cannot be completed', 400);
    }
    if (job.status === 'IN_PROGRESS') {
      throw new AppError('Return to the branch to complete this ride', 400);
    }
    if (job.status !== 'RETURNING') {
      throw new AppError('Job must be returning to branch to complete', 400);
    }

    const failedAttempts = await prisma.deliveryAttempt.findMany({
      where: {
        jobId: job.id,
        outcome: { not: 'DELIVERED' },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const failedOrderIds = new Set(failedAttempts.map((a) => a.orderId));

    const undelivered = job.jobOrders.filter(
      (jo) =>
        jo.order.status !== 'DELIVERED' &&
        jo.order.status !== 'CANCELLED' &&
        !failedOrderIds.has(jo.orderId),
    );
    if (undelivered.length > 0) {
      throw new AppError(`${undelivered.length} order(s) still pending delivery`, 400);
    }

    const radiusM = await resolveCompletionRadiusM(job.store.completionRadiusM);
    const distanceM = distanceMeters(body.lat, body.lng, job.store.lat, job.store.lng);
    if (distanceM > radiusM) {
      throw new AppError(
        `You must be within ${radiusM}m of the branch to complete this ride (currently ${Math.round(distanceM)}m away)`,
        400,
        'OUTSIDE_BRANCH_RADIUS',
        { distanceM: Math.round(distanceM), radiusM },
      );
    }

    const updated = await prisma.deliveryJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completedLat: body.lat,
        completedLng: body.lng,
      },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            lat: true,
            lng: true,
            addressLine: true,
            city: true,
            deliveryOtpRequired: true,
            completionRadiusM: true,
          },
        },
        jobOrders: jobOrdersWithDetails,
      },
    });

    await finalizeDeliveryJob(job.id).catch((err) => {
      logger.error('finalizeDeliveryJob failed after job complete', { jobId: job.id, err });
    });
    await promoteNextQueuedJob(driverId).catch(() => {});

    const remaining = await prisma.deliveryJob.count({
      where: { driverId, status: { in: await heldJobStatuses() } },
    });
    if (remaining === 0) {
      await patchDriverOpsProfile(driverId, { dutyStatus: 'ONLINE' }).catch(() => {});
    }

    getEventPublisher()
      .publish(`store:${job.store.id}`, 'deliveryJobUpdated', { jobId: job.id, status: 'COMPLETED' })
      .catch(() => {});

    return success(res, await formatJob(updated as unknown as JobWithOrders, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Vehicle failure
// ---------------------------------------------------------------------------

const vehicleFailureSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(500).nullish(),
});

type VehicleFailureResult = {
  jobId: string;
  orderId: string;
  deliveryFailed: true;
  rideEnteredReturning: false;
  rideReleased: true;
};

async function reconnectPrisma(): Promise<void> {
  await prisma.$disconnect().catch(() => undefined);
  await prisma.$connect();
}

/**
 * Driver reports their vehicle has broken down mid-ride. Records a
 * VEHICLE_FAILURE delivery attempt on the current active stop so the admin
 * can reassign the run to another driver. The driver's GPS coordinates are
 * captured so dispatch knows exactly where to send the replacement rider.
 */
async function executeVehicleFailureReport(req: Request, replay: boolean): Promise<VehicleFailureResult> {
    // Guard before any writes — delivery-service has no runtime schema-patch helper of
    // its own (unlike the legacy backend), so if this process's Prisma client was
    // generated before the VEHICLE_FAILURE job-status migration landed, fail loudly here
    // instead of partially writing DeliveryAttempt rows and then hitting a raw DB error
    // on the status-flip update below.
    if (!prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE')) {
      throw new AppError('Vehicle failure reporting is not available yet — try again shortly', 503);
    }

    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const { lat, lng, note } = vehicleFailureSchema.parse(req.body);

    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        job: {
          driverId,
          status: { in: ['IN_PROGRESS', 'RETURNING'] },
          storeId: { in: accessibleStoreIds },
        },
        order: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
      },
      orderBy: { sequence: 'asc' },
      include: { order: true, job: { include: { store: { select: { id: true, name: true } } } } },
    });
    if (!link) {
      if (replay) {
        const since = new Date(Date.now() - 60_000);
        const closed = await prisma.deliveryJob.findFirst({
          where: {
            driverId,
            storeId: { in: accessibleStoreIds },
            status: 'VEHICLE_FAILURE',
            completedAt: { gte: since },
          },
          orderBy: { completedAt: 'desc' },
          select: { id: true },
        });
        const recorded = closed
          ? await prisma.deliveryAttempt.findFirst({
              where: { jobId: closed.id, outcome: 'VEHICLE_FAILURE' },
              orderBy: { createdAt: 'desc' },
              select: { orderId: true },
            })
          : null;
        if (closed && recorded) {
          return {
            jobId: closed.id,
            orderId: recorded.orderId,
            deliveryFailed: true,
            rideEnteredReturning: false,
            rideReleased: true,
          };
        }
      }
      if (await driverHasUnpickedHeldJob(driverId, accessibleStoreIds)) {
        throw new AppError(REJECT_JOB_BEFORE_FAILURE_MESSAGE, 400);
      }
      throw new AppError('No active delivery to report a vehicle failure for', 400);
    }

    const remaining = await prisma.deliveryJobOrder.findMany({
      where: {
        jobId: link.jobId,
        sequence: { gte: link.sequence },
        order: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
      },
      orderBy: { sequence: 'asc' },
      include: { order: { select: { id: true, status: true } } },
    });

    const failureNote = note ?? 'Vehicle failure';
    const orderIds: string[] = [];
    for (const stop of remaining) {
      const prior = await prisma.deliveryAttempt.count({
        where: { orderId: stop.orderId, jobId: link.jobId },
      });
      await prisma.deliveryAttempt.create({
        data: {
          orderId: stop.orderId,
          jobId: link.jobId,
          driverId,
          attemptNo: prior + 1,
          outcome: 'VEHICLE_FAILURE',
          note: failureNote,
          lat,
          lng,
        },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId: stop.orderId,
          status: stop.order.status,
          note: note ? `Vehicle failure: ${note}` : 'Vehicle failure reported by driver',
        },
      });
      orderIds.push(stop.orderId);
    }

    const allLinks = await prisma.deliveryJobOrder.findMany({
      where: { jobId: link.jobId },
      select: { orderId: true, order: { select: { status: true, deliveryFee: true, cancelledAtStatus: true } } },
    });
    const { deliveredTotal } = creditedDeliveredTotals(allLinks, new Set(orderIds));

    await prisma.deliveryJob.update({
      where: { id: link.jobId },
      data: {
        status: 'VEHICLE_FAILURE',
        completedAt: new Date(),
        totalDeliveryFees: deliveredTotal,
      },
    });
    await promoteNextQueuedJob(driverId).catch(() => {});

    const remainingHeld = await prisma.deliveryJob.count({
      where: { driverId, status: { in: await heldJobStatuses() } },
    });
    if (remainingHeld === 0) {
      await patchDriverOpsProfile(driverId, { dutyStatus: 'ONLINE' }).catch(() => {});
    }

    const storeId = link.job.store.id;
    invalidateJobRoute(link.job.id);
    const orderId = orderIds[0] ?? link.orderId;
    const failurePayload = {
      jobId: link.job.id,
      driverId,
      orderId,
      lat,
      lng,
      storeId,
      rideCode: link.job.rideCode ?? null,
      storeName: link.job.store.name ?? null,
    };

    getEventPublisher()
      .publish(`store:${storeId}`, 'vehicleFailureReported', failurePayload)
      .catch(() => {});
    getEventPublisher()
      .publish('delivery-ops', 'vehicleFailureReported', failurePayload)
      .catch(() => {});
    getEventPublisher()
      .publish(`store:${storeId}`, 'deliveryJobUpdated', {
        jobId: link.job.id,
        status: 'VEHICLE_FAILURE',
      })
      .catch(() => {});

    return {
      jobId: link.job.id,
      orderId,
      deliveryFailed: true,
      rideEnteredReturning: false,
      rideReleased: true,
    };
}

export async function reportVehicleFailure(req: Request, res: Response, next: NextFunction) {
  try {
    let attempt = 0;
    const payload = await retryOnceOnDisconnect(async () => {
      attempt += 1;
      return executeVehicleFailureReport(req, attempt > 1);
    }, reconnectPrisma);
    return success(res, payload);
  } catch (err) {
    next(err);
  }
}
