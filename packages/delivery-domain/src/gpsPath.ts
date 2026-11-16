import { prisma } from '@bingchun/db';
import { haversineKm } from './geo';
import { lkrWholeToJobFeeDecimal } from './jobFees';

export type LatLngPoint = { lat: number; lng: number };

export type JobGpsLocation = LatLngPoint & { recordedAt: Date };

const GPS_PATH_SIMPLIFY_THRESHOLD = 500;
const GPS_PATH_SIMPLIFY_EPSILON_KM = 0.01;

/** Fetch GPS points recorded for a delivery job within a time window.
 *  Falls back to the driver's points in the same window (any jobId) when none are tagged. */
export async function fetchJobGpsLocations(
  jobId: string,
  from: Date,
  to: Date,
  driverId?: string | null,
): Promise<JobGpsLocation[]> {
  const byJob = await prisma.driverLocation.findMany({
    where: {
      jobId,
      recordedAt: { gte: from, lte: to },
    },
    orderBy: { recordedAt: 'asc' },
    select: { lat: true, lng: true, recordedAt: true },
  });
  if (byJob.length > 0 || !driverId) return byJob;

  return prisma.driverLocation.findMany({
    where: {
      driverId,
      recordedAt: { gte: from, lte: to },
    },
    orderBy: { recordedAt: 'asc' },
    select: { lat: true, lng: true, recordedAt: true },
  });
}

/** Latest GPS ping for a driver, ignoring job id and time window. */
export async function fetchLatestDriverLocation(
  driverId: string,
): Promise<JobGpsLocation | null> {
  const latest = await prisma.driverLocation.findFirst({
    where: { driverId },
    orderBy: { recordedAt: 'desc' },
    select: { lat: true, lng: true, recordedAt: true },
  });
  return latest;
}

/** Parse stored actualRoute JSON into lat/lng points. */
export function parseActualRouteJson(actualRoute: string | null | undefined): LatLngPoint[] {
  if (!actualRoute) return [];
  try {
    const parsed = JSON.parse(actualRoute) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
          return { lat: Number(pt[0]), lng: Number(pt[1]) };
        }
        if (pt && typeof pt === 'object' && 'lat' in pt && 'lng' in pt) {
          const o = pt as { lat: number; lng: number };
          return { lat: Number(o.lat), lng: Number(o.lng) };
        }
        return null;
      })
      .filter((p): p is LatLngPoint => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

/** Simplify a GPS trace for map payloads; full resolution below threshold. */
export function simplifyGpsPath(
  locations: LatLngPoint[],
  options?: { maxPoints?: number; epsilonKm?: number },
): LatLngPoint[] {
  if (locations.length <= 2) return locations;
  const maxPoints = options?.maxPoints ?? GPS_PATH_SIMPLIFY_THRESHOLD;
  const epsilonKm = options?.epsilonKm ?? GPS_PATH_SIMPLIFY_EPSILON_KM;
  if (locations.length <= maxPoints) return locations;
  return rdpSimplify(locations, epsilonKm);
}

function rdpSimplify(points: LatLngPoint[], epsilonKm: number): LatLngPoint[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceKm(points[i], start, end);
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }

  if (maxDist > epsilonKm) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilonKm);
    const right = rdpSimplify(points.slice(index), epsilonKm);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

function perpendicularDistanceKm(p: LatLngPoint, a: LatLngPoint, b: LatLngPoint): number {
  if (a.lat === b.lat && a.lng === b.lng) return haversineKm(p.lat, p.lng, a.lat, a.lng);
  const toXY = (pt: LatLngPoint) => {
    const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    return {
      x: pt.lng * 111.32 * Math.cos(latRad),
      y: pt.lat * 110.57,
    };
  };
  const P = toXY(p);
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);
  const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2));
  const projX = A.x + t * dx;
  const projY = A.y + t * dy;
  return Math.hypot(P.x - projX, P.y - projY);
}

/** Failure outcomes where the rider still earns the stop fee (customer-side issues). */
export const CUSTOMER_SIDE_FAILURE_OUTCOMES = new Set([
  'CUSTOMER_UNREACHABLE',
  'WRONG_ADDRESS',
  'REFUSED',
  'PAYMENT_FAILED',
]);

