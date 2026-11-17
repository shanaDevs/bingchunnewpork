'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { BarChart2 } from 'lucide-react';

import BranchDeliveryPickupBarChart from '@/components/admin/BranchDeliveryPickupBarChart';
import BrandOrderSummaryByBranchChart from '@/components/admin/BrandOrderSummaryByBranchChart';
import BranchProfitLossCard from '@/components/admin/BranchProfitLossCard';
import type { BranchPerformanceRow } from '@/components/admin/BranchSalesPerformanceTable';
import TopBranchesChannelTable, {
  type TopBranchesChannelRow,
} from '@/components/admin/brand-sales/TopBranchesChannelTable';
import MonthlyDeliveryOrdersChart, {
  type MonthlyDeliveryPoint,
} from '@/components/admin/MonthlyDeliveryOrdersChart';
import MonthPickerSelect, {
  currentMonthKey,
  formatMonthKeyLabel,
} from '@/components/admin/MonthPickerSelect';
import YearSelect from '@/components/admin/YearSelect';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import BrandSalesOverviewChart from '@/components/admin/BrandSalesOverviewChart';
import BrandCompactSection from '@/components/admin/brand-sales/BrandCompactSection';
import PaymentChannelBreakdownCards from '@/components/admin/PaymentChannelBreakdownCards';
import {
  BRAND_PAYMENT_CHANNEL_CARDS,
  paymentChannelCardsWithoutDelivery,
} from '@/components/admin/paymentChannelCardConfig';
import BrandRankLeaderboardCard from '@/components/admin/brand-sales/BrandRankLeaderboardCard';
import BrandRankTable from '@/components/admin/brand-sales/BrandRankTable';
import BrandRankTabToggle from '@/components/admin/brand-sales/BrandRankTabToggle';
import BrandHourlyActivityChart, {
  BrandHourlyPeriodBadge,
  sumHeatmapByHour,
} from '@/components/admin/brand-sales/BrandHourlyActivityChart';
import BrandOrderStatusDonut from '@/components/admin/brand-sales/BrandOrderStatusDonut';
import BrandSalesDiscountsChart from '@/components/admin/brand-sales/BrandSalesDiscountsChart';
import CustomerBehaviorDonutChart from '@/components/admin/CustomerBehaviorDonutChart';
import OrderPlatformDonutChart from '@/components/admin/OrderPlatformDonutChart';
import TopCustomersModal from '@/components/admin/TopCustomersModal';
import TopSellingProductsModal from '@/components/admin/TopSellingProductsModal';
import TopTierScorecardGrid, {
  ScorecardPagination,
  TOP_TIER_SCORECARD_PAGE_SIZE,
} from '@/components/admin/TopTierScorecardGrid';
import {
  formatDashboardPeriodLabel,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { shortBranchName } from '@/lib/branchName';
import {
  adminFetch,
  buildBrandAnalyticsUrl,
  buildHourlyPeakHeatmapUrl,
  buildMonthlyDeliveryOrdersUrl,
  buildTierAnalyticsUrl,
  buildTopBranchesChannelBreakdownUrl,
  buildTopCustomersUrl,
} from '@/lib/brandSalesReportApi';
import { BRAND_ACCENT_LINK_CLASS } from '@/lib/brandSalesChartColors';
import { formatMoney } from '@/lib/receipt';
import {
  SALES_LEADERBOARD_PREVIEW,
  takeSalesLeaderboardPreview,
} from '@/lib/salesLeaderboard';

export type BrandTabTier = 'all' | 'top' | 'standard';

export type BrandAnalyticsPayload = {
  period: DashboardPeriod;
  kpiCards?: {
    grossSales: number;
    totalOrders: number;
    totalCups?: number;
    totalDeliveryRevenue: number;
    totalConvenienceRevenue?: number;
    gatewayFee?: number;
    commissionFee?: number;
    grossAfterFees?: number;
    netRevenue?: number;
    deliveryOrders?: number;
    pickupOrders?: number;
  };
  kpiComparison?: {
    grossSales: { current: number; previous: number; changePercent: number };
    totalOrders: { current: number; previous: number; changePercent: number };
    totalCups: { current: number; previous: number; changePercent: number };
    averageOrderValue: { current: number; previous: number; changePercent: number };
  };
  revenueBreakdown?: { delivery: number; pickup: number };
  orderStatus?: {
    completed: number;
    preparing: number;
    pending: number;
    cancelled: number;
    total: number;
  };
  profitLoss?: {
    productSalesRevenue: number;
    deliveryRevenue: number;
    convenienceRevenue: number;
    dartcodesCommission: number;
    payhereGatewayFees: number;
    netTakeHome: number;
  };
  salesOverview?: Array<{ period: string; revenue: number; orders: number; discount?: number }>;
  branchDeliveryPickup?: Array<{ storeId: string; branchName: string; delivery: number; pickup: number }>;
  branchPerformance?: BranchPerformanceRow[];
  leastPerformingBranches?: Array<BranchPerformanceRow & { rank: number; percentBelowAverage: number }>;
  orderSummaryByBranch?: Array<{
    label: string;
    delivery: number;
    pickupCash: number;
    pickupOnline: number;
    pickupCard: number;
    orderCount?: number;
    grossSales?: number;
  }>;
  paymentChannelBreakdown?: {
    pickupCashTotal: number;
    pickupCashCount: number;
    pickupCardTotal: number;
    pickupCardCount: number;
    pickupOnlineTotal: number;
    pickupOnlineCount: number;
    deliveryOnlineTotal: number;
    deliveryOnlineCount: number;
  };
  orderPlatform?: {
    webCount: number;
    mobileCount: number;
    webPercent: number;
    mobilePercent: number;
  };
  topProducts?: Array<{
    productId: string;
    productName: string;
    imageUrl: string | null;
    basePrice: number;
    quantity: number;
    revenue: number;
  }>;
  leastProducts?: Array<{
    productId: string;
    productName: string;
    imageUrl: string | null;
    basePrice: number;
    quantity: number;
    revenue: number;
  }>;
  topProductCategories?: Array<{
    categoryId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  topCustomers?: Array<{
    rank: number;
    name: string;
    phone?: string;
    email?: string;
    orders: number;
    totalSpend: number;
    homeBranch: string;
  }>;
  topCustomersByOrders?: Array<{
    rank: number;
    name: string;
    phone?: string;
    email?: string;
    orders: number;
    totalSpend: number;
    homeBranch: string;
  }>;
  customerBehavior?: {
    firstTimeBuyers: number;
    loyalCustomers: number;
    firstTimePercent: number;
    loyalPercent: number;
  };
  hourlyPeakTimes?: Array<{ hour: number; label: string; orders: number; revenue: number }>;
  hourlyHeatmap?: Array<{ day: number; hour: number; orders: number; revenue: number }>;
  stores?: Array<{ id: string; name: string; deliveryEnabled?: boolean; tier?: string }>;
  topTierScorecards?: Array<{
    rank: number;
    storeId: string;
    branchName: string;
    totalOrders: number;
    grossSales: number;
    deliveryPercent: number;
    netTakeHome: number;
    pickupOrders?: number;
    pickupAmount?: number;
    deliveryOrders?: number;
    deliveryAmount?: number;
  }>;
  platformReviews?: {
    avgRating: number | null;
    totalCount: number;
    distribution: Array<{ stars: 1 | 2 | 3 | 4 | 5; count: number }>;
    recentComments: Array<{ stars: number; comment: string; createdAt: string }>;
  };
  tierSummary?: {
    topTier: { branchCount: number; avgSalesPerBranch: number };
    standardTier: { branchCount: number; avgSalesPerBranch: number };
  };
};

const BEHAVIOR_CHART_COLORS = { firstTime: '#6366f1', loyal: '#ec4899' } as const;
const PLATFORM_CHART_COLORS = { web: '#307ef2', mobile: '#f97316' } as const;

type Props = {
  tier: BrandTabTier;
  data?: BrandAnalyticsPayload;
  loading: boolean;
  period: DashboardPeriod;
  customRange?: DateRange;
  periodLabel: string;
  branchPeriod: DashboardPeriod;
  branchCustomRange?: DateRange;
  onBranchPeriodChange: (p: Exclude<DashboardPeriod, 'custom'>) => void;
  onBranchCustomRangeChange: (r: DateRange | undefined) => void;
  branchRows: BranchPerformanceRow[];
  branchLoading: boolean;
  leastPerforming?: BrandAnalyticsPayload['leastPerformingBranches'];
  peakStoreId: string;
  onPeakStoreChange: (id: string) => void;
  showProfitLoss?: boolean;
  showPlatformBehavior?: boolean;
  showScorecards?: boolean;
  showHourlyPeak?: boolean;
  showTopCustomers?: boolean;
};

export default function BrandSalesTabPanel({
  tier,
  data,
  loading,
  period,
  customRange,
  periodLabel,
  branchPeriod,
  branchCustomRange,
  onBranchPeriodChange,
  onBranchCustomRangeChange,
  branchRows,
  branchLoading,
  leastPerforming,
  peakStoreId,
  onPeakStoreChange,
  showProfitLoss = false,
  showPlatformBehavior = false,
  showScorecards = false,
  showHourlyPeak = true,
  showTopCustomers = false,
}: Props) {
  const [topCustomersOpen, setTopCustomersOpen] = useState(false);
  const [topProductsOpen, setTopProductsOpen] = useState(false);
  const [leastProductsOpen, setLeastProductsOpen] = useState(false);
  const [hourlyPeakMonth, setHourlyPeakMonth] = useState(currentMonthKey);
  const [hourlyPeakStoreId, setHourlyPeakStoreId] = useState('');
  const [monthlyDeliveryYear, setMonthlyDeliveryYear] = useState(() => new Date().getFullYear());
  const [customerStoreId, setCustomerStoreId] = useState('');
  const [productStoreId, setProductStoreId] = useState('');
  const [branchLeaderboardStoreId, setBranchLeaderboardStoreId] = useState('');
  const [scorecardPage, setScorecardPage] = useState(0);
  const [productRank, setProductRank] = useState<'top' | 'least'>('top');
  const [customerRank, setCustomerRank] = useState<'spend' | 'orders'>('spend');
  const [branchRank, setBranchRank] = useState<'top' | 'least'>('top');

  const scorecards = data?.topTierScorecards ?? [];
  const scorecardTotalPages = Math.max(1, Math.ceil(scorecards.length / TOP_TIER_SCORECARD_PAGE_SIZE));
  const scorecardSafePage = Math.min(scorecardPage, scorecardTotalPages - 1);
  const visibleScorecards = useMemo(
    () =>
      scorecards.slice(
        scorecardSafePage * TOP_TIER_SCORECARD_PAGE_SIZE,
        (scorecardSafePage + 1) * TOP_TIER_SCORECARD_PAGE_SIZE,
      ),
    [scorecards, scorecardSafePage],
  );

  useEffect(() => {
    setScorecardPage(0);
  }, [scorecards.length, period, tier, customRange?.from?.toISOString(), customRange?.to?.toISOString()]);

  useEffect(() => {
    if (scorecardPage !== scorecardSafePage) setScorecardPage(scorecardSafePage);
  }, [scorecardPage, scorecardSafePage]);

  const customPeriodReady = period !== 'custom' || !!(customRange?.from && customRange?.to);
  const branchCustomPeriodReady =
    branchPeriod !== 'custom' || !!(branchCustomRange?.from && branchCustomRange?.to);

  const { data: channelBreakdownData, isLoading: channelBreakdownLoading } = useQuery<{
    branches: TopBranchesChannelRow[];
  }>({
    queryKey: [
      'top-branches-channel-breakdown',
      tier,
      branchPeriod,
      branchCustomRange?.from?.toISOString() ?? null,
      branchCustomRange?.to?.toISOString() ?? null,
    ],
    queryFn: () =>
      adminFetch(
        buildTopBranchesChannelBreakdownUrl(
          branchPeriod,
          branchCustomRange,
          tier === 'all' ? 'all' : tier,
        ),
      ),
    enabled: branchCustomPeriodReady,
    refetchInterval: 60_000,
  });

  const useTierHourlyPeakFilters = showHourlyPeak && (tier === 'top' || tier === 'standard');
  const showMonthlyDeliveryChart = showHourlyPeak && tier === 'top';

  const tierStores = useMemo(() => {
    const stores = data?.stores ?? [];
    if (tier === 'top') return stores.filter((s) => s.tier === 'top' || s.deliveryEnabled);
    if (tier === 'standard') return stores.filter((s) => s.tier === 'standard' || !s.deliveryEnabled);
    return stores;
  }, [data?.stores, tier]);

  const sortedTierStores = useMemo(
    () =>
      [...tierStores].sort((a, b) =>
        shortBranchName(a.name).localeCompare(shortBranchName(b.name)),
      ),
    [tierStores],
  );

  const hourlyPeakMonthLabel = formatMonthKeyLabel(hourlyPeakMonth);
  const hourlyPeakAllBranchesLabel =
    tier === 'top' ? 'All delivery branches' : 'All pickup-only branches';
  const hourlyPeakBranchLabel = hourlyPeakStoreId
    ? shortBranchName(sortedTierStores.find((store) => store.id === hourlyPeakStoreId)?.name ?? '')
    : hourlyPeakAllBranchesLabel;

  const { data: hourlyPeakData, isLoading: hourlyPeakLoading } = useQuery<{
    hourlyHeatmap: BrandAnalyticsPayload['hourlyHeatmap'];
  }>({
    queryKey: ['hourly-peak-heatmap', tier, hourlyPeakMonth, hourlyPeakStoreId || null],
    queryFn: () =>
      adminFetch(
        buildHourlyPeakHeatmapUrl(
          tier as 'top' | 'standard',
          hourlyPeakMonth,
          hourlyPeakStoreId || undefined,
        ),
      ),
    enabled: useTierHourlyPeakFilters,
  });

  const { data: monthlyDeliveryData, isLoading: monthlyDeliveryLoading } = useQuery<{
    year: number;
    monthlyDeliveryOrders: MonthlyDeliveryPoint[];
  }>({
    queryKey: ['monthly-delivery-orders', tier, monthlyDeliveryYear],
    queryFn: () => adminFetch(buildMonthlyDeliveryOrdersUrl('top', monthlyDeliveryYear)),
    enabled: showMonthlyDeliveryChart,
  });

  const sortedAllStores = useMemo(
    () =>
      [...(data?.stores ?? [])].sort((a, b) =>
        shortBranchName(a.name).localeCompare(shortBranchName(b.name)),
      ),
    [data?.stores],
  );

  const customerBranchLabel = customerStoreId
    ? shortBranchName(sortedAllStores.find((store) => store.id === customerStoreId)?.name ?? '')
    : 'All Branches';

  const leaderboardProductsUrl =
    tier === 'top'
      ? buildTierAnalyticsUrl('top', period, customRange, productStoreId || undefined)
      : tier === 'standard'
        ? buildTierAnalyticsUrl('standard', period, customRange, productStoreId || undefined)
        : buildBrandAnalyticsUrl(period, customRange, productStoreId || undefined);

  const { data: leaderboardProductsData, isLoading: leaderboardProductsLoading } = useQuery<
    Pick<BrandAnalyticsPayload, 'topProducts' | 'leastProducts'>
  >({
    queryKey: [
      'brand-leaderboard-products',
      tier,
      period,
      customRange?.from?.toISOString(),
      customRange?.to?.toISOString(),
      productStoreId || null,
    ],
    queryFn: () => adminFetch(leaderboardProductsUrl),
    enabled: customPeriodReady,
  });

  const { data: topCustomersData, isLoading: topCustomersLoading } = useQuery<{
    topCustomers: NonNullable<BrandAnalyticsPayload['topCustomers']>;
    topCustomersByOrders: NonNullable<BrandAnalyticsPayload['topCustomersByOrders']>;
  }>({
    queryKey: [
      'top-customers',
      period,
      customRange?.from?.toISOString(),
      customRange?.to?.toISOString(),
      customerStoreId || null,
    ],
    queryFn: () =>
      adminFetch(buildTopCustomersUrl(period, customRange, customerStoreId || undefined)),
    enabled: showTopCustomers && customPeriodReady,
  });

  const productBranchLabel = productStoreId
    ? shortBranchName(sortedAllStores.find((store) => store.id === productStoreId)?.name ?? '')
    : 'All Branches';

  const leaderboardBranchSelect = (value: string, onChange: (storeId: string) => void) => (
    <SearchableBranchSelect
      stores={sortedAllStores}
      value={value}
      onChange={onChange}
      formatName={shortBranchName}
      allowAll
      placeholder="All Branches"
      compact
      className="min-w-0 max-w-[10rem] shrink-0"
    />
  );

  const behaviorChartData = useMemo(() => {
    if (!data?.customerBehavior) return [];
    return [
      { key: 'firstTime', label: 'First-time buyers', value: data.customerBehavior.firstTimeBuyers, percent: data.customerBehavior.firstTimePercent, fill: BEHAVIOR_CHART_COLORS.firstTime },
      { key: 'loyal', label: 'Loyal customers', value: data.customerBehavior.loyalCustomers, percent: data.customerBehavior.loyalPercent, fill: BEHAVIOR_CHART_COLORS.loyal },
    ].filter((i) => i.value > 0);
  }, [data?.customerBehavior]);

  const platformChartData = useMemo(() => {
    if (!data?.orderPlatform) return [];
    const { webCount, mobileCount, webPercent, mobilePercent } = data.orderPlatform;
    return [
      { key: 'web', label: 'Web', count: webCount, percent: webPercent, fill: PLATFORM_CHART_COLORS.web },
      { key: 'mobile', label: 'Mobile App', count: mobileCount, percent: mobilePercent, fill: PLATFORM_CHART_COLORS.mobile },
    ];
  }, [data?.orderPlatform]);

  const salesBreakdownLines = useMemo(() => {
    if (!data?.profitLoss) return [];
    const lines: Array<{ label: string; amount: number }> = [];
    if (data.profitLoss.productSalesRevenue > 0) lines.push({ label: 'Product sales', amount: data.profitLoss.productSalesRevenue });
    if (data.profitLoss.deliveryRevenue > 0) lines.push({ label: 'Delivery revenue', amount: data.profitLoss.deliveryRevenue });
    if (data.profitLoss.convenienceRevenue > 0) lines.push({ label: 'Convenience revenue', amount: data.profitLoss.convenienceRevenue });
    return lines;
  }, [data?.profitLoss]);

  const channelCards =
    tier === 'standard'
      ? paymentChannelCardsWithoutDelivery(BRAND_PAYMENT_CHANNEL_CARDS)
      : BRAND_PAYMENT_CHANNEL_CARDS;
  const hourlySeries = useMemo(() => {
    if (useTierHourlyPeakFilters) {
      return sumHeatmapByHour(hourlyPeakData?.hourlyHeatmap ?? []);
    }
    if ((data?.hourlyPeakTimes ?? []).length > 0) return data?.hourlyPeakTimes ?? [];
    return sumHeatmapByHour(data?.hourlyHeatmap ?? []);
  }, [useTierHourlyPeakFilters, hourlyPeakData?.hourlyHeatmap, data?.hourlyPeakTimes, data?.hourlyHeatmap]);
  const leaderboardProducts = leaderboardProductsData ?? data;
  const spendCustomers = topCustomersData?.topCustomers ?? data?.topCustomers ?? [];
  const orderCustomers = topCustomersData?.topCustomersByOrders ?? data?.topCustomersByOrders ?? [];
  const previewSpendCustomers = takeSalesLeaderboardPreview(spendCustomers);
  const previewOrderCustomers = takeSalesLeaderboardPreview(orderCustomers);
  const activeCustomerList = customerRank === 'spend' ? spendCustomers : orderCustomers;
  const previewProductList = takeSalesLeaderboardPreview(
    productRank === 'top'
      ? leaderboardProducts?.topProducts
      : leaderboardProducts?.leastProducts,
  );
  const fullProductList =
    productRank === 'top'
      ? leaderboardProducts?.topProducts ?? []
      : leaderboardProducts?.leastProducts ?? [];
  const branchRowsForLeaderboard = useMemo(() => {
    if (!branchLeaderboardStoreId) return branchRows;
    return branchRows.filter((row) => row.storeId === branchLeaderboardStoreId);
  }, [branchRows, branchLeaderboardStoreId]);
  const topBranches = useMemo(
    () => [...branchRowsForLeaderboard].sort((a, b) => b.grossSales - a.grossSales).slice(0, 5),
    [branchRowsForLeaderboard],
  );
  const leastBranches = useMemo(() => {
    if (branchLeaderboardStoreId) {
      return [...branchRowsForLeaderboard].sort((a, b) => a.grossSales - b.grossSales).slice(0, 5);
    }
    if (leastPerforming && leastPerforming.length > 0) {
      return leastPerforming.slice(0, 5);
    }
    return [...branchRowsForLeaderboard].sort((a, b) => a.grossSales - b.grossSales).slice(0, 5);
  }, [branchLeaderboardStoreId, branchRowsForLeaderboard, leastPerforming]);

  return (
    <div className="space-y-3">
      {showProfitLoss && (
        <div className="grid gap-3 xl:grid-cols-12 xl:items-stretch">
          <div className="xl:col-span-4">
            <BranchProfitLossCard
              lines={salesBreakdownLines}
              grossSales={data?.kpiCards?.grossSales ?? 0}
              totalOrders={data?.kpiCards?.totalOrders ?? 0}
              periodLabel={periodLabel}
              loading={loading}
            />
          </div>
          {showPlatformBehavior && (
            <>
              <BrandCompactSection title="Order Platform" subtitle="Web vs mobile app" className="xl:col-span-4">
                {platformChartData.every((i) => i.count === 0) ? (
                  <p className="text-sm text-muted">No platform data</p>
                ) : (
                  <OrderPlatformDonutChart data={platformChartData} loading={loading} />
                )}
              </BrandCompactSection>
              <BrandCompactSection title="Customer Behavior" subtitle="First-time vs loyal" className="xl:col-span-4">
                {behaviorChartData.length === 0 ? (
                  <p className="text-sm text-muted">No customer data</p>
                ) : (
                  <CustomerBehaviorDonutChart data={behaviorChartData} loading={loading} />
                )}
              </BrandCompactSection>
            </>
          )}
        </div>
      )}

      {showScorecards && (
        <BrandCompactSection
          title="Delivery Branch Scorecards"
          subtitle="Delivery-enabled branches ranked by sales"
          action={
            scorecards.length > TOP_TIER_SCORECARD_PAGE_SIZE ? (
              <ScorecardPagination
                page={scorecardSafePage}
                totalPages={scorecardTotalPages}
                onPageChange={setScorecardPage}
              />
            ) : null
          }
        >
          <TopTierScorecardGrid cards={visibleScorecards} loading={loading} />
        </BrandCompactSection>
      )}

      {showMonthlyDeliveryChart && (
        <BrandCompactSection
          title="Delivery Orders by Month"
          subtitle={`Completed paid delivery orders · ${monthlyDeliveryYear}`}
          action={
            <YearSelect
              value={monthlyDeliveryYear}
              onChange={setMonthlyDeliveryYear}
              className="min-w-[5.5rem]"
            />
          }
        >
          <MonthlyDeliveryOrdersChart
            data={monthlyDeliveryData?.monthlyDeliveryOrders ?? []}
            year={monthlyDeliveryYear}
            loading={monthlyDeliveryLoading}
            compact
          />
        </BrandCompactSection>
      )}

      <BrandCompactSection title="Total Revenue" subtitle={`Revenue and outflow · ${periodLabel}`}>
        <BrandSalesOverviewChart data={data?.salesOverview ?? []} loading={loading} compact />
      </BrandCompactSection>

      <BrandCompactSection
        id="brand-branch-sales-performance"
        title="Branch Sales Performance"
        subtitle={
          tier === 'standard'
            ? 'Pickup only branches'
            : tier === 'top'
              ? 'Delivery & pickup branches'
              : `Compare performance across all branches · ${formatDashboardPeriodLabel(branchPeriod, branchCustomRange)}`
        }
      >
        <TopBranchesChannelTable
          rows={channelBreakdownData?.branches ?? []}
          period={branchPeriod}
          customRange={branchCustomRange}
          onPeriodChange={onBranchPeriodChange}
          onCustomRangeChange={onBranchCustomRangeChange}
          loading={channelBreakdownLoading && !channelBreakdownData}
          tierFilter={tier === 'all' ? 'all' : tier}
          showTierColumn={tier === 'all'}
          hideDeliveryOnline={tier === 'standard'}
          paginate
          pageSize={10}
        />
      </BrandCompactSection>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {tier !== 'standard' ? (
          <BrandCompactSection
            title="Delivery vs Pickup by Branch"
            subtitle={
              tier === 'all'
                ? `Top 10 branches by order count · ${periodLabel}`
                : `Delivery & pickup · ${periodLabel}`
            }
          >
            <BranchDeliveryPickupBarChart
              data={data?.branchDeliveryPickup ?? []}
              loading={loading}
              maxBranches={tier === 'all' ? 10 : undefined}
              compact
            />
          </BrandCompactSection>
        ) : (
          <BrandCompactSection title="Pickup Orders by Branch" subtitle={`Top 10 pickup-only branches · ${periodLabel}`}>
            <BranchDeliveryPickupBarChart
              data={(data?.branchDeliveryPickup ?? []).map((row) => ({ ...row, delivery: 0 }))}
              loading={loading}
              maxBranches={10}
              compact
            />
          </BrandCompactSection>
        )}

        <BrandCompactSection
          title="Order Summary & Payment Channels"
          subtitle={
            tier === 'standard'
              ? `Top 10 pickup-only branches by gross sales · ${periodLabel}`
              : tier === 'top'
                ? `Top 10 delivery branches by gross sales · ${periodLabel}`
                : `Top 10 branches by gross sales · ${periodLabel}`
          }
        >
          <BrandOrderSummaryByBranchChart
            data={data?.orderSummaryByBranch ?? []}
            periodLabel={periodLabel}
            loading={loading}
            pickupOnly={tier === 'standard'}
            maxBranches={10}
            sortBy="revenue"
            compact
          />
          <div className="mt-3">
            <PaymentChannelBreakdownCards
              cards={channelCards}
              breakdown={data?.paymentChannelBreakdown}
              loading={loading}
            />
          </div>
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        {showHourlyPeak ? (
          <BrandCompactSection
            className="xl:col-span-2"
            title="Hourly Order Activity"
            icon={BarChart2}
            subtitle={
              useTierHourlyPeakFilters
                ? `Orders throughout the day · ${hourlyPeakMonthLabel}`
                : `Orders throughout the day · ${periodLabel}`
            }
            action={
              useTierHourlyPeakFilters ? (
                <BrandHourlyPeriodBadge label={hourlyPeakMonthLabel} />
              ) : (
                <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                  <BrandHourlyPeriodBadge label={periodLabel} />
                  <SearchableBranchSelect
                    stores={tierStores}
                    value={peakStoreId}
                    onChange={onPeakStoreChange}
                    formatName={shortBranchName}
                    className="min-w-[8rem]"
                  />
                </div>
              )
            }
          >
            {useTierHourlyPeakFilters && (
              <div className="mb-3 flex flex-nowrap items-center gap-2">
                <MonthPickerSelect
                  value={hourlyPeakMonth}
                  onChange={setHourlyPeakMonth}
                  className="min-w-0 flex-1"
                />
                <SearchableBranchSelect
                  stores={sortedTierStores}
                  value={hourlyPeakStoreId}
                  onChange={setHourlyPeakStoreId}
                  formatName={shortBranchName}
                  allowAll
                  placeholder={hourlyPeakAllBranchesLabel}
                  className="min-w-0 flex-1"
                />
              </div>
            )}
            <BrandHourlyActivityChart
              data={hourlySeries}
              loading={useTierHourlyPeakFilters ? hourlyPeakLoading : loading}
            />
          </BrandCompactSection>
        ) : null}

        <BrandCompactSection
          className={showHourlyPeak ? 'xl:col-span-2' : 'xl:col-span-4'}
          title="Sales vs Discounts"
          subtitle={`Gross sales and discounts · ${periodLabel}`}
        >
          <BrandSalesDiscountsChart data={data?.salesOverview ?? []} loading={loading} />
        </BrandCompactSection>

        <BrandCompactSection
          className="xl:col-span-1"
          title="Order Status"
          subtitle="All orders in the selected period"
        >
          <BrandOrderStatusDonut data={data?.orderStatus} loading={loading} />
        </BrandCompactSection>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-3">
        <BrandRankLeaderboardCard
          title="Top Selling Products"
          branchControl={leaderboardBranchSelect(productStoreId, setProductStoreId)}
          tabs={
            <BrandRankTabToggle
              value={productRank}
              onChange={(id) => setProductRank(id as 'top' | 'least')}
              options={[
                { id: 'top', label: 'Top Selling' },
                { id: 'least', label: 'Least Selling' },
              ]}
            />
          }
          footerLink={
            fullProductList.length > SALES_LEADERBOARD_PREVIEW ? (
              <button
                type="button"
                onClick={() => (productRank === 'top' ? setTopProductsOpen(true) : setLeastProductsOpen(true))}
                className={BRAND_ACCENT_LINK_CLASS}
              >
                View All Products →
              </button>
            ) : null
          }
        >
          <BrandRankTable
            headers={['#', 'Product', 'Quantity']}
            loading={leaderboardProductsLoading}
            empty="No product sales in this period"
            rows={previewProductList.map((product) => ({
              key: product.productId,
              label: product.productName,
              value: product.quantity.toLocaleString(),
            }))}
          />
        </BrandRankLeaderboardCard>

        <BrandRankLeaderboardCard
          title="Top Customers"
          branchControl={leaderboardBranchSelect(customerStoreId, setCustomerStoreId)}
          tabs={
            <BrandRankTabToggle
              value={customerRank}
              onChange={(id) => setCustomerRank(id as 'spend' | 'orders')}
              options={[
                { id: 'spend', label: 'By Spend' },
                { id: 'orders', label: 'By Order Count' },
              ]}
            />
          }
          footerLink={
            activeCustomerList.length > SALES_LEADERBOARD_PREVIEW ? (
              <button
                type="button"
                onClick={() => setTopCustomersOpen(true)}
                className={BRAND_ACCENT_LINK_CLASS}
              >
                View All Customers →
              </button>
            ) : null
          }
        >
          <BrandRankTable
            headers={['#', 'Customer', customerRank === 'spend' ? 'Total Spent' : 'Orders']}
            loading={topCustomersLoading}
            empty="No customer data in this period"
            rows={(customerRank === 'spend' ? previewSpendCustomers : previewOrderCustomers).map(
              (customer) => ({
                key: `${customerRank}-${customer.rank}`,
                label: customer.name,
                value:
                  customerRank === 'spend'
                    ? formatMoney(customer.totalSpend)
                    : customer.orders.toLocaleString(),
              }),
            )}
          />
        </BrandRankLeaderboardCard>

        <BrandRankLeaderboardCard
          title="Top Performing Branches"
          branchControl={leaderboardBranchSelect(branchLeaderboardStoreId, setBranchLeaderboardStoreId)}
          tabs={
            <BrandRankTabToggle
              value={branchRank}
              onChange={(id) => setBranchRank(id as 'top' | 'least')}
              options={[
                { id: 'top', label: 'Top Performing' },
                { id: 'least', label: 'Least Performing' },
              ]}
            />
          }
          footerLink={
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('brand-branch-sales-performance')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={BRAND_ACCENT_LINK_CLASS}
            >
              View All Branches →
            </button>
          }
        >
          <BrandRankTable
            headers={['#', 'Branch', 'Gross Sales (LKR)']}
            loading={branchLoading && topBranches.length === 0 && leastBranches.length === 0}
            empty="No branch sales in this period"
            rows={(branchRank === 'top' ? topBranches : leastBranches).map((branch) => ({
              key: branch.storeId,
              label: shortBranchName(branch.branchName),
              value: formatMoney(branch.grossSales),
            }))}
          />
        </BrandRankLeaderboardCard>
      </div>

      <TopCustomersModal
        open={topCustomersOpen}
        onClose={() => setTopCustomersOpen(false)}
        customers={spendCustomers}
        periodLabel={`${customerBranchLabel} · ${periodLabel}`}
      />
      <TopSellingProductsModal open={topProductsOpen} onClose={() => setTopProductsOpen(false)} products={leaderboardProducts?.topProducts ?? []} periodLabel={`${productBranchLabel} · ${periodLabel}`} />
      <TopSellingProductsModal open={leastProductsOpen} onClose={() => setLeastProductsOpen(false)} products={leaderboardProducts?.leastProducts ?? []} periodLabel={`${productBranchLabel} · ${periodLabel}`} variant="least" />
    </div>
  );
}
