import {
  DeliveryJobStatus,
  Prisma,
  type Order,
  type OrderItem,
  type User,
  type Address,
  type OrderStatus,
} from '@prisma/client';
import { normalizeProductImageUrl } from './productImages';
import { prisma } from './prisma';
import { creditedDeliveredTotals } from '@bingchun/delivery-domain';
import type { RouteStop } from './routeOptimizer';
import { optimizeDeliveryStops, totalRouteDistanceKm, totalRouteEtaMinutes } from './routeOptimizer';
import { haversineKm } from '../utils/geo';
import { resolveCustomerDisplayName } from './customerName';
import {
  DEFAULT_BRANCH_COMPLETION_RADIUS_M,
  getBranchCompletionRadiusM,
} from './appSchema';
import { broadcastDeliveryJobUpdated } from './socket';
import { invalidateJobRoute } from './routeCache';
import { ensureDeliveryJobsTables } from './deliverySchema';
import { getDeliveryJobsSqlRef } from './deliveryPg';
import { lkrToDecimal } from './moneyDecimal';

export const ACTIVE_JOB_STATUSES = [
  'SCHEDULED',
  'ASSIGNED',
  'QUEUED',
  'IN_PROGRESS',
  'RETURNING',
] as const;

/** Statuses a driver currently holds — SCHEDULED jobs are still in the branch pool. */
export const DRIVER_HELD_JOB_STATUSES = ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'] as const;

/** Pre-pickup failure is blocked — the rider should reject the claimed job instead. */
export const REJECT_JOB_BEFORE_FAILURE_MESSAGE =
  'reject job if you want to remove the accepted job';

/** False until `prisma generate` includes this label — using it in queries 500s the admin job list. */
export function prismaKnowsDeliveryJobStatus(status: string): boolean {
  return (Object.values(DeliveryJobStatus) as string[]).includes(status);
}

/**
 * Rides that mute new-job ringing: actively delivering customers, or already
 * holding the one extra claim allowed while returning to branch.
 */
export const ALERT_MUTE_JOB_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'QUEUED'] as const;

export type ActiveRidePhase = 'NONE' | 'ASSIGNED' | 'IN_PROGRESS' | 'RETURNING' | 'QUEUED';

/** Single-pass flags from held job rows (same rules as the async helpers). */
export function deriveDriverJobFlags(
  heldJobs: ReadonlyArray<{ status: string }>,
): { alertEligible: boolean; activeRidePhase: ActiveRidePhase; canClaimMore: boolean } {
  const statuses = heldJobs.map((j) => j.status);
  const alertEligible = !statuses.some((s) =>
    (ALERT_MUTE_JOB_STATUSES as readonly string[]).includes(s),
  );
  let activeRidePhase: ActiveRidePhase = 'NONE';
  if (statuses.includes('IN_PROGRESS')) activeRidePhase = 'IN_PROGRESS';
  else if (statuses.includes('ASSIGNED')) activeRidePhase = 'ASSIGNED';
  else if (statuses.includes('RETURNING')) activeRidePhase = 'RETURNING';
  else if (statuses.includes('QUEUED')) activeRidePhase = 'QUEUED';

  const hasCurrentRun = statuses.some((s) => s === 'IN_PROGRESS' || s === 'ASSIGNED');
  const hasQueued = statuses.some((s) => s === 'QUEUED');
  const canClaimMore = !(hasCurrentRun && hasQueued);
  return { alertEligible, activeRidePhase, canClaimMore };
}

/**
 * Cap: one active run (ASSIGNED / IN_PROGRESS) plus at most one QUEUED next job.
 * RETURNING does not count as a current run, so a driver heading back to the
 * branch can still claim (as ASSIGNED) unless they already hold a QUEUED job
 * stacked on top of a current run.
 */
export async function canDriverClaimMore(driverId: string): Promise<boolean> {
  const runs = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
    select: { status: true },
  });
  return deriveDriverJobFlags(runs).canClaimMore;
}

export type JobPreviewStop = { customerName: string; addressLine: string; city: string; district: string };
export type JobRoutePreview = {
  estimatedDistanceKm: number;
  estimatedMinutes: number;
  previewStops: JobPreviewStop[];
};

