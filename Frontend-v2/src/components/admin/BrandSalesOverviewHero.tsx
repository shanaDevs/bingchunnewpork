'use client';

import { useMemo } from 'react';
import { Coffee, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';

import type { BrandAnalyticsPayload } from '@/components/admin/BrandSalesTabPanel';
import type { TierSummary } from '@/components/admin/BranchTierBanner';
import BrandBranchSummaryPanel from '@/components/admin/brand-sales/BrandBranchSummaryPanel';
import BrandCommandKpiCard from '@/components/admin/brand-sales/BrandCommandKpiCard';
import BrandCustomersReviewsPanel from '@/components/admin/brand-sales/BrandCustomersReviewsPanel';
import BrandRevenueBreakdownPanel from '@/components/admin/brand-sales/BrandRevenueBreakdownPanel';
import { formatMoney } from '@/lib/receipt';

type Props = {
  data?: BrandAnalyticsPayload;
  overviewData?: BrandAnalyticsPayload & { tierSummary?: TierSummary };
  loading?: boolean;
  overviewLoading?: boolean;
};

function averageOrderValue(grossSales: number, totalOrders: number) {
  return totalOrders > 0 ? grossSales / totalOrders : 0;
}

export default function BrandSalesOverviewHero({
  data,
  overviewData,
  loading = false,
  overviewLoading = false,
}: Props) {
  const grossSales = data?.kpiCards?.grossSales ?? 0;
  const totalOrders = data?.kpiCards?.totalOrders ?? 0;
  const totalCups = data?.kpiCards?.totalCups ?? data?.kpiComparison?.totalCups.current ?? 0;
  const aov = data?.kpiComparison?.averageOrderValue.current
    ?? Math.round(averageOrderValue(grossSales, totalOrders));

  const kpis = [
    {
      title: 'Total Gross Sales',
      value: formatMoney(grossSales),
      icon: TrendingUp,
      change: data?.kpiComparison?.grossSales.changePercent,
    },
    {
      title: 'Total Orders',
      value: totalOrders.toLocaleString(),
      icon: ShoppingBag,
      change: data?.kpiComparison?.totalOrders.changePercent,
    },
    {
      title: 'Total Cups Sold',
      value: totalCups.toLocaleString(),
      icon: Coffee,
      change: data?.kpiComparison?.totalCups.changePercent,
    },
    {
      title: 'Average Order Value',
      value: formatMoney(aov),
      icon: Wallet,
      change: data?.kpiComparison?.averageOrderValue.changePercent,
    },
  ];

  const branchRows = overviewData?.branchPerformance ?? [];
  const topBranch = branchRows[0];
  const leastBranch = useMemo(() => {
    if (branchRows.length === 0) return undefined;
    return [...branchRows].sort((a, b) => a.grossSales - b.grossSales || a.totalOrders - b.totalOrders)[0];
  }, [branchRows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <BrandCommandKpiCard
            key={kpi.title}
            icon={kpi.icon}
            title={kpi.title}
            value={kpi.value}
            changePercent={kpi.change}
            loading={loading}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <BrandRevenueBreakdownPanel
          delivery={data?.revenueBreakdown?.delivery ?? 0}
          pickup={data?.revenueBreakdown?.pickup ?? 0}
          loading={loading}
        />
        <BrandCustomersReviewsPanel
          newCustomers={overviewData?.customerBehavior?.firstTimeBuyers ?? 0}
          repeatCustomers={overviewData?.customerBehavior?.loyalCustomers ?? 0}
          avgRating={overviewData?.platformReviews?.avgRating ?? null}
          totalReviews={overviewData?.platformReviews?.totalCount ?? 0}
          distribution={overviewData?.platformReviews?.distribution}
          loading={overviewLoading}
        />
        <BrandBranchSummaryPanel
          deliveryPickupCount={overviewData?.tierSummary?.topTier.branchCount ?? 0}
          pickupOnlyCount={overviewData?.tierSummary?.standardTier.branchCount ?? 0}
          topBranch={topBranch}
          leastBranch={leastBranch}
          loading={overviewLoading}
        />
      </div>
    </div>
  );
}