export function isCustomerSideFailureOutcome(outcome: string): boolean {
  return CUSTOMER_SIDE_FAILURE_OUTCOMES.has(outcome);
}

/**
 * Whether this stop's delivery fee credits the rider on this job.
 * Customer-side failures credit even if the order is later DELIVERED on another job.
 * Driver-side failures (OTHER, VEHICLE_FAILURE) never credit on this job.
 */
export function isCreditedDelivery(
  orderStatus: string,
  failureOutcome?: string | null,
  cancelledAtStatus?: string | null,
): boolean {
  if (failureOutcome) {
    return isCustomerSideFailureOutcome(failureOutcome);
  }
  if (orderStatus === 'DELIVERED') return true;
  return orderStatus === 'CANCELLED' && cancelledAtStatus === 'OUT_FOR_DELIVERY';
}

export type CreditedJobOrder = {
  orderId: string;
  order: { status: string; deliveryFee: number; cancelledAtStatus?: string | null };
};

/** Group failed-attempt rows so history/stats can look up leftover stops per job. */
export function groupFailedOrderIdsByJob(
  attempts: Array<{ jobId: string; orderId: string }>,
): Map<string, Set<string>> {
  const byJob = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const existing = byJob.get(attempt.jobId);
    if (existing) existing.add(attempt.orderId);
    else byJob.set(attempt.jobId, new Set([attempt.orderId]));
  }
  return byJob;
}

export type FailedAttemptSummary = { outcome: string; note: string | null };

export type HistoryAttemptRow = {
  jobId: string;
  orderId: string;
  outcome: string;
  note: string | null;
  attemptNo: number;
  createdAt: Date;
};

const DELIVERY_FAILURE_OUTCOME_LABELS: Record<string, string> = {
  CUSTOMER_UNREACHABLE: 'Customer not available',
  WRONG_ADDRESS: 'Wrong / incomplete address',
  REFUSED: 'Customer refused delivery',
  PAYMENT_FAILED: 'Payment issue',
  OTHER: 'Driver error',
  VEHICLE_FAILURE: 'Vehicle failure',
};

/** Human-readable failure line for rider history (outcome + optional note). */
export function formatDeliveryFailureReason(outcome?: string | null, note?: string | null): string {
  const outcomeLabel = outcome
    ? (DELIVERY_FAILURE_OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' '))
    : null;
  const noteLabel = note?.trim()
    ? (DELIVERY_FAILURE_OUTCOME_LABELS[note.trim()] ?? note.trim())
    : null;
  if (!outcomeLabel && !noteLabel) return 'Not provided';
  if (outcomeLabel && noteLabel && outcomeLabel.toLowerCase() === noteLabel.toLowerCase()) {
    return outcomeLabel;
  }
  return [outcomeLabel, noteLabel].filter(Boolean).join(' — ');
}

