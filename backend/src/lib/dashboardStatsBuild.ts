import { Request } from 'express';
import { resolveBranchStoreId, isBranchScopedRole } from '../middleware/auth';
import { prisma } from './prisma';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { computeBranchPayablesSummary } from './walletService';
import { aggregateTopRefundBranches } from './refundAnalytics';
import { getOutgoingFlowsForDashboard, sumJasonInvestedLkrForRange } from './walletAnalysis';
import { dateStringInColombo } from './datetime';
import { normalizeProductImageUrl, productImageUrl } from './productImages';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import {
  aggregatePaidRevenueByBucket,
  summarizeRevenueChannelsForScope,
  type PaidSalesScope,
} from './dashboardOrderAggregates';
import {
  chartBucketLabel,
  paidSalesWhere,
  periodRange,
  resolveChartRange,
  resolveSelectedRange,
} from './dashboardStatsDateRange';
import { buildDashboardStatsFull } from './dashboardStatsFull';
import {
  buildDiscountsByParty,
  fetchTopDeliveryRidersForDashboard,
  loadBranchMonthlyRefundOutflow,
  loadSuperAdminMonthlyCashflow,
} from './dashboardStatsHelpers';
import type {
  DashboardPeriod,
  DashboardStatsContext,
  DashboardStatsTier,
} from './dashboardStatsTypes';

export type { DashboardPeriod, DashboardStatsContext, DashboardStatsTier } from './dashboardStatsTypes';

type DashboardTopRiderRow = Awaited<
  ReturnType<typeof fetchTopDeliveryRidersForDashboard>
>[number];

function mapDashboardTopRiders(topDeliveryRiders: DashboardTopRiderRow[]) {
  return topDeliveryRiders.map((rider) => ({
    rank: rider.rank,
    driverId: rider.riderId,
    name: rider.riderName,
    completedJobs: rider.completedJobs,
    deliveredOrders: rider.distinctOrders,
  }));
}

export async function createDashboardStatsContext(
  req: Request,
  period: DashboardPeriod,
  from?: string,
  to?: string,
): Promise<DashboardStatsContext> {
  const storeId = await resolveBranchStoreId(req);
  const scope = storeId ? { storeId } : {};
  let pickupOnlyQueue = false;
  if (storeId) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { deliveryEnabled: true },
    });
    pickupOnlyQueue = store?.deliveryEnabled === false;
  }
  const isBranchAdmin = isBranchScopedRole(req.user?.role);
  const now = new Date();
  const todayRange = periodRange('today', now);
  const selectedRange = resolveSelectedRange(period, now, from, to);
  const periodWhere = { createdAt: selectedRange };
  const monthlyChart = resolveChartRange(period, selectedRange, now);
  const paidPeriodWhere = paidSalesWhere({
    ...scope,
    ...periodWhere,
  });
  const paidSalesScope: PaidSalesScope = {
    storeId: scope.storeId,
    createdAtGte: selectedRange.gte,
    createdAtLte: selectedRange.lte,
  };

  return {
    scope,
    pickupOnlyQueue,
    isBranchAdmin,
    period,
    from,
    to,
    now,
    todayRange,
    selectedRange,
    periodWhere,
    monthlyChart,
    paidPeriodWhere,
    paidSalesScope,
  };
}

export async function buildDashboardStatsAll(ctx: DashboardStatsContext) {
  return buildDashboardStatsFull(ctx);
}

