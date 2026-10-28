import { Prisma, ProductSize } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  accumulateSettlementBreakdown,
  buildPeriodBaseLookup,
  buildSlabInfo,
  normalizeStoredSettlementBreakdown,
  orderCommissionChannel,
  storePeriodKey,
  sumBreakdownCommission,
  sumCommissionableBase,
  sumBreakdownConvenienceFee,
  sumBreakdownProviderFee,
} from '../lib/commission';
import { aggregateTopRefundBranches } from '../lib/refundAnalytics';
import { getOutgoingFlowsForRange, sumJasonInvestedLkrForRange } from '../lib/walletAnalysis';
import { prisma } from '../lib/prisma';
import { decimalFieldToCentsNumber } from '../lib/moneyDecimal';
import { walletBalanceCents } from '../lib/walletApiMoney';
import { normalizeProductImageUrl, productImageUrl } from '../lib/productImages';
import {
  enrichOrdersWithAddonPayments,
  fetchOrderAddonMap,
  platformItemSalesLkr,
  summarizeRevenueChannelsLkr,
} from '../lib/walletRevenue';
import { computeBranchPayablesSummary } from '../lib/walletService';
import { requireBranchStoreId, resolveBranchStoreId, isBranchScopedRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { success } from '../utils/apiResponse';
import { dateStringInColombo, formatDateTime } from '../lib/datetime';
import { resolveCustomerDisplayName } from '../lib/customerName';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import { analyticsCacheKey, withAnalyticsCache } from '../lib/analyticsResponseCache';
import {
  buildDashboardStatsForTier,
  createDashboardStatsContext,
  type DashboardStatsTier,
} from '../lib/dashboardStatsBuild';
import { buildCustomerGrowth, chartBucketKey } from '../lib/dashboardStatsHelpers';
import {
  aggregateCategorySales,
  aggregateHourlySales,
  aggregatePaidRevenueByBucket,
  aggregatePeriodBaseLookup,
  aggregateSalesOverviewByBucket,
  summarizePaymentChannelBreakdownForScope,
  summarizeRevenueChannelsForScope,
  type PaidSalesScope,
} from '../lib/dashboardOrderAggregates';
import { resolveReportDayRange } from '../lib/reportQueryRange';
import {
  assertMaxDateSpan,
  chartBucketLabel,
  dayChartLabel,
  monthChartLabel,
  dayKey,
  endOfDay,
  getColomboClock,
  monthKey,
  paidSalesWhere,
  resolveChartRange,
  resolveSelectedRange,
  startOfDay,
  startOfDayColombo,
  endOfDayColombo,
  type ChartRange,
} from '../lib/dashboardStatsDateRange';

const periodSchema = z.enum(['today', 'month', 'year', 'custom']).optional().default('month');

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const dashboardTierSchema = z
  .enum(['all', 'summary', 'charts', 'charts-wallet', 'details'])
  .optional();

/** Period/from/to only — `tier` means different things per route (dashboard vs branch analytics). */
const dashboardPeriodQuerySchema = z
  .object({
    period: periodSchema,
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period === 'custom' && (!value.from || !value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to are required when period is custom',
        path: ['from'],
      });
    }
  });

function colomboDayRange(from?: string, to?: string) {
  const gte = from ? startOfDayColombo(from) : undefined;
  const lte = to ? endOfDayColombo(to) : undefined;
  if (gte && lte) assertMaxDateSpan(gte, lte);
  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(-4);
  return `${prefix} XXX ${suffix}`;
}

function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function buildHourlySales(orders: Array<{ createdAt: Date; total: number }>) {
  const peakHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    orders: 0,
    revenue: 0,
  }));

  const heatmapCells = Array.from({ length: 7 * 24 }, (_, index) => ({
    day: Math.floor(index / 24),
    hour: index % 24,
    orders: 0,
    revenue: 0,
  }));

  for (const order of orders) {
    const { hour, day } = getColomboClock(new Date(order.createdAt));

    peakHours[hour].orders += 1;
    peakHours[hour].revenue += order.total;

    const cell = heatmapCells[day * 24 + hour];
    cell.orders += 1;
    cell.revenue += order.total;
  }

  return { peakHours, hourlyHeatmap: heatmapCells };
}

async function storeScope(req: Request) {
  const storeId = await resolveBranchStoreId(req);
  return storeId ? { storeId } : {};
}

function parseDateOnly(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function buildBranchMonthlyRefunds(
  storeId: string,
  monthlyChart: ChartRange,
): Promise<Array<{ month: string; count: number; amountLkr: number }>> {
  const buckets = new Map<string, { count: number; amountLkr: number }>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, { count: 0, amountLkr: 0 });
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
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.amountLkr += refund.refundAmount ?? 0;
  }

  return monthlyChart.keys.map((key) => {
    const bucket = buckets.get(key) ?? { count: 0, amountLkr: 0 };
    return {
      month: chartBucketLabel(key, monthlyChart.granularity),
      count: bucket.count,
      amountLkr: bucket.amountLkr,
    };
  });
}

async function buildBranchMonthlyDiscounts(
  paidPeriodWhere: Record<string, unknown>,
  monthlyChart: ChartRange,
): Promise<Array<{ month: string; totalDiscount: number }>> {
  const buckets = new Map<string, number>();
  for (const key of monthlyChart.keys) {
    buckets.set(key, 0);
  }

  const usages = await prisma.promotionUsage.findMany({
    where: {
      order: {
        ...paidPeriodWhere,
        createdAt: { gte: monthlyChart.gte, lte: monthlyChart.lte },
      },
    },
    select: { totalDiscountAmount: true, createdAt: true },
  });

  for (const usage of usages) {
    const key = chartBucketKey(new Date(usage.createdAt), monthlyChart.granularity);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + (usage.totalDiscountAmount ?? 0));
  }

  return monthlyChart.keys.map((key) => ({
    month: chartBucketLabel(key, monthlyChart.granularity),
    totalDiscount: buckets.get(key) ?? 0,
  }));
}

export async function getDashboardStats(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const tier = dashboardTierSchema.parse(req.query.tier);
    const ctx = await createDashboardStatsContext(req, period, from, to);
    const isBranchAdmin = ctx.isBranchAdmin;
    const effectiveTier: DashboardStatsTier =
      isBranchAdmin || !tier || tier === 'all' ? 'all' : tier;
    const cacheKey = analyticsCacheKey([
      'dashboard-stats',
      req.user?.sub,
      req.user?.role,
      ctx.scope.storeId,
      period,
      from,
      to,
      effectiveTier,
    ]);
    const started = process.env.DASHBOARD_STATS_TIMING === '1' ? Date.now() : 0;
    const payload = await withAnalyticsCache(cacheKey, async () =>
      buildDashboardStatsForTier(ctx, effectiveTier),
    );
    if (started) {
      const { logger } = await import('../utils/logger');
      logger.info(
        `dashboard-stats tier=${effectiveTier} period=${period} ms=${Date.now() - started}`,
      );
    }
    return success(res, payload);
  } catch (err) {
    next(err);
  }
}

type BranchOrderForAnalytics = {
  createdAt: Date;
  total: number;
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryFee: number;
  convenientFee: number;
  orderMode: string;
  paymentMethod: string;
  storeId: string;
};

type OrderSummaryBucket = {
  label: string;
  delivery: number;
  pickupCash: number;
  pickupOnline: number;
  pickupCard: number;
  orderCount: number;
  grossSales: number;
};

const EMPTY_CHANNEL_TOTALS = {
  pickupCashTotal: 0,
  pickupCashCount: 0,
  pickupCardTotal: 0,
  pickupCardCount: 0,
  pickupOnlineTotal: 0,
  pickupOnlineCount: 0,
  deliveryOnlineTotal: 0,
  deliveryOnlineCount: 0,
};

function emptyOrderSummaryBucket(label: string): OrderSummaryBucket {
  return {
    label,
    delivery: 0,
    pickupCash: 0,
    pickupOnline: 0,
    pickupCard: 0,
    orderCount: 0,
    grossSales: 0,
  };
}

function addOrderToSummaryBucket(
  bucket: OrderSummaryBucket,
  orderMode: string,
  paymentMethod: string,
  total: number,
) {
  bucket.orderCount += 1;
  bucket.grossSales += total;
  const channel = orderCommissionChannel(orderMode, paymentMethod);
  if (channel === 'deliveryOnline') bucket.delivery += total;
  else if (channel === 'pickupCash') bucket.pickupCash += total;
  else if (channel === 'pickupOnline') bucket.pickupOnline += total;
  else if (channel === 'pickupCard') bucket.pickupCard += total;
}

function buildWeeklyBuckets(range: { gte: Date; lte: Date }) {
  const buckets: Array<{ gte: Date; lte: Date; label: string }> = [];
  const cursor = startOfDay(range.gte);
  const end = endOfDay(range.lte);

  while (cursor <= end) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + 6);
    const cappedEnd = bucketEnd > end ? end : bucketEnd;
    const label = `${String(bucketStart.getDate()).padStart(2, '0')}-${String(cappedEnd.getDate()).padStart(2, '0')}`;
    buckets.push({ gte: bucketStart, lte: endOfDay(cappedEnd), label });
    cursor.setDate(cursor.getDate() + 7);
  }

  return buckets;
}

function buildOrderSummaryChart(
  orders: Array<{ createdAt: Date; total: number; orderMode: string; paymentMethod: string }>,
  period: 'today' | 'month' | 'year' | 'custom',
  range: { gte: Date; lte: Date },
): OrderSummaryBucket[] {
  if (period === 'today') {
    const buckets = Array.from({ length: 24 }, (_, hour) =>
      emptyOrderSummaryBucket(formatHourLabel(hour)),
    );
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      addOrderToSummaryBucket(buckets[hour], order.orderMode, order.paymentMethod, order.total);
    }
    return buckets;
  }

  if (period === 'year') {
    const keys: string[] = [];
    const cursor = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const endMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    while (cursor <= endMonth) {
      keys.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderSummaryBucket(monthChartLabel(key))]));
    for (const order of orders) {
      const key = monthKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToSummaryBucket(bucket, order.orderMode, order.paymentMethod, order.total);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  const daySpan =
    Math.ceil((endOfDay(range.lte).getTime() - startOfDay(range.gte).getTime()) / 86_400_000) + 1;

  if (period === 'custom' && daySpan <= 1) {
    const buckets = Array.from({ length: 24 }, (_, hour) =>
      emptyOrderSummaryBucket(formatHourLabel(hour)),
    );
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      addOrderToSummaryBucket(buckets[hour], order.orderMode, order.paymentMethod, order.total);
    }
    return buckets;
  }

  if (period === 'custom' && daySpan <= 62) {
    const keys: string[] = [];
    const cursor = startOfDay(range.gte);
    const end = endOfDay(range.lte);
    while (cursor <= end) {
      keys.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderSummaryBucket(dayChartLabel(key))]));
    for (const order of orders) {
      const key = dayKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToSummaryBucket(bucket, order.orderMode, order.paymentMethod, order.total);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  if (period === 'custom') {
    const keys: string[] = [];
    const cursor = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const endMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    while (cursor <= endMonth) {
      keys.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderSummaryBucket(monthChartLabel(key))]));
    for (const order of orders) {
      const key = monthKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToSummaryBucket(bucket, order.orderMode, order.paymentMethod, order.total);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  const weeklyBuckets = buildWeeklyBuckets(range);
  const bucketMap = new Map(
    weeklyBuckets.map((bucket) => [bucket.label, emptyOrderSummaryBucket(bucket.label)]),
  );
  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const match = weeklyBuckets.find(
      (bucket) => createdAt >= bucket.gte && createdAt <= bucket.lte,
    );
    if (!match) continue;
    const chartBucket = bucketMap.get(match.label);
    if (!chartBucket) continue;
    addOrderToSummaryBucket(chartBucket, order.orderMode, order.paymentMethod, order.total);
  }
  return weeklyBuckets.map((bucket) => bucketMap.get(bucket.label)!);
}

type OrderModeBucket = {
  label: string;
  delivery: number;
  pickup: number;
};

function emptyOrderModeBucket(label: string): OrderModeBucket {
  return { label, delivery: 0, pickup: 0 };
}

function addOrderToModeBucket(bucket: OrderModeBucket, orderMode: string) {
  if (orderMode === 'DELIVERY') bucket.delivery += 1;
  else if (orderMode === 'TAKEAWAY') bucket.pickup += 1;
}

function buildOrderModeChart(
  orders: Array<{ createdAt: Date; orderMode: string }>,
  period: 'today' | 'month' | 'year' | 'custom',
  range: { gte: Date; lte: Date },
): OrderModeBucket[] {
  if (period === 'today') {
    const buckets = Array.from({ length: 24 }, (_, hour) =>
      emptyOrderModeBucket(formatHourLabel(hour)),
    );
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      addOrderToModeBucket(buckets[hour], order.orderMode);
    }
    return buckets;
  }

  if (period === 'year') {
    const keys: string[] = [];
    const cursor = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const endMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    while (cursor <= endMonth) {
      keys.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderModeBucket(monthChartLabel(key))]));
    for (const order of orders) {
      const key = monthKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToModeBucket(bucket, order.orderMode);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  const daySpan =
    Math.ceil((endOfDay(range.lte).getTime() - startOfDay(range.gte).getTime()) / 86_400_000) + 1;

  if (period === 'custom' && daySpan <= 1) {
    const buckets = Array.from({ length: 24 }, (_, hour) =>
      emptyOrderModeBucket(formatHourLabel(hour)),
    );
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      addOrderToModeBucket(buckets[hour], order.orderMode);
    }
    return buckets;
  }

  if (period === 'custom' && daySpan <= 62) {
    const keys: string[] = [];
    const cursor = startOfDay(range.gte);
    const end = endOfDay(range.lte);
    while (cursor <= end) {
      keys.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderModeBucket(dayChartLabel(key))]));
    for (const order of orders) {
      const key = dayKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToModeBucket(bucket, order.orderMode);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  if (period === 'custom') {
    const keys: string[] = [];
    const cursor = new Date(range.gte.getFullYear(), range.gte.getMonth(), 1);
    const endMonth = new Date(range.lte.getFullYear(), range.lte.getMonth(), 1);
    while (cursor <= endMonth) {
      keys.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const bucketMap = new Map(keys.map((key) => [key, emptyOrderModeBucket(monthChartLabel(key))]));
    for (const order of orders) {
      const key = monthKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      addOrderToModeBucket(bucket, order.orderMode);
    }
    return keys.map((key) => bucketMap.get(key)!);
  }

  const weeklyBuckets = buildWeeklyBuckets(range);
  const bucketMap = new Map(
    weeklyBuckets.map((bucket) => [bucket.label, emptyOrderModeBucket(bucket.label)]),
  );
  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const match = weeklyBuckets.find(
      (bucket) => createdAt >= bucket.gte && createdAt <= bucket.lte,
    );
    if (!match) continue;
    const chartBucket = bucketMap.get(match.label);
    if (!chartBucket) continue;
    addOrderToModeBucket(chartBucket, order.orderMode);
  }
  return weeklyBuckets.map((bucket) => bucketMap.get(bucket.label)!);
}

