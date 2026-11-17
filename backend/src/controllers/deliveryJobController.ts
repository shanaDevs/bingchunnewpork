import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { retryOnceOnDisconnect } from '../utils/prismaErrors';
import { success } from '../utils/apiResponse';
import { decimalFieldToLkrNumber, lkrToDecimal, parseDecimalFromDb } from '../lib/moneyDecimal';
import { serializeDeliveryJobFees } from '../lib/walletApiMoney';
import {
  buildNewJobBroadcastPayload,
  buildNewJobPushFromBroadcast,
} from '../lib/newJobBroadcast';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import {
  prismaKnowsDeliveryJobStatus,
  DRIVER_HELD_JOB_STATUSES,
  allocateRideCode,
  buildJobRoutePreview,
  canDriverClaimMore,
  classifyIncompleteJob,
  countComplaintsForOrderIds,
  buildJobHistoryOrderRows,
  creditedDeliveredTotals,
  distanceMeters,
  fetchDriverComplaintsByOrderIds,
  fetchLatestFailedAttemptsForJob,
  finalizeDeliveryJob,
  persistJobActualRouteFromGps,
  formatJobOrder,
  groupLatestFailedAttemptsByJob,
  isRejectAllowed,
  jobOrdersWithDetails,
  maybeEnterReturningPhase,
  recordVehicleFailureAndReleaseJob,
  executeAdminCancelDeliveryJob,
  REJECT_JOB_BEFORE_FAILURE_MESSAGE,
  ensureJobDeliveryTerminalEvent,
  orderStopImageMeta,
  promoteNextQueuedJob,
  releaseDriverWhenIdle,
  resolveCompletionRadiusM,
  resolveJobRouteOrigin,
} from '../lib/deliveryJobHelpers';
import {
  dateStringInColombo,
  rescheduleMissedJobToToday,
  todayDateRange,
  todayDateString,
} from '../lib/datetime';
import { applyMeritDelta, MERIT_DELTAS, recordSuccessfulDelivery } from '../lib/meritPoints';
import { resolveAdminStoreIdForRequest } from '../lib/adminDeliveryHelpers';
import { isAllBranchRole } from '../middleware/auth';
import { getMaxCupsPerRider } from '../lib/appSchema';
import { buildDeliveryRoutePayload } from '../lib/deliveryRouteResponse';
import { invalidateJobRoute } from '../lib/routeCache';
import {
  customerRouteStops,
  optimizeDeliveryStops,
  totalRouteDistanceKm,
  totalRouteEtaMinutes,
  type RouteStop,
} from '../lib/routeOptimizer';
import { fetchRoadRoute, buildRouteWaypoints } from '../lib/roadRouting';
import {
  assertDriverVehicleReadyForWork,
  buildJobHandoverResponse,
  dropoffApiFields,
  JobHandoverError,
  mapPinPoint,
  markVehicleFixed,
  recordDeliveredAttempt,
  resolveRiderDropoffCoords,
  VEHICLE_BREAKDOWN_OPEN_CODE,
} from '@bingchun/delivery-domain';
import { throwIfVehicleBreakdownDomainError } from '../lib/vehicleBreakdownErrors';
import { notifyCustomerOrderStatus } from '../lib/customerNotifications';
import { paymentStatusOnOrderStatus } from '../lib/orderPayment';
import {
  broadcastDeliveryJobUpdated,
  broadcastJobClaimed,
  broadcastNewJob,
  broadcastVehicleBreakdownCleared,
  broadcastVehicleFailureReported,
} from '../lib/socket';
import { jobHasPickedUp } from '../lib/liveDriverTracking';
import { resolveCustomerDisplayName } from '../lib/customerName';
import { sendPushToBranchDrivers } from '../lib/driverPush';
import { getDriverAccessibleStoreIds } from '../lib/driverAccess';
import {
  createDeliveryOtp,
  ensureOtpForOrder,
  isOtpRequiredForStore,
  requireOtpIfNeeded,
} from '../lib/deliveryOtp';
import type { DeliveryAttemptOutcome } from '@bingchun/db';

function formatTotalDeliveryFeesForApi(stored: unknown, fallbackLkr: number): string {
  if (stored != null) return serializeDeliveryJobFees(parseDecimalFromDb(stored)) ?? '0';
  return String(fallbackLkr);
}

async function requireAccessibleStores(driverId: string, jwtStoreId?: string | null): Promise<string[]> {
  const accessibleStoreIds = await getDriverAccessibleStoreIds(driverId, jwtStoreId);
  if (accessibleStoreIds.length === 0) {
    throw new AppError('Driver account is not linked to a branch', 403);
  }
  return accessibleStoreIds;
}

/** True when the driver holds an accepted job that has not been picked up yet. */
async function driverHasUnpickedHeldJob(
  driverId: string,
  accessibleStoreIds: string[],
  orderId?: string,
): Promise<boolean> {
  const held = await prisma.deliveryJob.findFirst({
    where: {
      driverId,
      storeId: { in: accessibleStoreIds },
      status: { in: ['ASSIGNED', 'QUEUED'] },
      ...(orderId ? { jobOrders: { some: { orderId } } } : {}),
    },
    select: { id: true, status: true },
  });
  if (!held) return false;
  return !(await jobHasPickedUp(held.id, held.status));
}

async function getDriverJobOrThrow(jobId: string, driverId: string, accessibleStoreIds: string[]) {
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
  return job;
}

