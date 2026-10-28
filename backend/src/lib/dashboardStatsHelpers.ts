import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  centsToLkr,
  getOutgoingTotalsByChartBuckets,
  type WalletAnalysisFlowPoint,
} from './walletAnalysis';
import { aggregateSharedPromoUsageRows } from './sharedPromoContribution';
import { isPrismaMissingTableError } from '../utils/prismaErrors';
import { dateStringInColombo } from './datetime';
import {
  chartBucketKey,
  endOfDayColombo,
  startOfDayColombo,
  type ChartRange,
} from './dashboardStatsDateRange';
import { promiseAllLimited } from '../utils/promiseAllLimited';

export { chartBucketKey } from './dashboardStatsDateRange';

/** Align completedAt filters with dashboard period boundaries (Colombo calendar days). */
export function completedAtRangeForDashboard(selectedRange: { gte: Date; lte: Date }) {
  const fromKey = dateStringInColombo(selectedRange.gte);
  const toKey = dateStringInColombo(selectedRange.lte);
  const gte = startOfDayColombo(fromKey);
  const endCap = endOfDayColombo(toKey);
  const lte = new Date(Math.min(selectedRange.lte.getTime(), endCap.getTime()));
  return { gte, lte };
}

type MonthlyCashflowBucket = { inflow: number; outflow: number };

export function sumOutgoingFlowPoints(flows: WalletAnalysisFlowPoint[]): number {
  return flows.reduce((sum, row) => sum + row.amount, 0);
}

/** Outgoing wallet totals per chart bucket (same categories as Outflows by method). */
export async function loadSuperAdminMonthlyOutgoingTotals(
  monthlyChart: ChartRange,
): Promise<Map<string, number>> {
  return getOutgoingTotalsByChartBuckets(monthlyChart);
}

export async function loadSuperAdminMonthlyCashflow(
  monthlyChart: ChartRange,
): Promise<Map<string, MonthlyCashflowBucket>> {
  const buckets = new Map<string, MonthlyCashflowBucket>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, { inflow: 0, outflow: 0 });
  }

  const bucketSql =
    monthlyChart.granularity === 'day'
      ? Prisma.sql`to_char(wt."createdAt", 'YYYY-MM-DD')`
      : Prisma.sql`to_char(wt."createdAt", 'YYYY-MM')`;

  const [walletBucketRows, outgoingByKey] = await Promise.all([
    prisma.$queryRaw<Array<{ bucket: string; inflow_cents: bigint }>>`
      WITH base AS (
        SELECT
          ${bucketSql} AS bucket,
          wt.type,
          wt.amount,
          wt."orderId",
          wt.reference,
          wt.description,
          wt."createdAt"
        FROM "wallet_transactions" wt
        WHERE wt."createdAt" >= ${monthlyChart.gte}
          AND wt."createdAt" <= ${monthlyChart.lte}
      ),
      order_credits AS (
        SELECT DISTINCT ON (b.type, b."orderId")
          b.bucket,
          ABS(b.amount)::bigint AS cents
        FROM base b
        WHERE b.type IN ('ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT')
          AND b."orderId" IS NOT NULL
          AND b.amount <> 0
        ORDER BY b.type, b."orderId", b."createdAt" ASC
      ),
      other_inflow AS (
        SELECT
          b.bucket,
          ABS(b.amount)::bigint AS cents
        FROM base b
        WHERE b.type = 'ADJUSTMENT'
          AND b.amount > 0
      ),
      inflow_union AS (
        SELECT bucket, cents FROM order_credits
        UNION ALL
        SELECT bucket, cents FROM other_inflow
      )
      SELECT
        bucket,
        COALESCE(SUM(cents), 0)::bigint AS inflow_cents
      FROM inflow_union
      GROUP BY bucket
    `,
    loadSuperAdminMonthlyOutgoingTotals(monthlyChart),
  ]);

  for (const row of walletBucketRows) {
    const bucket = buckets.get(row.bucket);
    if (!bucket) continue;
    bucket.inflow += centsToLkr(Number(row.inflow_cents));
  }

  for (const [key, outflow] of outgoingByKey) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.outflow = outflow;
  }

  return buckets;
}