function buildOrderPlatformBreakdown(orders: Array<{ platform: number }>) {
  let webCount = 0;
  let mobileCount = 0;
  for (const order of orders) {
    if (order.platform === 1) mobileCount += 1;
    else webCount += 1;
  }
  const total = webCount + mobileCount;
  return {
    webCount,
    mobileCount,
    webPercent: total > 0 ? Math.round((webCount / total) * 100) : 0,
    mobilePercent: total > 0 ? Math.round((mobileCount / total) * 100) : 0,
  };
}

function buildPaymentChannelBreakdown(
  orders: Array<{
    id?: string;
    total: number;
    orderMode: string;
    paymentMethod: string;
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    deliveryFee?: number;
    convenientFee?: number;
    addonAmountLkr?: number;
    addonPaymentMethod?: string;
  }>,
) {
  const totals = { ...EMPTY_CHANNEL_TOTALS };

  for (const order of orders) {
    const addonAmount = order.addonAmountLkr ?? 0;
    const primaryAmount = order.total - addonAmount;
    const primaryChannel = orderCommissionChannel(order.orderMode, order.paymentMethod);

    if (primaryChannel === 'pickupCash' && primaryAmount > 0) {
      totals.pickupCashTotal += primaryAmount;
      totals.pickupCashCount += 1;
    } else if (primaryChannel === 'pickupCard' && primaryAmount > 0) {
      totals.pickupCardTotal += primaryAmount;
      totals.pickupCardCount += 1;
    } else if (primaryChannel === 'pickupOnline' && primaryAmount > 0) {
      totals.pickupOnlineTotal += primaryAmount;
      totals.pickupOnlineCount += 1;
    } else if (primaryChannel === 'deliveryOnline') {
      totals.deliveryOnlineTotal += platformItemSalesLkr(order);
      totals.deliveryOnlineCount += 1;
    }

    if (addonAmount > 0) {
      if (order.addonPaymentMethod === 'CARD' || order.addonPaymentMethod === 'LOYALTY_POINTS') {
        totals.pickupCardTotal += addonAmount;
      } else {
        totals.pickupCashTotal += addonAmount;
      }
    }
  }

  return totals;
}

async function buildPaymentChannelBreakdownWithAddons(
  orders: Array<{
    id?: string;
    total: number;
    orderMode: string;
    paymentMethod: string;
    subtotal?: number;
    discount?: number;
    loyaltyDiscount?: number;
    deliveryFee?: number;
    convenientFee?: number;
  }>,
  paidScope?: PaidSalesScope,
) {
  if (paidScope) {
    return summarizePaymentChannelBreakdownForScope(paidScope);
  }
  const addonMap = await fetchOrderAddonMap(
    orders.map((order) => order.id).filter((id): id is string => !!id),
  );
  return buildPaymentChannelBreakdown(enrichOrdersWithAddonPayments(orders, addonMap));
}

function buildSalesOverviewFromBuckets(
  chartRange: ChartRange,
  buckets: Map<string, { revenue: number; orders: number; discount: number }>,
) {
  return chartRange.keys.map((key) => {
    const value = buckets.get(key) ?? { revenue: 0, orders: 0, discount: 0 };
    return {
      period: chartBucketLabel(key, chartRange.granularity),
      revenue: value.revenue,
      orders: value.orders,
      discount: value.discount,
    };
  });
}

async function buildBranchTopCustomers(
  paidPeriodWhere: Record<string, unknown>,
  limit = 20,
) {
  const poolSize = Math.max(limit * 2, 16);
  const [customerUserGroups, customerGuestGroups] = await Promise.all([
    prisma.order.groupBy({
      by: ['userId'],
      where: { ...paidPeriodWhere, userId: { not: null } },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: 'desc' } },
      take: poolSize,
    }),
    prisma.order.groupBy({
      by: ['guestPhone'],
      where: { ...paidPeriodWhere, userId: null, guestPhone: { not: null } },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: 'desc' } },
      take: poolSize,
    }),
  ]);

  const customerUserIds = customerUserGroups
    .map((g) => g.userId)
    .filter((id): id is string => !!id);
  const guestPhones = customerGuestGroups
    .map((g) => g.guestPhone)
    .filter((p): p is string => !!p);

  const [customerUsers, guestContactRows] = await Promise.all([
    customerUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: customerUserIds } },
          select: { id: true, name: true, phone: true, email: true },
        })
      : Promise.resolve([]),
    guestPhones.length
      ? prisma.order.findMany({
          where: { guestPhone: { in: guestPhones } },
          distinct: ['guestPhone'],
          select: { guestPhone: true, guestName: true, guestEmail: true },
        })
      : Promise.resolve([]),
  ]);

  const customerUserMap = new Map(customerUsers.map((u) => [u.id, u]));
  const guestContactMap = new Map(
    guestContactRows.map((g) => [g.guestPhone!, { name: g.guestName, email: g.guestEmail }]),
  );

  return [
    ...customerUserGroups.map((g) => {
      const user = customerUserMap.get(g.userId!);
      return {
        name: user?.name ?? 'Customer',
        phone: user?.phone ? maskPhone(user.phone) : undefined,
        email: user?.email ?? undefined,
        orders: g._count.id,
        totalSpend: g._sum.total || 0,
      };
    }),
    ...customerGuestGroups.map((g) => {
      const contact = guestContactMap.get(g.guestPhone!);
      return {
        name: resolveCustomerDisplayName({
          guestName: contact?.name,
          phone: g.guestPhone,
        }),
        phone: g.guestPhone ? maskPhone(g.guestPhone) : undefined,
        email: contact?.email ?? undefined,
        orders: g._count.id,
        totalSpend: g._sum.total || 0,
      };
    }),
  ]
    .sort((a, b) => b.totalSpend - a.totalSpend || b.orders - a.orders)
    .slice(0, limit)
    .map((c, i) => ({ rank: i + 1, ...c }));
}

type LeastProductGroup = {
  productId: string;
  productName: string;
  _sum: { quantity: number | null; totalPrice: number | null };
};

type CatalogueProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  basePrice: number;
};

async function buildLeastSellingProducts(
  leastProductGroups: LeastProductGroup[],
  catalogueProducts: CatalogueProduct[],
  limit = 20,
) {
  const soldIds = new Set(leastProductGroups.map((product) => product.productId));
  const zeroSellerProducts = catalogueProducts.filter((product) => !soldIds.has(product.id));

  const mergedGroups: LeastProductGroup[] = [
    ...leastProductGroups,
    ...zeroSellerProducts.map((product) => ({
      productId: product.id,
      productName: product.name,
      _sum: { quantity: 0, totalPrice: 0 },
    })),
  ];

  const sorted = mergedGroups.sort(
    (a, b) =>
      (a._sum.quantity || 0) - (b._sum.quantity || 0) ||
      a.productName.localeCompare(b.productName),
  );
  const selected = sorted.slice(0, limit);
  const productIds = selected.map((product) => product.productId);
  const productRows = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, imageUrl: true, basePrice: true },
      })
    : [];
  const productMap = new Map(productRows.map((product) => [product.id, product]));

  return selected.map((product) => {
    const row = productMap.get(product.productId);
    const imageUrl =
      normalizeProductImageUrl(row?.imageUrl) ??
      productImageUrl(row?.name ?? product.productName) ??
      null;
    return {
      productId: product.productId,
      productName: product.productName,
      imageUrl,
      basePrice: row?.basePrice ?? 0,
      quantity: product._sum.quantity || 0,
      revenue: product._sum.totalPrice || 0,
    };
  });
}

async function buildCustomerBehavior(paidPeriodWhere: Record<string, unknown>) {
  const growth = await buildCustomerGrowth({}, paidPeriodWhere);
  const firstTimeBuyers = growth.segments.find((s) => s.key === 'newRegistered')?.value ?? 0;
  const loyalCustomers = growth.segments.find((s) => s.key === 'returningLoyal')?.value ?? 0;
  const total = firstTimeBuyers + loyalCustomers;

  return {
    firstTimeBuyers,
    loyalCustomers,
    firstTimePercent: total > 0 ? Math.round((firstTimeBuyers / total) * 100) : 0,
    loyalPercent: total > 0 ? Math.round((loyalCustomers / total) * 100) : 0,
  };
}

function resolvePreviousRange(current: { gte: Date; lte: Date }) {
  const durationMs = current.lte.getTime() - current.gte.getTime();
  const lte = new Date(current.gte.getTime() - 1);
  const gte = new Date(lte.getTime() - durationMs);
  return { gte, lte };
}

function growthPercent(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type OrderStatusSummary = {
  completed: number;
  preparing: number;
  pending: number;
  cancelled: number;
  total: number;
};

const EMPTY_ORDER_STATUS: OrderStatusSummary = {
  completed: 0,
  preparing: 0,
  pending: 0,
  cancelled: 0,
  total: 0,
};

function summarizeOrderStatus(
  groups: Array<{ status: string; _count: { _all?: number | null } }>,
): OrderStatusSummary {
  const byStatus = new Map(groups.map((group) => [group.status, group._count._all ?? 0]));
  const completed = byStatus.get('DELIVERED') ?? 0;
  const preparing =
    (byStatus.get('PREPARING') ?? 0) +
    (byStatus.get('READY') ?? 0) +
    (byStatus.get('OUT_FOR_DELIVERY') ?? 0);
  const pending = byStatus.get('RECEIVED') ?? 0;
  const cancelled = byStatus.get('CANCELLED') ?? 0;
  const total = [...byStatus.values()].reduce((sum, count) => sum + count, 0);
  return { completed, preparing, pending, cancelled, total };
}

function sumRevenueBreakdown(orders: Array<{ orderMode: string; total: number }>) {
  let delivery = 0;
  let pickup = 0;
  for (const order of orders) {
    if (order.orderMode === 'DELIVERY') delivery += order.total;
    else if (order.orderMode === 'TAKEAWAY') pickup += order.total;
  }
  return { delivery, pickup };
}

function buildSalesOverviewSeries(
  chartRange: ChartRange,
  orders: Array<{
    createdAt: Date;
    total: number;
    discount?: number | null;
    loyaltyDiscount?: number | null;
  }>,
) {
  const salesOverviewMap = new Map<string, { revenue: number; orders: number; discount: number }>();
  for (const key of chartRange.keys) {
    salesOverviewMap.set(key, { revenue: 0, orders: 0, discount: 0 });
  }
  for (const order of orders) {
    const key =
      chartRange.granularity === 'day'
        ? dayKey(new Date(order.createdAt))
        : monthKey(new Date(order.createdAt));
    const bucket = salesOverviewMap.get(key);
    if (!bucket) continue;
    bucket.revenue += order.total;
    bucket.orders += 1;
    bucket.discount += (order.discount ?? 0) + (order.loyaltyDiscount ?? 0);
  }
  return [...salesOverviewMap.entries()].map(([key, value]) => ({
    period: chartBucketLabel(key, chartRange.granularity),
    revenue: value.revenue,
    orders: value.orders,
    discount: value.discount,
  }));
}

function buildKpiComparison(input: {
  currentGross: number;
  previousGross: number;
  currentOrders: number;
  previousOrders: number;
  currentCups: number;
  previousCups: number;
}) {
  const currentAov = input.currentOrders > 0 ? input.currentGross / input.currentOrders : 0;
  const previousAov = input.previousOrders > 0 ? input.previousGross / input.previousOrders : 0;
  return {
    grossSales: {
      current: input.currentGross,
      previous: input.previousGross,
      changePercent: growthPercent(input.currentGross, input.previousGross),
    },
    totalOrders: {
      current: input.currentOrders,
      previous: input.previousOrders,
      changePercent: growthPercent(input.currentOrders, input.previousOrders),
    },
    totalCups: {
      current: input.currentCups,
      previous: input.previousCups,
      changePercent: growthPercent(input.currentCups, input.previousCups),
    },
    averageOrderValue: {
      current: input.currentOrders > 0 ? Math.round(currentAov) : 0,
      previous: input.previousOrders > 0 ? Math.round(previousAov) : 0,
      changePercent: growthPercent(currentAov, previousAov),
    },
  };
}

const ZERO_KPI_COMPARISON = buildKpiComparison({
  currentGross: 0,
  previousGross: 0,
  currentOrders: 0,
  previousOrders: 0,
  currentCups: 0,
  previousCups: 0,
});

async function loadPreviousPaidComparison(args: {
  previousRange: { gte: Date; lte: Date };
  storeIds?: string[];
  currentGross: number;
  currentOrders: number;
  currentCups: number;
}) {
  const storeFilter =
    args.storeIds && args.storeIds.length > 0 ? { storeId: { in: args.storeIds } } : {};
  const previousWhere = paidSalesWhere({
    createdAt: args.previousRange,
    ...storeFilter,
  });
  const [previousAgg, previousCupsAgg] = await Promise.all([
    prisma.order.aggregate({
      where: previousWhere,
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: previousWhere },
      _sum: { quantity: true },
    }),
  ]);
  return buildKpiComparison({
    currentGross: args.currentGross,
    previousGross: previousAgg._sum.total ?? 0,
    currentOrders: args.currentOrders,
    previousOrders: previousAgg._count.id ?? 0,
    currentCups: args.currentCups,
    previousCups: previousCupsAgg._sum.quantity ?? 0,
  });
}