type PreviewOrder = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryAddressLine: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  guestName: string | null;
  user: { name: string | null } | null;
  address: { lat: number | null; lng: number | null; addressLine: string; city: string; district: string } | null;
};

/**
 * Cheap (haversine-only, no OSRM) distance and first-3-stop preview for job-list
 * cards — deliberately lighter than the full road-following route.
 */
export function buildJobRoutePreview(
  store: { lat: number; lng: number },
  orders: PreviewOrder[],
  isMine: boolean,
): JobRoutePreview {
  const rawStops = orders
    .filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
    .map((o) => {
      const lat = o.deliveryLat ?? o.address?.lat;
      const lng = o.deliveryLng ?? o.address?.lng;
      if (lat == null || lng == null) return null;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        customerName: isMine ? (o.user?.name ?? o.guestName ?? 'Guest') : 'Customer',
        customerPhone: '',
        addressLine: isMine ? (o.deliveryAddressLine ?? o.address?.addressLine ?? '') : '',
        city: o.deliveryCity ?? o.address?.city ?? '',
        district: o.deliveryDistrict ?? o.address?.district ?? '',
        status: o.status,
        total: 0,
        itemCount: 0,
        lat,
        lng,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (rawStops.length === 0) {
    return { estimatedDistanceKm: 0, estimatedMinutes: 0, previewStops: [] };
  }

  const ordered = optimizeDeliveryStops(store, rawStops);
  return {
    estimatedDistanceKm: totalRouteDistanceKm(ordered),
    estimatedMinutes: totalRouteEtaMinutes(ordered),
    previewStops: ordered.slice(0, 3).map((s) => ({
      customerName: s.customerName,
      addressLine: s.addressLine,
      city: s.city,
      district: s.district,
    })),
  };
}

export function isActiveDeliveryJobStatus(status: string): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(status);
}

export type IncompleteJobStatus = 'MISSED' | 'ABANDONED' | 'PARTIALLY_COMPLETED';

/**
 * Classify a job whose scheduled day has passed without completing:
 * never claimed (Missed), claimed but nothing delivered (Abandoned), or
 * claimed with some but not all orders delivered (Partially Completed).
 */
export function classifyIncompleteJob(
  job: { status: string; driverId: string | null },
  deliveredCount: number,
): IncompleteJobStatus | null {
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return null;
  if (job.status === 'SCHEDULED' && !job.driverId) return 'MISSED';
  if (job.driverId) return deliveredCount === 0 ? 'ABANDONED' : 'PARTIALLY_COMPLETED';
  return null;
}

const PICKUP_BLOCKING_STATES = new Set([
  'PICKED_UP',
  'EN_ROUTE',
  'ARRIVED',
  'AWAITING_OTP',
  'DELIVERED',
]);

/** Reject/cancel allowed only before any order on the job has been picked up. */
export function isRejectAllowed(domainStates: string[]): boolean {
  return !domainStates.some((state) => PICKUP_BLOCKING_STATES.has(state));
}

/** Active jobs hide cancelled orders; completed jobs keep them as history. */
export function visibleOrdersForDeliveryJob<T extends { status: string }>(
  jobStatus: string,
  orders: T[],
): T[] {
  if (!isActiveDeliveryJobStatus(jobStatus)) return orders;
  return orders.filter((order) => order.status !== 'CANCELLED');
}

export function visibleJobOrderLinksForDeliveryJob<T extends { order: { status: string } }>(
  jobStatus: string,
  jobOrders: T[],
): T[] {
  if (!isActiveDeliveryJobStatus(jobStatus)) return jobOrders;
  return jobOrders.filter((link) => link.order.status !== 'CANCELLED');
}

/**
 * Delivery-schema rows can point at an order that no longer exists. Including that
 * required relation makes Prisma throw "Field order is required to return data, got null"
 * and the whole list fails. Loading by id leaves the missing order out.
 */
type OrderSelectWithId<S extends Prisma.OrderSelect> = S & { id: true };

export async function findOrdersByIds<S extends Prisma.OrderSelect>(
  ids: string[],
  select: S,
): Promise<Map<string, Prisma.OrderGetPayload<{ select: OrderSelectWithId<S> }>>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const selectWithId: OrderSelectWithId<S> = { ...select, id: true };
  type Row = Prisma.OrderGetPayload<{ select: OrderSelectWithId<S> }>;
  const rows = await prisma.order.findMany({
    where: { id: { in: unique } },
    select: selectWithId,
  });
  const out = new Map<string, Row>();
  for (const row of rows) {
    const id = (row as { id: string }).id;
    out.set(id, row as Row);
  }
  return out;
}