export async function loadBranchMonthlyRefundOutflow(
  storeId: string,
  monthlyChart: ChartRange,
): Promise<Map<string, number>> {
  const buckets = new Map<string, number>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, 0);
  }

  const range = { gte: monthlyChart.gte, lte: monthlyChart.lte };
  const refunds = await prisma.refund.findMany({
    where: {
      status: 'COMPLETE',
      order: { is: { storeId } },
      OR: [{ processedAt: range }, { processedAt: null, createdAt: range }],
    },
    select: {
      refundAmount: true,
      processedAt: true,
      createdAt: true,
    },
  });

  for (const refund of refunds) {
    const when = refund.processedAt ?? refund.createdAt;
    const key = chartBucketKey(new Date(when), monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + (refund.refundAmount ?? 0));
  }

  return buckets;
}

export async function buildCustomerGrowth(
  scope: { storeId?: string },
  paidPeriodWhere: Record<string, unknown>,
) {
  const paidScope = { ...scope, paymentStatus: 'PAID' as const };

  const [periodUserGroups, periodGuestGroups] = await Promise.all([
    prisma.order.groupBy({
      by: ['userId'],
      where: { ...paidPeriodWhere, userId: { not: null } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['guestPhone'],
      where: { ...paidPeriodWhere, userId: null, guestPhone: { not: null } },
      _count: { id: true },
    }),
  ]);

  const userIds = periodUserGroups
    .map((row) => row.userId)
    .filter((id): id is string => !!id);
  const guestPhones = periodGuestGroups
    .map((row) => row.guestPhone)
    .filter((phone): phone is string => !!phone);

  const [userOrderCounts, guestOrderCounts] = await Promise.all([
    userIds.length
      ? prisma.order.groupBy({
          by: ['userId'],
          where: { ...paidScope, userId: { in: userIds } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    guestPhones.length
      ? prisma.order.groupBy({
          by: ['guestPhone'],
          where: { ...paidScope, userId: null, guestPhone: { in: guestPhones } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  let newRegistered = 0;
  let newGuest = 0;
  let returningLoyal = 0;

  for (const row of userOrderCounts) {
    if (row._count.id === 1) newRegistered += 1;
    else returningLoyal += 1;
  }
  for (const row of guestOrderCounts) {
    if (row._count.id === 1) newGuest += 1;
    else returningLoyal += 1;
  }

  const segments = [
    { key: 'newRegistered', label: 'New Registered', value: newRegistered, color: '#307ef2' },
    { key: 'newGuest', label: 'New Guest Buyers', value: newGuest, color: '#34d399' },
    { key: 'returningLoyal', label: 'Returning Customers', value: returningLoyal, color: '#a78bfa' },
  ];

  return {
    segments,
    total: segments.reduce((sum, s) => sum + s.value, 0),
  };
}

export async function buildRiderStaffStatus(scope: { storeId?: string }) {
  const staffWhere = {
    isActive: true,
    role: { name: { in: ['DELIVERY_DRIVER'] } },
    ...(scope.storeId ? { storeId: scope.storeId } : {}),
  };

  const onDutyStaff = await prisma.adminUser.findMany({
    where: staffWhere,
    select: { id: true, role: { select: { name: true } } },
  });

  const driverIds = onDutyStaff
    .filter((s) => s.role.name === 'DELIVERY_DRIVER')
    .map((s) => s.id);

  let busyDrivers: Array<{ driverId: string | null }> = [];
  if (driverIds.length) {
    try {
      busyDrivers = await prisma.deliveryJob.findMany({
        where: {
          driverId: { in: driverIds },
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          ...(scope.storeId ? { storeId: scope.storeId } : {}),
        },
        select: { driverId: true },
        distinct: ['driverId'],
      });
    } catch (err) {
      if (!isPrismaMissingTableError(err)) throw err;
      const total = onDutyStaff.length;
      return { total, active: 0, idle: total };
    }
  }

  const active = busyDrivers.filter((j) => j.driverId).length;
  const total = onDutyStaff.length;
  const idle = Math.max(0, total - active);

  return { total, active, idle };
}

type TopDeliveryRider = {
  rank: number;
  riderId: string;
  riderName: string;
  profilePhotoUrl?: string | null;
  completedJobs: number;
  distinctOrders: number;
  totalDistanceKm: number;
  onlineTimeMinutes: number;
};

export async function fetchTopDeliveryRidersForDashboard(
  scope: { storeId?: string },
  selectedRange: { gte: Date; lte: Date },
) {
  const completedRange = completedAtRangeForDashboard(selectedRange);
  try {
    const storeFilter = scope.storeId
      ? Prisma.sql`AND dj."storeId" = ${scope.storeId}`
      : Prisma.empty;

    const topRows = await prisma.$queryRaw<
      Array<{
        driver_id: string;
        completed_jobs: bigint | number;
        distinct_orders: bigint | number;
        total_distance_km: number | null;
      }>
    >`
      SELECT
        dj."driverId" AS driver_id,
        COUNT(*)::bigint AS completed_jobs,
        COUNT(DISTINCT djo."orderId")::bigint AS distinct_orders,
        COALESCE(SUM(dj."totalDistanceKm"), 0)::double precision AS total_distance_km
      FROM delivery.delivery_jobs dj
      LEFT JOIN delivery.delivery_job_orders djo ON djo."jobId" = dj.id
      WHERE dj.status = 'COMPLETED'
        AND dj."driverId" IS NOT NULL
        AND dj."completedAt" >= ${completedRange.gte}
        AND dj."completedAt" <= ${completedRange.lte}
        ${storeFilter}
      GROUP BY dj."driverId"
      ORDER BY completed_jobs DESC, distinct_orders DESC, total_distance_km DESC
      LIMIT 5
    `;

    if (topRows.length === 0) return [];

    const riderIds = topRows.map((row) => row.driver_id);
    const drivers = await prisma.adminUser.findMany({
      where: { id: { in: riderIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));

    let riderShifts: Array<{ driverId: string; startedAt: Date; endedAt: Date | null }> = [];
    try {
      riderShifts = await prisma.driverShift.findMany({
        where: shiftOverlapWhere(riderIds, selectedRange),
        select: { driverId: true, startedAt: true, endedAt: true },
      });
    } catch (err) {
      if (!isPrismaMissingTableError(err)) throw err;
    }

    const onlineMinutes = onlineMinutesFromShifts(riderShifts, selectedRange);
    return topRows.map((row, index) => {
      const driver = driverById.get(row.driver_id);
      return {
        rank: index + 1,
        riderId: row.driver_id,
        riderName: driver?.name ?? 'Unknown',
        profilePhotoUrl: driver?.profilePhotoUrl ?? null,
        completedJobs: Number(row.completed_jobs),
        distinctOrders: Number(row.distinct_orders),
        totalDistanceKm: Math.round(Number(row.total_distance_km ?? 0) * 10) / 10,
        onlineTimeMinutes: Math.round((onlineMinutes.get(row.driver_id) ?? 0) * 10) / 10,
      };
    });
  } catch (err) {
    if (isPrismaMissingTableError(err)) return [];
    throw err;
  }
}

export function shiftOverlapWhere(driverIds: string[], range: { gte: Date; lte: Date }) {
  return {
    driverId: { in: driverIds },
    startedAt: { lt: range.lte },
    OR: [{ endedAt: { gt: range.gte } }, { endedAt: null }],
  };
}

export function onlineMinutesFromShifts(
  shifts: Array<{ driverId: string; startedAt: Date; endedAt: Date | null }>,
  range: { gte: Date; lte: Date },
) {
  const now = new Date();
  const byDriver = new Map<string, number>();
  for (const shift of shifts) {
    const start = shift.startedAt > range.gte ? shift.startedAt : range.gte;
    const shiftEnd = shift.endedAt ?? now;
    const end = shiftEnd < range.lte ? shiftEnd : range.lte;
    if (end <= start) continue;
    const minutes = (end.getTime() - start.getTime()) / 60000;
    byDriver.set(shift.driverId, (byDriver.get(shift.driverId) ?? 0) + minutes);
  }
  return byDriver;
}

export function aggregateTopDeliveryRiders(
  jobs: Array<{
    driverId: string | null;
    totalDistanceKm: number | null;
    jobOrders: Array<{ orderId: string }>;
    driver: { id: string; name: string; profilePhotoUrl?: string | null } | null;
  }>,
  onlineMinutes: Map<string, number>,
): TopDeliveryRider[] {
  const byDriver = new Map<
    string,
    {
      riderName: string;
      profilePhotoUrl: string | null;
      completedJobs: number;
      orderIds: Set<string>;
      totalDistanceKm: number;
    }
  >();

  for (const job of jobs) {
    if (!job.driverId) continue;
    const existing = byDriver.get(job.driverId) ?? {
      riderName: job.driver?.name ?? 'Unknown',
      profilePhotoUrl: job.driver?.profilePhotoUrl ?? null,
      completedJobs: 0,
      orderIds: new Set<string>(),
      totalDistanceKm: 0,
    };
    existing.completedJobs += 1;
    existing.totalDistanceKm += job.totalDistanceKm ?? 0;
    for (const link of job.jobOrders) {
      existing.orderIds.add(link.orderId);
    }
    byDriver.set(job.driverId, existing);
  }

  return [...byDriver.entries()]
    .map(([riderId, data]) => ({
      riderId,
      riderName: data.riderName,
      profilePhotoUrl: data.profilePhotoUrl,
      completedJobs: data.completedJobs,
      distinctOrders: data.orderIds.size,
      totalDistanceKm: Math.round(data.totalDistanceKm * 10) / 10,
      onlineTimeMinutes: Math.round((onlineMinutes.get(riderId) ?? 0) * 10) / 10,
    }))
    .sort(
      (a, b) =>
        b.completedJobs - a.completedJobs ||
        b.distinctOrders - a.distinctOrders ||
        b.totalDistanceKm - a.totalDistanceKm,
    )
    .slice(0, 5)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function discountPartyPayload(branch: number, jason: number, platform: number) {
  const total = branch + jason + platform;
  const pct = (part: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
  return {
    branch,
    jason,
    platform,
    total,
    branchPercent: pct(branch),
    jasonPercent: pct(jason),
    platformPercent: pct(platform),
  };
}

export async function buildDiscountsByParty(paidPeriodWhere: Record<string, unknown>) {
  const usages = await prisma.promotionUsage.findMany({
    where: { order: paidPeriodWhere },
    select: {
      ownership: true,
      totalDiscountAmount: true,
      branchShareAmount: true,
      platformShareAmount: true,
      contributionSource: true,
    },
  });

  let branch = 0;
  let platform = 0;
  const sharedRows: Array<{
    totalDiscountAmount: number;
    branchShareAmount: number;
    platformShareAmount: number;
    contributionSource: string | null;
  }> = [];

  for (const row of usages) {
    const ownership = (row.ownership ?? '').toUpperCase();
    if (ownership === 'BRANCH') {
      branch += row.totalDiscountAmount;
    } else if (ownership === 'PLATFORM') {
      platform += row.totalDiscountAmount;
    } else if (ownership === 'SHARED') {
      sharedRows.push(row);
    }
  }

  if (sharedRows.length > 0) {
    const shared = aggregateSharedPromoUsageRows(sharedRows);
    branch += centsToLkr(shared.branch);
    platform += centsToLkr(shared.platform);
    const jason = centsToLkr(shared.jason);
    return discountPartyPayload(branch, jason, platform);
  }

  return discountPartyPayload(branch, 0, platform);
}
