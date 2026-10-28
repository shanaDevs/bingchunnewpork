import { prisma } from './prisma';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { walletBalanceCents } from './walletApiMoney';
import { normalizeProductImageUrl, productImageUrl } from './productImages';
import { computeBranchPayablesSummary } from './walletService';
import { getOutgoingFlowsForDashboard, sumJasonInvestedLkrForRange } from './walletAnalysis';
import { dateStringInColombo } from './datetime';
import { chartBucketLabel } from './dashboardStatsDateRange';
import { resolveCustomerDisplayName } from './customerName';
import { promiseAllLimited } from '../utils/promiseAllLimited';
import {
  aggregateHourlySales,
  aggregatePaidRevenueByBucket,
  summarizeRevenueChannelsForScope,
} from './dashboardOrderAggregates';
import type { DashboardStatsContext } from './dashboardStatsTypes';
import {
  buildCustomerGrowth,
  buildDiscountsByParty,
  buildRiderStaffStatus,
  fetchTopDeliveryRidersForDashboard,
  loadBranchMonthlyRefundOutflow,
  loadSuperAdminMonthlyCashflow,
} from './dashboardStatsHelpers';
import { aggregateTopRefundBranches } from './refundAnalytics';

export async function buildDashboardStatsFull(ctx: DashboardStatsContext) {
  const {
    scope,
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
  } = ctx;

  const [
      todayOrders,
      todayRevenue,
      totalUsers,
      activeOrders,
      periodOrders,
      periodRevenueAgg,
      pendingPaymentAgg,
      cancelledOrders,
      deliveryAgg,
      takeawayAgg,
      pickupOnlineAgg,
      pickupStoreAgg,
      branchGroups,
      productGroups,
      deliveryProductGroups,
      pickupProductGroups,
      paymentGroups,
      recentOrders,
      wallets,
      stuckReceived,
      periodCupsAgg,
      onlineWalletBalanceAgg,
      periodRefundAgg,
    ] = await promiseAllLimited(4, [
      () => prisma.order.count({ where: { ...scope, createdAt: todayRange } }),
      () => prisma.order.aggregate({
        where: { ...scope, createdAt: todayRange, paymentStatus: 'PAID' },
        _sum: { total: true },
      }),
      () => isBranchAdmin
        ? Promise.resolve(0)
        : prisma.user.count({ where: { deletedAt: null } }),
      () => prisma.order.count({
        where: {
          ...scope,
          status: { in: ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] },
        },
      }),
      () => prisma.order.count({ where: { ...scope, ...periodWhere } }),
      () => prisma.order.aggregate({
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.aggregate({
        where: {
          ...scope,
          ...periodWhere,
          paymentStatus: 'PENDING',
          status: { not: 'CANCELLED' },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.count({
        where: { ...scope, ...periodWhere, status: 'CANCELLED' },
      }),
      () => prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.aggregate({
        where: { ...paidPeriodWhere, orderMode: 'TAKEAWAY' },
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.aggregate({
        where: {
          ...paidPeriodWhere,
          orderMode: 'TAKEAWAY',
          paymentMethod: { in: ['PAYHERE', 'CARD'] },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.aggregate({
        where: {
          ...paidPeriodWhere,
          orderMode: 'TAKEAWAY',
          paymentMethod: { notIn: ['PAYHERE', 'CARD'] },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.groupBy({
        by: ['storeId'],
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      () => prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: paidPeriodWhere,
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 50,
      }),
      () => prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: { ...paidPeriodWhere, orderMode: 'DELIVERY' },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      () => prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: { ...paidPeriodWhere, orderMode: 'TAKEAWAY' },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      () => prisma.order.groupBy({
        by: ['paymentMethod'],
        where: paidPeriodWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
      () => prisma.order.findMany({
        where: { ...scope, ...periodWhere },
        select: {
          id: true,
          orderNumber: true,
          orderMode: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          total: true,
          createdAt: true,
          guestName: true,
          guestPhone: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      () => prisma.storeWallet.findMany({
        where: isBranchAdmin ? { storeId: scope.storeId } : undefined,
        include: { store: { select: { id: true, name: true, city: true } } },
        orderBy: { balance: 'desc' },
        take: isBranchAdmin ? 1 : 8,
      }),
      () => prisma.order.count({
        where: {
          ...scope,
          status: { in: ['RECEIVED', 'PREPARING'] },
          createdAt: { lt: new Date(now.getTime() - 30 * 60 * 1000) },
        },
      }),
      () => prisma.orderItem.aggregate({
        where: { order: paidPeriodWhere },
        _sum: { quantity: true },
      }),
      () => prisma.storeWallet.aggregate({
        where: isBranchAdmin && scope.storeId ? { storeId: scope.storeId } : undefined,
        _sum: { balance: true },
      }),
      () => isBranchAdmin && !scope.storeId
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
    ]);

        const [monthlyRevenueBuckets, hourlySales, revenueChannels] = await Promise.all([
      aggregatePaidRevenueByBucket(
        {
          storeId: scope.storeId,
          createdAtGte: monthlyChart.gte,
          createdAtLte: monthlyChart.lte,
        },
        monthlyChart.granularity,
      ),
      aggregateHourlySales(paidSalesScope),
      summarizeRevenueChannelsForScope(paidSalesScope),
    ]);
    const { peakHours, hourlyHeatmap } = hourlySales;

    const storeIds = branchGroups.map((b) => b.storeId);
    const stores = storeIds.length
      ? await prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true, city: true },
        })
      : [];
    const storeMap = new Map(stores.map((s) => [s.id, s]));

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

    const cashflowByKey = isBranchAdmin
      ? null
      : await loadSuperAdminMonthlyCashflow(monthlyChart);
    const branchRefundOutflowByKey =
      isBranchAdmin && scope.storeId
        ? await loadBranchMonthlyRefundOutflow(scope.storeId, monthlyChart)
        : null;

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

    const periodRevenue = periodRevenueAgg._sum.total || 0;
    const periodPaidCount = periodRevenueAgg._count.id || 0;
    const periodRefundAmount = periodRefundAgg._sum.refundAmount || 0;
    const jasonInvestedAmount = isBranchAdmin ? 0 : await sumJasonInvestedLkrForRange(selectedRange);
    const pendingPayment = pendingPaymentAgg._count.id || 0;
    const unpaidPaymentAmount = pendingPaymentAgg._sum.total || 0;

    const branches = branchGroups.map((b, i) => {
      const store = storeMap.get(b.storeId);
      return {
        rank: i + 1,
        storeId: b.storeId,
        storeName: store?.name?.replace('Bing Chun - ', '') ?? 'Unknown',
        city: store?.city ?? '',
        orders: b._count.id,
        revenue: b._sum.total || 0,
      };
    });

    const topProductNames = [
      ...new Set([
        ...productGroups.map((p) => p.productName),
        deliveryProductGroups[0]?.productName,
        pickupProductGroups[0]?.productName,
      ].filter((name): name is string => Boolean(name))),
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

    const [customerUserGroups, customerGuestGroups] = await Promise.all([
      prisma.order.groupBy({
        by: ['userId'],
        where: { ...paidPeriodWhere, userId: { not: null } },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 12,
      }),
      prisma.order.groupBy({
        by: ['guestPhone'],
        where: { ...paidPeriodWhere, userId: null, guestPhone: { not: null } },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 12,
      }),
    ]);

    const customerUserIds = customerUserGroups
      .map((g) => g.userId)
      .filter((id): id is string => !!id);
    const guestPhones = customerGuestGroups
      .map((g) => g.guestPhone)
      .filter((p): p is string => !!p);

    const [customerUsers, guestNameRows] = await Promise.all([
      customerUserIds.length
        ? prisma.user.findMany({
            where: { id: { in: customerUserIds } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
      guestPhones.length
        ? prisma.order.findMany({
            where: { guestPhone: { in: guestPhones }, guestName: { not: null } },
            distinct: ['guestPhone'],
            select: { guestPhone: true, guestName: true },
          })
        : Promise.resolve([]),
    ]);

    const customerUserMap = new Map(customerUsers.map((u) => [u.id, u]));
    const guestNameMap = new Map(
      guestNameRows.map((g) => [g.guestPhone!, g.guestName!]),
    );

    const topCustomers = [
      ...customerUserGroups.map((g) => {
        const user = customerUserMap.get(g.userId!);
        return {
          name: user?.name ?? 'Customer',
          phone: user?.phone,
          orders: g._count.id,
          revenue: g._sum.total || 0,
        };
      }),
      ...customerGuestGroups.map((g) => ({
        name: resolveCustomerDisplayName({
          guestName: guestNameMap.get(g.guestPhone!),
          phone: g.guestPhone,
        }),
        phone: g.guestPhone ?? undefined,
        orders: g._count.id,
        revenue: g._sum.total || 0,
      })),
    ]
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
      .slice(0, 8)
      .map((c, i) => ({ rank: i + 1, ...c }));

    const topDeliveryRiders = await fetchTopDeliveryRidersForDashboard(scope, selectedRange);
    const topRiders = topDeliveryRiders.map((rider) => ({
      rank: rider.rank,
      driverId: rider.riderId,
      name: rider.riderName,
      completedJobs: rider.completedJobs,
      deliveredOrders: rider.distinctOrders,
    }));

    const paymentTotal = paymentGroups.reduce((s, p) => s + (p._sum.total || 0), 0);
    const byPaymentMethod = paymentGroups.map((p) => ({
      method: p.paymentMethod,
      revenue: p._sum.total || 0,
      count: p._count.id,
      percent: paymentTotal > 0 ? Math.round(((p._sum.total || 0) / paymentTotal) * 100) : 0,
    }));

    const onlineWalletBalance = decimalFieldToCentsNumber(onlineWalletBalanceAgg._sum.balance);

    const branchPayables = await computeBranchPayablesSummary(
      isBranchAdmin && scope.storeId ? scope.storeId : undefined,
    );

    const walletBalances = wallets.map((w) => ({
      storeId: w.store.id,
      storeName: w.store.name.replace('Bing Chun - ', ''),
      city: w.store.city,
      balance: walletBalanceCents(w),
    }));

    const totalPayable = branchPayables.totalRemaining;

    const needsAttention: Array<{ type: string; label: string; count: number; href: string; tone: string }> = [];
    if (activeOrders > 0) {
      needsAttention.push({
        type: 'active',
        label: 'Orders in progress',
        count: activeOrders,
        href: '/admin/orders',
        tone: 'blue',
      });
    }
    if (pendingPayment > 0) {
      needsAttention.push({
        type: 'pending',
        label: 'Unpaid orders',
        count: pendingPayment,
        href: '/admin/orders',
        tone: 'yellow',
      });
    }
    if (stuckReceived > 0) {
      needsAttention.push({
        type: 'stuck',
        label: 'Waiting 30+ min (received)',
        count: stuckReceived,
        href: '/admin/orders',
        tone: 'orange',
      });
    }
    if (!isBranchAdmin && branchPayables.branchesWithPayable > 0) {
      needsAttention.push({
        type: 'wallet',
        label: 'Branches with outstanding payables',
        count: branchPayables.branchesWithPayable,
        href: '/admin/wallet',
        tone: 'green',
      });
    }

    const deliveryRevenue = deliveryAgg._sum.total || 0;
    const pickupOnlineRevenue = pickupOnlineAgg._sum.total || 0;
    const pickupStoreRevenue = pickupStoreAgg._sum.total || 0;
    const [customerGrowth, riderStaffStatus, discountsByParty, outflowByMethod, topRefundBranches] =
      await Promise.all([
        buildCustomerGrowth(scope, paidPeriodWhere),
        buildRiderStaffStatus(scope),
        buildDiscountsByParty(paidPeriodWhere),
        isBranchAdmin
          ? Promise.resolve(undefined)
          : getOutgoingFlowsForDashboard({
              from: dateStringInColombo(selectedRange.gte),
              to: dateStringInColombo(selectedRange.lte),
            }),
        isBranchAdmin ? Promise.resolve(undefined) : aggregateTopRefundBranches(selectedRange),
      ]);

    return {
      period,
      dateFrom: period === 'custom' ? from : undefined,
      dateTo: period === 'custom' ? to : undefined,
      todayOrders,
      todayRevenue: todayRevenue._sum.total || 0,
      totalUsers,
      activeOrders,
      periodOrders,
      periodCups: periodCupsAgg._sum.quantity || 0,
      periodRevenue,
      periodRefundAmount,
      jasonInvestedAmount,
      periodPaidCount,
      pendingPayment,
      unpaidPaymentAmount,
      onlineWalletBalance,
      cancelledOrders,
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
      revenueChannels,
      monthlyOverview,
      peakHours,
      hourlyHeatmap,
      branches,
      topProducts: topProducts.slice(0, 50),
      topDeliveryProduct,
      topPickupProduct,
      topCustomers,
      topRiders,
      topDeliveryRiders,
      customerGrowth,
      riderStaffStatus,
      discountsByParty,
      ...(isBranchAdmin ? {} : { outflowByMethod: outflowByMethod ?? [], topRefundBranches: topRefundBranches ?? [] }),
      byPaymentMethod,
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
      walletBalances,
      totalPayable,
      needsAttention,
      recentOrders,
    };
}
