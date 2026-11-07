import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { prisma } from './prisma';
import { getDriverAccessibleStoreIds } from './driverAccess';
import {
  allocateRideCode,
  maybeEnterReturningPhase,
  orderStopImageMeta,
} from './deliveryJobHelpers';
import { sendPushToDriver } from './driverPush';
import { broadcastDeliveryJobUpdated, broadcastJobAssignedToDriver } from './socket';
import { resolveCustomerDisplayName } from './customerName';
import { optimizeDeliveryStops, customerRouteStops, totalRouteDistanceKm, totalRouteEtaMinutes, type RouteStop } from './routeOptimizer';
import { fetchRoadRoute, buildRouteWaypoints } from './roadRouting';
import { lkrToDecimal } from './moneyDecimal';

/** Jobs that count as an in-flight redelivery (original failed job is excluded separately). */
export const REDELIVERY_JOB_STATUSES = ['SCHEDULED', 'ASSIGNED', 'QUEUED', 'IN_PROGRESS'] as const;

export type FailureReassignmentStatus =
  | 'needs_assignment'
  | 'ringing'
  | 'assigned'
  | 'done'
  | 'not_reassignable';

/** Only mid-route vehicle breakdowns may be reassigned to another rider from the delivery portal. */
export function failureOutcomeAllowsRiderReassignment(outcome: string): boolean {
  return outcome === 'VEHICLE_FAILURE';
}

export type ActiveRedeliveryJobSummary = {
  id: string;
  status: string;
  driver: { id: string; name: string } | null;
};

export type JobLinkForReassignment = {
  jobId: string;
  job: {
    id: string;
    status: string;
    createdAt: Date;
    driver: { id: string; name: string } | null;
  };
};

export type JobStopForForward = {
  orderId: string;
  sequence: number;
  orderNumber: string;
  status: string;
};

export type ForwardOrderSummary = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  isFailedStop: boolean;
};

const MOVABLE_ORDER_STATUSES = new Set(['READY', 'OUT_FOR_DELIVERY']);

/** Every unfinished (READY/OUT_FOR_DELIVERY) stop on the ride — not just the failed one and
 *  not just ones sequenced after it — moves to the redelivery job, regardless of failure
 *  outcome. Delivered and cancelled stops are excluded via MOVABLE_ORDER_STATUSES. */
export function collectForwardOrders(input: {
  failedOrderId: string;
  stops: JobStopForForward[];
}): ForwardOrderSummary[] {
  const failed = input.stops.find((stop) => stop.orderId === input.failedOrderId);
  if (!failed) return [];

  return input.stops
    .filter((stop) => MOVABLE_ORDER_STATUSES.has(stop.status))
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => ({
      orderId: stop.orderId,
      orderNumber: stop.orderNumber,
      sequence: stop.sequence,
      status: stop.status,
      isFailedStop: stop.orderId === input.failedOrderId,
    }));
}

export function redeliveryJobTitle(failedOrderNumber: string, forwardCount: number): string {
  if (forwardCount <= 1) return `Redelivery #${failedOrderNumber}`;
  return `Redelivery #${failedOrderNumber} + ${forwardCount - 1} more`;
}

export function deriveFailureReassignment(input: {
  orderStatus: string;
  originalJobId: string;
  jobsForOrder: JobLinkForReassignment[];
  attemptOutcome: string;
}): {
  reassignmentStatus: FailureReassignmentStatus;
  activeRedeliveryJob: ActiveRedeliveryJobSummary | null;
} {
  if (input.orderStatus === 'DELIVERED' || input.orderStatus === 'CANCELLED') {
    return { reassignmentStatus: 'done', activeRedeliveryJob: null };
  }

  const redelivery = input.jobsForOrder
    .filter(
      (link) =>
        link.jobId !== input.originalJobId &&
        (REDELIVERY_JOB_STATUSES as readonly string[]).includes(link.job.status),
    )
    .sort((a, b) => b.job.createdAt.getTime() - a.job.createdAt.getTime());

  const newest = redelivery[0];
  if (newest) {
    return {
      reassignmentStatus: newest.job.status === 'SCHEDULED' ? 'ringing' : 'assigned',
      activeRedeliveryJob: {
        id: newest.job.id,
        status: newest.job.status,
        driver: newest.job.driver,
      },
    };
  }

  if (input.orderStatus === 'READY' || input.orderStatus === 'OUT_FOR_DELIVERY') {
    if (failureOutcomeAllowsRiderReassignment(input.attemptOutcome)) {
      return { reassignmentStatus: 'needs_assignment', activeRedeliveryJob: null };
    }
    return { reassignmentStatus: 'not_reassignable', activeRedeliveryJob: null };
  }

  return { reassignmentStatus: 'done', activeRedeliveryJob: null };
}