export async function findOrdersByIdsInclude<I extends Prisma.OrderInclude>(
  ids: string[],
  include: I,
): Promise<Map<string, Prisma.OrderGetPayload<{ include: I }>>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  type Row = Prisma.OrderGetPayload<{ include: I }>;
  const rows = await prisma.order.findMany({
    where: { id: { in: unique } },
    include,
  });
  const out = new Map<string, Row>();
  for (const row of rows) {
    const id = (row as { id: string }).id;
    out.set(id, row as Row);
  }
  return out;
}

/**
 * When every order in a job is delivered/cancelled/failed, move the job to
 * RETURNING so the rider must travel back to the branch before completing.
 */
export async function maybeEnterReturningPhase(jobId: string): Promise<boolean> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: {
      jobOrders: { include: { order: { select: { status: true, id: true } } } },
    },
  });

  if (!job || job.status !== 'IN_PROGRESS') return false;
  if (job.jobOrders.length === 0) return false;

  const failedAttempts = await prisma.deliveryAttempt.findMany({
    where: { jobId, outcome: { not: 'DELIVERED' } },
    select: { orderId: true },
    distinct: ['orderId'],
  });
  const failedOrderIds = new Set(failedAttempts.map((a) => a.orderId));

  const allDone = job.jobOrders.every(
    (jo) =>
      jo.order.status === 'DELIVERED' ||
      jo.order.status === 'CANCELLED' ||
      failedOrderIds.has(jo.orderId),
  );
  if (!allDone) return false;

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: { status: 'RETURNING', returnStartedAt: new Date() },
  });

  broadcastDeliveryJobUpdated(job.storeId, { jobId, status: 'RETURNING' });

  return true;
}

/** @deprecated Use maybeEnterReturningPhase — kept for callers during migration. */
export async function maybeAutoCompleteDeliveryJob(jobId: string): Promise<boolean> {
  return maybeEnterReturningPhase(jobId);
}

/** After a job completes, promote the oldest QUEUED job for this driver to ASSIGNED. */
export async function promoteNextQueuedJob(driverId: string | null | undefined): Promise<void> {
  if (!driverId) return;
  const next = await prisma.deliveryJob.findFirst({
    where: { driverId, status: 'QUEUED' },
    orderBy: { assignedAt: 'asc' },
    select: { id: true },
  });
  if (!next) return;
  await prisma.deliveryJob.update({
    where: { id: next.id },
    data: { status: 'ASSIGNED' },
  });
}

export type JobVehicleFailurePin = {
  lat: number;
  lng: number;
  orderId: string;
};

export type JobRouteOriginStore = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  addressLine: string;
  city: string;
};

type JobWithPickupFields = {
  store: JobRouteOriginStore;
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string | null;
};

/** Route start point — outlet branch, or breakdown pickup for vehicle-failure redeliveries. */
export function resolveJobRouteOrigin(job: JobWithPickupFields): JobRouteOriginStore {
  const pickupLat = job.pickupLat;
  const pickupLng = job.pickupLng;
  if (pickupLat != null && pickupLng != null) {
    return {
      id: 'pickup',
      name: job.pickupLabel ?? 'Pickup location',
      addressLine: '',
      city: '',
      lat: pickupLat,
      lng: pickupLng,
    };
  }
  return job.store;
}