/** Latest non-delivered attempt per order on each job (same rule as fetchLatestFailedAttemptsForJob). */
export function groupLatestFailedAttemptsByJob(
  attempts: HistoryAttemptRow[],
): Map<string, Map<string, FailedAttemptSummary>> {
  const sorted = [...attempts].sort((a, b) => {
    if (b.attemptNo !== a.attemptNo) return b.attemptNo - a.attemptNo;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const byJob = new Map<string, Map<string, FailedAttemptSummary>>();
  for (const row of sorted) {
    let byOrder = byJob.get(row.jobId);
    if (!byOrder) {
      byOrder = new Map();
      byJob.set(row.jobId, byOrder);
    }
    if (!byOrder.has(row.orderId)) {
      byOrder.set(row.orderId, { outcome: row.outcome, note: row.note });
    }
  }
  return byJob;
}

export type JobHistoryOrderLink = {
  orderId: string;
  order: { status: string; cancelledAtStatus?: string | null };
};

export type JobHistoryOrderRow = {
  orderId: string;
  status: string;
  cancelledAtStatus: string | null;
  deliveryFailed: boolean;
  failureOutcome: string | null;
  failureNote: string | null;
  failureReason: string | null;
};

export function buildJobHistoryOrderRows(
  jobOrders: JobHistoryOrderLink[],
  failedByOrder: Map<string, FailedAttemptSummary> | undefined,
): { orders: JobHistoryOrderRow[]; failedCount: number } {
  let failedCount = 0;
  const orders: JobHistoryOrderRow[] = jobOrders.map((jo) => {
    const failed = failedByOrder?.get(jo.orderId);
    const deliveryFailed = !!failed;
    if (deliveryFailed) failedCount += 1;
    return {
      orderId: jo.orderId,
      status: jo.order.status,
      cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
      deliveryFailed,
      failureOutcome: deliveryFailed ? (failed?.outcome ?? null) : null,
      failureNote: deliveryFailed ? (failed?.note ?? null) : null,
      failureReason: deliveryFailed ? formatDeliveryFailureReason(failed?.outcome, failed?.note) : null,
    };
  });
  return { orders, failedCount };
}

/**
 * Rider earnings for a job: delivered stops, customer-side failed stops, and
 * mid-ride customer cancels (cancelled while OUT_FOR_DELIVERY).
 * Leftover vehicle- or driver-error failures must not credit even if another
 * rider later delivers the order.
 */
export function creditedDeliveredTotals(
  jobOrders: CreditedJobOrder[],
  failedByOrder: Map<string, FailedAttemptSummary> = new Map(),
): { deliveredCount: number; deliveredTotal: number } {
  return creditedDeliveryFeesForJobOrders(jobOrders, failedByOrder);
}

export function creditedDeliveryFeesForJobOrders(
  jobOrders: CreditedJobOrder[],
  failedByOrder: Map<string, FailedAttemptSummary>,
): { deliveredCount: number; deliveredTotal: number } {
  let deliveredCount = 0;
  let deliveredTotal = 0;
  for (const jo of jobOrders) {
    const failureOutcome = failedByOrder.get(jo.orderId)?.outcome ?? null;
    if (!isCreditedDelivery(jo.order.status, failureOutcome, jo.order.cancelledAtStatus)) {
      continue;
    }
    deliveredCount += 1;
    deliveredTotal += jo.order.deliveryFee;
  }
  return { deliveredCount, deliveredTotal };
}

/** Payout fees for a completed job (same credit rules as creditedDeliveredTotals). */
export function deliveredOrderDeliveryFees(
  jobOrders: CreditedJobOrder[],
  failedByOrder: Map<string, FailedAttemptSummary> = new Map(),
): number {
  return creditedDeliveryFeesForJobOrders(jobOrders, failedByOrder).deliveredTotal;
}

/** Delete raw GPS rows older than the retention window. */
export async function deleteExpiredDriverLocations(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.driverLocation.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });
  return result.count;
}

type JobForActualRoute = {
  id: string;
  driverId: string | null;
  startedAt: Date | null;
  assignedAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  actualDistanceKm: number | null;
  totalDistanceKm: number | null;
  store: { lat: number; lng: number };
  jobOrders: Array<{
    order: {
      deliveryLat: number | null;
      deliveryLng: number | null;
      address: { lat: number | null; lng: number | null } | null;
    };
  }>;
};

async function loadJobForActualRoute(jobId: string): Promise<JobForActualRoute | null> {
  return prisma.deliveryJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      driverId: true,
      startedAt: true,
      assignedAt: true,
      createdAt: true,
      completedAt: true,
      actualDistanceKm: true,
      totalDistanceKm: true,
      store: { select: { lat: true, lng: true } },
      jobOrders: {
        orderBy: { sequence: 'asc' },
        select: {
          order: {
            select: {
              deliveryLat: true,
              deliveryLng: true,
              address: { select: { lat: true, lng: true } },
            },
          },
        },
      },
    },
  });
}