async function formatJob(
  job: Awaited<ReturnType<typeof getDriverJobOrThrow>>,
  opts: { viewerDriverId?: string | null } = {},
) {
  const isAssignedToViewer =
    !!opts.viewerDriverId && !!job.driverId && job.driverId === opts.viewerDriverId;
  const redactCustomer = !isAssignedToViewer;
  const orderIds = job.jobOrders.map((jo) => jo.orderId);
  const failedByOrder = await fetchLatestFailedAttemptsForJob(job.id, orderIds);
  const failedOrderIds = new Set(failedByOrder.keys());
  const complaintsByOrder =
    opts.viewerDriverId && orderIds.length
      ? await fetchDriverComplaintsByOrderIds(opts.viewerDriverId, orderIds)
      : new Map();

  const orders = job.jobOrders.map((jo) => {
    const failed = failedByOrder.get(jo.orderId);
    const deliveryFailed = failedOrderIds.has(jo.orderId);
    return {
      ...formatJobOrder(jo.order, jo.sequence, { redactCustomer, redactPricing: true }),
      deliveryFailed,
      failureOutcome: deliveryFailed ? (failed?.outcome ?? null) : null,
      failureNote: deliveryFailed ? (failed?.note ?? null) : null,
      complaints: complaintsByOrder.get(jo.orderId) ?? [],
    };
  });

  // Count failed attempts as resolved so the driver app canComplete gate works.
  const deliveredCount = orders.filter(
    (o) => o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.deliveryFailed,
  ).length;

  const completionRadiusM = await resolveCompletionRadiusM(job.store.completionRadiusM);
  const totalCups =
    (job as { totalCups?: number | null }).totalCups ??
    job.jobOrders.reduce(
      (sum, jo) => sum + jo.order.items.reduce((n, item) => n + item.quantity, 0),
      0,
    );
  const creditedLinks = job.jobOrders.map((jo) => ({
    orderId: jo.orderId,
    order: {
      status: jo.order.status,
      deliveryFee: jo.order.deliveryFee,
      cancelledAtStatus:
        (jo.order as { cancelledAtStatus?: string | null }).cancelledAtStatus ?? null,
    },
  }));
  const { deliveredTotal } = creditedDeliveredTotals(creditedLinks, failedByOrder);

  const terminalFeeSnapshot =
    job.status === 'COMPLETED' || job.status === 'VEHICLE_FAILURE' || job.status === 'CANCELLED';
  const storedFees = (job as { totalDeliveryFees?: unknown }).totalDeliveryFees;
  const totalDeliveryFees = terminalFeeSnapshot
    ? formatTotalDeliveryFeesForApi(null, deliveredTotal)
    : storedFees != null
      ? serializeDeliveryJobFees(parseDecimalFromDb(storedFees))
      : String(job.jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0));

  const actualMinutes =
    job.startedAt && job.completedAt
      ? Math.max(1, Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 60_000))
      : null;

  return {
    id: job.id,
    rideCode: (job as { rideCode?: string | null }).rideCode ?? null,
    title: job.title,
    status: job.status,
    scheduledAt: job.scheduledAt,
    assignedAt: job.assignedAt,
    startedAt: job.startedAt,
    returnStartedAt: (job as { returnStartedAt?: Date | null }).returnStartedAt ?? null,
    completedAt: job.completedAt,
    store: {
      ...job.store,
      deliveryOtpRequired: isOtpRequiredForStore(job.store),
      completionRadiusM,
    },
    pickup:
      (job as { pickupLat?: number | null }).pickupLat != null &&
      (job as { pickupLng?: number | null }).pickupLng != null
        ? {
            lat: (job as { pickupLat: number }).pickupLat,
            lng: (job as { pickupLng: number }).pickupLng,
            label: (job as { pickupLabel?: string | null }).pickupLabel ?? 'Pickup location',
          }
        : null,
    orderCount: orders.length,
    deliveredCount,
    totalCups,
    totalDeliveryFees,
    estimatedDistanceKm: (job as { estimatedDistanceKm?: number | null }).estimatedDistanceKm ?? job.totalDistanceKm ?? null,
    estimatedMinutes: (job as { estimatedMinutes?: number | null }).estimatedMinutes ?? null,
    actualDistanceKm: (job as { actualDistanceKm?: number | null }).actualDistanceKm ?? null,
    actualMinutes,
    totalDistanceKm: job.totalDistanceKm ?? null,
    orders,
    pickedUp: await jobHasPickedUp(job.id, job.status),
    canComplete: job.status === 'RETURNING' && deliveredCount === orders.length,
    canClaimMore: opts.viewerDriverId ? await canDriverClaimMore(opts.viewerDriverId) : true,
  };
}

function mapFailureNoteToOutcome(note?: string): DeliveryAttemptOutcome {
  const n = (note || '').toLowerCase();
  if (n.includes('not available') || n.includes('cannot contact') || n.includes('unreachable')) {
    return 'CUSTOMER_UNREACHABLE';
  }
  if (n.includes('address') || n.includes('wrong')) return 'WRONG_ADDRESS';
  if (n.includes('refused')) return 'REFUSED';
  if (n.includes('payment')) return 'PAYMENT_FAILED';
  return 'OTHER';
}