async function loadOrderStatusSummary(
  range: { gte: Date; lte: Date },
  storeIds?: string[],
) {
  const groups = await prisma.order.groupBy({
    by: ['status'],
    where: {
      createdAt: range,
      ...(storeIds && storeIds.length > 0 ? { storeId: { in: storeIds } } : {}),
    },
    _count: { _all: true },
  });
  return summarizeOrderStatus(groups);
}

function accumulateBranchPlatformOrders(
  orders: Array<{ storeId: string; platform: number }>,
) {
  const webOrdersByStore = new Map<string, number>();
  const mobileOrdersByStore = new Map<string, number>();
  for (const order of orders) {
    if (order.platform === 1) {
      mobileOrdersByStore.set(order.storeId, (mobileOrdersByStore.get(order.storeId) ?? 0) + 1);
    } else {
      webOrdersByStore.set(order.storeId, (webOrdersByStore.get(order.storeId) ?? 0) + 1);
    }
  }
  return { webOrdersByStore, mobileOrdersByStore };
}

async function buildPerStoreCustomerCounts(
  periodOrders: Array<{
    storeId: string;
    userId: string | null;
    guestPhone: string | null;
  }>,
) {
  const userIds = [
    ...new Set(periodOrders.map((o) => o.userId).filter((id): id is string => !!id)),
  ];
  const guestPhones = [
    ...new Set(
      periodOrders
        .filter((o) => !o.userId && o.guestPhone)
        .map((o) => o.guestPhone!),
    ),
  ];

  const [userOrderCounts, guestOrderCounts] = await Promise.all([
    userIds.length
      ? prisma.order.groupBy({
          by: ['userId'],
          where: { paymentStatus: 'PAID', userId: { in: userIds } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    guestPhones.length
      ? prisma.order.groupBy({
          by: ['guestPhone'],
          where: { paymentStatus: 'PAID', userId: null, guestPhone: { in: guestPhones } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const userTotalMap = new Map(
    userOrderCounts.map((row) => [row.userId!, row._count.id]),
  );
  const guestTotalMap = new Map(
    guestOrderCounts.map((row) => [row.guestPhone!, row._count.id]),
  );

  const newCustomersByStore = new Map<string, number>();
  const loyalCustomersByStore = new Map<string, number>();
  const seenByStore = new Map<string, Set<string>>();

  for (const order of periodOrders) {
    const customerKey = order.userId
      ? `u:${order.userId}`
      : order.guestPhone
        ? `g:${order.guestPhone}`
        : null;
    if (!customerKey) continue;

    if (!seenByStore.has(order.storeId)) seenByStore.set(order.storeId, new Set());
    const seen = seenByStore.get(order.storeId)!;
    if (seen.has(customerKey)) continue;
    seen.add(customerKey);

    const lifetimeOrders = order.userId
      ? userTotalMap.get(order.userId) ?? 1
      : guestTotalMap.get(order.guestPhone!) ?? 1;

    if (lifetimeOrders <= 1) {
      newCustomersByStore.set(order.storeId, (newCustomersByStore.get(order.storeId) ?? 0) + 1);
    } else {
      loyalCustomersByStore.set(order.storeId, (loyalCustomersByStore.get(order.storeId) ?? 0) + 1);
    }
  }

  return { newCustomersByStore, loyalCustomersByStore };
}

type StoreTierRow = { id: string; name: string; deliveryEnabled: boolean };

function buildTierSummary(
  stores: StoreTierRow[],
  branchPerformance: Array<{ storeId: string; grossSales: number; totalOrders: number; growthPercent: number }>,
  periodOrders: Array<{ storeId: string; orderMode: string }>,
) {
  const topStoreIds = new Set(stores.filter((s) => s.deliveryEnabled).map((s) => s.id));
  const standardStoreIds = new Set(stores.filter((s) => !s.deliveryEnabled).map((s) => s.id));

  const topBranches = branchPerformance.filter((b) => topStoreIds.has(b.storeId));
  const standardBranches = branchPerformance.filter((b) => standardStoreIds.has(b.storeId));

  const topOrders = periodOrders.filter((o) => topStoreIds.has(o.storeId));
  const topDelivery = topOrders.filter((o) => o.orderMode === 'DELIVERY').length;
  const topPickup = topOrders.filter((o) => o.orderMode === 'TAKEAWAY').length;
  const topTotal = topDelivery + topPickup;

  const standardGrowthValues = standardBranches
    .map((b) => b.growthPercent)
    .filter((value) => Number.isFinite(value));
  const avgStandardGrowth =
    standardGrowthValues.length > 0
      ? Math.round(
          standardGrowthValues.reduce((sum, value) => sum + value, 0) /
            standardGrowthValues.length,
        )
      : 0;

  const avgTopSales =
    topBranches.length > 0
      ? Math.round(topBranches.reduce((sum, b) => sum + b.grossSales, 0) / topBranches.length)
      : 0;
  const avgStandardSales =
    standardBranches.length > 0
      ? Math.round(
          standardBranches.reduce((sum, b) => sum + b.grossSales, 0) / standardBranches.length,
        )
      : 0;

  return {
    topTier: {
      branchCount: topStoreIds.size,
      deliveryPercent: topTotal > 0 ? Math.round((topDelivery / topTotal) * 100) : 0,
      pickupPercent: topTotal > 0 ? Math.round((topPickup / topTotal) * 100) : 0,
      avgSalesPerBranch: avgTopSales,
    },
    standardTier: {
      branchCount: standardStoreIds.size,
      avgGrowthPercent: avgStandardGrowth,
      avgSalesPerBranch: avgStandardSales,
    },
  };
}

function buildPlatformReviewsSummary(
  ratings: Array<{ stars: number; comment: string | null; createdAt: Date }>,
) {
  const distribution = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: ratings.filter((rating) => rating.stars === stars).length,
  }));
  const totalCount = ratings.length;
  const avgRating =
    totalCount > 0
      ? Math.round((ratings.reduce((sum, rating) => sum + rating.stars, 0) / totalCount) * 10) / 10
      : null;
  const recentComments = ratings
    .filter((rating) => rating.comment?.trim())
    .slice(0, 5)
    .map((rating) => ({
      stars: rating.stars,
      comment: rating.comment!.trim(),
      createdAt: rating.createdAt.toISOString(),
    }));

  return { avgRating, totalCount, distribution, recentComments };
}

function buildBranchDeliveryPickup(
  stores: Array<{ id: string; name: string }>,
  orders: Array<{ storeId: string; orderMode: string }>,
  limit = 10,
) {
  const byStore = new Map<string, { delivery: number; pickup: number }>();
  for (const store of stores) {
    byStore.set(store.id, { delivery: 0, pickup: 0 });
  }
  for (const order of orders) {
    const bucket = byStore.get(order.storeId);
    if (!bucket) continue;
    if (order.orderMode === 'DELIVERY') bucket.delivery += 1;
    else if (order.orderMode === 'TAKEAWAY') bucket.pickup += 1;
  }
  return stores
    .map((store) => {
      const counts = byStore.get(store.id) ?? { delivery: 0, pickup: 0 };
      return {
        storeId: store.id,
        branchName: store.name,
        delivery: counts.delivery,
        pickup: counts.pickup,
      };
    })
    .sort((a, b) => b.delivery + b.pickup - (a.delivery + a.pickup))
    .slice(0, limit);
}

type BranchModeSales = {
  pickupOrders: number;
  pickupAmount: number;
  deliveryOrders: number;
  deliveryAmount: number;
};

function buildBranchModeSalesByStore(
  orders: Array<{ storeId: string; orderMode: string; total: number }>,
): Map<string, BranchModeSales> {
  const byStore = new Map<string, BranchModeSales>();
  for (const order of orders) {
    const current = byStore.get(order.storeId) ?? {
      pickupOrders: 0,
      pickupAmount: 0,
      deliveryOrders: 0,
      deliveryAmount: 0,
    };
    if (order.orderMode === 'DELIVERY') {
      current.deliveryOrders += 1;
      current.deliveryAmount += order.total;
    } else if (order.orderMode === 'TAKEAWAY') {
      current.pickupOrders += 1;
      current.pickupAmount += order.total;
    }
    byStore.set(order.storeId, current);
  }
  return byStore;
}

function enrichTopTierScorecards<
  T extends { storeId: string; grossSales: number; totalOrders: number; deliveryPercent: number },
>(
  branches: T[],
  modeSalesByStore: Map<string, BranchModeSales>,
  limit = 10,
) {
  return branches.slice(0, limit).map((branch, index) => {
    const modes = modeSalesByStore.get(branch.storeId) ?? {
      pickupOrders: 0,
      pickupAmount: 0,
      deliveryOrders: 0,
      deliveryAmount: 0,
    };
    return {
      rank: index + 1,
      ...branch,
      pickupOrders: modes.pickupOrders,
      pickupAmount: modes.pickupAmount,
      deliveryOrders: modes.deliveryOrders,
      deliveryAmount: modes.deliveryAmount,
    };
  });
}

function buildOrderSummaryByBranch(
  stores: Array<{ id: string; name: string }>,
  orders: Array<{ storeId: string; total: number; orderMode: string; paymentMethod: string }>,
  limit = 10,
  pickupOnly = false,
  sortBy: 'revenue' | 'orders' = 'revenue',
): OrderSummaryBucket[] {
  const storeNameMap = new Map(stores.map((store) => [store.id, store.name]));

  if (pickupOnly) {
    const bucketsByStore = new Map<string, OrderSummaryBucket>();
    for (const store of stores) {
      bucketsByStore.set(store.id, emptyOrderSummaryBucket(store.name));
    }
    for (const order of orders) {
      const bucket = bucketsByStore.get(order.storeId);
      if (!bucket) continue;
      addOrderToSummaryBucket(bucket, order.orderMode, order.paymentMethod, order.total);
    }
    return [...bucketsByStore.values()]
      .filter((bucket) =>
        sortBy === 'orders' ? bucket.orderCount > 0 : bucket.grossSales > 0,
      )
      .sort((a, b) =>
        sortBy === 'orders'
          ? b.orderCount - a.orderCount
          : b.grossSales - a.grossSales,
      )
      .slice(0, limit);
  }

  const storeRankings = new Map<string, number>();
  for (const order of orders) {
    const current = storeRankings.get(order.storeId) ?? 0;
    storeRankings.set(
      order.storeId,
      sortBy === 'orders' ? current + 1 : current + order.total,
    );
  }

  const topStoreIds = [...storeRankings.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([storeId]) => storeId);

  const buckets = topStoreIds.map((storeId) =>
    emptyOrderSummaryBucket(storeNameMap.get(storeId) ?? 'Unknown'),
  );

  for (const order of orders) {
    const index = topStoreIds.indexOf(order.storeId);
    if (index < 0) continue;
    addOrderToSummaryBucket(buckets[index], order.orderMode, order.paymentMethod, order.total);
  }

  return buckets;
}

async function buildBrandTopCustomers(
  paidPeriodWhere: Record<string, unknown>,
  limit = 10,
  sortBy: 'spend' | 'orders' = 'spend',
) {
  const orders = await prisma.order.findMany({
    where: paidPeriodWhere,
    select: {
      userId: true,
      guestPhone: true,
      guestName: true,
      guestEmail: true,
      total: true,
      storeId: true,
      user: { select: { id: true, name: true, phone: true, email: true } },
      store: { select: { name: true } },
      items: { select: { productName: true, quantity: true } },
    },
  });

  type CustomerAgg = {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    orders: number;
    totalSpend: number;
    storeSpend: Map<string, { name: string; spend: number; orders: number }>;
    productQty: Map<string, number>;
  };

  const customerMap = new Map<string, CustomerAgg>();

  for (const order of orders) {
    const key = order.userId ?? (order.guestPhone ? `guest:${order.guestPhone}` : null);
    if (!key) continue;

    const current = customerMap.get(key) ?? {
      id: order.userId ?? key,
      name: order.user?.name ?? order.guestName ?? 'Customer',
      phone: order.user?.phone ?? order.guestPhone ?? undefined,
      email: order.user?.email ?? order.guestEmail ?? undefined,
      orders: 0,
      totalSpend: 0,
      storeSpend: new Map(),
      productQty: new Map(),
    };

    current.orders += 1;
    current.totalSpend += order.total;

    const storeEntry = current.storeSpend.get(order.storeId) ?? {
      name: order.store.name,
      spend: 0,
      orders: 0,
    };
    storeEntry.spend += order.total;
    storeEntry.orders += 1;
    current.storeSpend.set(order.storeId, storeEntry);

    for (const item of order.items) {
      current.productQty.set(
        item.productName,
        (current.productQty.get(item.productName) ?? 0) + item.quantity,
      );
    }

    customerMap.set(key, current);
  }

  return [...customerMap.values()]
    .sort((a, b) =>
      sortBy === 'orders'
        ? b.orders - a.orders || b.totalSpend - a.totalSpend
        : b.totalSpend - a.totalSpend || b.orders - a.orders,
    )
    .slice(0, limit)
    .map((customer, index) => {
      const homeBranch = [...customer.storeSpend.values()].sort(
        (a, b) => b.orders - a.orders || b.spend - a.spend,
      )[0];
      const favoriteProduct = [...customer.productQty.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        rank: index + 1,
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        orders: customer.orders,
        totalSpend: customer.totalSpend,
        homeBranch: homeBranch?.name ?? '—',
        favoriteProduct: favoriteProduct?.[0] ?? '—',
      };
    });
}

export async function getBrandAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const peakStoreId = z.object({ storeId: z.string().optional() }).parse(req.query).storeId;
    const cacheKey = analyticsCacheKey([
      'brand-analytics',
      req.user?.sub,
      period,
      from,
      to,
      peakStoreId,
    ]);
    const payload = await withAnalyticsCache(cacheKey, async () => {
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);
    const previousRange = resolvePreviousRange(selectedRange);
    const paidPeriodWhere = paidSalesWhere({
      createdAt: selectedRange,
    });
    const chartRange = resolveChartRange(period, selectedRange, now);
    const monthlyBaseFrom = new Date(
      selectedRange.gte.getFullYear(),
      selectedRange.gte.getMonth(),
      1,
    );

    const [
      stores,
      periodOrders,
      previousGrossByStore,
      periodRevenueAgg,
      deliveryFeeAgg,
      convenienceFeeAgg,
      productGroups,
      leastProductGroups,
      platformRatings,
    ] = await Promise.all([
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true, deliveryEnabled: true },
        orderBy: { name: 'asc' },
      }),
      prisma.order.findMany({
        where: paidPeriodWhere,
        select: {
          id: true,
          total: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          deliveryFee: true,
          convenientFee: true,
          orderMode: true,
          paymentMethod: true,
          createdAt: true,
          storeId: true,
          platform: true,
        },
      }),
      prisma.order.groupBy({
        by: ['storeId'],
        where: {
          paymentStatus: 'PAID',
          createdAt: previousRange,
        },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        _sum: { deliveryFee: true },
      }),
      prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { convenientFee: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: paidPeriodWhere },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 20,
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: {
          order: paidPeriodWhere,
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'asc' } },
        take: 20,
      }),
      prisma.platformRating.findMany({
        where: { createdAt: selectedRange },
        select: { stars: true, comment: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const paidSalesScope: PaidSalesScope = {
      createdAtGte: selectedRange.gte,
      createdAtLte: selectedRange.lte,
    };
    const [
      periodBaseLookup,
      categorySalesRows,
      salesOverviewBuckets,
      deliveryCountByStoreRows,
      peakHourlySales,
    ] = await Promise.all([
      aggregatePeriodBaseLookup({
        createdAtGte: monthlyBaseFrom,
        createdAtLte: selectedRange.lte,
      }),
      aggregateCategorySales(paidSalesScope),
      aggregateSalesOverviewByBucket(paidSalesScope, chartRange.granularity),
      prisma.order.groupBy({
        by: ['storeId'],
        where: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        _count: { id: true },
      }),
      aggregateHourlySales({
        ...paidSalesScope,
        ...(peakStoreId ? { storeId: peakStoreId } : {}),
      }),
    ]);

    const grossSales = periodRevenueAgg._sum.total || 0;
    const totalOrders = periodRevenueAgg._count.id || 0;
    const totalDeliveryRevenue = deliveryFeeAgg._sum.deliveryFee || 0;
    const totalConvenienceRevenue = convenienceFeeAgg._sum.convenientFee || 0;

    const previousGrossMap = new Map(
      previousGrossByStore.map((row) => [row.storeId, row._sum.total ?? 0]),
    );
    const deliveryCountByStore = new Map(
      deliveryCountByStoreRows.map((row) => [row.storeId, row._count.id]),
    );
    let periodCommission = 0;
    let gatewayFee = 0;

    const branchPerformance = stores.map((store) => {
      const storeOrders = periodOrders.filter((order) => order.storeId === store.id);
      const storeGross = storeOrders.reduce((sum, order) => sum + order.total, 0);
      const windowBase = sumCommissionableBase(storeOrders);
      const breakdown = accumulateSettlementBreakdown(
        storeOrders as BranchOrderForAnalytics[],
        windowBase,
      );
      const commission = sumBreakdownCommission(breakdown);
      const providerFee = sumBreakdownProviderFee(breakdown);
      periodCommission += commission;
      gatewayFee += providerFee;
      const totalStoreOrders = storeOrders.length;
      const deliveryOrders = deliveryCountByStore.get(store.id) ?? 0;
      const previousGross = previousGrossMap.get(store.id) ?? 0;
      return {
        storeId: store.id,
        branchName: store.name,
        tier: store.deliveryEnabled ? ('top' as const) : ('standard' as const),
        deliveryEnabled: store.deliveryEnabled,
        totalOrders: totalStoreOrders,
        grossSales: storeGross,
        commission,
        netTakeHome: Math.max(0, storeGross - commission - providerFee),
        growthPercent: growthPercent(storeGross, previousGross),
        deliveryPercent:
          totalStoreOrders > 0 ? Math.round((deliveryOrders / totalStoreOrders) * 100) : 0,
      };
    }).sort((a, b) => b.grossSales - a.grossSales);

    const netRevenue = Math.max(0, grossSales - periodCommission - gatewayFee);
    const tierSummary = buildTierSummary(stores, branchPerformance, periodOrders);
    const platformReviews = buildPlatformReviewsSummary(platformRatings);
    const modeSalesByStore = buildBranchModeSalesByStore(periodOrders);
    const topTierScorecards = enrichTopTierScorecards(
      branchPerformance.filter((branch) => branch.tier === 'top'),
      modeSalesByStore,
      10,
    );

    const salesOverview = buildSalesOverviewFromBuckets(chartRange, salesOverviewBuckets);

    const branchDeliveryPickup = buildBranchDeliveryPickup(stores, periodOrders, 10);
    const orderSummaryByBranch = buildOrderSummaryByBranch(stores, periodOrders, 10);
    const paymentChannelBreakdown = await buildPaymentChannelBreakdownWithAddons(
      periodOrders,
      paidSalesScope,
    );
    const orderPlatform = buildOrderPlatformBreakdown(periodOrders);

    const { peakHours, hourlyHeatmap } = peakHourlySales;

    const productIds = productGroups.map((product) => product.productId);
    const productRows = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, imageUrl: true, basePrice: true },
        })
      : [];
    const productMap = new Map(productRows.map((product) => [product.id, product]));

    const topProducts = productGroups.map((product) => {
      const row = productMap.get(product.productId);
      const imageUrl =
        normalizeProductImageUrl(row?.imageUrl) ??
        productImageUrl(row?.name ?? product.productName) ??
        null;
      return {
        productId: product.productId,
        productName: product.productName,
        imageUrl,
        basePrice: row?.basePrice ?? 0,
        quantity: product._sum.quantity || 0,
        revenue: product._sum.totalPrice || 0,
      };
    });

    const catalogueProducts = await prisma.product.findMany({
      where: { isAvailable: true },
      select: { id: true, name: true, imageUrl: true, basePrice: true },
    });
    const leastProducts = await buildLeastSellingProducts(
      leastProductGroups,
      catalogueProducts,
      20,
    );

    const avgBranchGrossSales =
      branchPerformance.length > 0
        ? Math.round(
            branchPerformance.reduce((sum, branch) => sum + branch.grossSales, 0) /
              branchPerformance.length,
          )
        : 0;

    const leastPerformingBranches = [...branchPerformance]
      .sort((a, b) => a.grossSales - b.grossSales || a.totalOrders - b.totalOrders)
      .slice(0, 5)
      .map((branch, index) => ({
        ...branch,
        rank: index + 1,
        percentBelowAverage:
          avgBranchGrossSales > 0
            ? Math.round(((avgBranchGrossSales - branch.grossSales) / avgBranchGrossSales) * 100)
            : 0,
      }));

    let totalCups = 0;
    for (const row of categorySalesRows) {
      totalCups += row.quantity;
    }
    const topProductCategories = [...categorySalesRows]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        quantity: row.quantity,
        revenue: row.revenue,
      }));

    const [topCustomers, topCustomersByOrders, customerBehavior, kpiComparison, orderStatus] =
      await Promise.all([
        buildBrandTopCustomers(paidPeriodWhere, 10, 'spend'),
        buildBrandTopCustomers(paidPeriodWhere, 10, 'orders'),
        buildCustomerBehavior(paidPeriodWhere),
        loadPreviousPaidComparison({
          previousRange,
          currentGross: grossSales,
          currentOrders: totalOrders,
          currentCups: totalCups,
        }),
        loadOrderStatusSummary(selectedRange),
      ]);
    const revenueBreakdown = sumRevenueBreakdown(periodOrders);

    const productSalesRevenue = Math.max(0, grossSales - totalDeliveryRevenue - totalConvenienceRevenue);

    return {
      period,
      dateFrom: period === 'custom' ? from : undefined,
      dateTo: period === 'custom' ? to : undefined,
      kpiCards: {
        grossSales,
        totalOrders,
        totalCups,
        totalDeliveryRevenue,
        totalConvenienceRevenue,
        gatewayFee,
        commissionFee: periodCommission,
        grossAfterFees: netRevenue,
        netRevenueLabel: 'After commission & PSP fee (excl. payout adjustments)',
        commissionNote: 'Indicative for selected period; payout uses calendar-month slab',
      },
      kpiComparison,
      revenueBreakdown,
      orderStatus,
      profitLoss: {
        productSalesRevenue,
        deliveryRevenue: totalDeliveryRevenue,
        convenienceRevenue: totalConvenienceRevenue,
        dartcodesCommission: periodCommission,
        payhereGatewayFees: gatewayFee,
        netTakeHome: netRevenue,
      },
      salesOverview,
      branchDeliveryPickup,
      branchPerformance,
      orderSummaryByBranch,
      leastPerformingBranches,
      paymentChannelBreakdown,
      orderPlatform,
      topProducts,
      leastProducts,
      topProductCategories,
      topCustomers,
      topCustomersByOrders,
      customerBehavior,
      hourlyPeakTimes: peakHours,
      hourlyHeatmap,
      tierSummary,
      platformReviews,
      topTierScorecards,
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        deliveryEnabled: store.deliveryEnabled,
        tier: store.deliveryEnabled ? 'top' : 'standard',
      })),
    };
    });
    return success(res, payload);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