async function computeActualRouteForJob(
  jobId: string,
  job: JobForActualRoute,
): Promise<{ actualDistanceKm: number; actualRoute: LatLngPoint[] }> {
  const startedAt = job.startedAt ?? job.assignedAt ?? job.createdAt;
  const completedAt = job.completedAt ?? new Date();

  const locations = await fetchJobGpsLocations(jobId, startedAt, completedAt, job.driverId);

  let actualDistanceKm = job.actualDistanceKm ?? 0;
  let actualRoute: LatLngPoint[] = [];

  if (locations.length >= 2) {
    if (!actualDistanceKm || actualDistanceKm <= 0) {
      let sum = 0;
      for (let i = 1; i < locations.length; i++) {
        sum += haversineKm(
          locations[i - 1].lat,
          locations[i - 1].lng,
          locations[i].lat,
          locations[i].lng,
        );
      }
      actualDistanceKm = sum;
    }
    actualRoute = simplifyGpsPath(locations);
  } else {
    let prevLat = job.store.lat;
    let prevLng = job.store.lng;
    let sum = 0;
    const path: LatLngPoint[] = [{ lat: prevLat, lng: prevLng }];
    for (const jo of job.jobOrders) {
      const lat = jo.order.deliveryLat ?? jo.order.address?.lat;
      const lng = jo.order.deliveryLng ?? jo.order.address?.lng;
      if (lat == null || lng == null) continue;
      sum += haversineKm(prevLat, prevLng, lat, lng);
      prevLat = lat;
      prevLng = lng;
      path.push({ lat, lng });
    }
    sum += haversineKm(prevLat, prevLng, job.store.lat, job.store.lng);
    path.push({ lat: job.store.lat, lng: job.store.lng });
    if (!actualDistanceKm || actualDistanceKm <= 0) actualDistanceKm = sum;
    actualRoute = path;
  }

  return {
    actualDistanceKm: Math.round(actualDistanceKm * 10) / 10,
    actualRoute,
  };
}

/** Persist GPS-based actual route/distance without changing delivery fees. */
export async function persistJobActualRouteFromGps(jobId: string): Promise<void> {
  const job = await loadJobForActualRoute(jobId);
  if (!job) return;

  const { actualDistanceKm, actualRoute } = await computeActualRouteForJob(jobId, job);

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: {
      actualDistanceKm,
      actualRoute: JSON.stringify(actualRoute.map((p) => [p.lat, p.lng])),
    },
  });
}

/**
 * Finalize actual route/distance from GPS trace and sum delivery fees.
 * Called when the rider completes the ride at the branch.
 */
export async function finalizeDeliveryJob(jobId: string): Promise<void> {
  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    include: {
      store: { select: { lat: true, lng: true } },
      jobOrders: {
        orderBy: { sequence: 'asc' },
        include: {
          order: {
            select: {
              status: true,
              deliveryFee: true,
              cancelledAtStatus: true,
              deliveryLat: true,
              deliveryLng: true,
              address: { select: { lat: true, lng: true } },
            },
          },
        },
      },
    },
  });
  if (!job) return;

  const orderIds = job.jobOrders.map((jo) => jo.orderId);
  const failedAttempts =
    orderIds.length === 0
      ? []
      : await prisma.deliveryAttempt.findMany({
          where: {
            jobId: job.id,
            orderId: { in: orderIds },
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
        });
  const failedByOrder = groupLatestFailedAttemptsByJob(failedAttempts).get(job.id) ?? new Map();
  const creditedLinks: CreditedJobOrder[] = job.jobOrders.map((jo) => ({
    orderId: jo.orderId,
    order: {
      status: jo.order.status,
      deliveryFee: jo.order.deliveryFee,
      cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
    },
  }));
  const feesLkr = deliveredOrderDeliveryFees(creditedLinks, failedByOrder);
  const { actualDistanceKm, actualRoute } = await computeActualRouteForJob(jobId, job);

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: {
      actualDistanceKm,
      actualRoute: JSON.stringify(actualRoute.map((p) => [p.lat, p.lng])),
      totalDeliveryFees: lkrWholeToJobFeeDecimal(feesLkr),
      ...(job.totalDistanceKm == null ? { totalDistanceKm: actualDistanceKm } : {}),
    },
  });
}