export function resolveJobPickupOverride(
  job: JobWithPickupFields,
): { lat: number; lng: number; label: string } | null {
  const pickupLat = job.pickupLat;
  const pickupLng = job.pickupLng;
  if (pickupLat == null || pickupLng == null) return null;
  return {
    lat: pickupLat,
    lng: pickupLng,
    label: job.pickupLabel ?? 'Pickup location',
  };
}

export async function fetchJobVehicleFailure(jobId: string): Promise<JobVehicleFailurePin | null> {
  await ensureDeliveryJobsTables();
  const attempt = await prisma.deliveryAttempt.findFirst({
    where: {
      jobId,
      outcome: 'VEHICLE_FAILURE',
      lat: { not: null },
      lng: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { lat: true, lng: true, orderId: true },
  });
  if (attempt?.lat == null || attempt.lng == null) return null;
  return { lat: attempt.lat, lng: attempt.lng, orderId: attempt.orderId };
}

/**
 * Flag remaining undelivered stops as a mid-route breakdown, then close the
 * ride as VEHICLE_FAILURE while keeping the original rider on the job
 * (history + admin), so it drops off My active job without return-to-branch.
 */
export async function recordVehicleFailureAndReleaseJob(opts: {
  jobId: string;
  driverId: string;
  storeId: string;
  fromSequence: number;
  lat: number;
  lng: number;
  note?: string;
}): Promise<{ orderIds: string[] }> {
  // Idempotent after the first successful run (short-circuits via a module-level flag) —
  // guarantees the VEHICLE_FAILURE enum value exists on the DB even if this process's
  // Prisma client was generated before the migration landed, so the status-flip below
  // can't silently fail and leave the job invisible in both the admin Incomplete tab
  // and the driver's own history.
  await ensureDeliveryJobsTables();

  const remaining = await prisma.deliveryJobOrder.findMany({
    where: {
      jobId: opts.jobId,
      sequence: { gte: opts.fromSequence },
      order: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } },
    },
    orderBy: { sequence: 'asc' },
    include: { order: { select: { id: true, status: true } } },
  });

  const orderIds: string[] = [];
  const note = opts.note ?? 'Vehicle failure';
  for (const link of remaining) {
    const prior = await prisma.deliveryAttempt.count({
      where: { orderId: link.orderId, jobId: opts.jobId },
    });
    await prisma.deliveryAttempt.create({
      data: {
        orderId: link.orderId,
        jobId: opts.jobId,
        driverId: opts.driverId,
        attemptNo: prior + 1,
        outcome: 'VEHICLE_FAILURE',
        note,
        lat: opts.lat,
        lng: opts.lng,
      },
    });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: link.orderId,
        status: link.order.status,
        note: opts.note ? `Vehicle failure: ${opts.note}` : 'Vehicle failure reported by driver',
      },
    });
    orderIds.push(link.orderId);
  }

  const allLinks = await prisma.deliveryJobOrder.findMany({
    where: { jobId: opts.jobId },
    select: { orderId: true, order: { select: { status: true, deliveryFee: true, cancelledAtStatus: true } } },
  });
  const { deliveredTotal } = creditedDeliveredTotals(allLinks, new Set(orderIds));

  await prisma.deliveryJob.update({
    where: { id: opts.jobId },
    data: {
      status: 'VEHICLE_FAILURE',
      completedAt: new Date(),
      totalDeliveryFees: lkrToDecimal(deliveredTotal),
    },
  });
  await releaseDriverWhenIdle(opts.driverId);
  await promoteNextQueuedJob(opts.driverId);

  invalidateJobRoute(opts.jobId);
  broadcastDeliveryJobUpdated(opts.storeId, { jobId: opts.jobId, status: 'VEHICLE_FAILURE' });

  return { orderIds };
}

/** Flip the driver back to ONLINE once they hold no assigned/queued/in-progress/returning run. */
export async function releaseDriverWhenIdle(driverId: string | null | undefined): Promise<void> {
  if (!driverId) return;
  const remaining = await prisma.deliveryJob.count({
    where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
  });
  if (remaining > 0) return;
  await prisma.adminUser.update({
    where: { id: driverId },
    data: { dutyStatus: 'ONLINE' },
  });
}

