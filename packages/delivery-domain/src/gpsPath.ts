import { prisma } from '@bingchun/db';
import { haversineKm } from './geo';

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

/** An order counts for this rider on this job if they delivered it, or the
 *  customer cancelled after the run had already started (OUT_FOR_DELIVERY). */
export function isCreditedDelivery(
  orderStatus: string,
  failedOnThisJob: boolean,
  cancelledAtStatus?: string | null,
): boolean {
  if (failedOnThisJob) return false;
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

/**
 * Rider earnings for a job: DELIVERED stops that this job did not already fail,
 * plus mid-ride customer cancels (cancelled while OUT_FOR_DELIVERY).
 * Leftover vehicle-failure links stay on the original job; when another rider
 * later delivers them, live order status is DELIVERED but they must not credit
 * the original rider.
 */
export function creditedDeliveredTotals(
  jobOrders: CreditedJobOrder[],
  failedOrderIds: Set<string> = new Set(),
): { deliveredCount: number; deliveredTotal: number } {
  let deliveredCount = 0;
  let deliveredTotal = 0;
  for (const jo of jobOrders) {
    if (!isCreditedDelivery(jo.order.status, failedOrderIds.has(jo.orderId), jo.order.cancelledAtStatus)) {
      continue;
    }
    deliveredCount += 1;
    deliveredTotal += jo.order.deliveryFee;
  }
  return { deliveredCount, deliveredTotal };
}

/** Payout fees for a completed job: delivered orders and mid-ride cancels. */
export function deliveredOrderDeliveryFees(
  jobOrders: { order: { status: string; deliveryFee: number; cancelledAtStatus?: string | null } }[],
): number {
  return jobOrders.reduce(
    (sum, jo) =>
      isCreditedDelivery(jo.order.status, false, jo.order.cancelledAtStatus)
        ? sum + jo.order.deliveryFee
        : sum,
    0,
  );
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

  const totalDeliveryFees = deliveredOrderDeliveryFees(job.jobOrders);
  const { actualDistanceKm, actualRoute } = await computeActualRouteForJob(jobId, job);

  await prisma.deliveryJob.update({
    where: { id: jobId },
    data: {
      actualDistanceKm,
      actualRoute: JSON.stringify(actualRoute.map((p) => [p.lat, p.lng])),
      totalDeliveryFees,
      ...(job.totalDistanceKm == null ? { totalDistanceKm: actualDistanceKm } : {}),
    },
  });
}