async function loadBrandBranchPerformance(selectedRange: { gte: Date; lte: Date }) {
  const paidPeriodWhere = {
    createdAt: selectedRange,
    paymentStatus: 'PAID' as const,
  };
  const monthlyBaseFrom = new Date(
    selectedRange.gte.getFullYear(),
    selectedRange.gte.getMonth(),
    1,
  );

  const [stores, periodOrders, monthlyBaseOrders] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, city: true, district: true },
      orderBy: { name: 'asc' },
    }),
    prisma.order.findMany({
      where: paidPeriodWhere,
      select: {
        total: true,
        subtotal: true,
        discount: true,
        loyaltyDiscount: true,
        deliveryFee: true,
        convenientFee: true,
        orderMode: true,
        paymentMethod: true,
        createdAt: true,
        storeId: true,
      },
    }),
    prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: monthlyBaseFrom, lte: selectedRange.lte },
      },
      select: {
        subtotal: true,
        discount: true,
        loyaltyDiscount: true,
        orderMode: true,
        paymentMethod: true,
        createdAt: true,
        storeId: true,
      },
    }),
  ]);

  const periodBaseLookup = buildPeriodBaseLookup(monthlyBaseOrders);

  const branchPerformance = stores
    .map((store) => {
      const storeOrders = periodOrders.filter((order) => order.storeId === store.id);
      const storeGross = storeOrders.reduce((sum, order) => sum + order.total, 0);
      const windowBase = sumCommissionableBase(storeOrders);
      const breakdown = accumulateSettlementBreakdown(
        storeOrders as BranchOrderForAnalytics[],
        windowBase,
      );
      const commission = sumBreakdownCommission(breakdown);
      const providerFee = sumBreakdownProviderFee(breakdown);
      const totalOrders = storeOrders.length;
      return {
        storeId: store.id,
        branchName: store.name,
        location: [store.city, store.district].filter(Boolean).join(', ') || '—',
        totalOrders,
        grossSales: storeGross,
        aov: totalOrders > 0 ? Math.round(storeGross / totalOrders) : 0,
        commission,
        netTakeHome: Math.max(0, storeGross - commission - providerFee),
      };
    })
    .sort((a, b) => b.grossSales - a.grossSales);

  const avgBranchGrossSales =
    branchPerformance.length > 0
      ? Math.round(
          branchPerformance.reduce((sum, branch) => sum + branch.grossSales, 0) /
            branchPerformance.length,
        )
      : 0;

  const leastPerformingBranches = [...branchPerformance]
    .sort((a, b) => a.grossSales - b.grossSales || a.totalOrders - b.totalOrders)
    .slice(0, 5)
    .map((branch, index) => ({
      ...branch,
      rank: index + 1,
      percentBelowAverage:
        avgBranchGrossSales > 0
          ? Math.round(((avgBranchGrossSales - branch.grossSales) / avgBranchGrossSales) * 100)
          : 0,
    }));

  return { branchPerformance, leastPerformingBranches };
}