export async function maybeAutoCompleteDeliveryJobsForOrder(orderId: string): Promise<void> {
  const links = await prisma.deliveryJobOrder.findMany({
    where: {
      orderId,
      job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
    },
    select: { jobId: true },
  });

  for (const link of links) {
    await maybeEnterReturningPhase(link.jobId);
  }
}

export async function ensureJobDeliveryTerminalEvent(opts: {
  orderId: string;
  jobId: string;
  driverId?: string | null;
  storeId: string;
  jobStatus: string;
  orderStatus: 'DELIVERED' | 'CANCELLED';
  note?: string;
}): Promise<void> {
  const state = opts.orderStatus === 'DELIVERED' ? 'DELIVERED' : 'FAILED';
  const existing = await prisma.deliveryEvent.findFirst({
    where: { orderId: opts.orderId, jobId: opts.jobId, state },
    select: { id: true },
  });
  if (!existing) {
    await prisma.deliveryEvent.create({
      data: {
        orderId: opts.orderId,
        jobId: opts.jobId,
        driverId: opts.driverId ?? null,
        state,
        note: opts.note ?? (opts.orderStatus === 'DELIVERED' ? 'Marked delivered' : 'Cancelled'),
      },
    });
  }
  broadcastDeliveryJobUpdated(opts.storeId, { jobId: opts.jobId, status: opts.jobStatus });
}

/** Write a job-scoped terminal delivery event when admin/legacy sets order status. */
export async function syncJobDeliveryEventForOrderStatus(
  orderId: string,
  orderStatus: 'DELIVERED' | 'CANCELLED',
): Promise<void> {
  const links = await prisma.deliveryJobOrder.findMany({
    where: {
      orderId,
      job: { status: { in: [...ACTIVE_JOB_STATUSES] } },
    },
    select: {
      jobId: true,
      job: { select: { storeId: true, status: true, driverId: true } },
    },
  });

  for (const link of links) {
    await ensureJobDeliveryTerminalEvent({
      orderId,
      jobId: link.jobId,
      driverId: link.job.driverId,
      storeId: link.job.storeId,
      jobStatus: link.job.status,
      orderStatus,
    });
  }
}

/**
 * Rider may receive ringing new-ride alerts when they have no ASSIGNED/IN_PROGRESS/
 * QUEUED ride (idle ONLINE, or only RETURNING with no extra claim taken yet).
 */
export async function isDriverAlertEligible(driverId: string): Promise<boolean> {
  const jobs = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
    select: { status: true },
  });
  return deriveDriverJobFlags(jobs).alertEligible;
}

export async function getDriverActiveRidePhase(driverId: string): Promise<ActiveRidePhase> {
  const jobs = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: [...DRIVER_HELD_JOB_STATUSES] } },
    select: { status: true },
  });
  return deriveDriverJobFlags(jobs).activeRidePhase;
}