/** Rider who took over orders from a vehicle-failure job. */
export type ReassignedRiderSummary = {
  id: string;
  name: string;
  phone: string | null;
  jobId: string;
  rideCode: string | null;
  status: string;
};

export type VehicleFailureAttemptRef = {
  jobId: string;
  orderId: string;
  createdAt: Date;
};

export type ReassignedJobLink = {
  orderId: string;
  job: {
    id: string;
    status: string;
    rideCode: string | null;
    createdAt: Date;
    driver: { id: string; name: string; phone: string | null } | null;
  };
};

/**
 * Newest takeover job per rider, ignoring the failed job itself and any job
 * created before the vehicle-failure attempt (an earlier ride that shared an order).
 */
export function pickReassignedRiders(input: {
  failedJobIds: string[];
  attempts: VehicleFailureAttemptRef[];
  links: ReassignedJobLink[];
}): Map<string, ReassignedRiderSummary[]> {
  const failed = new Set(input.failedJobIds);
  const attemptsByJob = new Map<string, { orderIds: Set<string>; earliest: Date }>();
  for (const attempt of input.attempts) {
    if (!failed.has(attempt.jobId)) continue;
    const current = attemptsByJob.get(attempt.jobId);
    if (!current) {
      attemptsByJob.set(attempt.jobId, {
        orderIds: new Set([attempt.orderId]),
        earliest: attempt.createdAt,
      });
      continue;
    }
    current.orderIds.add(attempt.orderId);
    if (attempt.createdAt < current.earliest) current.earliest = attempt.createdAt;
  }

  const result = new Map<string, ReassignedRiderSummary[]>();
  for (const jobId of input.failedJobIds) result.set(jobId, []);

  for (const [sourceJobId, meta] of attemptsByJob) {
    const newestByRider = new Map<string, ReassignedJobLink['job']>();
    for (const link of input.links) {
      if (!meta.orderIds.has(link.orderId)) continue;
      if (link.job.id === sourceJobId) continue;
      if (link.job.createdAt < meta.earliest) continue;
      const driver = link.job.driver;
      if (!driver) continue;
      const existing = newestByRider.get(driver.id);
      if (!existing || link.job.createdAt > existing.createdAt) {
        newestByRider.set(driver.id, link.job);
      }
    }

    const riders = [...newestByRider.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((job) => ({
        id: job.driver!.id,
        name: job.driver!.name,
        phone: job.driver!.phone,
        jobId: job.id,
        rideCode: job.rideCode,
        status: job.status,
      }));
    result.set(sourceJobId, riders);
  }

  return result;
}

export async function loadReassignedRidersByFailedJob(
  jobIds: string[],
): Promise<Map<string, ReassignedRiderSummary[]>> {
  const unique = [...new Set(jobIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const attempts = await prisma.deliveryAttempt.findMany({
    where: { jobId: { in: unique }, outcome: 'VEHICLE_FAILURE' },
    select: { jobId: true, orderId: true, createdAt: true },
  });
  const orderIds = [...new Set(attempts.map((attempt) => attempt.orderId))];
  const links =
    orderIds.length === 0
      ? []
      : await prisma.deliveryJobOrder.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            orderId: true,
            job: {
              select: {
                id: true,
                status: true,
                rideCode: true,
                createdAt: true,
                driver: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        });

  return pickReassignedRiders({
    failedJobIds: unique,
    attempts,
    links: links.map((link) => ({
      orderId: link.orderId,
      job: {
        id: link.job.id,
        status: link.job.status,
        rideCode: link.job.rideCode ?? null,
        createdAt: link.job.createdAt,
        driver: link.job.driver
          ? {
              id: link.job.driver.id,
              name: link.job.driver.name,
              phone: link.job.driver.phone ?? null,
            }
          : null,
      },
    })),
  });
}

export type ReassignFailedDeliveryResult = {
  jobId: string;
  rideCode: string | null;
  status: string;
  driverId: string;
  driverName: string;
  orderId: string;
  orderNumber: string;
  orderIds: string[];
  orderCount: number;
  originalJobId: string;
  title: string;
};

type ForwardOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  storeId: string;
  guestName: string | null;
  guestPhone: string | null;
  total: number;
  deliveryFee: number;
  deliveryAddressLine: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  user: { name: string | null; phone: string | null } | null;
  address: {
    addressLine: string | null;
    city: string | null;
    district: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  items: Array<{
    quantity: number;
    productName: string;
    totalPrice: number;
    product: { imageUrl: string | null } | null;
  }>;
};

function toRouteStop(
  order: ForwardOrderRow,
): Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'> {
  const lat = order.deliveryLat ?? order.address?.lat;
  const lng = order.deliveryLng ?? order.address?.lng;
  if (lat == null || lng == null) {
    throw new AppError(`Order ${order.orderNumber} is missing delivery coordinates`, 400);
  }
  const itemCount = order.items.reduce((n, item) => n + item.quantity, 0);
  return {
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
    itemCount,
    ...orderStopImageMeta(order.items),
    lat,
    lng,
  };
}

type ReassignmentDriver = {
  id: string;
  name: string;
  isActive: boolean;
  dutyStatus: string;
};

export type PickupOverride = { lat: number; lng: number; label: string };

type FailureReassignmentContext = {
  attempt: {
    id: string;
    jobId: string;
    orderId: string;
    outcome: string;
  };
  failedOrder: {
    id: string;
    orderNumber: string;
    status: string;
    storeId: string;
    store: { id: string; name: string; lat: number; lng: number };
  };
  forward: ForwardOrderSummary[];
  forwardById: Map<string, ForwardOrderRow>;
  laterPendingIds: string[];
  /** Set for vehicle-failure attempts — the new rider(s) must collect the parcels from
   *  the stranded rider's breakdown spot, not the outlet. */
  pickupOverride: PickupOverride | null;
};

function mergeAssignmentsByDriver(
  assignments: Array<{ driverId: string; orderIds: string[] }>,
): Array<{ driverId: string; orderIds: string[] }> {
  const byDriver = new Map<string, string[]>();
  for (const row of assignments) {
    const existing = byDriver.get(row.driverId) ?? [];
    byDriver.set(row.driverId, [...existing, ...row.orderIds]);
  }
  return [...byDriver.entries()].map(([driverId, orderIds]) => ({ driverId, orderIds }));
}

function validateAssignmentCoverage(
  forwardIds: string[],
  assignments: Array<{ driverId: string; orderIds: string[] }>,
): void {
  const forwardIdSet = new Set(forwardIds);
  const assignedIds = assignments.flatMap((row) => row.orderIds);
  const assignedSet = new Set(assignedIds);

  if (assignedIds.length !== assignedSet.size) {
    throw new AppError('Each order can only be assigned to one rider', 400);
  }
  if (assignedIds.length !== forwardIds.length) {
    throw new AppError('Every order must be assigned to a rider', 400);
  }
  for (const orderId of assignedIds) {
    if (!forwardIdSet.has(orderId)) {
      throw new AppError('Unknown order in assignment', 400);
    }
  }
  for (const orderId of forwardIds) {
    if (!assignedSet.has(orderId)) {
      throw new AppError('Every order must be assigned to a rider', 400);
    }
  }
}

async function loadFailureReassignmentContext(params: {
  attemptId: string;
  allowedStoreId?: string;
}): Promise<FailureReassignmentContext> {
  const attempt = await prisma.deliveryAttempt.findUnique({
    where: { id: params.attemptId },
    select: {
      id: true,
      jobId: true,
      orderId: true,
      outcome: true,
      lat: true,
      lng: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          storeId: true,
          store: { select: { id: true, name: true, lat: true, lng: true } },
        },
      },
    },
  });

  if (!attempt) throw new AppError('Delivery failure not found', 404);
  if (attempt.outcome === 'DELIVERED') {
    throw new AppError('This attempt was a successful delivery', 400);
  }
  if (!failureOutcomeAllowsRiderReassignment(attempt.outcome)) {
    throw new AppError('Only vehicle failures can be reassigned to another rider', 400);
  }

  const failedOrder = attempt.order;
  if (params.allowedStoreId && failedOrder.storeId !== params.allowedStoreId) {
    throw new AppError('Failure is not in your branch', 403);
  }
  if (failedOrder.status === 'DELIVERED' || failedOrder.status === 'CANCELLED') {
    throw new AppError('Order is already completed and cannot be reassigned', 400);
  }
  if (failedOrder.status !== 'READY' && failedOrder.status !== 'OUT_FOR_DELIVERY') {
    throw new AppError('Order is not ready for a redelivery job', 400);
  }

  const originalStops = await prisma.deliveryJobOrder.findMany({
    where: { jobId: attempt.jobId },
    orderBy: { sequence: 'asc' },
    select: {
      orderId: true,
      sequence: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          storeId: true,
          guestName: true,
          guestPhone: true,
          total: true,
          deliveryFee: true,
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
      },
    },
  });

  const forward = collectForwardOrders({
    failedOrderId: failedOrder.id,
    stops: originalStops.map((stop) => ({
      orderId: stop.orderId,
      sequence: stop.sequence,
      orderNumber: stop.order.orderNumber,
      status: stop.order.status,
    })),
  });
  if (forward.length === 0) {
    throw new AppError('No undelivered orders remain to reassign on this ride', 400);
  }

  const forwardIds = forward.map((row) => row.orderId);
  const existingLinks = await prisma.deliveryJobOrder.findMany({
    where: {
      orderId: { in: forwardIds },
      job: { status: { in: [...REDELIVERY_JOB_STATUSES] } },
    },
    select: {
      orderId: true,
      jobId: true,
      job: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          driver: { select: { id: true, name: true } },
        },
      },
    },
  });
  for (const orderId of forwardIds) {
    const derived = deriveFailureReassignment({
      orderStatus: originalStops.find((s) => s.orderId === orderId)?.order.status ?? 'OUT_FOR_DELIVERY',
      originalJobId: attempt.jobId,
      jobsForOrder: existingLinks.filter((link) => link.orderId === orderId),
      attemptOutcome: attempt.outcome,
    });
    if (
      (derived.reassignmentStatus === 'assigned' || derived.reassignmentStatus === 'ringing') &&
      derived.activeRedeliveryJob
    ) {
      throw new AppError('This ride already has orders assigned to another rider', 400);
    }
  }

  const forwardById = new Map(originalStops.map((stop) => [stop.orderId, stop.order]));
  const laterPendingIds = forward.filter((row) => !row.isFailedStop).map((row) => row.orderId);

  // Vehicle failure: parcels sit with the stranded rider at the breakdown spot, not the
  // outlet, so the new job's pickup point must follow the rider instead of the branch.
  const pickupOverride: PickupOverride | null =
    attempt.outcome === 'VEHICLE_FAILURE' && attempt.lat != null && attempt.lng != null
      ? { lat: attempt.lat, lng: attempt.lng, label: 'Rider breakdown location' }
      : null;

  return {
    attempt: {
      id: attempt.id,
      jobId: attempt.jobId,
      orderId: attempt.orderId,
      outcome: attempt.outcome,
    },
    failedOrder,
    forward,
    forwardById,
    laterPendingIds,
    pickupOverride,
  };
}

