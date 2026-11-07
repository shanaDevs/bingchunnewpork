'use client';

import { Store } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT } from '@/lib/dashboardTheme';
import { formatMoney } from '@/lib/receipt';

type BranchRow = {
  storeId?: string;
  storeName: string;
  revenue: number;
};

type Props = {
  branches: BranchRow[];
  periodLabel: string;
  maxRevenue: number;
  loading?: boolean;
};

export default function SuperAdminMostSellingBranchCard({
  branches,
  periodLabel,
  maxRevenue,
  loading,
}: Props) {
  const theme = KPI_LIGHT.blue;
  const topBranch = [...branches].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <div className="super-admin-most-selling-branch-card card relative flex h-full min-h-[320px] flex-col overflow-hidden">
      <div className="border-b border-border/40 px-5 py-4">
        <BrandKpiCardHeader
          icon={Store}
          theme={theme}
          title="Most Selling Branches"
          subtitle={periodLabel}
          size="sm"
          accentTitle={false}
          titleClassName="text-sm font-semibold text-fg"
        />
      </div>

      <div className="flex flex-1 flex-col px-5 py-4">
        {loading ? (
          <p className="flex flex-1 items-center justify-center text-sm text-muted">Loading…</p>
        ) : !topBranch ? (
          <p className="flex flex-1 items-center justify-center text-sm text-muted">No branch sales data</p>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-fg">{topBranch.storeName}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-fg">
                {formatMoney(topBranch.revenue)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-navy-light/80">
              <div
                className="super-admin-most-selling-branch-card__bar h-full rounded-full"
                style={{ width: `${maxRevenue > 0 ? (topBranch.revenue / maxRevenue) * 100 : 0}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