/** Allocate the next human-readable ride code (RIDE-1024, …). */
export async function allocateRideCode(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ rideCode: string | null }>>(
    `SELECT "rideCode" FROM ${getDeliveryJobsSqlRef()}
     WHERE "rideCode" IS NOT NULL
     ORDER BY "createdAt" DESC
     LIMIT 50`,
  );
  let max = 1000;
  for (const row of rows) {
    const m = row.rideCode?.match(/^RIDE-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  // Retry a few times in case of concurrent creates.
  for (let i = 1; i <= 5; i++) {
    const code = `RIDE-${max + i}`;
    const exists = await prisma.deliveryJob.findFirst({
      where: { rideCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return `RIDE-${max + Date.now() % 100000}`;
}

export async function resolveCompletionRadiusM(
  storeCompletionRadiusM: number | null | undefined,
): Promise<number> {
  if (storeCompletionRadiusM != null && Number.isFinite(storeCompletionRadiusM)) {
    return Math.max(20, Math.min(2000, Math.round(storeCompletionRadiusM)));
  }
  try {
    return await getBranchCompletionRadiusM();
  } catch {
    return DEFAULT_BRANCH_COMPLETION_RADIUS_M;
  }
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

type OrderWithRelations = Order & {
  user: Pick<User, 'name' | 'phone'> | null;
  address: Pick<Address, 'addressLine' | 'city' | 'district' | 'lat' | 'lng'> | null;
  items: (Pick<OrderItem, 'quantity' | 'productName' | 'totalPrice'> & {
    product?: { imageUrl: string | null } | null;
  })[];
};

export function orderStopImageMeta(
  items: OrderWithRelations['items'],
): { imageUrl: string | null; extraItemCount: number } {
  const imageUrl = normalizeProductImageUrl(items[0]?.product?.imageUrl ?? null);
  const extraItemCount = Math.max(0, items.length - 1);
  return { imageUrl, extraItemCount };
}

export function orderToStop(
  order: OrderWithRelations,
  sequence: number,
  distanceFromPreviousKm = 0,
  etaMinutesFromPrevious = 0
): RouteStop {
  const lat = order.deliveryLat ?? order.address?.lat ?? 0;
  const lng = order.deliveryLng ?? order.address?.lng ?? 0;

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
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    ...orderStopImageMeta(order.items),
    lat,
    lng,
    sequence,
    distanceFromPreviousKm,
    etaMinutesFromPrevious,
  };
}

export type FormatJobOrderOptions = {
  /** When true, strip customer phone and full street address (pre-acceptance privacy). */
  redactCustomer?: boolean;
  /** When true, omit order total and per-item prices from driver-facing payloads. */
  redactPricing?: boolean;
};

export function formatJobOrder(
  order: OrderWithRelations,
  sequence: number,
  opts: FormatJobOrderOptions = {},
) {
  const lat = order.deliveryLat ?? order.address?.lat;
  const lng = order.deliveryLng ?? order.address?.lng;
  const redactCustomer = opts.redactCustomer === true;
  const redactPricing = opts.redactPricing !== false; // default: hide product prices from drivers

  const paymentLabel =
    (order as { paymentGateway?: string | null }).paymentGateway === 'WEBXPAY'
      ? 'WEBXPAY'
      : order.paymentMethod;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    sequence,
    status: order.status,
    createdAt: order.createdAt,
    paymentMethod: paymentLabel,
    paymentStatus: order.paymentStatus,
    total: redactPricing ? undefined : order.total,
    deliveryFee: order.deliveryFee,
    estimatedMinutes: order.estimatedMinutes,
    notes: order.notes,
    cancelReason: (order as { cancelReason?: string | null }).cancelReason ?? null,
    customerName: redactCustomer
      ? 'Customer'
      : resolveCustomerDisplayName({
          guestName: order.guestName,
          userName: order.user?.name,
          phone: order.guestPhone ?? order.user?.phone,
        }),
    customerPhone: redactCustomer ? '' : (order.user?.phone ?? order.guestPhone ?? ''),
    addressLine: redactCustomer
      ? ''
      : (order.deliveryAddressLine ?? order.address?.addressLine ?? ''),
    city: order.deliveryCity ?? order.address?.city ?? '',
    district: order.deliveryDistrict ?? order.address?.district ?? '',
    // Coordinates stay visible pre-claim so the driver can see the run on the map.
    // Name/phone/addressLine above remain redacted until the job is theirs.
    lat,
    lng,
    items: order.items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      totalPrice: redactPricing ? undefined : i.totalPrice,
      imageUrl: normalizeProductImageUrl(i.product?.imageUrl ?? null),
    })),
  };
}

export const jobOrdersWithDetails = {
  orderBy: { sequence: 'asc' as const },
  include: {
    order: {
      include: {
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
};

type DeliveryEventRow = { state: string; createdAt: Date; note: string | null };
type DeliveryAttemptRow = {
  outcome: string;
  note: string | null;
  createdAt: Date;
  attemptNo: number;
};

export type AdminOrderDeliveryState = {
  deliveryState: 'Delivered' | 'Failed' | 'Pending';
  terminalEventAt: Date | null;
  failureOutcome: string | null;
  failureNote: string | null;
};

export type DeriveAdminOrderDeliveryStateOpts = {
  orderStatus?: string;
  statusEvents?: { status: string; createdAt: Date }[];
  updatedAt?: Date | null;
  cancelReason?: string | null;
  complaint?: {
    category: string;
    description: string;
    createdAt: Date;
    status?: string;
  } | null;
};

function statusEventAt(
  opts: DeriveAdminOrderDeliveryStateOpts | undefined,
  status: string,
): Date | null {
  return opts?.statusEvents?.find((event) => event.status === status)?.createdAt ?? null;
}

function deliveredAtFromStatus(opts?: DeriveAdminOrderDeliveryStateOpts): Date | null {
  return statusEventAt(opts, 'DELIVERED') ?? opts?.updatedAt ?? null;
}

function failedAttempt(attempts: DeliveryAttemptRow[]): DeliveryAttemptRow | undefined {
  return attempts.find((attempt) => attempt.outcome !== 'DELIVERED');
}

export function deriveAdminOrderDeliveryState(
  events: DeliveryEventRow[],
  attempts: DeliveryAttemptRow[],
  opts?: DeriveAdminOrderDeliveryStateOpts,
): AdminOrderDeliveryState {
  const latestEvent = events[0];

  if (latestEvent?.state === 'DELIVERED') {
    return {
      deliveryState: 'Delivered',
      terminalEventAt: latestEvent.createdAt,
      failureOutcome: null,
      failureNote: null,
    };
  }

  if (latestEvent?.state === 'FAILED' || latestEvent?.state === 'RETURNED_TO_STORE') {
    const latestFailedAttempt = failedAttempt(attempts);
    return {
      deliveryState: 'Failed',
      terminalEventAt: latestEvent.createdAt,
      failureOutcome: latestFailedAttempt?.outcome ?? null,
      failureNote: latestFailedAttempt?.note ?? null,
    };
  }

  if (opts?.orderStatus === 'DELIVERED') {
    return {
      deliveryState: 'Delivered',
      terminalEventAt: deliveredAtFromStatus(opts),
      failureOutcome: null,
      failureNote: null,
    };
  }

  if (opts?.orderStatus === 'CANCELLED') {
    return {
      deliveryState: 'Failed',
      terminalEventAt: statusEventAt(opts, 'CANCELLED') ?? opts.updatedAt ?? null,
      failureOutcome: opts.cancelReason ?? 'CANCELLED',
      failureNote: opts.cancelReason ?? 'Cancelled',
    };
  }

  const latestFailedAttempt = failedAttempt(attempts);
  if (latestFailedAttempt) {
    return {
      deliveryState: 'Failed',
      terminalEventAt: latestFailedAttempt.createdAt,
      failureOutcome: latestFailedAttempt.outcome,
      failureNote: latestFailedAttempt.note,
    };
  }

  const complaint = opts?.complaint;
  if (complaint && complaint.status !== 'DISMISSED') {
    return {
      deliveryState: 'Failed',
      terminalEventAt: complaint.createdAt,
      failureOutcome: complaint.category,
      failureNote: complaint.description,
    };
  }

  return {
    deliveryState: 'Pending',
    terminalEventAt: null,
    failureOutcome: null,
    failureNote: null,
  };
}

/** Admin detail include — events and attempts scoped to the current job. */
export function adminOrderDetailInclude(jobId: string) {
  return {
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
    statusEvents: {
      where: { status: { in: ['DELIVERED', 'CANCELLED'] as OrderStatus[] } },
      orderBy: { createdAt: 'desc' as const },
      take: 2,
      select: { status: true, createdAt: true },
    },
    deliveryEvents: {
      where: { jobId },
      orderBy: { createdAt: 'desc' as const },
      take: 5,
      select: { state: true, createdAt: true, note: true },
    },
    deliveryAttempts: {
      where: { jobId },
      orderBy: { createdAt: 'desc' as const },
      take: 3,
      select: { outcome: true, note: true, createdAt: true, attemptNo: true },
    },
  };
}

export function adminJobOrdersInclude(jobId: string) {
  return {
    orderBy: { sequence: 'asc' as const },
    include: {
      order: {
        include: adminOrderDetailInclude(jobId),
      },
    },
  };
}

export type { LatLngPoint, JobGpsLocation, CreditedJobOrder } from '@bingchun/delivery-domain';
export {
  fetchJobGpsLocations,
  fetchLatestDriverLocation,
  parseActualRouteJson,
  simplifyGpsPath,
  isCreditedDelivery,
  groupFailedOrderIdsByJob,
  creditedDeliveredTotals,
  deliveredOrderDeliveryFees,
  finalizeDeliveryJob,
  persistJobActualRouteFromGps,
} from '@bingchun/delivery-domain';

/**
 * Incrementally add a GPS leg to actualDistanceKm while a ride is active.
 */
export async function accumulateJobActualDistance(
  jobId: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<void> {
  const legKm = haversineKm(fromLat, fromLng, toLat, toLng);
  if (legKm <= 0 || legKm > 5) return; // ignore GPS jumps
  await prisma.$executeRawUnsafe(
    `UPDATE ${getDeliveryJobsSqlRef()}
     SET "actualDistanceKm" = COALESCE("actualDistanceKm", 0) + $1
     WHERE "id" = $2 AND "status" IN ('IN_PROGRESS', 'RETURNING')`,
    Math.round(legKm * 1000) / 1000,
    jobId,
  );
}

export type DriverComplaintSummary = {
  id: string;
  category: string;
  description: string;
  status: string;
  createdAt: Date;
};

export async function fetchOrderComplaintsByOrderIds(
  orderIds: string[],
): Promise<Map<string, DriverComplaintSummary[]>> {
  if (orderIds.length === 0) return new Map();

  const rows = await prisma.driverComplaint.findMany({
    where: { orderId: { in: orderIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderId: true,
      category: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });

  const byOrder = new Map<string, DriverComplaintSummary[]>();
  for (const row of rows) {
    const summary: DriverComplaintSummary = {
      id: row.id,
      category: row.category,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
    };
    const list = byOrder.get(row.orderId);
    if (list) list.push(summary);
    else byOrder.set(row.orderId, [summary]);
  }
  return byOrder;
}

/** Complaints this driver filed, grouped by order — for job/order detail payloads. */
export async function fetchDriverComplaintsByOrderIds(
  driverId: string,
  orderIds: string[],
): Promise<Map<string, DriverComplaintSummary[]>> {
  if (orderIds.length === 0) return new Map();

  const rows = await prisma.driverComplaint.findMany({
    where: { driverId, orderId: { in: orderIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderId: true,
      category: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });

  const byOrder = new Map<string, DriverComplaintSummary[]>();
  for (const row of rows) {
    const summary: DriverComplaintSummary = {
      id: row.id,
      category: row.category,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
    };
    const list = byOrder.get(row.orderId);
    if (list) list.push(summary);
    else byOrder.set(row.orderId, [summary]);
  }
  return byOrder;
}

export function countComplaintsForOrderIds(
  complaintsByOrder: Map<string, DriverComplaintSummary[]>,
  orderIds: string[],
): number {
  let count = 0;
  for (const orderId of orderIds) {
    count += complaintsByOrder.get(orderId)?.length ?? 0;
  }
  return count;
}

/** Job statuses where a customer may already have rated the rider (order DELIVERED). */
const JOB_STATUSES_FOR_RIDER_RATING: DeliveryJobStatus[] = [
  DeliveryJobStatus.IN_PROGRESS,
  DeliveryJobStatus.RETURNING,
  DeliveryJobStatus.COMPLETED,
];

/** Increment pre-aggregated rider rating totals on the assigned delivery job. */
export async function incrementJobRiderRating(orderId: string, stars: number): Promise<void> {
  const link = await prisma.deliveryJobOrder.findFirst({
    where: {
      orderId,
      job: {
        driverId: { not: null },
        status: { in: [...JOB_STATUSES_FOR_RIDER_RATING] },
      },
    },
    orderBy: { job: { createdAt: 'desc' } },
    select: { jobId: true },
  });
  if (!link) return;

  await prisma.deliveryJob.update({
    where: { id: link.jobId },
    data: {
      riderRatingSum: { increment: stars },
      riderRatingCount: { increment: 1 },
    },
  });
}
