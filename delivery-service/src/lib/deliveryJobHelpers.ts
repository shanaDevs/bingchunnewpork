import type { Order, OrderItem, User, Address } from '@bingchun/db';
import { prisma } from '@bingchun/db';
import { DeliveryJobStatus } from '@prisma/client';
import { haversineKm, optimizeDeliveryStops, totalRouteDistanceKm, totalRouteEtaMinutes } from '@bingchun/delivery-domain';
import type { RouteStop } from '@bingchun/delivery-domain';
import { isOtpRequiredForStore } from './otp';

/** Rides that mute new-job ringing — a rider RETURNING to the branch still rings. */
const ALERT_MUTE_JOB_STATUSES = ['ASSIGNED', 'IN_PROGRESS'] as const;

export const DEFAULT_BRANCH_COMPLETION_RADIUS_M = 100;

export type HeldJobStatus = 'ASSIGNED' | 'QUEUED' | 'IN_PROGRESS' | 'RETURNING';

/** Pre-pickup failure is blocked — the rider should reject the claimed job instead. */
export const REJECT_JOB_BEFORE_FAILURE_MESSAGE =
  'reject job if you want to remove the accepted job';

export function prismaKnowsDeliveryJobStatus(status: string): boolean {
  return (Object.values(DeliveryJobStatus) as string[]).includes(status);
}

let queuedEnumReady: boolean | undefined;

