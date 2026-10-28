'use client';

import { useMemo } from 'react';
import DashboardOrderSummaryPaymentChannels from '@/components/admin/DashboardOrderSummaryPaymentChannels';
import SalesVsJasonInvestmentChart from '@/components/admin/SalesVsJasonInvestmentChart';
import DiscountsByPartyPieChart from '@/components/admin/DiscountsByPartyPieChart';
import type { DiscountsByPartyBreakdown } from '@/components/admin/DiscountsByPartyPieChart';
import RevenueOverviewBarChart from '@/components/admin/RevenueOverviewBarChart';
import SuperAdminBranchPerformanceCard from '@/components/admin/SuperAdminBranchPerformanceCard';
import SuperAdminOverviewCards from '@/components/admin/SuperAdminOverviewCards';
import SuperAdminOutflowByMethodChart from '@/components/admin/SuperAdminOutflowByMethodChart';
import SuperAdminTopRefundBranchesChart, {
  type SuperAdminTopRefundBranch,
} from '@/components/admin/SuperAdminTopRefundBranchesChart';
import SuperAdminPaymentBreakdownCard from '@/components/admin/SuperAdminPaymentBreakdownCard';
import { type SuperAdminRankingRow } from '@/components/admin/SuperAdminRankingCard';
import SuperAdminTopProducts from '@/components/admin/SuperAdminTopProducts';
import SuperAdminTopRidersCard, {
  type SuperAdminTopDeliveryRider,
} from '@/components/admin/SuperAdminTopRidersCard';
import type { DashboardPeriod } from '@/components/admin/DashboardPeriodFilter';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { type RevenueChannels } from '@/components/admin/BranchRevenueBreakdownDonut';
import { normalizeBranchName, shortBranchName } from '@/lib/branchName';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import type { DateRange } from 'react-day-picker';
import type { WalletAnalysisFlowPoint } from '@/components/admin/wallet-analysis/walletAnalysisTypes';

type BranchPerformance = {
  branchName: string;
  grossSales: number;
  totalOrders?: number;
};

type OrderSummaryRow = {
  label: string;
  delivery: number;
  pickupCash: number;
  pickupOnline: number;
  pickupCard: number;
  orderCount?: number;
  grossSales?: number;
};

type PickupCountRow = {
  branchName: string;
  pickup: number;
};

type TopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
  basePrice?: number;
  imageUrl?: string | null;
};

type RankSource = {
  id: string;
  name: string;
  revenue: number;
  metric?: string;
  imageUrl?: string | null;
};

type Props = {
  stats: {
    periodRevenue?: number;
    periodRefundAmount?: number;
    jasonInvestedAmount?: number;
    periodOrders?: number;
    revenueChannels?: RevenueChannels;
    delivery?: { orders?: number; revenue?: number };
    takeaway?: { orders?: number; revenue?: number };
    onlineWalletBalance?: number;
    totalPayable?: number;
    cancelledOrders?: number;
    topProducts?: TopProduct[];
    monthlyOverview?: Array<{
      month: string;
      revenue: number;
      orders?: number;
      inflow?: number;
      outflow?: number;
    }>;
    discountsByParty?: DiscountsByPartyBreakdown | null;
    outflowByMethod?: WalletAnalysisFlowPoint[];
    topRefundBranches?: SuperAdminTopRefundBranch[];
    topDeliveryRiders?: SuperAdminTopDeliveryRider[];
  } | null;
  brandOverview?: {
    branchPerformance?: BranchPerformance[];
    orderSummaryByBranch?: OrderSummaryRow[];
    branchDeliveryPickup?: PickupCountRow[];
  } | null;
  period: DashboardPeriod;
  customRange?: DateRange;
  periodLabel: string;
  summaryLoading?: boolean;
  chartsLoading?: boolean;
  walletChartsLoading?: boolean;
  detailsLoading?: boolean;
  brandLoading?: boolean;
};

function pickupChannelRevenue(row: OrderSummaryRow) {
  return row.pickupCash + row.pickupOnline + row.pickupCard;
}

function combinedChannelRevenue(row: OrderSummaryRow) {
  return row.delivery + pickupChannelRevenue(row);
}

function formatOrderMetric(count: number | undefined) {
  return typeof count === 'number' ? count.toLocaleString('en-LK') : undefined;
}

function toTopRankRows(items: RankSource[], limit = 5): SuperAdminRankingRow[] {
  const ranked = items
    .filter((item) => item.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
  const max = Math.max(...ranked.map((item) => item.revenue), 1);
  return ranked.map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    metric: item.metric,
    value: formatMoneyAmount(item.revenue),
    progress: (item.revenue / max) * 100,
  }));
}

function combinedBranchSources(
  summaryRows: OrderSummaryRow[],
  branchPerformance: BranchPerformance[],
): RankSource[] {
  if (summaryRows.length > 0) {
    return summaryRows.map((row) => ({
      id: row.label,
      name: shortBranchName(row.label),
      revenue: row.grossSales ?? combinedChannelRevenue(row),
      metric: formatOrderMetric(row.orderCount),
    }));
  }
  return branchPerformance.map((row) => ({
    id: row.branchName,
    name: shortBranchName(row.branchName),
    revenue: row.grossSales,
    metric: formatOrderMetric(row.totalOrders),
  }));
}

function pickupBranchSources(
  summaryRows: OrderSummaryRow[],
  pickupCounts: PickupCountRow[],
): RankSource[] {
  const pickupCountByName = new Map(
    pickupCounts.map((row) => [normalizeBranchName(row.branchName), row.pickup]),
  );

  return summaryRows.map((row) => {
    const pickupOrders = pickupCountByName.get(normalizeBranchName(row.label));
    return {
      id: `pickup-${row.label}`,
      name: shortBranchName(row.label),
      revenue: pickupChannelRevenue(row),
      metric: formatOrderMetric(pickupOrders),
    };
  });
}