async function loadReassignmentDriver(driverId: string, storeId: string): Promise<ReassignmentDriver> {
  const driver = await prisma.adminUser.findFirst({
    where: { id: driverId, role: { name: 'DELIVERY_DRIVER' } },
    select: {
      id: true,
      name: true,
      isActive: true,
      dutyStatus: true,
    },
  });
  if (!driver) throw new AppError('Driver not found', 404);
  if (!driver.isActive) throw new AppError('Driver account is suspended', 403);

  const accessible = await getDriverAccessibleStoreIds(driver.id);
  if (!accessible.includes(storeId)) {
    throw new AppError('Rider does not have access to this branch', 403);
  }
  return driver;
}

type CreatedRedeliveryJob = {
  job: { id: string; status: string; rideCode: string | null; title: string };
  driver: ReassignmentDriver;
  orderIds: string[];
  totalCups: number;
  estimatedDistanceKm: number;
  estimatedMinutes: number;
  feesSum: number;
};

async function createRedeliveryJobForDriver(params: {
  tx: Prisma.TransactionClient;
  driver: ReassignmentDriver;
  store: { id: string; name: string; lat: number; lng: number };
  failedOrderNumber: string;
  orderIds: string[];
  forwardById: Map<string, ForwardOrderRow>;
  /** When set, the rider must collect the parcels here instead of the outlet — e.g. a
   *  vehicle-failure breakdown spot. Route origin and the job's stored pickup fields
   *  follow this point instead of the store. */
  pickupOverride?: PickupOverride | null;
}): Promise<CreatedRedeliveryJob> {
  const { tx, driver, store, failedOrderNumber, orderIds, forwardById, pickupOverride } = params;
  const subsetForward = orderIds.map((orderId) => {
    const order = forwardById.get(orderId);
    if (!order) throw new AppError('Forward order is missing from the original ride', 400);
    return order;
  });

  const origin = pickupOverride ?? store;
  const rawStops = subsetForward.map((order) => toRouteStop(order));
  const optimized = optimizeDeliveryStops(
    { lat: origin.lat, lng: origin.lng },
    rawStops,
    { includeReturnToOrigin: true },
  );
  let estimatedDistanceKm = totalRouteDistanceKm(optimized);
  let estimatedMinutes = totalRouteEtaMinutes(optimized);
  try {
    const customerStops = customerRouteStops(optimized);
    const waypoints = buildRouteWaypoints(
      { lat: origin.lat, lng: origin.lng },
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

  const sequenceByOrderId = new Map(customerRouteStops(optimized).map((s) => [s.orderId, s.sequence]));
  const totalCups = rawStops.reduce((sum, stop) => sum + stop.itemCount, 0);
  const feesSum = subsetForward.reduce((sum, order) => sum + order.deliveryFee, 0);
  const readyOrderIds = subsetForward.filter((order) => order.status === 'READY').map((order) => order.id);
  const rideCode = await allocateRideCode();
  const title = redeliveryJobTitle(failedOrderNumber, orderIds.length);

  // Pre-assigned to this driver but SCHEDULED, not ASSIGNED — same as every other job,
  // the driver must explicitly claim it (via the existing assign/claim endpoint) before
  // it becomes ASSIGNED/QUEUED and their duty status flips to ON_DELIVERY.
  const job = await tx.deliveryJob.create({
    data: {
      storeId: store.id,
      driverId: driver.id,
      title,
      rideCode,
      status: 'SCHEDULED',
      scheduledAt: new Date(),
      totalCups,
      estimatedDistanceKm,
      estimatedMinutes,
      totalDistanceKm: estimatedDistanceKm,
      totalDeliveryFees: lkrToDecimal(feesSum),
      pickupLat: pickupOverride?.lat ?? null,
      pickupLng: pickupOverride?.lng ?? null,
      pickupLabel: pickupOverride?.label ?? null,
      jobOrders: {
        create: orderIds.map((orderId) => ({
          orderId,
          sequence: sequenceByOrderId.get(orderId) ?? 1,
        })),
      },
    },
    select: { id: true, status: true, rideCode: true, title: true },
  });

  if (readyOrderIds.length > 0) {
    await tx.order.updateMany({
      where: { id: { in: readyOrderIds }, status: 'READY' },
      data: { status: 'OUT_FOR_DELIVERY' },
    });
    await tx.orderStatusEvent.createMany({
      data: readyOrderIds.map((orderId) => ({
        orderId,
        status: 'OUT_FOR_DELIVERY' as const,
        note: 'Added to redelivery job',
      })),
    });
  }

  await tx.deliveryEvent.createMany({
    data: orderIds.map((orderId) => ({
      orderId,
      jobId: job.id,
      driverId: driver.id,
      state: 'PENDING_ASSIGNMENT' as const,
      note: 'Redelivery scheduled for driver — awaiting acceptance',
    })),
  });

  return {
    job,
    driver,
    orderIds,
    totalCups,
    estimatedDistanceKm,
    estimatedMinutes,
    feesSum,
  };
}

function toReassignResult(
  ctx: FailureReassignmentContext,
  created: CreatedRedeliveryJob,
): ReassignFailedDeliveryResult {
  return {
    jobId: created.job.id,
    rideCode: created.job.rideCode,
    status: created.job.status,
    driverId: created.driver.id,
    driverName: created.driver.name,
    orderId: ctx.failedOrder.id,
    orderNumber: ctx.failedOrder.orderNumber,
    orderIds: created.orderIds,
    orderCount: created.orderIds.length,
    originalJobId: ctx.attempt.jobId,
    title: created.job.title,
  };
}

export async function reassignFailedDeliveryOrders(params: {
  attemptId: string;
  assignments: Array<{ driverId: string; orderIds: string[] }>;
  allowedStoreId?: string;
}): Promise<{ jobs: ReassignFailedDeliveryResult[] }> {
  const ctx = await loadFailureReassignmentContext({
    attemptId: params.attemptId,
    allowedStoreId: params.allowedStoreId,
  });
  return executeFailureReassignment(ctx, mergeAssignmentsByDriver(params.assignments));
}

async function executeFailureReassignment(
  ctx: FailureReassignmentContext,
  assignments: Array<{ driverId: string; orderIds: string[] }>,
): Promise<{ jobs: ReassignFailedDeliveryResult[] }> {
  const forwardIds = ctx.forward.map((row) => row.orderId);
  validateAssignmentCoverage(forwardIds, assignments);

  const driverMap = new Map<string, ReassignmentDriver>();
  for (const assignment of assignments) {
    if (!driverMap.has(assignment.driverId)) {
      driverMap.set(
        assignment.driverId,
        await loadReassignmentDriver(assignment.driverId, ctx.failedOrder.storeId),
      );
    }
  }

  const store = ctx.failedOrder.store;
  const createdJobs: CreatedRedeliveryJob[] = [];

  await prisma.$transaction(async (tx) => {
    if (ctx.laterPendingIds.length > 0) {
      await tx.deliveryJobOrder.deleteMany({
        where: { jobId: ctx.attempt.jobId, orderId: { in: ctx.laterPendingIds } },
      });
    }

    for (const assignment of assignments) {
      const driver = driverMap.get(assignment.driverId)!;
      // Always created SCHEDULED — whether this driver is free, mid-run, or offline no
      // longer matters here; ASSIGNED vs QUEUED is decided later when they claim it.
      const created = await createRedeliveryJobForDriver({
        tx,
        driver,
        store,
        failedOrderNumber: ctx.failedOrder.orderNumber,
        orderIds: assignment.orderIds,
        forwardById: ctx.forwardById,
        pickupOverride: ctx.pickupOverride,
      });
      createdJobs.push(created);
    }
  });

  await maybeEnterReturningPhase(ctx.attempt.jobId).catch(() => {});

  const jobs = createdJobs.map((created) => {
    broadcastJobAssignedToDriver(created.driver.id, {
      jobId: created.job.id,
      title: created.job.title,
      status: created.job.status,
      storeId: store.id,
      storeName: store.name,
      orderCount: created.orderIds.length,
      rideCode: created.job.rideCode,
      totalCups: created.totalCups,
      estimatedDistanceKm: created.estimatedDistanceKm,
      estimatedMinutes: created.estimatedMinutes,
      deliveryFee: created.feesSum,
      forceRing: true,
    });
    broadcastDeliveryJobUpdated(store.id, { jobId: created.job.id, status: created.job.status });
    sendPushToDriver(created.driver.id, {
      jobId: created.job.id,
      title: created.job.title,
      storeName: store.name,
      storeId: store.id,
      orderCount: created.orderIds.length,
      rideCode: created.job.rideCode ?? undefined,
      totalCups: created.totalCups,
      estimatedDistanceKm: created.estimatedDistanceKm,
      estimatedMinutes: created.estimatedMinutes,
      deliveryFee: created.feesSum,
      forceRing: true,
    }).catch(() => {});
    return toReassignResult(ctx, created);
  });

  broadcastDeliveryJobUpdated(store.id, { jobId: ctx.attempt.jobId, status: 'UPDATED' });

  return { jobs };
}

export async function reassignFailedDeliveryOrder(params: {
  attemptId: string;
  driverId: string;
  allowedStoreId?: string;
}): Promise<ReassignFailedDeliveryResult> {
  const ctx = await loadFailureReassignmentContext({
    attemptId: params.attemptId,
    allowedStoreId: params.allowedStoreId,
  });
  const { jobs } = await executeFailureReassignment(ctx, [
    { driverId: params.driverId, orderIds: ctx.forward.map((row) => row.orderId) },
  ]);
  return jobs[0];
}