/** Live DB may not have DeliveryJobStatus.QUEUED until the additive migration runs. */
export async function isQueuedStatusAvailable(): Promise<boolean> {
  if (queuedEnumReady !== undefined) return queuedEnumReady;
  try {
    const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'DeliveryJobStatus' AND e.enumlabel = 'QUEUED'
    `;
    queuedEnumReady = Number(rows[0]?.cnt ?? 0) > 0;
  } catch {
    queuedEnumReady = false;
  }
  return queuedEnumReady;
}

export async function heldJobStatuses(): Promise<HeldJobStatus[]> {
  return (await isQueuedStatusAvailable())
    ? ['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING']
    : ['ASSIGNED', 'IN_PROGRESS', 'RETURNING'];
}

/**
 * Rider may receive ringing new-ride alerts when they hold no ASSIGNED/IN_PROGRESS
 * ride (idle ONLINE, or only QUEUED / RETURNING). Mirrors core.
 */
export async function isDriverAlertEligible(driverId: string): Promise<boolean> {
  const muted = await prisma.deliveryJob.count({
    where: { driverId, status: { in: [...ALERT_MUTE_JOB_STATUSES] } },
  });
  return muted === 0;
}

function clampBranchRadiusM(value: number): number {
  return Math.max(20, Math.min(2000, Math.round(value)));
}

/** Branch geofence in metres — per-store override, else the global app setting. */
export async function resolveCompletionRadiusM(
  storeCompletionRadiusM: number | null | undefined,
): Promise<number> {
  if (storeCompletionRadiusM != null && Number.isFinite(storeCompletionRadiusM)) {
    return clampBranchRadiusM(storeCompletionRadiusM);
  }
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ branchCompletionRadiusM: number | bigint | null }>>(
      'SELECT "branchCompletionRadiusM" FROM "app_settings" WHERE "id" = $1 LIMIT 1',
      'default',
    );
    const raw = rows[0]?.branchCompletionRadiusM;
    if (raw == null) return DEFAULT_BRANCH_COMPLETION_RADIUS_M;
    return clampBranchRadiusM(Number(raw));
  } catch {
    return DEFAULT_BRANCH_COMPLETION_RADIUS_M;
  }
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

export async function assignedOrQueuedStatuses(): Promise<Array<'ASSIGNED' | 'QUEUED'>> {
  return (await isQueuedStatusAvailable()) ? ['ASSIGNED', 'QUEUED'] : ['ASSIGNED'];
}

/**
 * A driver can't claim another job while actively holding one — claiming only
 * reopens once the current run reaches RETURNING (last stop done) or completes.
 * Mirrors the block enforced by takeScheduledJob.
 */
export async function canDriverClaimMore(driverId: string): Promise<boolean> {
  const heldStatuses = await heldJobStatuses();
  const runs = await prisma.deliveryJob.findMany({
    where: { driverId, status: { in: heldStatuses } },
    select: { status: true },
  });
  return !runs.some((j) => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');
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
 * cards — deliberately lighter than getJobRoute's full road-following path.
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

export type IncompleteJobStatus = 'MISSED' | 'ABANDONED' | 'PARTIALLY_COMPLETED';

/**
 * Classify a job whose scheduled day has passed without completing:
 * never claimed (Missed), claimed but nothing delivered (Abandoned), or
 * claimed with some but not all orders delivered (Partially Completed).
 */
export function classifyIncompleteJob(
  job: { status: string; driverId?: string | null },
  deliveredCount: number,
): IncompleteJobStatus | null {
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return null;
  if (job.status === 'SCHEDULED' && !job.driverId) return 'MISSED';
  if (job.driverId) return deliveredCount === 0 ? 'ABANDONED' : 'PARTIALLY_COMPLETED';
  return null;
}

/** Terminal states from the delivery domain's perspective — the order will not be
 *  revisited by this job even though `orders.status` may lag a few seconds behind
 *  (it is written asynchronously by core via the outbox). */
const TERMINAL_ORDER_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

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

type OrderWithRelations = Order & {
  user: Pick<User, 'name' | 'phone'> | null;
  address: Pick<Address, 'addressLine' | 'city' | 'district' | 'lat' | 'lng'> | null;
  items: (Pick<OrderItem, 'quantity' | 'productName' | 'totalPrice'> & {
    product?: { imageUrl: string | null } | null;
  })[];
};

export type FormatJobOrderOptions = {
  /** When true, strip customer phone and full street address (pre-acceptance privacy). */
  redactCustomer?: boolean;
  /** When true, omit order total and per-item prices from driver-facing payloads. */
  redactPricing?: boolean;
};

export function orderStopImageMeta(
  items: OrderWithRelations['items'],
): { imageUrl: string | null; extraItemCount: number } {
  const imageUrl = items[0]?.product?.imageUrl ?? null;
  const extraItemCount = Math.max(0, items.length - 1);
  return { imageUrl, extraItemCount };
}

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
    customerName: redactCustomer
      ? 'Customer'
      : (order.user?.name ?? order.guestName ?? 'Guest'),
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
      imageUrl: i.product?.imageUrl ?? null,
    })),
  };
}

export type JobWithOrders = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  driverId?: string | null;
  store: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    addressLine: string;
    city: string;
    deliveryOtpRequired?: boolean;
    completionRadiusM?: number | null;
  };
  jobOrders: { sequence: number; orderId: string; order: OrderWithRelations }[];
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupLabel?: string | null;
};

export async function formatJob(
  job: JobWithOrders,
  opts: { viewerDriverId?: string | null } = {},
) {

  const isAssignedToViewer =
    !!opts.viewerDriverId && !!job.driverId && job.driverId === opts.viewerDriverId;
  const redactCustomer = !isAssignedToViewer;
  const orderIds = job.jobOrders.map((jo) => jo.orderId);
  const failedAttempts = orderIds.length
    ? await prisma.deliveryAttempt.findMany({
        where: {
          orderId: { in: orderIds },
          jobId: job.id,
          outcome: { not: 'DELIVERED' },
        },
        select: { orderId: true },
        distinct: ['orderId'],
      })
    : [];
  const failedOrderIds = new Set(failedAttempts.map((a) => a.orderId));
  const complaintsByOrder =
    opts.viewerDriverId && orderIds.length
      ? await fetchDriverComplaintsByOrderIds(opts.viewerDriverId, orderIds)
      : new Map();

  const orders = job.jobOrders.map((jo) => ({
    ...formatJobOrder(jo.order, jo.sequence, { redactCustomer, redactPricing: true }),
    deliveryFailed: failedOrderIds.has(jo.orderId),
    complaints: complaintsByOrder.get(jo.orderId) ?? [],
  }));
  // Failed attempts count as resolved so the driver app can finish the run.
  const deliveredCount = orders.filter(
    (o) => o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.deliveryFailed,
  ).length;
  const totalDeliveryFees = job.jobOrders.reduce((sum, jo) => sum + jo.order.deliveryFee, 0);

  return {
    id: job.id,
    title: job.title,
    status: job.status,
    scheduledAt: job.scheduledAt,
    assignedAt: job.assignedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    store: {
      ...job.store,
      deliveryOtpRequired: isOtpRequiredForStore(job.store),
      // Resolve rather than pass the raw column through: it is nullable (null = "use the
      // app default"), and the driver app declares completionRadiusM as a non-null Int, so
      // an explicit null fails to parse. Matches backend's formatJob.
      completionRadiusM: await resolveCompletionRadiusM(job.store.completionRadiusM),
    },
    pickup:
      job.pickupLat != null && job.pickupLng != null
        ? { lat: job.pickupLat, lng: job.pickupLng, label: job.pickupLabel ?? 'Pickup location' }
        : null,
    orderCount: orders.length,
    deliveredCount,
    totalDeliveryFees,
    orders,
    pickedUp: await jobHasPickedUp(job.id, job.status),
    canComplete: job.status === 'RETURNING' && deliveredCount === orders.length,
    canClaimMore: opts.viewerDriverId ? await canDriverClaimMore(opts.viewerDriverId) : true,
  };
}


export async function jobHasPickedUp(jobId: string, jobStatus?: string | null): Promise<boolean> {
  if (jobStatus === 'IN_PROGRESS' || jobStatus === 'COMPLETED') return true;
  const event = await prisma.deliveryEvent.findFirst({
    where: { jobId, state: { in: ['PICKED_UP', 'EN_ROUTE'] } },
    select: { id: true },
  });
  return !!event;
}

/** True when the driver holds an accepted job that has not been picked up yet. */
export async function driverHasUnpickedHeldJob(
  driverId: string,
  accessibleStoreIds: string[],
  orderId?: string,
): Promise<boolean> {
  const held = await prisma.deliveryJob.findFirst({
    where: {
      driverId,
      storeId: { in: accessibleStoreIds },
      status: { in: await assignedOrQueuedStatuses() },
      ...(orderId ? { jobOrders: { some: { orderId } } } : {}),
    },
    select: { id: true, status: true },
  });
  if (!held) return false;
  return !(await jobHasPickedUp(held.id, held.status));
}

/** Order is done from the delivery job's perspective — either core already flipped
 *  its status, or the driver already recorded a terminal delivery event. */
async function isOrderDoneForJob(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (order && TERMINAL_ORDER_STATUSES.has(order.status)) return true;

  const terminalEvent = await prisma.deliveryEvent.findFirst({
    where: { orderId, state: { in: ['DELIVERED', 'RETURNED_TO_STORE'] } },
    select: { id: true },
  });
  return !!terminalEvent;
}

/** When every order in a job is delivered/cancelled/returned, move the job to RETURNING
 *  so the rider must travel back to the branch before completing. Mirrors core's
 *  `maybeEnterReturningPhase`. Delivery-owned data only — never writes `orders`. */
export async function maybeEnterReturningPhase(jobId: string): Promise<boolean> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: { jobOrders: { select: { orderId: true } } },
  });

  if (!job || job.status !== 'IN_PROGRESS') return false;
  if (job.jobOrders.length === 0) return false;

  const doneFlags = await Promise.all(job.jobOrders.map((jo) => isOrderDoneForJob(jo.orderId)));
  if (!doneFlags.every(Boolean)) return false;

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: { status: 'RETURNING', returnStartedAt: new Date() },
  });

  return true;
}


/** After a job completes, promote the oldest QUEUED job for this driver to ASSIGNED. */
export async function promoteNextQueuedJob(driverId: string | null | undefined): Promise<void> {
  if (!driverId) return;
  if (!(await isQueuedStatusAvailable())) return;
  const next = await prisma.deliveryJob.findFirst({
    where: { driverId, status: 'QUEUED' },
    orderBy: { assignedAt: 'asc' },
  });
  if (!next) return;
  await prisma.deliveryJob.update({
    where: { id: next.id },
    data: { status: 'ASSIGNED' },
  });
}

/** Re-export shared GPS finalize for job completion handlers. */
export { finalizeDeliveryJob } from '@bingchun/delivery-domain';

export type DriverComplaintSummary = {
  id: string;
  category: string;
  description: string;
  status: string;
  createdAt: Date;
};

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

export type { RouteStop };