export async function getBrandBranchPerformance(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const filters = z
      .object({
        orderMode: z.enum(['ALL', 'DELIVERY', 'TAKEAWAY']).optional().default('ALL'),
        paymentMethod: z.enum(['ALL', 'CASH', 'CARD', 'ONLINE']).optional().default('ALL'),
        metric: z.enum(['revenue', 'orders']).optional().default('revenue'),
        storeId: z.string().optional(),
      })
      .parse(req.query);
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);
    const previousRange = resolvePreviousRange(selectedRange);
    const paidPeriodWhere: Record<string, unknown> = {
      createdAt: selectedRange,
      paymentStatus: 'PAID' as const,
    };
    if (filters.storeId) {
      paidPeriodWhere.storeId = filters.storeId;
    }
    if (filters.orderMode === 'DELIVERY' || filters.orderMode === 'TAKEAWAY') {
      paidPeriodWhere.orderMode = filters.orderMode;
    }
    if (filters.paymentMethod === 'CASH') {
      paidPeriodWhere.paymentMethod = { in: ['CASH_ON_DELIVERY', 'CASH_AT_COUNTER'] };
    } else if (filters.paymentMethod === 'CARD') {
      paidPeriodWhere.paymentMethod = 'CARD';
    } else if (filters.paymentMethod === 'ONLINE') {
      paidPeriodWhere.paymentMethod = 'PAYHERE';
    }

    const [stores, periodOrders, previousGrossByStore] = await Promise.all([
      prisma.store.findMany({
        where: {
          isActive: true,
          ...(filters.storeId ? { id: filters.storeId } : {}),
        },
        select: { id: true, name: true, city: true, district: true, deliveryEnabled: true },
        orderBy: { name: 'asc' },
      }),
      prisma.order.findMany({
        where: paidPeriodWhere,
        select: {
          total: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          deliveryFee: true,
          convenientFee: true,
          orderMode: true,
          paymentMethod: true,
          createdAt: true,
          storeId: true,
        },
      }),
      prisma.order.groupBy({
        by: ['storeId'],
        where: {
          paymentStatus: 'PAID',
          createdAt: previousRange,
          ...(filters.storeId ? { storeId: filters.storeId } : {}),
        },
        _sum: { total: true },
      }),
    ]);

    const monthlyBaseFrom = new Date(
      selectedRange.gte.getFullYear(),
      selectedRange.gte.getMonth(),
      1,
    );
    const monthlyBaseOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: { gte: monthlyBaseFrom, lte: selectedRange.lte },
        ...(filters.storeId ? { storeId: filters.storeId } : {}),
      },
      select: {
        subtotal: true,
        discount: true,
        loyaltyDiscount: true,
        orderMode: true,
        paymentMethod: true,
        createdAt: true,
        storeId: true,
      },
    });

    const periodBaseLookup = buildPeriodBaseLookup(monthlyBaseOrders);
    const previousGrossMap = new Map(
      previousGrossByStore.map((row) => [row.storeId, row._sum.total ?? 0]),
    );
    const deliveryCountByStore = new Map<string, number>();
    for (const order of periodOrders) {
      if (order.orderMode === 'DELIVERY') {
        deliveryCountByStore.set(
          order.storeId,
          (deliveryCountByStore.get(order.storeId) ?? 0) + 1,
        );
      }
    }

    let branchPerformance = stores
      .map((store) => {
        const storeOrders = periodOrders.filter((order) => order.storeId === store.id);
        const storeGross = storeOrders.reduce((sum, order) => sum + order.total, 0);
        const windowBase = sumCommissionableBase(storeOrders);
        const breakdown = accumulateSettlementBreakdown(
          storeOrders as BranchOrderForAnalytics[],
          windowBase,
        );
        const commission = sumBreakdownCommission(breakdown);
        const providerFee = sumBreakdownProviderFee(breakdown);
        const totalStoreOrders = storeOrders.length;
        const deliveryOrders = deliveryCountByStore.get(store.id) ?? 0;
        const previousGross = previousGrossMap.get(store.id) ?? 0;
        return {
          storeId: store.id,
          branchName: store.name,
          location: [store.city, store.district].filter(Boolean).join(', ') || '—',
          tier: store.deliveryEnabled ? ('top' as const) : ('standard' as const),
          deliveryEnabled: store.deliveryEnabled,
          totalOrders: totalStoreOrders,
          grossSales: storeGross,
          aov: totalStoreOrders > 0 ? Math.round(storeGross / totalStoreOrders) : 0,
          commission,
          netTakeHome: Math.max(0, storeGross - commission - providerFee),
          growthPercent: growthPercent(storeGross, previousGross),
          deliveryPercent:
            totalStoreOrders > 0 ? Math.round((deliveryOrders / totalStoreOrders) * 100) : 0,
        };
      })
      .sort((a, b) =>
        filters.metric === 'orders'
          ? b.totalOrders - a.totalOrders || b.grossSales - a.grossSales
          : b.grossSales - a.grossSales || b.totalOrders - a.totalOrders,
      );

    const avgBranchGrossSales =
      branchPerformance.length > 0
        ? Math.round(
            branchPerformance.reduce((sum, branch) => sum + branch.grossSales, 0) /
              branchPerformance.length,
          )
        : 0;

    branchPerformance = branchPerformance.map((branch, index) => {
      const percentVsAvg =
        avgBranchGrossSales > 0
          ? Math.round(((branch.grossSales - avgBranchGrossSales) / avgBranchGrossSales) * 100)
          : 0;
      let performanceStatus: 'Top Performer' | 'Average' | 'Needs Attention' = 'Average';
      if (percentVsAvg >= 15 || index < Math.max(1, Math.ceil(branchPerformance.length * 0.25))) {
        performanceStatus = 'Top Performer';
      } else if (percentVsAvg <= -15) {
        performanceStatus = 'Needs Attention';
      }
      return {
        ...branch,
        rank: index + 1,
        performanceStatus,
        percentVsAvg,
      };
    });

    const leastPerformingBranches = [...branchPerformance]
      .sort((a, b) => a.grossSales - b.grossSales || a.totalOrders - b.totalOrders)
      .slice(0, 5)
      .map((branch, index) => ({
        ...branch,
        rank: index + 1,
        percentBelowAverage:
          avgBranchGrossSales > 0
            ? Math.round(((avgBranchGrossSales - branch.grossSales) / avgBranchGrossSales) * 100)
            : 0,
      }));

    return success(res, {
      period,
      branchPerformance,
      leastPerformingBranches,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

const tierQuerySchema = z.enum(['all', 'top', 'standard']).default('all');

export async function getBranchTierAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const tier = tierQuerySchema.parse(req.query.tier ?? 'all');
    const peakStoreId = z.object({ storeId: z.string().optional() }).parse(req.query).storeId;
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);
    const previousRange = resolvePreviousRange(selectedRange);
    const chartRange = resolveChartRange(period, selectedRange, now);
    const paidPeriodWhere = paidSalesWhere({
      createdAt: selectedRange,
    });

    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        ...(tier === 'top'
          ? { deliveryEnabled: true }
          : tier === 'standard'
            ? { deliveryEnabled: false }
            : {}),
      },
      select: { id: true, name: true, deliveryEnabled: true },
      orderBy: { name: 'asc' },
    });
    const storeIds = stores.map((store) => store.id);
    if (storeIds.length === 0) {
      return success(res, {
        tier,
        period,
        stores: [],
        branchPerformance: [],
        branchDeliveryPickup: [],
        orderSummaryByBranch: [],
        paymentChannelBreakdown: buildPaymentChannelBreakdown([]),
        topProducts: [],
        leastProducts: [],
        topProductCategories: [],
        salesOverview: buildSalesOverviewSeries(chartRange, []),
        kpiComparison: ZERO_KPI_COMPARISON,
        revenueBreakdown: { delivery: 0, pickup: 0 },
        orderStatus: EMPTY_ORDER_STATUS,
        hourlyPeakTimes: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          label: formatHourLabel(hour),
          orders: 0,
          revenue: 0,
        })),
        hourlyHeatmap: Array.from({ length: 7 * 24 }, (_, index) => ({
          day: Math.floor(index / 24),
          hour: index % 24,
          orders: 0,
          revenue: 0,
        })),
      });
    }

    const storeFilter = { storeId: { in: storeIds } };
    const [periodOrders, productGroups, leastProductGroups, categoryItems] = await Promise.all([
      prisma.order.findMany({
        where: { ...paidPeriodWhere, ...storeFilter },
        select: {
          id: true,
          total: true,
          discount: true,
          loyaltyDiscount: true,
          orderMode: true,
          deliveryFee: true,
          convenientFee: true,
          paymentMethod: true,
          createdAt: true,
          storeId: true,
          platform: true,
          userId: true,
          guestPhone: true,
        },
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { ...paidPeriodWhere, ...storeFilter } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 20,
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: { ...paidPeriodWhere, ...storeFilter } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'asc' } },
        take: 20,
      }),
      prisma.orderItem.findMany({
        where: { order: { ...paidPeriodWhere, ...storeFilter } },
        select: {
          quantity: true,
          totalPrice: true,
          product: {
            select: {
              categoryId: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const previousGrossByStore = await prisma.order.groupBy({
      by: ['storeId'],
      where: {
        paymentStatus: 'PAID',
        createdAt: previousRange,
        storeId: { in: storeIds },
      },
      _sum: { total: true },
    });
    const previousGrossMap = new Map(
      previousGrossByStore.map((row) => [row.storeId, row._sum.total ?? 0]),
    );
    const deliveryCountByStore = new Map<string, number>();
    for (const order of periodOrders) {
      if (order.orderMode === 'DELIVERY') {
        deliveryCountByStore.set(
          order.storeId,
          (deliveryCountByStore.get(order.storeId) ?? 0) + 1,
        );
      }
    }

    const { webOrdersByStore, mobileOrdersByStore } = accumulateBranchPlatformOrders(periodOrders);
    const { newCustomersByStore, loyalCustomersByStore } =
      await buildPerStoreCustomerCounts(periodOrders);

    const branchPerformance = stores
      .map((store) => {
        const storeOrders = periodOrders.filter((order) => order.storeId === store.id);
        const storeGross = storeOrders.reduce((sum, order) => sum + order.total, 0);
        const totalStoreOrders = storeOrders.length;
        const deliveryOrders = deliveryCountByStore.get(store.id) ?? 0;
        const previousGross = previousGrossMap.get(store.id) ?? 0;
        return {
          storeId: store.id,
          branchName: store.name,
          tier: store.deliveryEnabled ? ('top' as const) : ('standard' as const),
          deliveryEnabled: store.deliveryEnabled,
          totalOrders: totalStoreOrders,
          grossSales: storeGross,
          growthPercent: growthPercent(storeGross, previousGross),
          deliveryPercent:
            totalStoreOrders > 0 ? Math.round((deliveryOrders / totalStoreOrders) * 100) : 0,
          webOrders: webOrdersByStore.get(store.id) ?? 0,
          mobileOrders: mobileOrdersByStore.get(store.id) ?? 0,
          newCustomers: newCustomersByStore.get(store.id) ?? 0,
          loyalCustomers: loyalCustomersByStore.get(store.id) ?? 0,
        };
      })
      .sort((a, b) => b.grossSales - a.grossSales);

    const branchDeliveryPickup = buildBranchDeliveryPickup(stores, periodOrders, 20);
    const orderSummaryByBranch = buildOrderSummaryByBranch(
      stores,
      periodOrders,
      tier === 'standard' || tier === 'top' ? 10 : 20,
      tier === 'standard',
      'revenue',
    );
    const paymentChannelBreakdown = await buildPaymentChannelBreakdownWithAddons(periodOrders);

    const peakOrders =
      peakStoreId && peakStoreId.length > 0 && storeIds.includes(peakStoreId)
        ? periodOrders.filter((order) => order.storeId === peakStoreId)
        : periodOrders;
    const { peakHours, hourlyHeatmap } = buildHourlySales(
      peakOrders.map((order) => ({ createdAt: order.createdAt, total: order.total })),
    );

    const productIds = productGroups.map((product) => product.productId);
    const productRows = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, imageUrl: true, basePrice: true },
        })
      : [];
    const productMap = new Map(productRows.map((product) => [product.id, product]));

    const topProducts = productGroups.map((product) => {
      const row = productMap.get(product.productId);
      const imageUrl =
        normalizeProductImageUrl(row?.imageUrl) ??
        productImageUrl(row?.name ?? product.productName) ??
        null;
      return {
        productId: product.productId,
        productName: product.productName,
        imageUrl,
        basePrice: row?.basePrice ?? 0,
        quantity: product._sum.quantity || 0,
        revenue: product._sum.totalPrice || 0,
      };
    });

    const storeProductRows = storeIds.length
      ? await prisma.storeProduct.findMany({
          where: { storeId: { in: storeIds }, isAvailable: true },
          select: {
            product: {
              select: { id: true, name: true, imageUrl: true, basePrice: true },
            },
          },
        })
      : [];
    const catalogueProducts = storeProductRows.map((row) => row.product);
    const leastProducts = await buildLeastSellingProducts(
      leastProductGroups,
      catalogueProducts,
      20,
    );

    const categoryMap = new Map<
      string,
      { categoryId: string; name: string; quantity: number; revenue: number }
    >();
    let totalCups = 0;
    for (const item of categoryItems) {
      const categoryId = item.product.categoryId;
      const name = item.product.category.name;
      const current = categoryMap.get(categoryId) ?? {
        categoryId,
        name,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += item.quantity;
      current.revenue += item.totalPrice;
      categoryMap.set(categoryId, current);
      totalCups += item.quantity;
    }
    const topProductCategories = [...categoryMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);

    const topTierScorecards =
      tier === 'top'
        ? enrichTopTierScorecards(
            branchPerformance,
            buildBranchModeSalesByStore(periodOrders),
            branchPerformance.length,
          )
        : [];

    let deliveryOrders = 0;
    let pickupOrders = 0;
    let grossSales = 0;
    let totalDeliveryRevenue = 0;
    let totalConvenienceRevenue = 0;
    for (const order of periodOrders) {
      grossSales += order.total;
      totalConvenienceRevenue += order.convenientFee ?? 0;
      if (order.orderMode === 'DELIVERY') {
        deliveryOrders += 1;
        totalDeliveryRevenue += order.deliveryFee ?? 0;
      } else if (order.orderMode === 'TAKEAWAY') {
        pickupOrders += 1;
      }
    }

    const [kpiComparison, orderStatus] = await Promise.all([
      loadPreviousPaidComparison({
        previousRange,
        storeIds,
        currentGross: grossSales,
        currentOrders: periodOrders.length,
        currentCups: totalCups,
      }),
      loadOrderStatusSummary(selectedRange, storeIds),
    ]);
    const salesOverview = buildSalesOverviewSeries(chartRange, periodOrders);
    const revenueBreakdown = sumRevenueBreakdown(periodOrders);

    return success(res, {
      tier,
      period,
      kpiCards: {
        grossSales,
        totalOrders: periodOrders.length,
        totalCups,
        deliveryOrders,
        pickupOrders,
        totalDeliveryRevenue,
        totalConvenienceRevenue,
      },
      kpiComparison,
      revenueBreakdown,
      orderStatus,
      salesOverview,
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        deliveryEnabled: store.deliveryEnabled,
        tier: store.deliveryEnabled ? 'top' : 'standard',
      })),
      branchPerformance,
      branchDeliveryPickup,
      orderSummaryByBranch,
      paymentChannelBreakdown,
      topProducts,
      leastProducts,
      topProductCategories,
      hourlyPeakTimes: peakHours,
      hourlyHeatmap,
      topTierScorecards,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

export async function getBranchAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const storeId = await requireBranchStoreId(req);
    const cacheKey = analyticsCacheKey([
      'branch-analytics',
      req.user?.sub,
      storeId,
      period,
      from,
      to,
    ]);
    const payload = await withAnalyticsCache(cacheKey, async () => {
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);
    const paidPeriodWhere = paidSalesWhere({
      storeId,
      createdAt: selectedRange,
    });

    const monthlyChart = resolveChartRange(period, selectedRange, now);
    const monthlyBaseFrom = new Date(
      selectedRange.gte.getFullYear(),
      selectedRange.gte.getMonth(),
      1,
    );

    const [
      periodOrders,
      periodRevenueAgg,
      deliveryFeeAgg,
      convenienceFeeAgg,
      productGroups,
      sizeGroups,
      toppingGroups,
      settlements,
      pendingSettlementCount,
      storeWallet,
    ] = await Promise.all([
      prisma.order.findMany({
        where: paidPeriodWhere,
        select: {
          id: true,
          total: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          deliveryFee: true,
          convenientFee: true,
          orderMode: true,
          paymentMethod: true,
          createdAt: true,
          storeId: true,
          platform: true,
        },
      }),
      prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        _sum: { deliveryFee: true },
      }),
      prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { convenientFee: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: paidPeriodWhere },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 8,
      }),
      prisma.orderItem.groupBy({
        by: ['size'],
        where: { order: paidPeriodWhere },
        _sum: { quantity: true },
      }),
      prisma.orderItemTopping.groupBy({
        by: ['toppingId', 'toppingName'],
        where: { orderItem: { order: paidPeriodWhere } },
        _count: { toppingId: true },
        orderBy: { _count: { toppingId: 'desc' } },
        take: 10,
      }),
      prisma.commissionSettlement.findMany({
        where: { storeId, status: 'VERIFIED' },
        orderBy: { verifiedAt: 'desc' },
        take: 1,
        select: { verifiedAt: true },
      }),
      prisma.commissionSettlement.count({
        where: { storeId, status: 'PENDING_VERIFICATION' },
      }),
      prisma.storeWallet.findUnique({
        where: { storeId },
        select: { lastSettledAt: true },
      }),
    ]);

    const paidSalesScope: PaidSalesScope = {
      storeId,
      createdAtGte: selectedRange.gte,
      createdAtLte: selectedRange.lte,
    };
    const [periodBaseLookup, categorySalesRows, peakHourlySales] = await Promise.all([
      aggregatePeriodBaseLookup({
        storeId,
        createdAtGte: monthlyBaseFrom,
        createdAtLte: selectedRange.lte,
      }),
      aggregateCategorySales(paidSalesScope),
      aggregateHourlySales(paidSalesScope),
    ]);

    const grossSales = periodRevenueAgg._sum.total || 0;
    const totalOrders = periodRevenueAgg._count.id || 0;
    const totalDeliveryRevenue = deliveryFeeAgg._sum.deliveryFee || 0;
    const totalConvenienceRevenue = convenienceFeeAgg._sum.convenientFee || 0;
    const avgOrderValue =
      totalOrders > 0 ? Math.round((grossSales / totalOrders) * 100) / 100 : 0;
    const windowBase = sumCommissionableBase(periodOrders);
    const settlementBreakdown = accumulateSettlementBreakdown(
      periodOrders as BranchOrderForAnalytics[],
      windowBase,
    );
    const periodCommission = sumBreakdownCommission(settlementBreakdown);
    const gatewayFee = sumBreakdownProviderFee(settlementBreakdown);
    const grossAfterFees = Math.max(0, grossSales - periodCommission - gatewayFee);

    const currentPeriodBase =
      periodBaseLookup[storePeriodKey(storeId, now)] ??
      periodBaseLookup[Object.keys(periodBaseLookup).sort().pop() ?? ''] ??
      0;
    const slabInfo = buildSlabInfo(currentPeriodBase);

    const orderSummaryChart = buildOrderSummaryChart(periodOrders, period, selectedRange);
    const orderModeChart = buildOrderModeChart(periodOrders, period, selectedRange);
    const paymentChannelBreakdown = await buildPaymentChannelBreakdownWithAddons(
      periodOrders,
      paidSalesScope,
    );
    const orderPlatform = buildOrderPlatformBreakdown(periodOrders);
    const { peakHours } = peakHourlySales;

    const productIds = productGroups.map((p) => p.productId);
    const productRows = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, imageUrl: true, basePrice: true },
        })
      : [];
    const productMap = new Map(productRows.map((p) => [p.id, p]));

    const topProducts = productGroups.map((p) => {
      const product = productMap.get(p.productId);
      const imageUrl =
        normalizeProductImageUrl(product?.imageUrl) ??
        productImageUrl(product?.name ?? p.productName) ??
        null;
      return {
        productId: p.productId,
        productName: p.productName,
        imageUrl,
        basePrice: product?.basePrice ?? 0,
        quantity: p._sum.quantity || 0,
        revenue: p._sum.totalPrice || 0,
      };
    });

    const topProductCategories = [...categorySalesRows]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        quantity: row.quantity,
        revenue: row.revenue,
      }));

    const toppingIds = toppingGroups.map((t) => t.toppingId);
    const toppingRows = toppingIds.length
      ? await prisma.topping.findMany({
          where: { id: { in: toppingIds } },
          select: { id: true, extraPrice: true },
        })
      : [];
    const toppingPriceMap = new Map(toppingRows.map((t) => [t.id, t.extraPrice]));

    const totalToppingCount = toppingGroups.reduce((sum, row) => sum + row._count.toppingId, 0);
    const popularToppings = toppingGroups.map((row) => ({
      toppingId: row.toppingId,
      name: row.toppingName,
      count: row._count.toppingId,
      extraPrice: toppingPriceMap.get(row.toppingId) ?? 0,
      percent:
        totalToppingCount > 0
          ? Math.round((row._count.toppingId / totalToppingCount) * 100)
          : 0,
    }));

    const sizeTotals = {
      REGULAR: 0,
      LARGE: 0,
    };
    for (const row of sizeGroups) {
      if (row.size === ProductSize.REGULAR || row.size === ProductSize.LARGE) {
        sizeTotals[row.size] = row._sum.quantity || 0;
      }
    }
    const totalSizeCount = sizeTotals.REGULAR + sizeTotals.LARGE;
    const mostDemandedSizes = {
      REGULAR: {
        count: sizeTotals.REGULAR,
        percent:
          totalSizeCount > 0 ? Math.round((sizeTotals.REGULAR / totalSizeCount) * 100) : 0,
      },
      LARGE: {
        count: sizeTotals.LARGE,
        percent: totalSizeCount > 0 ? Math.round((sizeTotals.LARGE / totalSizeCount) * 100) : 0,
      },
    };

    const [topCustomers, customerBehavior, outflowByMethod, refundByMonth, discountsByMonth] =
      await Promise.all([
        buildBranchTopCustomers(paidPeriodWhere),
        buildCustomerBehavior(paidPeriodWhere),
        getOutgoingFlowsForRange({
          from: dateStringInColombo(selectedRange.gte),
          to: dateStringInColombo(selectedRange.lte),
          storeId,
        }),
        buildBranchMonthlyRefunds(storeId, monthlyChart),
        buildBranchMonthlyDiscounts(paidPeriodWhere, monthlyChart),
      ]);

    const lastSettledAt =
      settlements[0]?.verifiedAt?.toISOString() ??
      storeWallet?.lastSettledAt?.toISOString() ??
      null;

    return {
      period,
      dateFrom: period === 'custom' ? from : undefined,
      dateTo: period === 'custom' ? to : undefined,
      kpiCards: {
        grossSales,
        totalOrders,
        totalDeliveryRevenue,
        totalConvenienceRevenue,
        avgOrderValue,
        avgOrderValueNote: 'incl. delivery & convenience',
        gatewayFee,
        commissionFee: periodCommission,
        grossAfterFees,
        netRevenueLabel: 'After commission & PSP fee (excl. payout adjustments)',
        commissionNote: 'Indicative for selected period; payout uses calendar-month slab',
      },
      orderSummaryChart,
      orderModeChart,
      paymentChannelBreakdown,
      hourlyPeakTimes: peakHours,
      dartcodesPayments: {
        periodCommission,
        totalOwed: periodCommission,
        effectiveSlabRate: slabInfo.effectiveRate,
        lastSettledAt,
        pendingSettlementCount,
      },
      topProducts,
      topProductCategories,
      mostDemandedSizes,
      popularToppings,
      topCustomers,
      customerBehavior,
      orderPlatform,
      outflowByMethod,
      refundByMonth,
      discountsByMonth,
    };
    });
    return success(res, payload);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

