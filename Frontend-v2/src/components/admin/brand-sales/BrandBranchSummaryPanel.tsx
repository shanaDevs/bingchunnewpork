'use client';

import { ChartNoAxesColumnDecreasing, ShoppingBag, Store, Trophy } from 'lucide-react';

import { BrandOverviewMetricGridSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import BrandOverviewMetricTile, {
  brandOverviewCardHeaderClassName,
  brandOverviewCardShellClassName,
  brandOverviewKpiBodyClassName,
} from '@/components/admin/brand-sales/BrandOverviewMetricTile';
import { formatMoney } from '@/lib/receipt';

type Props = {
  deliveryPickupCount: number;
  pickupOnlyCount: number;
  topBranch?: { branchName: string; grossSales: number };
  leastBranch?: { branchName: string; grossSales: number };
  loading?: boolean;
};

function shortName(name: string) {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

export default function BrandBranchSummaryPanel({
  deliveryPickupCount,
  pickupOnlyCount,
  topBranch,
  leastBranch,
  loading,
}: Props) {
  const topName = topBranch ? shortName(topBranch.branchName) : '—';
  const leastName = leastBranch ? shortName(leastBranch.branchName) : '—';

  return (
    <div className={brandOverviewCardShellClassName}>
      <div className={brandOverviewCardHeaderClassName}>
        <h2 className="text-[13px] font-semibold text-fg">Branch Performance</h2>
      </div>
      <div className={brandOverviewKpiBodyClassName}>
        {loading ? (
          <BrandOverviewMetricGridSkeleton />
        ) : (
          <div className="grid w-full grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <BrandOverviewMetricTile
              icon={Store}
              label="Delivery & Pickup"
              value={deliveryPickupCount.toLocaleString()}
              tileClassName="bg-[#307ef2]/10"
              iconClassName="text-[#307ef2]"
            />
            <BrandOverviewMetricTile
              icon={ShoppingBag}
              label="Pickup Only"
              value={pickupOnlyCount.toLocaleString()}
              tileClassName="bg-amber-500/10"
              iconClassName="text-amber-600"
            />
            <BrandOverviewMetricTile
              icon={Trophy}
              label="Top Branch"
              value={topName}
              valueTitle={topBranch ? topBranch.branchName : undefined}
              secondary={topBranch ? formatMoney(topBranch.grossSales) : undefined}
              tileClassName="bg-cyan-500/10"
              iconClassName="text-cyan-700"
              valueClassName="truncate text-sm font-bold leading-tight text-fg"
            />
            <BrandOverviewMetricTile
              icon={ChartNoAxesColumnDecreasing}
              label="Least Performing"
              value={leastName}
              valueTitle={leastBranch ? leastBranch.branchName : undefined}
              secondary={leastBranch ? formatMoney(leastBranch.grossSales) : undefined}
              tileClassName="bg-violet-500/10"
              iconClassName="text-violet-600"
              valueClassName="truncate text-sm font-bold leading-tight text-fg"
            />
          </div>
        )}
      </div>
    </div>
  );
}