export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const { from: todayFrom, to: todayTo } = todayDateRange();

    const jobs = await retryOnceOnDisconnect(() => prisma.deliveryJob.findMany({
      where: {
        storeId: { in: accessibleStoreIds },
        // Guard against orphaned jobs whose orders were removed/cascaded out
        // from under them (e.g. a redelivery job rejected, then its sole
        // order deleted) — never surface a job with nothing left to deliver.
        jobOrders: { some: {} },
        OR: [
          // Only today's unclaimed jobs are pickable — past-day jobs nobody
          // took are surfaced to admins as "Missed", not offered here.
          { status: 'SCHEDULED', driverId: null, scheduledAt: { gte: todayFrom, lte: todayTo } },
          // A job pre-targeted at this driver (e.g. a failure redelivery) — sits
          // SCHEDULED with driverId already set until they explicitly claim it.
          { status: 'SCHEDULED', driverId },
          { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
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
                items: { select: { quantity: true } },
              },
            },
          },
        },
      },
      // Newest first so fresh alerts appear at the top of the available list.
      orderBy: { scheduledAt: 'desc' },
    }), async () => {
      await prisma.$connect();
    });

    return success(
      res,
      jobs.map((j) => {
        const cupsFromOrders = j.jobOrders.reduce(
          (sum, jo) => sum + jo.order.items.reduce((n, item) => n + item.quantity, 0),
          0,
        );
        const fees = j.jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0);
        const isMine = j.driverId === driverId;
        const preview = buildJobRoutePreview(
          j.store,
          j.jobOrders.map((jo) => jo.order),
          isMine,
        );
        return {
          id: j.id,
          rideCode: j.rideCode ?? null,
          title: j.title,
          status: j.status,
          scheduledAt: j.scheduledAt,
          assignedAt: j.assignedAt,
          storeId: j.storeId,
          storeName: j.store.name,
          storeCity: j.store.city,
          orderCount: j.jobOrders.length,
          totalCups: j.totalCups ?? cupsFromOrders,
          totalDeliveryFees: formatTotalDeliveryFeesForApi(j.totalDeliveryFees, fees),
          estimatedDistanceKm: j.estimatedDistanceKm ?? j.totalDistanceKm ?? preview.estimatedDistanceKm,
          estimatedMinutes: j.estimatedMinutes ?? preview.estimatedMinutes,
          previewStops: preview.previewStops,
          orderPreviews: j.jobOrders.slice(0, 3).map((jo) => ({
            orderNumber: jo.order.orderNumber,
            deliveryFee: jo.order.deliveryFee,
          })),
          isMine,
        };
      })
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
        status: { in: [...DRIVER_HELD_JOB_STATUSES] },
      },
      include: {
        store: { select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true, deliveryOtpRequired: true, completionRadiusM: true } },
        jobOrders: jobOrdersWithDetails,
      },
      orderBy: { assignedAt: 'asc' },
    });

    // Prefer IN_PROGRESS, then RETURNING, then ASSIGNED, then QUEUED.
    const priority = (status: string) =>
      status === 'IN_PROGRESS' ? 0 : status === 'RETURNING' ? 1 : status === 'ASSIGNED' ? 2 : 3;
    const job = [...jobs].sort((a, b) => priority(a.status) - priority(b.status))[0];

    if (!job) return success(res, null);
    return success(res, await formatJob(job, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    return success(res, await formatJob(job, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

/**
 * Single-claim model: one active run (ASSIGNED / IN_PROGRESS) plus at most one
 * QUEUED next job. RETURNING does not count as a current run — a driver heading
 * back to the branch claims as ASSIGNED.
 */
async function takeScheduledJob(req: Request, res: Response) {
  const driverId = req.user!.sub;
  const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
  const jobId = req.params.id as string;

  const activeRuns = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
    select: { id: true, status: true },
  });
  // Cap: one active run (ASSIGNED / IN_PROGRESS) + at most one QUEUED next job.
  // RETURNING does not count as a current run — claim lands as ASSIGNED.
  const hasCurrentRun = activeRuns.some(
    (j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED',
  );
  const hasQueuedRun = activeRuns.some((j) => j.status === 'QUEUED');

  const driver = await prisma.adminUser.findFirst({
    where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
    select: { isActive: true, dutyStatus: true, name: true },
  });
  if (!driver) throw new AppError('Driver not found', 404);
  if (!driver.isActive) throw new AppError('Driver account is suspended', 403);
  if (driver.dutyStatus !== 'ONLINE' && driver.dutyStatus !== 'ON_DELIVERY') {
    throw new AppError('You must be online and available to accept jobs', 400);
  }
  try {
    await assertDriverVehicleReadyForWork(driverId);
  } catch (err) {
    throwIfVehicleBreakdownDomainError(err);
    throw err;
  }

  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: { jobOrders: { select: { orderId: true } } },
  });
  if (!job || !accessibleStoreIds.includes(job.storeId)) throw new AppError('Job not found', 404);
  if (job.driverId === driverId && (job.status === 'ASSIGNED' || job.status === 'QUEUED')) {
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
    if (updated) return success(res, await formatJob(updated, { viewerDriverId: driverId }));
  }
  if (job.status !== 'SCHEDULED') throw new AppError('Job is not available for assignment', 400);
  // A job pre-targeted at this driver (e.g. a failure redelivery) already has driverId
  // set — only reject when it belongs to someone else.
  if (job.driverId && job.driverId !== driverId) throw new AppError('Job already assigned', 400);
  const isPreTargetedToMe = job.driverId === driverId;
  if (!isPreTargetedToMe && dateStringInColombo(job.scheduledAt) !== todayDateString()) {
    throw new AppError('This job is no longer available to claim', 400);
  }
  // Defense-in-depth: listJobs already excludes jobs with no linked orders, but
  // guard the claim itself too (e.g. stale push/cache still referencing one) — a
  // job with nothing to deliver can never auto-progress past RETURNING and would
  // strand the driver holding a dead job slot.
  if (job.jobOrders.length === 0) {
    throw new AppError('This job has no orders left to deliver and cannot be claimed', 400);
  }

  // Already holding the queued-next slot — cannot stack another claim.
  if (hasQueuedRun) {
    throw new AppError(
      'You already have a queued job — finish your current delivery before claiming another',
      409,
      'ACTIVE_JOB',
    );
  }

  let nextStatus: 'ASSIGNED' | 'QUEUED' = 'ASSIGNED';
  if (hasCurrentRun) {
    const queuedRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'DeliveryJobStatus' AND e.enumlabel = 'QUEUED'
    `;
    if (Number(queuedRows[0]?.cnt ?? 0) === 0) {
      throw new AppError(
        'Finish your current delivery before claiming another job',
        409,
        'ACTIVE_JOB',
      );
    }
    nextStatus = 'QUEUED';
  }

  const result = await prisma.deliveryJob.updateMany({
    where: { id: job.id, status: 'SCHEDULED', OR: [{ driverId: null }, { driverId }] },
    data: {
      driverId,
      status: nextStatus,
      assignedAt: new Date(),
    },
  });
  if (result.count === 0) throw new AppError('Job already claimed by another driver', 409);

  await prisma.deliveryEvent.createMany({
    data: job.jobOrders.map((jo) => ({
      orderId: jo.orderId,
      jobId: job.id,
      driverId,
      state: 'ASSIGNED' as const,
      note: nextStatus === 'QUEUED' ? 'Job queued for driver' : 'Job assigned to driver',
    })),
  });

  await prisma.adminUser.update({
    where: { id: driverId },
    data: { dutyStatus: 'ON_DELIVERY' },
  }).catch(() => {});

  broadcastJobClaimed(job.storeId, job.id, driverId, driver.name);
  broadcastDeliveryJobUpdated(job.storeId, { jobId: job.id, status: nextStatus });

  const updated = await prisma.deliveryJob.findUnique({
    where: { id: job.id },
    include: {
      store: { select: { id: true, name: true, lat: true, lng: true, addressLine: true, city: true, deliveryOtpRequired: true, completionRadiusM: true } },
      jobOrders: jobOrdersWithDetails,
    },
  });
  if (!updated) throw new AppError('Job not found', 404);

  return success(res, await formatJob(updated, { viewerDriverId: driverId }));
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

/** Pre-pickup reject: unassign the driver, record the audit row, re-broadcast to the branch pool. */
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
    if (job.driverId !== driverId) throw new AppError('Job is not assigned to you', 403);

    const events = await prisma.deliveryEvent.findMany({
      where: { jobId },
      select: { state: true },
    });
    if (!isRejectAllowed(events.map((e) => e.state as string))) {
      throw new AppError('Cannot reject after pickup — use delivery failure or complaint', 400);
    }

    await prisma.$transaction(async (tx) => {
      const unassigned = await tx.deliveryJob.updateMany({
        where: { id: jobId, driverId, status: { in: ['ASSIGNED', 'QUEUED'] } },
        data: {
          driverId: null,
          status: 'SCHEDULED',
          assignedAt: null,
          broadcastedAt: new Date(),
        },
      });
      if (unassigned.count === 0) throw new AppError('Job could not be unassigned', 409);

      await tx.deliveryJobRejection.create({
        data: { id: randomUUID(), jobId, driverId, reason },
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
    });

    await applyMeritDelta({
      driverId,
      orderId: job.jobOrders[0]?.orderId,
      delta: MERIT_DELTAS.CANCEL_BEFORE_PICKUP,
      eventType: 'CANCEL_BEFORE_PICKUP',
      reason: `Accepted order cancelled before pickup: ${reason}`,
    }).catch(() => {});

    // Restore ONLINE before FCM so the rejector is included in the branch push audience.
    await releaseDriverWhenIdle(driverId).catch(() => {});

    const broadcastedAt = new Date();
    broadcastDeliveryJobUpdated(job.storeId, { jobId, status: 'SCHEDULED' });

    // Only ring drivers if the job is still claimable today — otherwise it just
    // sits SCHEDULED/unassigned and surfaces as "Missed" in the admin Incomplete tab.
    const jobIsToday = dateStringInColombo(job.scheduledAt) === todayDateString();
    if (jobIsToday) {
      const offer = buildNewJobBroadcastPayload(
        {
          id: job.id,
          title: job.title,
          status: 'SCHEDULED',
          scheduledAt: job.scheduledAt,
          storeId: job.storeId,
          rideCode: job.rideCode,
          totalCups: job.totalCups,
          estimatedDistanceKm: job.estimatedDistanceKm,
          estimatedMinutes: job.estimatedMinutes,
          totalDistanceKm: job.totalDistanceKm,
          totalDeliveryFees: job.totalDeliveryFees,
          store: job.store,
          jobOrders: job.jobOrders.map((jo) => ({ sequence: jo.sequence, order: jo.order })),
        },
        { broadcastedAt },
      );
      broadcastNewJob(job.storeId, offer);
      sendPushToBranchDrivers(job.storeId, buildNewJobPushFromBroadcast(offer)).catch(() => {});
    }

    return success(res, { rejected: true, jobId });
  } catch (err) {
    next(err);
  }
}

/** Admin: manually re-notify branch drivers about a job that's still sitting unclaimed. */
export async function reRingDeliveryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      include: {
        store: { select: { id: true, name: true, city: true, lat: true, lng: true } },
        jobOrders: jobOrdersWithDetails,
      },
    });
    if (!job) throw new AppError('Job not found', 404);
    if (job.status !== 'SCHEDULED' || job.driverId) {
      throw new AppError('Job already claimed or no longer active', 409);
    }

    const { from: todayFrom } = todayDateRange();
    let scheduledAt = job.scheduledAt;
    const isMissedUnclaimed = job.scheduledAt < todayFrom;
    if (isMissedUnclaimed) {
      scheduledAt = rescheduleMissedJobToToday(job.scheduledAt);
      await prisma.deliveryJob.update({
        where: { id: jobId },
        data: { scheduledAt },
      });
      broadcastDeliveryJobUpdated(job.storeId, { jobId, status: 'SCHEDULED' });
    }

    const broadcastedAt = new Date();
    const offer = buildNewJobBroadcastPayload(
      {
        id: job.id,
        title: job.title,
        status: 'SCHEDULED',
        scheduledAt,
        storeId: job.storeId,
        rideCode: job.rideCode,
        totalCups: job.totalCups,
        estimatedDistanceKm: job.estimatedDistanceKm,
        estimatedMinutes: job.estimatedMinutes,
        totalDistanceKm: job.totalDistanceKm,
        totalDeliveryFees: job.totalDeliveryFees,
        store: job.store,
        jobOrders: job.jobOrders.map((jo) => ({ sequence: jo.sequence, order: jo.order })),
      },
      { broadcastedAt, forceRing: true },
    );
    broadcastNewJob(job.storeId, offer);
    sendPushToBranchDrivers(
      job.storeId,
      buildNewJobPushFromBroadcast(offer, { forceRing: true }),
    ).catch(() => {});

    return success(res, { reRung: true, jobId, rescheduled: isMissedUnclaimed });
  } catch (err) {
    next(err);
  }
}

const adminCancelDeliveryJobSchema = z
  .object({
    reason: z.string().min(3).max(500),
    applyMeritPenalty: z.boolean().optional().default(false),
    meritDelta: z.number().int().min(-20).max(-1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.applyMeritPenalty && data.meritDelta == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meritDelta is required when applyMeritPenalty is true',
        path: ['meritDelta'],
      });
    }
  });

/** HQ admin: terminal-close a stuck delivery job (orders unchanged) and release the rider. */
export async function adminCancelDeliveryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const body = adminCancelDeliveryJobSchema.parse(req.body);
    const adminId = req.user!.sub;
    const queryStoreId = req.query.storeId as string | undefined;

    const row = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { id: true, storeId: true, rideCode: true, driverId: true },
    });
    if (!row) throw new AppError('Job not found', 404);

    let storeId = row.storeId;
    if (!(isAllBranchRole(req.user?.role) && !queryStoreId)) {
      const resolved = await resolveAdminStoreIdForRequest(req, queryStoreId);
      if (row.storeId !== resolved) throw new AppError('Job not found', 404);
      storeId = resolved;
    }

    const meritDelta =
      body.applyMeritPenalty && body.meritDelta != null ? body.meritDelta : null;

    const result = await executeAdminCancelDeliveryJob({
      jobId,
      storeId,
      adminId,
      reason: body.reason,
      meritDelta,
    });

    let meritApplied: { delta: number; newPoints: number } | undefined;
    if (meritDelta != null && result.releasedDriverId) {
      const rideRef = row.rideCode ?? jobId;
      const merit = await applyMeritDelta({
        driverId: result.releasedDriverId,
        delta: meritDelta,
        eventType: 'MANUAL_ADJUSTMENT',
        reason: `Admin closed stuck ride ${rideRef}: ${body.reason}`,
        createdBy: adminId,
      }).catch(() => null);
      if (merit) {
        meritApplied = { delta: meritDelta, newPoints: merit.newPoints };
      }
    }

    return success(res, { ...result, meritApplied });
  } catch (err) {
    next(err);
  }
}

/** Confirm the driver collected the order at the outlet. Job stays ASSIGNED until start. */
const pickupJobSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function pickupJob(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const body = pickupJobSchema.parse(req.body ?? {});

    const job = await getDriverJobOrThrow(req.params.id as string, driverId, accessibleStoreIds);
    if (!['ASSIGNED', 'IN_PROGRESS'].includes(job.status)) {
      throw new AppError('Job must be assigned or in progress to mark pickup', 400);
    }
    if (job.driverId !== driverId) throw new AppError('Job is not assigned to you', 403);

    const hasPickupOverride =
      (job as { pickupLat?: number | null }).pickupLat != null &&
      (job as { pickupLng?: number | null }).pickupLng != null;
    if (!hasPickupOverride) {
      // Same branch geofence as ride completion — the driver must physically be at the
      // outlet to confirm they collected the orders. Jobs with a pickup override (e.g.
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

    const refreshed = await getDriverJobOrThrow(job.id, driverId, accessibleStoreIds);
    return success(res, await formatJob(refreshed, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

/** Ownership-checked single order fetch for the driver app Order Detail screen. */
export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
    const orderId = req.params.orderId as string;

    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: {
          storeId: { in: accessibleStoreIds },
          OR: [
            { driverId, status: { in: ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'COMPLETED'] } },
            { status: 'SCHEDULED', driverId: null },
          ],
        },
      },
      include: {
        order: jobOrdersWithDetails.include.order,
        job: { select: { id: true, driverId: true, status: true, storeId: true } },
      },
    });
    if (!link) throw new AppError('Order not found', 404);

    const isMine = link.job.driverId === driverId;
    const failedByOrder = await fetchLatestFailedAttemptsForJob(link.jobId, [orderId]);
    const failed = failedByOrder.get(orderId);
    const deliveryFailed = !!failed;
    const complaints = isMine
      ? ((await fetchDriverComplaintsByOrderIds(driverId, [orderId])).get(orderId) ?? [])
      : [];

    return success(res, {
      ...formatJobOrder(link.order, link.sequence, {
        redactCustomer: !isMine,
        redactPricing: true,
      }),
      jobId: link.jobId,
      jobStatus: link.job.status,
      deliveryFailed,
      failureOutcome: deliveryFailed ? (failed?.outcome ?? null) : null,
      failureNote: deliveryFailed ? (failed?.note ?? null) : null,
      complaints,
    });
  } catch (err) {
    next(err);
  }
}

/** Completed runs for this driver — powers the driver app's History tab. */
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
          { status: { in: [...DRIVER_HELD_JOB_STATUSES] }, scheduledAt: { lt: todayDateRange().from } },
          { status: 'CANCELLED', adminCancellations: { some: {} } },
        ],
      },
      include: {
        store: { select: { name: true, city: true } },
        adminCancellations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { reason: true, createdAt: true },
        },
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
            select: {
              jobId: true,
              orderId: true,
              outcome: true,
              note: true,
              attemptNo: true,
              createdAt: true,
            },
            orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
          }),
    ]);
    const latestFailedByJob = groupLatestFailedAttemptsByJob(failedAttempts);

    return success(
      res,
      jobs.map((j) => {
        const { deliveredCount, deliveredTotal } = creditedDeliveredTotals(
          j.jobOrders.map((jo) => ({
            orderId: jo.orderId,
            order: {
              status: jo.order.status,
              deliveryFee: jo.order.deliveryFee,
              cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
            },
          })),
          latestFailedByJob.get(j.id) ?? new Map(),
        );
        const jobOrderIds = j.jobOrders.map((jo) => jo.orderId);
        const { orders, failedCount } = buildJobHistoryOrderRows(
          j.jobOrders,
          latestFailedByJob.get(j.id),
        );
        const adminClose =
          j.status === 'CANCELLED' && j.adminCancellations.length > 0
            ? j.adminCancellations[0]
            : null;
        return {
          id: j.id,
          title: j.title,
          status: j.status,
          displayStatus: adminClose
            ? 'ADMIN_CLOSED'
            : j.status === 'COMPLETED'
              ? 'COMPLETED'
              : j.status === 'VEHICLE_FAILURE'
                ? 'VEHICLE_FAILURE'
                : classifyIncompleteJob(j, deliveredCount),
          scheduledAt: j.scheduledAt,
          completedAt: j.completedAt ?? adminClose?.createdAt ?? null,
          storeName: j.store.name,
          storeCity: j.store.city,
          orderCount: j.jobOrders.length,
          deliveredCount,
          deliveredTotal,
          failedCount,
          orders,
          totalDeliveryFees: formatTotalDeliveryFeesForApi(j.totalDeliveryFees, deliveredTotal),
          complaintCount: countComplaintsForOrderIds(complaintsByOrder, jobOrderIds),
          rideCode: j.rideCode ?? null,
          ...(adminClose ? { cancelReason: adminClose.reason } : {}),
        };
      }),
    );
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

    // Only one IN_PROGRESS run at a time — the rest stay queued.
    const otherActive = await prisma.deliveryJob.findFirst({
      where: { driverId, status: 'IN_PROGRESS', id: { not: job.id } },
      select: { id: true },
    });
    if (otherActive) {
      throw new AppError('Finish or pause your current run before starting another', 400);
    }

    const orderIds = job.jobOrders.map((jo) => jo.orderId);

    await prisma.$transaction([
      prisma.deliveryJob.update({
        where: { id: job.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      }),
      prisma.order.updateMany({
        where: { id: { in: orderIds }, status: 'READY' },
        data: { status: 'OUT_FOR_DELIVERY' },
      }),
    ]);

    invalidateJobRoute(job.id);

    await Promise.all(
      job.jobOrders
        .filter((jo) => jo.order.status === 'READY' || jo.order.status === 'OUT_FOR_DELIVERY')
        .map(async (jo) => {
          if (jo.order.status === 'READY') {
            await prisma.orderStatusEvent.create({
              data: { orderId: jo.orderId, status: 'OUT_FOR_DELIVERY', note: 'Driver started delivery run' },
            });
            notifyCustomerOrderStatus({
              id: jo.order.id,
              orderNumber: jo.order.orderNumber,
              userId: jo.order.userId,
              status: 'OUT_FOR_DELIVERY',
              orderMode: jo.order.orderMode,
            }).catch(() => {});
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
        })
    );

    // Always issue delivery PIN SMS on start-run (includes rider + vehicle details).
    // Sequential so SmsLenz rate limits are not tripped by multi-stop fan-out.
    for (const id of orderIds) {
      await ensureOtpForOrder(id, { startedByDriverId: driverId }).catch(() => {});
    }

    broadcastDeliveryJobUpdated(job.storeId, { jobId: job.id, status: 'IN_PROGRESS' });

    const refreshed = await getDriverJobOrThrow(job.id, driverId, accessibleStoreIds);
    return success(res, await formatJob(refreshed, { viewerDriverId: driverId }));
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
    const isMine = !!job.driverId && job.driverId === driverId;

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
        customerName: isMine
          ? resolveCustomerDisplayName({
              guestName: order.guestName,
              userName: order.user?.name,
              phone: order.guestPhone ?? order.user?.phone,
            })
          : 'Customer',
        customerPhone: isMine ? (order.user?.phone ?? order.guestPhone ?? '') : '',
        addressLine: isMine ? (order.deliveryAddressLine ?? order.address?.addressLine ?? '') : '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: isMine ? order.total : 0,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        ...orderStopImageMeta(order.items),
        lat,
        lng,
      });
    }

    const routeOrigin = resolveJobRouteOrigin(job);

    const routingStops = optimizeDeliveryStops({ lat: routeOrigin.lat, lng: routeOrigin.lng }, routingRawStops);
    // Customer identity is already redacted in routingRawStops when !isMine. Geometry stays real
    // either way so a driver can judge the run on the map before claiming it.
    const payload = await buildDeliveryRoutePayload(routeOrigin, routingStops, job.id);
    const deliveredStops: RouteStop[] = [];
    for (const jo of job.jobOrders) {
      if (jo.order.status !== 'DELIVERED') continue;
      const pin = mapPinPoint(jo.order);
      if (!pin) continue;
      deliveredStops.push({
        orderId: jo.order.id,
        orderNumber: jo.order.orderNumber,
        customerName: isMine
          ? resolveCustomerDisplayName({
              guestName: jo.order.guestName,
              userName: jo.order.user?.name,
              phone: jo.order.guestPhone ?? jo.order.user?.phone,
            })
          : 'Customer',
        customerPhone: isMine ? (jo.order.user?.phone ?? jo.order.guestPhone ?? '') : '',
        addressLine: isMine ? (jo.order.deliveryAddressLine ?? jo.order.address?.addressLine ?? '') : '',
        city: jo.order.deliveryCity ?? jo.order.address?.city ?? '',
        district: jo.order.deliveryDistrict ?? jo.order.address?.district ?? '',
        status: jo.order.status,
        total: isMine ? jo.order.total : 0,
        itemCount: jo.order.items.reduce((n, i) => n + i.quantity, 0),
        ...orderStopImageMeta(jo.order.items),
        lat: pin.lat,
        lng: pin.lng,
        ...dropoffApiFields(jo.order),
        sequence: jo.sequence,
        distanceFromPreviousKm: 0,
        etaMinutesFromPrevious: 0,
      });
    }

    return success(res, {
      jobId: job.id,
      ...payload,
      stops: [...payload.stops, ...deliveredStops],
    });
  } catch (err) {
    next(err);
  }
}

const driverStatusSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED']),
  note: z.string().optional(),
  otp: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/** Issue a fresh delivery code and send it to the customer (SMS + app notification). */
export async function resendOrderOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const orderId = req.params.orderId as string;
    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: { driverId, status: 'IN_PROGRESS', storeId: { in: accessibleStoreIds } },
      },
      select: { jobId: true },
    });
    if (!link) throw new AppError('Order not in your active job', 404);

    await createDeliveryOtp(orderId);
    return success(res, { sent: true });
  } catch (err) {
    next(err);
  }
}

export async function updateJobOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);

    const { status, note, otp, lat, lng } = driverStatusSchema.parse(req.body);
    const orderId = req.params.orderId as string;

    const link = await prisma.deliveryJobOrder.findFirst({
      where: {
        orderId,
        job: {
          driverId,
          status: 'IN_PROGRESS',
          storeId: { in: accessibleStoreIds },
        },
      },
      include: { order: true, job: true },
    });
    if (!link) {
      if (status === 'DELIVERY_FAILED' && (await driverHasUnpickedHeldJob(driverId, accessibleStoreIds, orderId))) {
        throw new AppError(REJECT_JOB_BEFORE_FAILURE_MESSAGE, 400);
      }
      throw new AppError('Order not in your active job', 404);
    }

    const existing = link.order;

    // Driver-reported failure — record attempt, leave order OUT_FOR_DELIVERY.
    if (status === 'DELIVERY_FAILED') {
      if (!['READY', 'OUT_FOR_DELIVERY'].includes(existing.status)) {
        throw new AppError(`Cannot report failure from ${existing.status}`, 400);
      }
      const prior = await prisma.deliveryAttempt.count({ where: { orderId, jobId: link.jobId } });
      const outcome = mapFailureNoteToOutcome(note);
      await prisma.deliveryAttempt.create({
        data: {
          orderId,
          jobId: link.jobId,
          driverId,
          attemptNo: prior + 1,
          outcome,
          note: note ?? outcome,
        },
      });
      await prisma.orderStatusEvent.create({
        data: {
          orderId,
          status: existing.status,
          note: note ? `Delivery failed: ${note}` : `Delivery failed: ${outcome}`,
        },
      });
      invalidateJobRoute(link.job.id);

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { name: true, phone: true } },
          address: {
            select: { addressLine: true, city: true, district: true, lat: true, lng: true },
          },
          items: { select: { quantity: true, productName: true, totalPrice: true } },
        },
      });
      if (!order) throw new AppError('Order not found', 404);
      const enteredReturning = await maybeEnterReturningPhase(link.job.id);
      return success(res, {
        ...formatJobOrder(order, link.sequence),
        deliveryFailed: true,
        rideEnteredReturning: enteredReturning,
      });
    }

    const allowed =
      (status === 'OUT_FOR_DELIVERY' && existing.status === 'READY') ||
      (status === 'DELIVERED' && ['READY', 'OUT_FOR_DELIVERY'].includes(existing.status));
    if (!allowed) throw new AppError(`Cannot change status from ${existing.status} to ${status}`, 400);

    let dropoff: { lat: number; lng: number } | null = null;
    if (status === 'DELIVERED') {
      await requireOtpIfNeeded(orderId, link.job.storeId, otp);
      dropoff = await resolveRiderDropoffCoords({
        lat,
        lng,
        driverId,
        jobId: link.job.id,
        orderId,
      });
    }

    const paidOnFulfillment = paymentStatusOnOrderStatus(existing, status);

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: status as any,
        ...(paidOnFulfillment ? { paymentStatus: paidOnFulfillment } : {}),
        ...(dropoff
          ? ({
              actualDropoffLat: dropoff.lat,
              actualDropoffLng: dropoff.lng,
              actualDropoffAt: new Date(),
            } as Record<string, unknown>)
          : {}),
        statusEvents: { create: { status: status as any, note: note ?? 'Updated by driver' } },
      },
      include: {
        user: { select: { name: true, phone: true } },
        address: {
          select: { addressLine: true, city: true, district: true, lat: true, lng: true },
        },
        items: { select: { quantity: true, productName: true, totalPrice: true } },
      },
    });

    invalidateJobRoute(link.job.id);

    if (status === 'DELIVERED') {
      await recordDeliveredAttempt({
        orderId,
        jobId: link.job.id,
        driverId,
        note: note ?? 'Delivered',
        lat: dropoff?.lat,
        lng: dropoff?.lng,
      }).catch(() => {});
      await recordSuccessfulDelivery(driverId, orderId).catch(() => {});
      await ensureJobDeliveryTerminalEvent({
        orderId,
        jobId: link.job.id,
        driverId,
        storeId: link.job.storeId,
        jobStatus: link.job.status,
        orderStatus: 'DELIVERED',
        note: note ?? 'Updated by driver',
      });
    }

    const enteredReturning = await maybeEnterReturningPhase(link.job.id);

    await notifyCustomerOrderStatus({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status,
      orderMode: order.orderMode,
      note,
    }).catch((err) => {
      logger.error('Failed to notify customer of order status', err);
    });

    return success(res, {
      ...formatJobOrder(order, link.sequence),
      rideEnteredReturning: enteredReturning,
    });
  } catch (err) {
    next(err);
  }
}

const vehicleFailureSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().max(500).nullish(),
  jobId: z.string().min(1).optional(),
});

type VehicleFailureBody = z.infer<typeof vehicleFailureSchema>;

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

/** A retry after the status flip already committed should not record the breakdown twice. */
async function recentVehicleFailureResult(
  driverId: string,
  accessibleStoreIds: string[],
): Promise<VehicleFailureResult | null> {
  if (!prismaKnowsDeliveryJobStatus('VEHICLE_FAILURE')) return null;
  const since = new Date(Date.now() - 60_000);
  const job = await prisma.deliveryJob.findFirst({
    where: {
      driverId,
      storeId: { in: accessibleStoreIds },
      status: 'VEHICLE_FAILURE',
      completedAt: { gte: since },
    },
    orderBy: { completedAt: 'desc' },
    select: { id: true },
  });
  if (!job) return null;
  const attempt = await prisma.deliveryAttempt.findFirst({
    where: { jobId: job.id, outcome: 'VEHICLE_FAILURE' },
    orderBy: { createdAt: 'desc' },
    select: { orderId: true },
  });
  const lastOrder = attempt
    ? null
    : await prisma.deliveryJobOrder.findFirst({
        where: { jobId: job.id },
        orderBy: { sequence: 'desc' },
        select: { orderId: true },
      });
  const orderId = attempt?.orderId ?? lastOrder?.orderId ?? '';
  return {
    jobId: job.id,
    orderId,
    deliveryFailed: true,
    rideEnteredReturning: false,
    rideReleased: true,
  };
}

async function persistRouteAfterVehicleFailure(jobId: string): Promise<void> {
  await persistJobActualRouteFromGps(jobId).catch((err) => {
    logger.error('persistJobActualRouteFromGps failed after vehicle failure', {
      jobId,
      err,
    });
  });
}

async function closeRideAsVehicleFailure(opts: {
  jobId: string;
  driverId: string;
  storeId: string;
  storeName: string | null;
  rideCode: string | null;
  fromSequence?: number;
  lat: number;
  lng: number;
  note?: string;
  fallbackOrderId: string;
}): Promise<VehicleFailureResult> {
  const { orderIds } = await recordVehicleFailureAndReleaseJob({
    jobId: opts.jobId,
    driverId: opts.driverId,
    storeId: opts.storeId,
    fromSequence: opts.fromSequence,
    lat: opts.lat,
    lng: opts.lng,
    note: opts.note,
  });
  await persistRouteAfterVehicleFailure(opts.jobId);
  const orderId = orderIds[0] ?? opts.fallbackOrderId;
  broadcastVehicleFailureReported(opts.storeId, {
    jobId: opts.jobId,
    driverId: opts.driverId,
    orderId,
    lat: opts.lat,
    lng: opts.lng,
    storeId: opts.storeId,
    rideCode: opts.rideCode,
    storeName: opts.storeName,
  });
  return {
    jobId: opts.jobId,
    orderId,
    deliveryFailed: true,
    rideEnteredReturning: false,
    rideReleased: true,
  };
}

async function executeVehicleFailureReport(
  req: Request,
  body: VehicleFailureBody,
  replay: boolean,
): Promise<VehicleFailureResult> {
  const driverId = req.user!.sub;
  const accessibleStoreIds = await requireAccessibleStores(driverId, req.user!.storeId);
  const { lat, lng, note, jobId } = body;

  const link = await prisma.deliveryJobOrder.findFirst({
    where: {
      job: {
        driverId,
        status: { in: ['IN_PROGRESS', 'RETURNING'] },
        storeId: { in: accessibleStoreIds },
        ...(jobId ? { id: jobId } : {}),
      },
      order: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
    },
    orderBy: { sequence: 'asc' },
    include: { order: true, job: { include: { store: { select: { id: true, name: true } } } } },
  });
  if (link) {
    return closeRideAsVehicleFailure({
      jobId: link.job.id,
      driverId,
      storeId: link.job.storeId,
      storeName: link.job.store?.name ?? null,
      rideCode: link.job.rideCode ?? null,
      fromSequence: link.sequence,
      lat,
      lng,
      note: note ?? undefined,
      fallbackOrderId: link.orderId,
    });
  }

  const returningJob = await prisma.deliveryJob.findFirst({
    where: {
      driverId,
      storeId: { in: accessibleStoreIds },
      status: 'RETURNING',
      ...(jobId ? { id: jobId } : {}),
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      storeId: true,
      rideCode: true,
      store: { select: { id: true, name: true } },
      jobOrders: { orderBy: { sequence: 'desc' }, take: 1, select: { orderId: true } },
    },
  });
  if (returningJob) {
    return closeRideAsVehicleFailure({
      jobId: returningJob.id,
      driverId,
      storeId: returningJob.storeId,
      storeName: returningJob.store?.name ?? null,
      rideCode: returningJob.rideCode ?? null,
      lat,
      lng,
      note: note ?? undefined,
      fallbackOrderId: returningJob.jobOrders[0]?.orderId ?? '',
    });
  }

  if (replay) {
    const already = await recentVehicleFailureResult(driverId, accessibleStoreIds);
    if (already) return already;
  }
  if (await driverHasUnpickedHeldJob(driverId, accessibleStoreIds)) {
    throw new AppError(REJECT_JOB_BEFORE_FAILURE_MESSAGE, 400);
  }
  throw new AppError('No active delivery to report a vehicle failure for', 400);
}

/**
 * Driver reports their vehicle has broken down mid-ride. Unlike a per-order
 * "job failure" (customer-side reasons picked from an order screen), this isn't
 * tied to a specific order the driver chose — it flags the driver's current
 * active stop so the ride (this stop and any later ones) can be reassigned to
 * another driver, with the driver's location captured for dispatch.
 */
export async function reportVehicleFailure(req: Request, res: Response, next: NextFunction) {
  try {
    const body = vehicleFailureSchema.parse(req.body);
    let attempt = 0;
    const payload = await retryOnceOnDisconnect(async () => {
      attempt += 1;
      return executeVehicleFailureReport(req, body, attempt > 1);
    }, reconnectPrisma);
    return success(res, payload);
  } catch (err) {
    next(err);
  }
}

export async function getJobHandover(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const jobId = req.params.id as string;
    const payload = await buildJobHandoverResponse(jobId, driverId);
    return success(res, payload);
  } catch (err) {
    if (err instanceof JobHandoverError) {
      return next(new AppError(err.message, err.statusCode));
    }
    next(err);
  }
}

/** Confirms the stranded rider is mobile again — same as `POST /me/vehicle-fixed` scoped to this failed job. */
export async function confirmHandoverBackOnRoad(req: Request, res: Response, next: NextFunction) {
  try {
    const driverId = req.user!.sub;
    const jobId = req.params.id as string;
    const job = await prisma.deliveryJob.findUnique({
      where: { id: jobId },
      select: { id: true, driverId: true, status: true, storeId: true },
    });
    if (!job || job.driverId !== driverId) throw new AppError('Job not found', 404);
    if (job.status !== 'VEHICLE_FAILURE') {
      throw new AppError('Back on road is only available after a vehicle failure', 400);
    }

    let result;
    try {
      result = await markVehicleFixed({
        driverId,
        fixedById: driverId,
        fixedByRole: 'DRIVER',
      });
    } catch (err) {
      throwIfVehicleBreakdownDomainError(err);
      throw err;
    }

    if (result.jobId !== job.id) {
      throw new AppError('No open breakdown for this ride', 400);
    }

    broadcastVehicleBreakdownCleared(job.storeId, {
      breakdownId: result.id,
      driverId,
      jobId: job.id,
      storeId: job.storeId,
      fixedByRole: 'DRIVER',
      fixedComment: null,
    });

    return success(res, {
      breakdownId: result.id,
      jobId: result.jobId,
      fixedAt: result.fixedAt.toISOString(),
      fixedComment: result.fixedComment,
    });
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
    await releaseDriverWhenIdle(driverId).catch(() => {});

    broadcastDeliveryJobUpdated(updated.store.id, { jobId: updated.id, status: 'COMPLETED' });

    return success(res, await formatJob(updated, { viewerDriverId: driverId }));
  } catch (err) {
    next(err);
  }
}

// Admin: create a scheduled job from ready delivery orders
const createJobSchema = z.object({
  storeId: z.string(),
  title: z.string().min(3).max(120),
  orderIds: z.array(z.string()).min(1),
  scheduledAt: z.string().datetime().optional(),
});

export async function createDeliveryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: bodyStoreId, title, orderIds, scheduledAt } = createJobSchema.parse(req.body);

    let storeId: string;
    try {
      storeId = await resolveAdminStoreIdForRequest(req, bodyStoreId);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Invalid store', 400);
    }

    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        storeId,
        orderMode: 'DELIVERY',
        status: { in: ['READY', 'OUT_FOR_DELIVERY'] },
        deliveryJobOrders: {
          none: {
            // Omit QUEUED until the live enum is guaranteed; SCHEDULED/ASSIGNED/
            // IN_PROGRESS still block orders already on an active run.
            job: { status: { in: ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'] } },
          },
        },
      },
      // Explicit select: live DB may not have orders.paymentGateway yet.
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        guestName: true,
        guestPhone: true,
        orderMode: true,
        status: true,
        total: true,
        deliveryAddressLine: true,
        deliveryCity: true,
        deliveryDistrict: true,
        deliveryLat: true,
        deliveryLng: true,
        user: { select: { name: true, phone: true } },
        address: {
          select: { addressLine: true, city: true, district: true, lat: true, lng: true },
        },
        items: {
          select: {
            quantity: true,
            productName: true,
            totalPrice: true,
            product: { select: { imageUrl: true } },
          },
        },
      },
    });
    if (orders.length !== orderIds.length) {
      throw new AppError('Some orders are invalid, not ready, or already assigned to a job', 400);
    }

    const totalCups = orders.reduce(
      (sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0),
      0
    );
    const maxCupsPerRider = await getMaxCupsPerRider();
    if (totalCups > maxCupsPerRider && orders.length > 1) {
      throw new AppError(
        `Each rider can carry at most ${maxCupsPerRider} cups per group (${totalCups} cups selected)`,
        400
      );
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, city: true, lat: true, lng: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const rawStops: Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>[] = [];
    for (const order of orders) {
      const lat = order.deliveryLat ?? order.address?.lat;
      const lng = order.deliveryLng ?? order.address?.lng;
      if (lat == null || lng == null) {
        throw new AppError(`Order ${order.orderNumber} is missing delivery coordinates`, 400);
      }
      rawStops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: resolveCustomerDisplayName({
          guestName: order.guestName,
          userName: order.user?.name,
          phone: order.guestPhone ?? order.user?.phone,
        }),
        customerPhone: order.user?.phone ?? order.guestPhone ?? '',
        addressLine: order.deliveryAddressLine ?? order.address?.addressLine ?? '',
        city: order.deliveryCity ?? order.address?.city ?? '',
        district: order.deliveryDistrict ?? order.address?.district ?? '',
        status: order.status,
        total: order.total,
        itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
        ...orderStopImageMeta(order.items),
        lat,
        lng,
      });
    }

    const optimized = optimizeDeliveryStops(
      { lat: store.lat, lng: store.lng },
      rawStops,
      { includeReturnToOrigin: true },
    );
    const customerStops = customerRouteStops(optimized);
    const sequenceByOrderId = new Map(customerStops.map((s) => [s.orderId, s.sequence]));
    const readyOrders = orders.filter((o) => o.status === 'READY');

    // Prefer OSRM round-trip estimate; fall back to haversine totals from optimized stops.
    let estimatedDistanceKm = totalRouteDistanceKm(optimized);
    let estimatedMinutes = totalRouteEtaMinutes(optimized);
    try {
      const waypoints = buildRouteWaypoints(
        { lat: store.lat, lng: store.lng },
        customerStops.map((s) => ({ lat: s.lat, lng: s.lng })),
        { includeReturnToOrigin: true },
      );
      const road = await fetchRoadRoute(waypoints);
      if (road.distanceKm > 0) {
        estimatedDistanceKm = road.distanceKm;
        estimatedMinutes = road.durationMinutes;
      }
    } catch {
      /* keep haversine fallback */
    }

    // Re-fetch delivery fees for the selected orders (create select omits deliveryFee).
    const feeRows = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, deliveryFee: true },
    });
    const feesSum = feeRows.reduce((sum, o) => sum + o.deliveryFee, 0);

    const rideCode = await allocateRideCode();

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryJob.create({
        data: {
          storeId,
          title,
          rideCode,
          totalCups,
          estimatedDistanceKm,
          estimatedMinutes,
          totalDistanceKm: estimatedDistanceKm,
          totalDeliveryFees: lkrToDecimal(feesSum),
          scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
          jobOrders: {
            create: orderIds.map((orderId) => ({
              orderId,
              sequence: sequenceByOrderId.get(orderId) ?? 1,
            })),
          },
        },
        include: {
          store: { select: { name: true, city: true } },
          jobOrders: { select: { orderId: true, sequence: true } },
        },
      });

      if (readyOrders.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: readyOrders.map((o) => o.id) }, status: 'READY' },
          data: { status: 'OUT_FOR_DELIVERY' },
        });
      }

      return created;
    });

    await Promise.all(
      readyOrders.map(async (order) => {
        await prisma.orderStatusEvent.create({
          data: {
            orderId: order.id,
            status: 'OUT_FOR_DELIVERY',
            note: 'Added to delivery job',
          },
        });
        notifyCustomerOrderStatus({
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: 'OUT_FOR_DELIVERY',
          orderMode: order.orderMode,
        }).catch(() => {});
      }),
    );

    const availableDriverCount = await prisma.adminUser.count({
      where: {
        role: { name: 'DELIVERY_DRIVER' },
        isActive: true,
        dutyStatus: { in: ['ONLINE', 'ON_DELIVERY'] },
        OR: [
          { accessibleStores: { some: { id: storeId } } },
          { storeId },
        ],
      },
    });

    const broadcastedAt = new Date();
    await prisma.deliveryJob.update({
      where: { id: job.id },
      data: { broadcastedAt },
    });

    // Only ring drivers for jobs claimable today — a backdated/future scheduledAt
    // shouldn't wake anyone up for a job they can't yet (or no longer) pick.
    if (dateStringInColombo(job.scheduledAt) === todayDateString()) {
      const feeByOrderId = new Map(feeRows.map((o) => [o.id, o.deliveryFee]));
      const offerJobOrders = orderIds.map((orderId) => {
        const order = orders.find((o) => o.id === orderId)!;
        return {
          sequence: sequenceByOrderId.get(orderId) ?? 1,
          order: { ...order, deliveryFee: feeByOrderId.get(orderId) ?? 0 },
        };
      });
      const offer = buildNewJobBroadcastPayload(
        {
          id: job.id,
          title: job.title,
          status: job.status,
          scheduledAt: job.scheduledAt,
          storeId,
          rideCode,
          totalCups,
          estimatedDistanceKm,
          estimatedMinutes,
          totalDistanceKm: estimatedDistanceKm,
          totalDeliveryFees: lkrToDecimal(feesSum),
          store,
          jobOrders: offerJobOrders,
        },
        { broadcastedAt },
      );
      broadcastNewJob(storeId, offer);
      sendPushToBranchDrivers(storeId, buildNewJobPushFromBroadcast(offer)).catch(() => {});
    }

    return success(
      res,
      {
        ...job,
        rideCode,
        totalCups,
        estimatedDistanceKm,
        estimatedMinutes,
        totalDeliveryFees: lkrToDecimal(feesSum),
        broadcastedAt,
        availableDriverCount,
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}
