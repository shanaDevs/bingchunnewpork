'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import {
  Coffee,
  Download,
  ShoppingBag,
  TrendingUp,
  Wallet,
  BarChart2,
} from 'lucide-react';

import BrandHourlyActivityChart, {
  BrandHourlyPeriodBadge,
} from '@/components/admin/brand-sales/BrandHourlyActivityChart';
import BrandCompactSection from '@/components/admin/brand-sales/BrandCompactSection';
import BrandCommandKpiCard from '@/components/admin/brand-sales/BrandCommandKpiCard';
import BrandOrderStatusDonut from '@/components/admin/brand-sales/BrandOrderStatusDonut';
import BrandSalesDiscountsChart from '@/components/admin/brand-sales/BrandSalesDiscountsChart';
import BranchGrossRevenueBreakdownDonut from '@/components/admin/branch-sales/BranchGrossRevenueBreakdownDonut';
import BranchOrderModeStackedChart from '@/components/admin/BranchOrderModeStackedChart';
import BranchOrderSummaryChart from '@/components/admin/BranchOrderSummaryChart';
import BrandSalesOverviewChart from '@/components/admin/BrandSalesOverviewChart';
import {
  BranchSalesCustomerListSkeleton,
  BranchSalesPageSkeleton,
  BranchSalesProductListSkeleton,
} from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import DashboardPeriodFilter, {
  buildBranchAnalyticsUrl,
  buildDashboardStatsUrl,
  formatDashboardPeriodLabel,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import DashboardTabularAmount from '@/components/admin/DashboardTabularAmount';
import PaymentChannelBreakdownCards from '@/components/admin/PaymentChannelBreakdownCards';
import {
  BRANCH_PAYMENT_CHANNEL_CARDS,
  paymentChannelCardsWithoutDelivery,
} from '@/components/admin/paymentChannelCardConfig';
import TopCustomersModal from '@/components/admin/TopCustomersModal';
import TopSellingProductsModal from '@/components/admin/TopSellingProductsModal';
import ProductImage from '@/components/ui/ProductImage';
import { getAdminSession, isBranchScoped, isPickupOnlyBranchAdmin, type AdminSession } from '@/lib/adminAuth';
import { BRAND_ACCENT_LINK_CLASS } from '@/lib/brandSalesChartColors';
import {
  branchProductGrossSales,
  buildBranchGrossRevenueBreakdown,
  buildBranchSalesOverviewPoints,
  buildSalesVsDiscountSeries,
} from '@/lib/branchSalesOverview';
import { adminFetch } from '@/lib/brandSalesReportApi';
import { formatMoney } from '@/lib/receipt';
import {
  SALES_LEADERBOARD_PREVIEW,
  takeSalesLeaderboardPreview,
} from '@/lib/salesLeaderboard';

type BranchAnalytics = {
  period: DashboardPeriod;
  kpiCards: {
    grossSales: number;
    productGrossSales?: number;
    totalOrders: number;
    totalDeliveryRevenue: number;
    totalConvenienceRevenue: number;
    avgOrderValue: number;
    avgOrderValueNote?: string;
    gatewayFee: number;
    commissionFee: number;
    grossAfterFees: number;
    netRevenueLabel?: string;
    commissionNote?: string;
  };
  orderSummaryChart: Array<{
    label: string;
    delivery: number;
    pickupCash: number;
    pickupOnline: number;
    pickupCard: number;
  }>;
  orderModeChart: Array<{
    label: string;
    delivery: number;
    pickup: number;
  }>;
  paymentChannelBreakdown: {
    pickupCashTotal: number;
    pickupCashCount: number;
    pickupCardTotal: number;
    pickupCardCount: number;
    pickupOnlineTotal: number;
    pickupOnlineCount: number;
    deliveryOnlineTotal: number;
    deliveryOnlineCount: number;
  };
  hourlyPeakTimes: Array<{ hour: number; label: string; orders: number; revenue: number }>;
  dartcodesPayments: {
    periodCommission: number;
    totalOwed: number;
    effectiveSlabRate: number;
    lastSettledAt: string | null;
    pendingSettlementCount: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    imageUrl: string | null;
    basePrice: number;
    quantity: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    rank: number;
    name: string;
    phone?: string;
    email?: string;
    orders: number;
    totalSpend: number;
  }>;
  discountsByMonth?: Array<{ month: string; totalDiscount: number }>;
  refundByMonth?: Array<{ month: string; count: number; amountLkr: number }>;
};

type DashboardCupsPayload = {
  periodCups?: number;
};

export default function BranchSalesPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [topCustomersOpen, setTopCustomersOpen] = useState(false);
  const [topProductsOpen, setTopProductsOpen] = useState(false);

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isBranchScoped(session)) {
      router.replace('/admin');
      return;
    }
    setAdmin(session);
  }, [router]);

  const pickupOnly = isPickupOnlyBranchAdmin(admin);
  const channelCards = pickupOnly
    ? paymentChannelCardsWithoutDelivery(BRANCH_PAYMENT_CHANNEL_CARDS)
    : BRANCH_PAYMENT_CHANNEL_CARDS;

  const customReady = period !== 'custom' || !!(customRange?.from && customRange?.to);
  const periodLabel = formatDashboardPeriodLabel(period, customRange);

  const { data, isLoading, isFetching } = useQuery<BranchAnalytics>({
    queryKey: [
      'branch-analytics',
      admin?.storeId,
      period,
      customRange?.from?.toISOString() ?? null,
      customRange?.to?.toISOString() ?? null,
    ],
    queryFn: () => adminFetch(buildBranchAnalyticsUrl(period, customRange)),
    enabled: !!admin?.storeId && customReady,
    refetchInterval: 60_000,
  });

  const { data: dashboardStats, isLoading: cupsLoading } = useQuery<DashboardCupsPayload>({
    queryKey: [
      'branch-sales-period-cups',
      admin?.storeId,
      period,
      customRange?.from?.toISOString() ?? null,
      customRange?.to?.toISOString() ?? null,
    ],
    queryFn: () => adminFetch(buildDashboardStatsUrl(period, customRange)),
    enabled: !!admin?.storeId && customReady,
    refetchInterval: 60_000,
  });

  const branchLabel =
    admin?.storeName?.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || 'Your branch';

  const salesOverview = useMemo(
    () =>
      buildBranchSalesOverviewPoints({
        orderSummaryChart: data?.orderSummaryChart ?? [],
        refundByMonth: data?.refundByMonth ?? [],
        commissionFee: data?.kpiCards?.commissionFee ?? 0,
        gatewayFee: data?.kpiCards?.gatewayFee ?? 0,
        pickupOnly,
      }),
    [data?.orderSummaryChart, data?.refundByMonth, data?.kpiCards, pickupOnly],
  );

  const salesVsDiscount = useMemo(
    () => buildSalesVsDiscountSeries(salesOverview, data?.discountsByMonth ?? []),
    [salesOverview, data?.discountsByMonth],
  );

  const revenueBreakdown = useMemo(() => {
    if (!data?.kpiCards) {
      return { productSales: 0, delivery: 0, convenience: 0, other: 0 };
    }
    return buildBranchGrossRevenueBreakdown(data.kpiCards, pickupOnly);
  }, [data?.kpiCards, pickupOnly]);

  const orderStatus = useMemo(() => {
    const completed = data?.kpiCards.totalOrders ?? 0;
    return {
      completed,
      preparing: 0,
      pending: 0,
      cancelled: 0,
      total: completed,
    };
  }, [data?.kpiCards.totalOrders]);

  function exportSummary() {
    if (!data) return;
    const rows = [
      ['Metric', 'Value'],
      ['Gross Sales (products)', branchProductGrossSales(data.kpiCards)],
      ['Total Orders', data.kpiCards.totalOrders],
      ...(!pickupOnly
        ? [['Delivery Revenue', data.kpiCards.totalDeliveryRevenue] as [string, number]]
        : []),
      ['Convenience Revenue', data.kpiCards.totalConvenienceRevenue],
      ['Avg Order Value (incl. delivery & convenience)', data.kpiCards.avgOrderValue],
      ['Commission Fee', data.kpiCards.commissionFee],
      ['Gateway Fee', data.kpiCards.gatewayFee],
      ['After Fees (est.)', data.kpiCards.grossAfterFees],
      ['DartCodes Commission', data.dartcodesPayments.periodCommission],
      [],
      ['Top Product', 'Quantity', 'Revenue'],
      ...data.topProducts.map((p) => [p.productName, p.quantity, p.revenue]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `branch-sales-${period}.csv`;
    a.click();
  }

  if (!admin) {
    return <BranchSalesPageSkeleton />;
  }

  const loading = isLoading || isFetching;
  const chartsLoading = loading && !data;
  const totalCups = dashboardStats?.periodCups ?? 0;
  const visibleCustomers = takeSalesLeaderboardPreview(data?.topCustomers);
  const visibleProducts = takeSalesLeaderboardPreview(data?.topProducts);
  const hasMoreCustomers = (data?.topCustomers?.length ?? 0) > SALES_LEADERBOARD_PREVIEW;
  const hasMoreProducts = (data?.topProducts?.length ?? 0) > SALES_LEADERBOARD_PREVIEW;

  return (
    <div className="admin-dashboard mx-auto max-w-[1680px] space-y-3 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-fg">{branchLabel} — Sales Overview</h1>
          <p className="mt-0.5 text-xs text-muted">
            Branch performance, product demand, and customer behavior
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={setCustomRange}
            compact
            showPresetDates
          />
          <button
            type="button"
            onClick={exportSummary}
            disabled={!data}
            className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download size={13} />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BrandCommandKpiCard
          icon={TrendingUp}
          title="Total Gross Sales"
          value={data ? formatMoney(branchProductGrossSales(data.kpiCards)) : '—'}
          loading={chartsLoading}
        />
        <BrandCommandKpiCard
          icon={ShoppingBag}
          title="Total Orders"
          value={data ? data.kpiCards.totalOrders.toLocaleString() : '—'}
          loading={chartsLoading}
        />
        <BrandCommandKpiCard
          icon={Coffee}
          title="Total Cups Sold"
          value={totalCups.toLocaleString()}
          loading={cupsLoading && dashboardStats == null}
        />
        <BrandCommandKpiCard
          icon={Wallet}
          title="Average Order Value"
          value={data ? formatMoney(data.kpiCards.avgOrderValue) : '—'}
          loading={chartsLoading}
        />
      </div>

      <BrandCompactSection
        title="Total Revenue"
        subtitle={`Revenue and outflow · ${periodLabel}`}
        action={<span className="text-[11px] font-medium text-muted">{periodLabel}</span>}
      >
        <BrandSalesOverviewChart data={salesOverview} loading={chartsLoading} compact />
      </BrandCompactSection>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BrandCompactSection
          title="Sales vs Discount"
          subtitle={`Gross sales and discounts · ${periodLabel}`}
          action={<span className="text-[11px] font-medium text-muted">{periodLabel}</span>}
        >
          <BrandSalesDiscountsChart data={salesVsDiscount} loading={chartsLoading} />
        </BrandCompactSection>

        <BrandCompactSection title="Revenue Breakdown" subtitle={`Sales by category · ${periodLabel}`}>
          <BranchGrossRevenueBreakdownDonut
            data={revenueBreakdown}
            loading={chartsLoading}
            hideDelivery={pickupOnly}
          />
        </BrandCompactSection>

        <BrandCompactSection
          title="Order Status"
          subtitle="Paid orders in the selected period"
          className="md:col-span-2 xl:col-span-1"
        >
          <BrandOrderStatusDonut data={orderStatus} loading={chartsLoading} />
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <BrandCompactSection
          title="Delivery vs Pickup Orders"
          subtitle={`Compare order types · ${periodLabel}`}
          action={<span className="text-[11px] font-medium text-muted">{periodLabel}</span>}
        >
          <BranchOrderModeStackedChart
            data={data?.orderModeChart ?? []}
            periodLabel={periodLabel}
            loading={chartsLoading}
            hideDelivery={pickupOnly}
            compact
          />
        </BrandCompactSection>

        <BrandCompactSection
          title="Order Summary & Payment Channels"
          subtitle={`Orders and revenue by payment method · ${periodLabel}`}
          action={<span className="text-[11px] font-medium text-muted">{periodLabel}</span>}
        >
          <BranchOrderSummaryChart
            data={data?.orderSummaryChart ?? []}
            periodLabel={periodLabel}
            loading={chartsLoading}
            hideDelivery={pickupOnly}
            compact
          />
          <div className="mt-3">
            <PaymentChannelBreakdownCards
              cards={channelCards}
              breakdown={data?.paymentChannelBreakdown}
              loading={chartsLoading}
            />
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BrandCompactSection
          title="Hourly Order Activity"
          subtitle={`Orders throughout the day · ${periodLabel}`}
          icon={BarChart2}
          action={<BrandHourlyPeriodBadge label={periodLabel} />}
        >
          <BrandHourlyActivityChart data={data?.hourlyPeakTimes ?? []} loading={chartsLoading} />
        </BrandCompactSection>

        <BrandCompactSection title="Top Customers" subtitle={`Top 5 by total spend · ${periodLabel}`}>
          {chartsLoading ? (
            <BranchSalesCustomerListSkeleton />
          ) : (data?.topCustomers.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No customer data in this period</p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="space-y-2">
                {visibleCustomers.map((customer) => (
                  <div
                    key={`${customer.rank}-${customer.phone ?? customer.name}`}
                    className="flex items-center gap-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#307ef2]/10 text-[11px] font-bold text-[#307ef2]">
                      #{customer.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{customer.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        <DashboardTabularAmount>{customer.orders}</DashboardTabularAmount> {customer.orders === 1 ? 'order' : 'orders'}
                        {customer.phone ? ` · ${customer.phone}` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                      <DashboardTabularAmount>{formatMoney(customer.totalSpend)}</DashboardTabularAmount>
                    </p>
                  </div>
                ))}
              </div>
              {hasMoreCustomers ? (
                <button
                  type="button"
                  onClick={() => setTopCustomersOpen(true)}
                  className={`mt-auto pt-3 text-left ${BRAND_ACCENT_LINK_CLASS}`}
                >
                  View more
                </button>
              ) : null}
            </div>
          )}
        </BrandCompactSection>

        <BrandCompactSection
          title="Top Selling Products"
          subtitle={`Top ${SALES_LEADERBOARD_PREVIEW} by quantity sold · ${periodLabel}`}
          className="md:col-span-2 xl:col-span-1"
        >
          {chartsLoading ? (
            <BranchSalesProductListSkeleton />
          ) : (data?.topProducts.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No product sales in this period</p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="space-y-2">
                {visibleProducts.map((product, index) => (
                  <div key={product.productId} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-[#307ef2]">
                      #{index + 1}
                    </span>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-navy-light/30">
                      <ProductImage
                        name={product.productName}
                        imageUrl={product.imageUrl}
                        className="h-full w-full"
                        contain
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{product.productName}</p>
                      <p className="text-[11px] font-semibold tabular-nums text-muted">
                        <DashboardTabularAmount>{formatMoney(product.revenue)}</DashboardTabularAmount>
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                      <DashboardTabularAmount>{product.quantity}</DashboardTabularAmount> sold
                    </p>
                  </div>
                ))}
              </div>
              {hasMoreProducts ? (
                <button
                  type="button"
                  onClick={() => setTopProductsOpen(true)}
                  className={`mt-auto pt-3 text-left ${BRAND_ACCENT_LINK_CLASS}`}
                >
                  View more
                </button>
              ) : null}
            </div>
          )}
        </BrandCompactSection>
      </div>

      <TopCustomersModal
        open={topCustomersOpen}
        onClose={() => setTopCustomersOpen(false)}
        customers={data?.topCustomers ?? []}
        periodLabel={periodLabel}
      />
      <TopSellingProductsModal
        open={topProductsOpen}
        onClose={() => setTopProductsOpen(false)}
        products={data?.topProducts ?? []}
        periodLabel={periodLabel}
      />
    </div>
  );
}