export async function getSalesReport(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        storeId: z.string().optional(),
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    const { from, to, page, pageSize } = parsed;
    const storeId = branchStoreId ?? parsed.storeId;

    const where: Record<string, unknown> = paidSalesWhere({});
    if (from || to) {
      const gte = from ? new Date(from) : undefined;
      const lte = to ? new Date(to) : undefined;
      if (gte && lte) assertMaxDateSpan(gte, lte);
      where.createdAt = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    }
    if (storeId) where.storeId = storeId;

    const skip = (page - 1) * pageSize;
    const [total, revenueAgg, modeGroups, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.aggregate({
        where,
        _sum: { total: true, discount: true, loyaltyDiscount: true },
      }),
      prisma.order.groupBy({
        by: ['orderMode'],
        where,
        _sum: { total: true },
      }),
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          total: true,
          subtotal: true,
          discount: true,
          loyaltyDiscount: true,
          deliveryFee: true,
          convenientFee: true,
          createdAt: true,
          orderMode: true,
          paymentMethod: true,
          store: { select: { name: true } },
          items: { select: { productName: true, quantity: true, totalPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);

    const totalRevenue = revenueAgg._sum.total || 0;
    const totalDiscount = revenueAgg._sum.discount || 0;
    const totalLoyaltyDiscount = revenueAgg._sum.loyaltyDiscount || 0;
    const byMode = modeGroups.reduce((acc: Record<string, number>, row) => {
      acc[row.orderMode] = row._sum.total || 0;
      return acc;
    }, {});

    return success(res, {
      orders,
      totalRevenue,
      totalDiscount,
      totalLoyaltyDiscount,
      byMode,
      count: orders.length,
      page,
      pageSize,
      total,
    });
  } catch (err) {
    next(err);
  }
}

export async function getTopProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        orderMode: z.enum(['ALL', 'DELIVERY', 'TAKEAWAY']).optional().default('ALL'),
        sortBy: z.enum(['top', 'least']).optional().default('top'),
        metric: z.enum(['quantity', 'revenue']).optional().default('quantity'),
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    if (branchStoreId) query.storeId = branchStoreId;

    const reportRange = resolveReportDayRange(query.from, query.to);
    const createdAt = { gte: reportRange.gte, lte: reportRange.lte };

    const aggregateRows = await prisma.$queryRaw<
      Array<{
        product_id: string;
        product_name: string;
        order_mode: string;
        qty: number | bigint;
        revenue: number | bigint;
      }>
    >`
      SELECT oi."productId" AS product_id,
             oi."productName" AS product_name,
             o."orderMode" AS order_mode,
             SUM(oi.quantity) AS qty,
             SUM(oi."totalPrice") AS revenue
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      WHERE o."paymentStatus" = 'PAID'
        AND o.status <> 'CANCELLED'
        AND o."createdAt" >= ${createdAt.gte}
        AND o."createdAt" <= ${createdAt.lte}
        ${query.storeId ? Prisma.sql`AND o."storeId" = ${query.storeId}` : Prisma.empty}
        ${query.orderMode !== 'ALL' ? Prisma.sql`AND o."orderMode" = ${query.orderMode}` : Prisma.empty}
      GROUP BY oi."productId", oi."productName", o."orderMode"
    `;

    const productIds = [...new Set(aggregateRows.map((row) => row.product_id))];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            slug: true,
            category: { select: { name: true } },
          },
        })
      : [];
    const productMeta = new Map(products.map((p) => [p.id, p]));

    type ProductAgg = {
      productId: string;
      sku: string;
      productName: string;
      category: string;
      totalQuantity: number;
      pickupQuantity: number;
      deliveryQuantity: number;
      totalRevenue: number;
    };

    const map = new Map<string, ProductAgg>();
    for (const row of aggregateRows) {
      const key = row.product_id;
      const meta = productMeta.get(row.product_id);
      const qty = Number(row.qty ?? 0);
      const revenue = Number(row.revenue ?? 0);
      const current = map.get(key) ?? {
        productId: row.product_id,
        sku: meta?.slug || row.product_id.slice(0, 8).toUpperCase(),
        productName: row.product_name,
        category: meta?.category?.name ?? '—',
        totalQuantity: 0,
        pickupQuantity: 0,
        deliveryQuantity: 0,
        totalRevenue: 0,
      };
      current.totalQuantity += qty;
      current.totalRevenue += revenue;
      if (row.order_mode === 'DELIVERY') {
        current.deliveryQuantity += qty;
      } else {
        current.pickupQuantity += qty;
      }
      map.set(key, current);
    }

    const sorted = [...map.values()].sort((a, b) => {
      const metricA = query.metric === 'revenue' ? a.totalRevenue : a.totalQuantity;
      const metricB = query.metric === 'revenue' ? b.totalRevenue : b.totalQuantity;
      return query.sortBy === 'least' ? metricA - metricB : metricB - metricA;
    });

    return success(res, sorted.slice(0, query.limit));
  } catch (err) {
    next(err);
  }
}

export async function getHourlyPeakHeatmap(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const tier = tierQuerySchema.parse(req.query.tier ?? 'all');
    const storeId = z.object({ storeId: z.string().optional() }).parse(req.query).storeId;
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);

    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        ...(tier === 'top'
          ? { deliveryEnabled: true }
          : tier === 'standard'
            ? { deliveryEnabled: false }
            : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const storeIds = stores.map((store) => store.id);

    if (storeIds.length === 0) {
      return success(res, {
        hourlyHeatmap: Array.from({ length: 7 * 24 }, (_, index) => ({
          day: Math.floor(index / 24),
          hour: index % 24,
          orders: 0,
          revenue: 0,
        })),
      });
    }

    const orders = await prisma.order.findMany({
      where: paidSalesWhere({
        createdAt: selectedRange,
        storeId: storeId && storeIds.includes(storeId) ? storeId : { in: storeIds },
      }),
      select: {
        createdAt: true,
        total: true,
      },
    });

    const { hourlyHeatmap } = buildHourlySales(orders);
    return success(res, { hourlyHeatmap });
  } catch (err) {
    next(err);
  }
}

const monthlyDeliveryYearSchema = z.coerce
  .number()
  .int()
  .min(2020)
  .max(2100)
  .default(new Date().getFullYear());