export async function buildDashboardSuperSummary(ctx: DashboardStatsContext) {
  const { scope, isBranchAdmin, period, from, to, selectedRange, periodWhere, paidPeriodWhere, paidSalesScope } =
    ctx;

  const [
    periodOrders,
    periodRevenueAgg,
    cancelledOrders,
    deliveryAgg,
    takeawayAgg,
    pickupOnlineAgg,
    pickupStoreAgg,
    onlineWalletBalanceAgg,
    periodRefundAgg,
    revenueChannels,
  ] = await promiseAllLimited(4, [
    () => prisma.order.count({ where: { ...scope, ...periodWhere } }),
    () =>
      prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
    () =>
      prisma.order.count({
        where: { ...scope, ...periodWhere, status: 'CANCELLED' },
      }),
    () =>
      prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        _sum: { total: true },
        _count: { id: true },
      }),
    () =>
      prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'TAKEAWAY' },
        _sum: { total: true },
        _count: { id: true },
      }),
    () =>
      prisma.order.aggregate({
        where: {
          ...paidPeriodWhere,
          orderMode: 'TAKEAWAY',
          paymentMethod: { in: ['PAYHERE', 'CARD'] },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
    () =>
      prisma.order.aggregate({
        where: {
          ...paidPeriodWhere,
          orderMode: 'TAKEAWAY',
          paymentMethod: { notIn: ['PAYHERE', 'CARD'] },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
    () =>
      prisma.storeWallet.aggregate({
        where: isBranchAdmin && scope.storeId ? { storeId: scope.storeId } : undefined,
        _sum: { balance: true },
      }),
    () =>
      isBranchAdmin && !scope.storeId
        ? Promise.resolve({ _sum: { refundAmount: null } })
        : prisma.refund.aggregate({
            where: {
              status: 'COMPLETE',
              ...(scope.storeId ? { order: { is: { storeId: scope.storeId } } } : {}),
              OR: [
                { processedAt: selectedRange },
                { processedAt: null, createdAt: selectedRange },
              ],
            },
            _sum: { refundAmount: true },
          }),
    () => summarizeRevenueChannelsForScope(paidSalesScope),
  ]);

  const periodRevenue = periodRevenueAgg._sum.total || 0;
  const periodPaidCount = periodRevenueAgg._count.id || 0;
  const periodRefundAmount = periodRefundAgg._sum.refundAmount || 0;
  const onlineWalletBalance = decimalFieldToCentsNumber(onlineWalletBalanceAgg._sum.balance);

  const branchPayables = await computeBranchPayablesSummary(
    isBranchAdmin && scope.storeId ? scope.storeId : undefined,
  );
  const totalPayable = branchPayables.totalRemaining;

  const deliveryRevenue = deliveryAgg._sum.total || 0;
  const pickupOnlineRevenue = pickupOnlineAgg._sum.total || 0;
  const pickupStoreRevenue = pickupStoreAgg._sum.total || 0;

  return {
    period,
    dateFrom: period === 'custom' ? from : undefined,
    dateTo: period === 'custom' ? to : undefined,
    periodOrders,
    periodRevenue,
    periodPaidCount,
    periodRefundAmount,
    cancelledOrders,
    onlineWalletBalance,
    totalPayable,
    revenueChannels,
    delivery: {
      orders: deliveryAgg._count.id,
      revenue: deliveryRevenue,
    },
    takeaway: {
      orders: takeawayAgg._count.id,
      revenue: takeawayAgg._sum.total || 0,
    },
    revenueBreakdown: {
      delivery: deliveryRevenue,
      pickupOnline: pickupOnlineRevenue,
      pickupStore: pickupStoreRevenue,
    },
    byMode: {
      DELIVERY: {
        orders: deliveryAgg._count.id,
        revenue: deliveryAgg._sum.total || 0,
      },
      TAKEAWAY: {
        orders: takeawayAgg._count.id,
        revenue: takeawayAgg._sum.total || 0,
      },
    },
  };
}

type DashboardPaymentMethodGroup = {
  paymentMethod: string;
  _sum: { total: number | null };
  _count: { id: number };
};

export async function buildDashboardCharts(ctx: DashboardStatsContext) {
  const { scope, isBranchAdmin, monthlyChart, paidPeriodWhere } = ctx;

  const chartTasks: Array<
    () => Promise<
      | Map<string, { revenue: number; orders: number }>
      | DashboardPaymentMethodGroup[]
      | Map<string, { inflow: number; outflow: number }>
      | Map<string, number>
      | null
    >
  > = [
    () =>
      aggregatePaidRevenueByBucket(
        {
          storeId: scope.storeId,
          createdAtGte: monthlyChart.gte,
          createdAtLte: monthlyChart.lte,
        },
        monthlyChart.granularity,
      ),
    async (): Promise<DashboardPaymentMethodGroup[]> => {
      const rows = await prisma.order.groupBy({
        by: ['paymentMethod'],
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      });
      return rows as DashboardPaymentMethodGroup[];
    },
  ];

  if (!isBranchAdmin) {
    chartTasks.push(() => loadSuperAdminMonthlyCashflow(monthlyChart));
  } else if (scope.storeId) {
    chartTasks.push(() => loadBranchMonthlyRefundOutflow(scope.storeId!, monthlyChart));
  }

  const chartResults = await promiseAllLimited(4, chartTasks);
  const monthlyRevenueBuckets = chartResults[0] as Map<string, { revenue: number; orders: number }>;
  const paymentGroups = chartResults[1] as DashboardPaymentMethodGroup[];
  const cashflowByKey = !isBranchAdmin
    ? (chartResults[2] as Map<string, { inflow: number; outflow: number }> | undefined)
    : null;
  const branchRefundOutflowByKey =
    isBranchAdmin && scope.storeId
      ? (chartResults[2] as Map<string, number> | undefined)
      : null;

  const monthlyMap = new Map<string, { revenue: number; orders: number }>();
  for (const key of monthlyChart.keys) {
    monthlyMap.set(key, { revenue: 0, orders: 0 });
  }
  for (const key of monthlyChart.keys) {
    const aggregated = monthlyRevenueBuckets.get(key);
    if (!aggregated) continue;
    const bucket = monthlyMap.get(key);
    if (bucket) {
      bucket.revenue = aggregated.revenue;
      bucket.orders = aggregated.orders;
    }
  }

  const monthlyOverview = [...monthlyMap.entries()].map(([key, v]) => {
    const point: {
      month: string;
      revenue: number;
      orders: number;
      inflow?: number;
      outflow?: number;
    } = {
      month: chartBucketLabel(key, monthlyChart.granularity),
      revenue: v.revenue,
      orders: v.orders,
    };
    if (cashflowByKey) {
      const cashflow = cashflowByKey.get(key) ?? { inflow: 0, outflow: 0 };
      point.inflow = cashflow.inflow;
      point.outflow = cashflow.outflow;
    } else if (branchRefundOutflowByKey) {
      point.outflow = branchRefundOutflowByKey.get(key) ?? 0;
    }
    return point;
  });

  const paymentTotal = paymentGroups.reduce((s, p) => s + (p._sum.total || 0), 0);
  const byPaymentMethod = paymentGroups.map((p) => ({
    method: p.paymentMethod,
    revenue: p._sum.total || 0,
    count: p._count.id,
    percent: paymentTotal > 0 ? Math.round(((p._sum.total || 0) / paymentTotal) * 100) : 0,
  }));

  return {
    monthlyOverview,
    byPaymentMethod,
  };
}

export async function buildDashboardChartsWallet(ctx: DashboardStatsContext) {
  const { scope, isBranchAdmin, selectedRange } = ctx;

  if (isBranchAdmin) {
    const topDeliveryRiders = await fetchTopDeliveryRidersForDashboard(scope, selectedRange);
    return { topDeliveryRiders, topRiders: mapDashboardTopRiders(topDeliveryRiders) };
  }

  const [outflowByMethod, topRefundBranches, topDeliveryRiders] = await promiseAllLimited(4, [
    () =>
      getOutgoingFlowsForDashboard({
        from: dateStringInColombo(selectedRange.gte),
        to: dateStringInColombo(selectedRange.lte),
      }),
    () => aggregateTopRefundBranches(selectedRange),
    () => fetchTopDeliveryRidersForDashboard(scope, selectedRange),
  ]);

  return {
    outflowByMethod: outflowByMethod ?? [],
    topRefundBranches: topRefundBranches ?? [],
    topDeliveryRiders,
    topRiders: mapDashboardTopRiders(topDeliveryRiders),
  };
}

export async function buildDashboardDetails(ctx: DashboardStatsContext) {
  const { isBranchAdmin, paidPeriodWhere, selectedRange } = ctx;

  const [productGroups, deliveryProductGroups, pickupProductGroups, discountsByParty, jasonInvestedAmount] =
    await promiseAllLimited(4, [
      () =>
        prisma.orderItem.groupBy({
          by: ['productName'],
          where: {
            order: paidPeriodWhere,
          },
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 50,
        }),
      () =>
        prisma.orderItem.groupBy({
          by: ['productName'],
          where: {
            order: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
          },
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 1,
        }),
      () =>
        prisma.orderItem.groupBy({
          by: ['productName'],
          where: {
            order: { ...paidPeriodWhere, orderMode: 'TAKEAWAY' },
          },
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 1,
        }),
      () => buildDiscountsByParty(paidPeriodWhere),
      () =>
        isBranchAdmin ? Promise.resolve(0) : sumJasonInvestedLkrForRange(selectedRange),
    ]);

  const topProductNames = [
    ...new Set(
      [
        ...productGroups.map((p) => p.productName),
        deliveryProductGroups[0]?.productName,
        pickupProductGroups[0]?.productName,
      ].filter((name): name is string => Boolean(name)),
    ),
  ];
  const topProductRows = topProductNames.length
    ? await prisma.product.findMany({
        where: { name: { in: topProductNames } },
        select: { name: true, imageUrl: true, basePrice: true },
      })
    : [];
  const productMetaByName = new Map(
    topProductRows.map((p) => [
      p.name,
      {
        imageUrl: normalizeProductImageUrl(p.imageUrl) ?? productImageUrl(p.name) ?? null,
        basePrice: p.basePrice,
      },
    ]),
  );

  const topProducts = productGroups.map((p) => {
    const meta = productMetaByName.get(p.productName);
    const quantity = p._sum.quantity || 0;
    const revenue = p._sum.totalPrice || 0;
    return {
      productName: p.productName,
      quantity,
      revenue,
      basePrice: meta?.basePrice ?? (quantity > 0 ? Math.round(revenue / quantity) : 0),
      imageUrl: meta?.imageUrl ?? productImageUrl(p.productName) ?? null,
    };
  });

  const deliveryTop = deliveryProductGroups[0];
  const topDeliveryProduct = deliveryTop
    ? {
        productName: deliveryTop.productName,
        quantity: deliveryTop._sum.quantity || 0,
        revenue: deliveryTop._sum.totalPrice || 0,
        basePrice:
          productMetaByName.get(deliveryTop.productName)?.basePrice ??
          (deliveryTop._sum.quantity
            ? Math.round((deliveryTop._sum.totalPrice || 0) / deliveryTop._sum.quantity)
            : 0),
        imageUrl:
          productMetaByName.get(deliveryTop.productName)?.imageUrl ??
          productImageUrl(deliveryTop.productName) ??
          null,
      }
    : null;

  const pickupTop = pickupProductGroups[0];
  const topPickupProduct = pickupTop
    ? {
        productName: pickupTop.productName,
        quantity: pickupTop._sum.quantity || 0,
        revenue: pickupTop._sum.totalPrice || 0,
        basePrice:
          productMetaByName.get(pickupTop.productName)?.basePrice ??
          (pickupTop._sum.quantity
            ? Math.round((pickupTop._sum.totalPrice || 0) / pickupTop._sum.quantity)
            : 0),
        imageUrl:
          productMetaByName.get(pickupTop.productName)?.imageUrl ??
          productImageUrl(pickupTop.productName) ??
          null,
      }
    : null;

  return {
    jasonInvestedAmount,
    discountsByParty,
    topProducts: topProducts.slice(0, 50),
    topDeliveryProduct,
    topPickupProduct,
  };
}

export async function buildDashboardStatsForTier(
  ctx: DashboardStatsContext,
  tier: DashboardStatsTier,
) {
  if (tier === 'summary') {
    return buildDashboardSuperSummary(ctx);
  }
  if (tier === 'charts') {
    return buildDashboardCharts(ctx);
  }
  if (tier === 'charts-wallet') {
    return buildDashboardChartsWallet(ctx);
  }
  if (tier === 'details') {
    return buildDashboardDetails(ctx);
  }
  return buildDashboardStatsAll(ctx);
}
