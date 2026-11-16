import { prisma } from '@bingchun/db';
import { creditedDeliveredTotals, groupLatestFailedAttemptsByJob } from './gpsPath';
import { meritStatusBand } from './jobStateMachine';
import { jobRiderDistanceKm, roundDistanceKm, sumRiderDistanceKm } from './riderDistance';

/**
 * Rider-facing performance figures for the driver app's Stats tab.
 *
 * Distance totals use {@link jobRiderDistanceKm} and match admin Delivery Analytics
 * (`getDriverAnalytics` / `getRiderKpiDetail`): completed jobs, `completedAt` window,
 * actual GPS km when available.
 */

export type RiderStatsPeriod = 'today' | '7d' | '30d' | 'all';

export const RIDER_STATS_PERIODS: readonly RiderStatsPeriod[] = ['today', '7d', '30d', 'all'];

export interface RiderStatsTotals {
  completedRuns: number;
  deliveredStops: number;
  totalDistanceKm: number;
  earningsLkr: number;
  onlineMinutes: number;
  attendanceDays: number;
  averagePickupMinutes: number | null;
  averageDeliveryMinutes: number | null;
}

export interface RiderRatingItem {
  id: string;
  orderNumber: string | null;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export interface RiderRatingSummary {
  average: number | null;
  count: number;
  recent: RiderRatingItem[];
}

export interface RiderMeritItem {
  id: string;
  changedPoints: number;
  newPoints: number;
  reason: string;
  eventType: string;
  createdAt: string;
}

export interface RiderMeritSummary {
  points: number;
  status: string;
  recent: RiderMeritItem[];
}

export interface RiderStats {
  period: { key: RiderStatsPeriod; from: string | null; to: string | null };
  totals: RiderStatsTotals;
  rating: RiderRatingSummary;
  merit: RiderMeritSummary;
}

export function isRiderStatsPeriod(value: unknown): value is RiderStatsPeriod {
  return typeof value === 'string' && (RIDER_STATS_PERIODS as readonly string[]).includes(value);
}

/** `today` is the rider's local calendar day on the server clock; the rest are rolling windows. */
export function resolveRiderStatsRange(period: RiderStatsPeriod, now = new Date()): {
  from?: Date;
  to?: Date;
} {
  if (period === 'all') return {};

  const to = now;
  if (period === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  const days = period === '7d' ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

function durationMs(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return ms >= 0 ? ms : null;
}

function averageMinutes(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  const mean = valid.reduce((sum, v) => sum + v, 0) / valid.length;
  return Math.round(mean / 60000);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Online time counts only the part of each shift that falls inside the window; a shift
 * still open is clamped at `to` (or now). Attendance is the count of distinct local days
 * a shift touched.
 */
function computeShiftMetrics(
  shifts: Array<{ startedAt: Date; endedAt: Date | null }>,
  from?: Date,
  to?: Date,
): { onlineMinutes: number; attendanceDays: number } {
  const windowEnd = to ?? new Date();
  const days = new Set<string>();
  let totalMs = 0;

  for (const shift of shifts) {
    const start = from && shift.startedAt < from ? from : shift.startedAt;
    const rawEnd = shift.endedAt ?? windowEnd;
    const end = rawEnd > windowEnd ? windowEnd : rawEnd;
    if (end <= start) continue;

    totalMs += end.getTime() - start.getTime();
    days.add(start.toDateString());
  }

  return { onlineMinutes: Math.round(totalMs / 60000), attendanceDays: days.size };
}

export async function computeRiderStats(
  driverId: string,
  period: RiderStatsPeriod,
): Promise<RiderStats> {
  const { from, to } = resolveRiderStatsRange(period);
  const rangeFilter = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;

  const [jobs, shifts, ratings, driver, meritRows] = await Promise.all([
    prisma.deliveryJob.findMany({
      where: {
        driverId,
        status: 'COMPLETED',
        ...(rangeFilter ? { completedAt: rangeFilter } : {}),
      },
      select: {
        id: true,
        assignedAt: true,
        startedAt: true,
        completedAt: true,
        actualDistanceKm: true,
        totalDistanceKm: true,
        jobOrders: {
          select: {
            orderId: true,
            order: { select: { status: true, deliveryFee: true, cancelledAtStatus: true } },
          },
        },
      },
    }),
    prisma.driverShift.findMany({
      where: {
        driverId,
        // Any shift that overlaps the window, including one still open.
        ...(to ? { startedAt: { lte: to } } : {}),
        ...(from ? { OR: [{ endedAt: null }, { endedAt: { gte: from } }] } : {}),
      },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.riderRating.findMany({
      where: { driverId, ...(rangeFilter ? { createdAt: rangeFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        stars: true,
        comment: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.adminUser.findUnique({
      where: { id: driverId },
      select: { meritPoints: true },
    }),
    prisma.meritPointHistory.findMany({
      where: { driverId, ...(rangeFilter ? { createdAt: rangeFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        changedPoints: true,
        newPoints: true,
        reason: true,
        eventType: true,
        createdAt: true,
      },
    }),
  ]);

  const failedAttempts =
    jobs.length === 0
      ? []
      : await prisma.deliveryAttempt.findMany({
          where: {
            jobId: { in: jobs.map((job) => job.id) },
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
  const latestFailedByJob = groupLatestFailedAttemptsByJob(failedAttempts);

  let deliveredStops = 0;
  let earningsLkr = 0;
  for (const job of jobs) {
    // Same basis as `deliveredTotal` on the job-history endpoint, so the Stats tab
    // and the History tab always add up to the same number.
    const credited = creditedDeliveredTotals(
      job.jobOrders.map((jo) => ({
        orderId: jo.orderId,
        order: {
          status: jo.order.status,
          deliveryFee: jo.order.deliveryFee,
          cancelledAtStatus: jo.order.cancelledAtStatus ?? null,
        },
      })),
      latestFailedByJob.get(job.id) ?? new Map(),
    );
    deliveredStops += credited.deliveredCount;
    earningsLkr += credited.deliveredTotal;
  }

  const shiftMetrics = computeShiftMetrics(shifts, from, to);
  const meritPoints = driver?.meritPoints ?? 0;
  const ratingSum = ratings.reduce((sum, r) => sum + r.stars, 0);

  return {
    period: {
      key: period,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    totals: {
      completedRuns: jobs.length,
      deliveredStops,
      totalDistanceKm: roundDistanceKm(sumRiderDistanceKm(jobs)),
      earningsLkr,
      onlineMinutes: shiftMetrics.onlineMinutes,
      attendanceDays: shiftMetrics.attendanceDays,
      averagePickupMinutes: averageMinutes(
        jobs.map((j) => durationMs(j.assignedAt, j.startedAt)),
      ),
      averageDeliveryMinutes: averageMinutes(
        jobs.map((j) => durationMs(j.startedAt, j.completedAt)),
      ),
    },
    rating: {
      average: ratings.length > 0 ? round1(ratingSum / ratings.length) : null,
      count: ratings.length,
      recent: ratings.slice(0, 5).map((r) => ({
        id: r.id,
        orderNumber: r.order?.orderNumber ?? null,
        stars: r.stars,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    merit: {
      points: meritPoints,
      status: meritStatusBand(meritPoints),
      recent: meritRows.map((row) => ({
        id: row.id,
        changedPoints: row.changedPoints,
        newPoints: row.newPoints,
        reason: row.reason,
        eventType: String(row.eventType),
        createdAt: row.createdAt.toISOString(),
      })),
    },
  };
}