export async function getMonthlyDeliveryOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const year = monthlyDeliveryYearSchema.parse(req.query.year);
    const tier = tierQuerySchema.parse(req.query.tier ?? 'top');

    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        ...(tier === 'top'
          ? { deliveryEnabled: true }
          : tier === 'standard'
            ? { deliveryEnabled: false }
            : {}),
      },
      select: { id: true },
    });
    const storeIds = stores.map((store) => store.id);

    const monthKeys = Array.from(
      { length: 12 },
      (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`,
    );
    const shortMonthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (storeIds.length === 0) {
      return success(res, {
        year,
        monthlyDeliveryOrders: monthKeys.map((key, index) => ({
          month: monthChartLabel(key),
          shortMonth: shortMonthLabels[index]!,
          orders: 0,
          revenue: 0,
        })),
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startOfDay(new Date(year, 0, 1)),
          lte: endOfDay(new Date(year, 11, 31)),
        },
        paymentStatus: 'PAID',
        orderMode: 'DELIVERY',
        storeId: { in: storeIds },
      },
      select: {
        createdAt: true,
        total: true,
      },
    });

    const bucketMap = new Map(
      monthKeys.map((key, index) => [
        key,
        {
          month: monthChartLabel(key),
          shortMonth: shortMonthLabels[index]!,
          orders: 0,
          revenue: 0,
        },
      ]),
    );

    for (const order of orders) {
      const key = monthKey(new Date(order.createdAt));
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      bucket.orders += 1;
      bucket.revenue += order.total;
    }

    return success(res, {
      year,
      monthlyDeliveryOrders: monthKeys.map((key) => bucketMap.get(key)!),
    });
  } catch (err) {
    next(err);
  }
}

export async function getTopCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        period: z.enum(['today', 'month', 'year', 'custom', 'all']).optional().default('month'),
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        sortBy: z.enum(['spend', 'orders']).optional().default('spend'),
        limit: z.coerce.number().int().min(1).max(100).optional().default(25),
      })
      .superRefine((value, ctx) => {
        if (value.period === 'custom' && (!value.from || !value.to)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'from and to are required when period is custom',
            path: ['from'],
          });
        }
      })
      .parse(req.query);

    const now = new Date();
    const paidPeriodWhere: Record<string, unknown> = {
      paymentStatus: 'PAID' as const,
    };

    if (query.period !== 'all') {
      paidPeriodWhere.createdAt = resolveSelectedRange(
        query.period === 'custom' ? 'custom' : query.period,
        now,
        query.from,
        query.to,
      );
    }

    if (query.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: query.storeId, isActive: true },
        select: { id: true },
      });
      if (!store) {
        return success(res, { topCustomers: [], topCustomersByOrders: [] });
      }
      paidPeriodWhere.storeId = query.storeId;
    }

    const [topCustomers, topCustomersByOrders] = await Promise.all([
      buildBrandTopCustomers(paidPeriodWhere, query.limit, 'spend'),
      buildBrandTopCustomers(paidPeriodWhere, query.limit, 'orders'),
    ]);

    return success(res, {
      topCustomers: query.sortBy === 'orders' ? topCustomersByOrders : topCustomers,
      topCustomersBySpend: topCustomers,
      topCustomersByOrders,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

export async function getCustomerLoyalty(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        customerType: z.enum(['ALL', 'NEW', 'LOYAL']).optional().default('ALL'),
        loyaltyThreshold: z.coerce.number().int().min(2).max(100).optional().default(2),
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional().default(100),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    if (branchStoreId) query.storeId = branchStoreId;

    const reportRange = resolveReportDayRange(query.from, query.to);

    const orderWhere = {
      paymentStatus: 'PAID' as const,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      createdAt: { gte: reportRange.gte, lte: reportRange.lte },
    };

    const aggregates = await prisma.order.groupBy({
      by: ['userId'],
      where: { ...orderWhere, userId: { not: null } },
      _count: { _all: true },
      _sum: { total: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    const userIds = aggregates.map((a) => a.userId!).slice(0, 2000);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, deletedAt: null },
          select: { id: true, name: true, phone: true, createdAt: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = aggregates
      .map((agg) => {
        const user = userMap.get(agg.userId!);
        if (!user) return null;
        const totalOrders = agg._count._all;
        const totalValue = agg._sum.total ?? 0;
        const customerType = totalOrders >= query.loyaltyThreshold ? 'LOYAL' : 'NEW';
        if (query.customerType !== 'ALL' && query.customerType !== customerType) return null;
        return {
          customerId: user.id,
          name: user.name,
          phone: user.phone,
          registrationDate: user.createdAt,
          customerType,
          firstOrderDate: agg._min.createdAt,
          lastOrderDate: agg._max.createdAt,
          totalOrders,
          totalValue,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, query.limit);

    return success(res, {
      loyaltyThreshold: query.loyaltyThreshold,
      customers: rows,
      summary: {
        total: rows.length,
        newCount: rows.filter((r) => r.customerType === 'NEW').length,
        loyalCount: rows.filter((r) => r.customerType === 'LOYAL').length,
      },
    });
  } catch (err) {
    next(err);
  }
}

const DELAY_THRESHOLD_MINUTES = 45;

export async function getOrderFulfillment(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        period: periodSchema,
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        orderMode: z.enum(['ALL', 'DELIVERY', 'TAKEAWAY']).optional().default('ALL'),
        delayedOnly: z
          .union([z.literal('true'), z.literal('false'), z.boolean()])
          .optional()
          .transform((v) => v === true || v === 'true')
          .default(false),
      })
      .parse(req.query);

    const now = new Date();
    const selectedRange = resolveSelectedRange(query.period, now, query.from, query.to);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: selectedRange,
        status: { in: ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
        ...(query.orderMode !== 'ALL' ? { orderMode: query.orderMode } : {}),
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      select: {
        id: true,
        storeId: true,
        orderMode: true,
        estimatedMinutes: true,
        createdAt: true,
        store: { select: { name: true } },
        statusEvents: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    type BranchAgg = {
      branchName: string;
      totalOrders: number;
      prepMinutesSum: number;
      prepCount: number;
      dispatchMinutesSum: number;
      dispatchCount: number;
      delayedOrders: number;
    };

    const byStore = new Map<string, BranchAgg>();

    for (const order of orders) {
      const readyAt = order.statusEvents.find((e) => e.status === 'READY')?.createdAt;
      const dispatchedAt = order.statusEvents.find((e) => e.status === 'OUT_FOR_DELIVERY')?.createdAt;
      const deliveredAt = order.statusEvents.find((e) => e.status === 'DELIVERED')?.createdAt;

      const prepEnd = readyAt ?? dispatchedAt ?? deliveredAt;
      const prepMinutes = prepEnd
        ? Math.max(0, (prepEnd.getTime() - order.createdAt.getTime()) / 60000)
        : null;

      const dispatchMinutes =
        readyAt && dispatchedAt
          ? Math.max(0, (dispatchedAt.getTime() - readyAt.getTime()) / 60000)
          : null;

      const threshold = order.estimatedMinutes || DELAY_THRESHOLD_MINUTES;
      const fulfillmentEnd = deliveredAt ?? dispatchedAt ?? readyAt;
      const fulfillmentMinutes = fulfillmentEnd
        ? (fulfillmentEnd.getTime() - order.createdAt.getTime()) / 60000
        : null;
      const isDelayed = fulfillmentMinutes != null && fulfillmentMinutes > threshold;

      if (query.delayedOnly && !isDelayed) continue;

      const current = byStore.get(order.storeId) ?? {
        branchName: order.store.name,
        totalOrders: 0,
        prepMinutesSum: 0,
        prepCount: 0,
        dispatchMinutesSum: 0,
        dispatchCount: 0,
        delayedOrders: 0,
      };

      current.totalOrders += 1;
      if (prepMinutes != null) {
        current.prepMinutesSum += prepMinutes;
        current.prepCount += 1;
      }
      if (dispatchMinutes != null) {
        current.dispatchMinutesSum += dispatchMinutes;
        current.dispatchCount += 1;
      }
      if (isDelayed) current.delayedOrders += 1;
      byStore.set(order.storeId, current);
    }

    const rows = [...byStore.values()]
      .map((row) => ({
        branchName: row.branchName,
        totalOrders: row.totalOrders,
        avgPreparationMinutes:
          row.prepCount > 0 ? Math.round((row.prepMinutesSum / row.prepCount) * 10) / 10 : 0,
        avgDispatchMinutes:
          row.dispatchCount > 0
            ? Math.round((row.dispatchMinutesSum / row.dispatchCount) * 10) / 10
            : 0,
        delayedOrders: row.delayedOrders,
        delayPercentage:
          row.totalOrders > 0 ? Math.round((row.delayedOrders / row.totalOrders) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.delayPercentage - a.delayPercentage || b.totalOrders - a.totalOrders);

    return success(res, { branches: rows, delayThresholdMinutes: DELAY_THRESHOLD_MINUTES });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

const CANCEL_REASON_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Item Out of Stock / Unavailable',
  CUSTOMER_REQUEST: 'Customer Requested Cancellation',
  PAYMENT_OR_SYSTEM_ISSUE: 'Payment or System Issue / Duplicate Order',
};

export async function getOrderCancellations(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        period: periodSchema,
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional().default(100),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    if (branchStoreId) query.storeId = branchStoreId;

    const now = new Date();
    const selectedRange = resolveSelectedRange(query.period, now, query.from, query.to);

    const orders = await prisma.order.findMany({
      where: {
        createdAt: selectedRange,
        OR: [{ status: 'CANCELLED' }, { paymentStatus: 'REFUNDED' }],
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        cancelReason: true,
        cancelledBy: true,
        createdAt: true,
        store: { select: { name: true } },
        user: { select: { name: true } },
        guestName: true,
        statusEvents: {
          where: { status: 'CANCELLED' },
          select: { note: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    const rows = orders.map((order) => {
      const cancelEvent = order.statusEvents[0];
      const note = cancelEvent?.note?.trim() || '';
      const cancelledByMatch = note.match(/cancelled by[:\s]+([^|.]+)/i);
      const cancelledByFromNote = cancelledByMatch?.[1]?.trim()
        || (note.toLowerCase().includes('customer') ? 'Customer' : note ? 'Staff' : 'System');
      const cancelReasonLabel = order.cancelReason
        ? CANCEL_REASON_LABELS[order.cancelReason] ?? order.cancelReason
        : note || (order.status === 'CANCELLED' ? 'Order cancelled' : 'Payment refunded');

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchName: order.store.name,
        orderValue: order.total,
        paymentMethod: order.paymentMethod,
        refundStatus: order.paymentStatus === 'REFUNDED' ? 'Refunded' : order.paymentStatus === 'PAID' ? 'Not Refunded' : order.paymentStatus,
        cancelledBy: order.cancelledBy ?? cancelledByFromNote,
        reason: cancelReasonLabel,
        customerName: order.user?.name ?? order.guestName ?? '—',
        createdAt: order.createdAt,
      };
    });

    return success(res, { cancellations: rows, count: rows.length });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}

export async function getSettlementReports(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = z
      .object({
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    const storeId = branchStoreId ?? parsed.storeId;
    const reportRange = resolveReportDayRange(parsed.from, parsed.to);

    const settlements = await prisma.commissionSettlement.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        createdAt: { gte: reportRange.gte, lte: reportRange.lte },
        status: { not: 'REJECTED' },
      },
      include: {
        store: { select: { name: true, city: true } },
        storeWithdrawal: {
          select: {
            amount: true,
            status: true,
            breakdown: true,
            isAdvance: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const rows = settlements.map((settlement) => {
      const breakdown = normalizeStoredSettlementBreakdown(settlement.breakdown);
      const channels = Object.values(breakdown);
      const grossSales = channels.reduce((sum, c) => sum + (c.revenueSubtotal ?? 0), 0);
      const slabCommission = sumBreakdownCommission(breakdown);
      const providerFees = sumBreakdownProviderFee(breakdown);
      const convenienceFees = sumBreakdownConvenienceFee(breakdown);
      const deliveryFees = channels.reduce(
        (sum, c) => sum + (c.deliveryFeeTotal ?? 0) + (c.payhereDeliveryFee ?? 0),
        0,
      );
      const weightedRate =
        grossSales > 0 ? Math.round((slabCommission / grossSales) * 10000) / 100 : 0;

      const offlineChannels = ['pickupCash', 'pickupCard'] as const;
      const offlineCollected = offlineChannels.reduce((sum, key) => {
        const row = breakdown[key];
        return sum + (row?.grossSalesTotal ?? row?.revenueSubtotal ?? 0) + (row?.deliveryFeeTotal ?? 0);
      }, 0);

      const netBranchShare = Math.max(
        0,
        grossSales + deliveryFees - providerFees - slabCommission,
      );
      const finalPayout = Math.max(0, netBranchShare - offlineCollected);
      const payoutStatus =
        settlement.storeWithdrawal?.status ??
        (settlement.status === 'VERIFIED' ? 'SETTLED' : settlement.status);

      return {
        id: settlement.id,
        statementRef: settlement.statementRef,
        branchName: settlement.store.name,
        cycleFrom: settlement.periodFrom,
        cycleTo: settlement.periodTo,
        grossSales,
        totalDeliveryFees: deliveryFees,
        payhereFees: providerFees,
        dartcodesCommission: slabCommission,
        lockedSlabRate: weightedRate,
        convenienceFeesCollected: convenienceFees,
        totalDartcodesRevenue: slabCommission + convenienceFees,
        netBranchShare,
        offlineCollected,
        finalPayoutAmount: finalPayout,
        payoutStatus,
        settlementStatus: settlement.status,
      };
    });

    return success(res, { settlements: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
}

export async function getWalletLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        from: dateOnlySchema.optional(),
        to: dateOnlySchema.optional(),
        storeId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
      })
      .parse(req.query);
    const branchStoreId = await resolveBranchStoreId(req);
    if (branchStoreId) query.storeId = branchStoreId;

    const reportRange = resolveReportDayRange(query.from, query.to);
    query.from = reportRange.from;
    query.to = reportRange.to;

    let broughtForward = 0;
    if (query.storeId && query.from) {
      const [priorTxns, priorSettlements] = await Promise.all([
        prisma.walletTransaction.findMany({
          where: {
            storeId: query.storeId,
            createdAt: { lt: reportRange.gte },
          },
          select: { amount: true },
        }),
        prisma.commissionSettlement.findMany({
          where: {
            storeId: query.storeId,
            createdAt: { lt: reportRange.gte },
          },
          select: { totalCommission: true },
        }),
      ]);
      broughtForward = Math.round(
        priorTxns.reduce((sum, t) => sum + decimalFieldToCentsNumber(t.amount) / 100, 0) * 100,
      ) / 100;
      broughtForward -= Math.round(
        priorSettlements.reduce(
          (sum, s) => sum + decimalFieldToCentsNumber(s.totalCommission) / 100,
          0,
        ) * 100,
      ) / 100;
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: {
        ...(query.storeId ? { storeId: query.storeId } : {}),
        createdAt: { gte: reportRange.gte, lte: reportRange.lte },
      },
      include: {
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const settlements = query.storeId
      ? await prisma.commissionSettlement.findMany({
          where: {
            storeId: query.storeId,
            createdAt: { gte: reportRange.gte, lte: reportRange.lte },
          },
          include: { store: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    type DailyOrderCredit = {
      day: string;
      date: Date;
      storeId: string;
      branchName: string;
      creditTotal: number;
      orderIds: Set<string>;
      txnCount: number;
      sortAt: number;
    };

    type DeductionOrOtherRow = {
      date: Date;
      storeId: string;
      branchName: string;
      referenceId: string;
      transactionType: string;
      debit: number;
      credit: number;
      description: string | null;
      sortAt: number;
      isOrderCreditSummary: false;
      transactionId?: string;
      txnType?: string;
    };

    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const labelForTxn = (type: string, amountLkr: number) => {
      if (type === 'ORDER_PAYMENT' || type === 'ORDER_ADDON_PAYMENT') {
        return 'Customer Payment (Inflow)';
      }
      if (type === 'PAYOUT') return 'Branch Payout (Outflow)';
      if (type === 'REFUND') return 'Refund / Fee Deduction (Outflow)';
      if (type === 'ADJUSTMENT') {
        return amountLkr < 0
          ? 'Dartcodes Share Transfer (Outflow)'
          : 'Wallet Adjustment (Inflow)';
      }
      return 'Adjustment';
    };

    const isOrderCreditType = (type: string) =>
      type === 'ORDER_PAYMENT' || type === 'ORDER_ADDON_PAYMENT';

    const dailyCredits = new Map<string, DailyOrderCredit>();
    const otherRows: DeductionOrOtherRow[] = [];

    for (const txn of transactions) {
      const amountLkr = decimalFieldToCentsNumber(txn.amount) / 100;
      const day = dayKey(txn.createdAt);

      if (isOrderCreditType(txn.type) && amountLkr > 0) {
        const key = `${txn.storeId}|${day}`;
        let bucket = dailyCredits.get(key);
        if (!bucket) {
          bucket = {
            day,
            date: startOfDay(txn.createdAt),
            storeId: txn.storeId,
            branchName: txn.store.name,
            creditTotal: 0,
            orderIds: new Set<string>(),
            txnCount: 0,
            // Place daily credit summary before same-day deductions (start of day)
            sortAt: startOfDay(txn.createdAt).getTime(),
          };
          dailyCredits.set(key, bucket);
        }
        bucket.creditTotal += amountLkr;
        bucket.txnCount += 1;
        if (txn.orderId) bucket.orderIds.add(txn.orderId);
        continue;
      }

      // Non-order deductions and any other non-order wallet movements stay as individual rows
      const isInflow = amountLkr >= 0;
      otherRows.push({
        date: txn.createdAt,
        storeId: txn.storeId,
        branchName: txn.store.name,
        referenceId: txn.reference || txn.paymentRef || txn.id.slice(0, 8).toUpperCase(),
        transactionType: labelForTxn(txn.type, amountLkr),
        debit: isInflow ? 0 : Math.abs(amountLkr),
        credit: isInflow ? amountLkr : 0,
        description: txn.description,
        sortAt: txn.createdAt.getTime(),
        isOrderCreditSummary: false,
        transactionId: txn.id,
        txnType: txn.type,
      });
    }

    for (const s of settlements) {
      const grossDebitLkr = decimalFieldToCentsNumber(s.totalCommission) / 100;
      const paybackCreditLkr = decimalFieldToCentsNumber(s.platformPaybackAmount) / 100;
      const periodLabel = `${s.periodFrom.toISOString().slice(0, 10)} → ${s.periodTo.toISOString().slice(0, 10)}`;
      otherRows.push({
        date: s.createdAt,
        storeId: s.storeId,
        branchName: s.store.name,
        referenceId: s.statementRef,
        transactionType: 'Commission Settlement (Outflow)',
        debit: grossDebitLkr,
        credit: 0,
        description: `Gross commission settlement ${periodLabel}`,
        sortAt: s.createdAt.getTime(),
        isOrderCreditSummary: false,
      });
      if (paybackCreditLkr > 0) {
        otherRows.push({
          date: s.createdAt,
          storeId: s.storeId,
          branchName: s.store.name,
          referenceId: `${s.statementRef}-PAYBACK`,
          transactionType: 'Platform Discount Payback (Inflow)',
          debit: 0,
          credit: paybackCreditLkr,
          description: `Platform discount payback ${periodLabel}`,
          sortAt: s.createdAt.getTime() + 1,
          isOrderCreditSummary: false,
        });
      }
    }

    type LedgerBuildRow = {
      date: Date;
      referenceId: string;
      transactionType: string;
      branchName: string;
      debit: number;
      credit: number;
      orderCount: number | null;
      description: string | null;
      sortAt: number;
      sortTie: number;
      transactionId?: string;
      txnType?: string;
    };

    const mixed: LedgerBuildRow[] = [
      ...Array.from(dailyCredits.values()).map((bucket, index) => ({
        date: bucket.date,
        referenceId: `DAILY-${bucket.day}`,
        transactionType: 'Order Credits (Daily Total)',
        branchName: bucket.branchName,
        debit: 0,
        credit: Math.round(bucket.creditTotal * 100) / 100,
        orderCount: bucket.orderIds.size > 0 ? bucket.orderIds.size : bucket.txnCount,
        description: `Daily order credits (${bucket.txnCount} payments)`,
        sortAt: bucket.sortAt,
        sortTie: index,
      })),
      ...otherRows.map((row, index) => ({
        date: row.date,
        referenceId: row.referenceId,
        transactionType: row.transactionType,
        branchName: row.branchName,
        debit: Math.round(row.debit * 100) / 100,
        credit: Math.round(row.credit * 100) / 100,
        orderCount: null as number | null,
        description: row.description,
        sortAt: row.sortAt,
        transactionId: row.transactionId,
        txnType: row.txnType,
        // After daily credit summary for the same timestamp ranking
        sortTie: 1_000_000 + index,
      })),
    ];

    mixed.sort((a, b) => {
      if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
      return a.sortTie - b.sortTie;
    });

    const payoutTxnIds = mixed
      .filter((row) => row.txnType === 'PAYOUT' && row.transactionId)
      .map((row) => row.transactionId!);

    const withdrawalByTxnId = new Map<string, string>();
    if (payoutTxnIds.length > 0) {
      const withdrawals = await prisma.storeWithdrawal.findMany({
        where: { walletTransactionId: { in: payoutTxnIds } },
        select: { id: true, walletTransactionId: true },
      });
      for (const withdrawal of withdrawals) {
        if (withdrawal.walletTransactionId) {
          withdrawalByTxnId.set(withdrawal.walletTransactionId, withdrawal.id);
        }
      }
    }

    let running = broughtForward;
    const rows = mixed.map((row) => {
      running += row.credit - row.debit;
      const transactionId = row.transactionId;
      const withdrawalId =
        transactionId && row.txnType === 'PAYOUT'
          ? withdrawalByTxnId.get(transactionId)
          : undefined;
      return {
        date: row.date,
        referenceId: row.referenceId,
        transactionType: row.transactionType,
        branchName: row.branchName,
        debit: row.debit,
        credit: row.credit,
        orderCount: row.orderCount,
        runningBalance: Math.round(running * 100) / 100,
        description: row.description,
        ...(transactionId ? { transactionId } : {}),
        ...(withdrawalId ? { withdrawalId } : {}),
      };
    });

    const limited = rows.slice(0, query.limit);

    return success(res, {
      ledger: limited,
      count: limited.length,
      closingBalance: rows.length > 0 ? rows[rows.length - 1]!.runningBalance : 0,
      broughtForward,
      meta: { from: reportRange.from, to: reportRange.to, truncated: limited.length < rows.length },
    });
  } catch (err) {
    next(err);
  }
}

type BranchChannelMetric = { amount: number; orders: number };

type StoreChannelBreakdown = {
  pickupCash: BranchChannelMetric;
  pickupCard: BranchChannelMetric;
  pickupOnline: BranchChannelMetric;
  deliveryOnline: BranchChannelMetric;
  totalOrders: number;
  grossSales: number;
  totalDiscount: number;
};

function emptyBranchChannelMetric(): BranchChannelMetric {
  return { amount: 0, orders: 0 };
}

function emptyStoreChannelBreakdown(): StoreChannelBreakdown {
  return {
    pickupCash: emptyBranchChannelMetric(),
    pickupCard: emptyBranchChannelMetric(),
    pickupOnline: emptyBranchChannelMetric(),
    deliveryOnline: emptyBranchChannelMetric(),
    totalOrders: 0,
    grossSales: 0,
    totalDiscount: 0,
  };
}

function addOrderToStoreChannelBreakdown(
  bucket: StoreChannelBreakdown,
  order: {
    total: number;
    orderMode: string;
    paymentMethod: string;
    discount?: number;
    loyaltyDiscount?: number;
    addonAmountLkr?: number;
    addonPaymentMethod?: string;
    subtotal?: number;
    deliveryFee?: number;
    convenientFee?: number;
  },
) {
  bucket.totalOrders += 1;
  bucket.grossSales += order.total;
  bucket.totalDiscount += (order.discount ?? 0) + (order.loyaltyDiscount ?? 0);

  const addonAmount = order.addonAmountLkr ?? 0;
  const primaryAmount = order.total - addonAmount;
  const primaryChannel = orderCommissionChannel(order.orderMode, order.paymentMethod);

  if (primaryChannel === 'pickupCash' && primaryAmount > 0) {
    bucket.pickupCash.amount += primaryAmount;
    bucket.pickupCash.orders += 1;
  } else if (primaryChannel === 'pickupCard' && primaryAmount > 0) {
    bucket.pickupCard.amount += primaryAmount;
    bucket.pickupCard.orders += 1;
  } else if (primaryChannel === 'pickupOnline' && primaryAmount > 0) {
    bucket.pickupOnline.amount += primaryAmount;
    bucket.pickupOnline.orders += 1;
  } else if (primaryChannel === 'deliveryOnline') {
    bucket.deliveryOnline.amount += platformItemSalesLkr(order);
    bucket.deliveryOnline.orders += 1;
  }

  if (addonAmount > 0) {
    if (order.addonPaymentMethod === 'CARD' || order.addonPaymentMethod === 'LOYALTY_POINTS') {
      bucket.pickupCard.amount += addonAmount;
    } else {
      bucket.pickupCash.amount += addonAmount;
    }
  }
}

export async function getTopBranchesChannelBreakdown(req: Request, res: Response, next: NextFunction) {
  try {
    const { period, from, to } = dashboardPeriodQuerySchema.parse(req.query);
    const tier = tierQuerySchema.parse(req.query.tier ?? 'all');
    const now = new Date();
    const selectedRange = resolveSelectedRange(period, now, from, to);
    const paidPeriodWhere = paidSalesWhere({
      createdAt: selectedRange,
    });

    const stores = await prisma.store.findMany({
      where: {
        isActive: true,
        ...(tier === 'top'
          ? { deliveryEnabled: true }
          : tier === 'standard'
            ? { deliveryEnabled: false }
            : {}),
      },
      select: { id: true, name: true, deliveryEnabled: true },
      orderBy: { name: 'asc' },
    });

    const storeIds = stores.map((store) => store.id);
    const orders =
      storeIds.length === 0
        ? []
        : await prisma.order.findMany({
            where: {
              ...paidPeriodWhere,
              storeId: { in: storeIds },
            },
            select: {
              id: true,
              total: true,
              discount: true,
              loyaltyDiscount: true,
              orderMode: true,
              paymentMethod: true,
              storeId: true,
              subtotal: true,
              deliveryFee: true,
              convenientFee: true,
            },
          });

    const addonMap = await fetchOrderAddonMap(orders.map((order) => order.id));
    const enrichedOrders = enrichOrdersWithAddonPayments(orders, addonMap);

    const breakdownByStore = new Map<string, StoreChannelBreakdown>();
    for (const store of stores) {
      breakdownByStore.set(store.id, emptyStoreChannelBreakdown());
    }

    for (const order of enrichedOrders) {
      const bucket = breakdownByStore.get(order.storeId);
      if (!bucket) continue;
      addOrderToStoreChannelBreakdown(bucket, order);
    }

    const refunds =
      storeIds.length === 0
        ? []
        : await prisma.refund.findMany({
            where: {
              status: 'COMPLETE',
              OR: [{ processedAt: selectedRange }, { processedAt: null, createdAt: selectedRange }],
              order: { storeId: { in: storeIds } },
            },
            select: {
              refundAmount: true,
              order: { select: { storeId: true } },
            },
          });

    const refundByStore = new Map<string, number>();
    for (const refund of refunds) {
      const storeId = refund.order.storeId;
      if (!storeId) continue;
      refundByStore.set(storeId, (refundByStore.get(storeId) ?? 0) + (refund.refundAmount ?? 0));
    }

    const branches = stores
      .map((store) => {
        const breakdown = breakdownByStore.get(store.id) ?? emptyStoreChannelBreakdown();
        return {
          storeId: store.id,
          branchName: store.name,
          tier: store.deliveryEnabled ? ('top' as const) : ('standard' as const),
          totalOrders: breakdown.totalOrders,
          grossSales: breakdown.grossSales,
          pickupCash: breakdown.pickupCash,
          pickupCard: breakdown.pickupCard,
          pickupOnline: breakdown.pickupOnline,
          deliveryOnline: breakdown.deliveryOnline,
          totalDiscount: breakdown.totalDiscount,
          totalRefunds: refundByStore.get(store.id) ?? 0,
        };
      })
      .sort((a, b) => b.grossSales - a.grossSales || b.totalOrders - a.totalOrders);

    return success(res, {
      period,
      branches,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid custom date range') {
      next(new AppError('Invalid custom date range', 400));
      return;
    }
    next(err);
  }
}