export default function SuperAdminDashboard({
  stats,
  brandOverview,
  period,
  customRange,
  periodLabel,
  summaryLoading = false,
  chartsLoading = false,
  walletChartsLoading = false,
  detailsLoading = false,
  brandLoading,
}: Props) {
  const channels = stats?.revenueChannels;
  const deliveryRevenue = stats?.delivery?.revenue ?? channels?.deliveryCard ?? 0;
  const lastOverview = stats?.monthlyOverview?.at(-1);
  const summaryRows = brandOverview?.orderSummaryByBranch ?? [];

  const combinedBranchRows = useMemo(
    () =>
      toTopRankRows(
        combinedBranchSources(summaryRows, brandOverview?.branchPerformance ?? []),
      ),
    [summaryRows, brandOverview?.branchPerformance],
  );
  const pickupBranchRows = useMemo(
    () =>
      toTopRankRows(
        pickupBranchSources(summaryRows, brandOverview?.branchDeliveryPickup ?? []),
      ),
    [summaryRows, brandOverview?.branchDeliveryPickup],
  );

  return (
    <div
      className="super-admin-dashboard space-y-3"
      aria-busy={Boolean(
        summaryLoading || chartsLoading || walletChartsLoading || detailsLoading,
      )}
    >
      <SuperAdminOverviewCards
        periodLabel={periodLabel}
        periodRevenue={stats?.periodRevenue ?? 0}
        periodRefundAmount={stats?.periodRefundAmount ?? 0}
        revenueChannels={channels}
        deliveryRevenue={deliveryRevenue}
        periodOrders={stats?.periodOrders}
        cancelledOrders={stats?.cancelledOrders}
        onlineWalletBalance={stats?.onlineWalletBalance}
        totalPayable={stats?.totalPayable}
        monthlyOverview={stats?.monthlyOverview}
        loading={summaryLoading}
        sparkLoading={chartsLoading}
      />

      <div className="grid gap-3 lg:grid-cols-12 lg:items-stretch">
        <div className="card flex min-h-[280px] flex-col p-4 lg:col-span-7">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">Total Revenue</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {periodLabel} · revenue · outflow
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-navy-light px-2 py-0.5 text-[10px] font-semibold text-muted">
                Paid Orders
              </span>
              {chartsLoading ? (
                <DashSkel className="h-4 w-20" />
              ) : lastOverview ? (
                <span className="text-sm font-bold tabular-nums text-fg">
                  {formatMoney(lastOverview.revenue)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <RevenueOverviewBarChart
              data={(stats?.monthlyOverview ?? []).map((point) => ({
                month: point.month,
                revenue: point.revenue,
                orders: point.orders ?? 0,
                outflow: point.outflow,
              }))}
              loading={chartsLoading}
              compact
              showCashflow
            />
          </div>
        </div>
        <div className="min-h-[280px] lg:col-span-5">
          <SuperAdminPaymentBreakdownCard
            revenueChannels={channels}
            deliveryRevenue={deliveryRevenue}
            periodLabel={periodLabel}
            loading={summaryLoading}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,35fr)_minmax(0,28fr)_minmax(0,37fr)] lg:items-stretch">
        <div className="min-h-[380px] min-w-0">
          <SuperAdminOutflowByMethodChart
            data={stats?.outflowByMethod ?? []}
            periodLabel={periodLabel}
            loading={walletChartsLoading}
          />
        </div>
        <div className="min-h-[380px] min-w-0">
          <SuperAdminTopRefundBranchesChart
            data={stats?.topRefundBranches ?? []}
            periodLabel={periodLabel}
            loading={walletChartsLoading}
          />
        </div>
        <div className="min-h-[380px] min-w-0">
          <SuperAdminTopRidersCard
            riders={stats?.topDeliveryRiders ?? []}
            periodLabel={periodLabel}
            period={period}
            customRange={customRange}
            loading={walletChartsLoading}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:items-stretch">
        <div className="min-h-[260px]">
          <SalesVsJasonInvestmentChart
            salesAmount={stats?.periodRevenue ?? 0}
            jasonInvestedAmount={stats?.jasonInvestedAmount ?? 0}
            periodLabel={periodLabel}
            loading={detailsLoading}
          />
        </div>
        <div className="min-h-[260px]">
          <DiscountsByPartyPieChart
            data={stats?.discountsByParty ?? null}
            periodLabel={periodLabel}
            loading={detailsLoading}
            compact
          />
        </div>
        <div className="min-h-[260px] md:col-span-2 xl:col-span-1">
          <DashboardOrderSummaryPaymentChannels
            orderSummaryByBranch={brandOverview?.orderSummaryByBranch}
            periodLabel={periodLabel}
            loading={brandLoading}
            compact
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:items-stretch">
        <SuperAdminTopProducts
          products={stats?.topProducts ?? []}
          periodLabel={periodLabel}
          loading={detailsLoading}
        />
        <SuperAdminBranchPerformanceCard
          title="Top Branches (Delivery & Pickup)"
          subtitle={periodLabel}
          rows={combinedBranchRows}
          loading={detailsLoading || brandLoading}
          empty="No branch sales in this period"
        />
        <SuperAdminBranchPerformanceCard
          title="Top Branches (Pickup Only)"
          subtitle={periodLabel}
          rows={pickupBranchRows}
          loading={detailsLoading || brandLoading}
          empty="No pickup sales in this period"
        />
      </div>
    </div>
  );
}
