'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { BranchSalesTableSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import {
  BranchTablePagination,
  BranchTierBadge,
  branchMatchesSearch,
  filterRowsByTier,
  useTablePagination,
  type BranchTierFilter,
} from '@/components/admin/branchTableShared';
import DashboardPeriodFilter, {
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { formatMoneyAmount } from '@/lib/receipt';
import { shortBranchName } from '@/lib/branchName';

export type { BranchTierFilter };

export type BranchPerformanceRow = {
  storeId: string;
  branchName: string;
  tier?: 'top' | 'standard';
  deliveryEnabled?: boolean;
  totalOrders: number;
  grossSales: number;
  growthPercent?: number;
  deliveryPercent?: number;
  webOrders?: number;
  mobileOrders?: number;
  newCustomers?: number;
  loyalCustomers?: number;
  commission?: number;
  netTakeHome?: number;
};

function GrowthCell({ value }: { value?: number }) {
  if (value === undefined || Number.isNaN(value)) return <span className="text-muted">—</span>;
  const positive = value >= 0;
  return (
    <span className={positive ? 'text-emerald-500' : 'text-red-400'}>
      {positive ? '+' : ''}
      {value}%
      {value >= 20 ? ' ↑↑' : value > 0 ? ' ↑' : value < 0 ? ' ↓' : ''}
    </span>
  );
}

type Props = {
  rows: BranchPerformanceRow[];
  period: DashboardPeriod;
  customRange: DateRange | undefined;
  onPeriodChange: (period: Exclude<DashboardPeriod, 'custom'>) => void;
  onCustomRangeChange: (range: DateRange | undefined) => void;
  defaultLimit?: number;
  loading?: boolean;
  tierFilter?: BranchTierFilter;
  onTierFilterChange?: (tier: BranchTierFilter) => void;
  showTierColumn?: boolean;
  showDeliveryPercent?: boolean;
  showEngagementColumns?: boolean;
  showGrowthColumn?: boolean;
  showRankColumn?: boolean;
  title?: string;
  paginate?: boolean;
  pageSize?: number;
};

export default function BranchSalesPerformanceTable({
  rows,
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
  defaultLimit = 10,
  loading,
  tierFilter = 'all',
  onTierFilterChange,
  showTierColumn = false,
  showDeliveryPercent = false,
  showEngagementColumns = false,
  showGrowthColumn = true,
  showRankColumn = false,
  title = 'Branch Sales Performance',
  paginate = false,
  pageSize = 10,
}: Props) {
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    const query = search.trim();
    let list = filterRowsByTier(rows, tierFilter);
    if (query) {
      list = list.filter((row) => branchMatchesSearch(row.branchName, query));
    } else if (tierFilter === 'all' && !paginate) {
      list = list.slice(0, defaultLimit);
    }
    return list;
  }, [rows, search, defaultLimit, tierFilter, paginate]);

  const { safePage, totalPages, setPage, visibleSlice } = useTablePagination(
    filteredRows.length,
    paginate,
    pageSize,
    [search, tierFilter, rows.length, period, customRange?.from, customRange?.to],
  );

  const visibleRows = useMemo(
    () => filteredRows.slice(visibleSlice.start, visibleSlice.end),
    [filteredRows, visibleSlice],
  );

  if (loading) {
    return <BranchSalesTableSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div
        className={
          onTierFilterChange
            ? 'grid w-full grid-cols-[minmax(160px,1fr)_150px_auto] items-center gap-2'
            : 'grid w-full grid-cols-[minmax(160px,1fr)_auto] items-center gap-2'
        }
      >
        <div className="relative min-w-0">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            className="input-field w-full min-w-0 pl-8 text-sm"
            placeholder="Search branch by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search branches by name"
          />
        </div>
        {onTierFilterChange && (
          <select
            className="input-field w-full min-w-0 text-sm"
            value={tierFilter}
            onChange={(e) => onTierFilterChange(e.target.value as BranchTierFilter)}
            aria-label="Filter by tier"
          >
            <option value="all">All tiers</option>
            <option value="top">Delivery & Pickup</option>
            <option value="standard">Pickup Only</option>
          </select>
        )}
        <DashboardPeriodFilter
          period={period}
          customRange={customRange}
          onPeriodChange={onPeriodChange}
          onCustomRangeChange={onCustomRangeChange}
          compact
          className="justify-self-end"
        />
      </div>

      {filteredRows.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center text-sm text-muted">
          {search.trim() ? 'No branches match your search' : 'No branch sales in this period'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-navy-border text-xs uppercase tracking-wide text-muted">
                {showRankColumn && <th className="px-3 py-3 font-semibold">#</th>}
                <th className="px-3 py-3 font-semibold">Branch Name</th>
                {showTierColumn && <th className="px-3 py-3 font-semibold">Tier</th>}
                <th className="px-3 py-3 text-right font-semibold">Total Orders</th>
                {showEngagementColumns && (
                  <>
                    <th className="px-3 py-3 text-right font-semibold">Web</th>
                    <th className="px-3 py-3 text-right font-semibold">Mobile</th>
                    <th className="px-3 py-3 text-right font-semibold">New Customers</th>
                    <th className="px-3 py-3 text-right font-semibold">Loyal Customers</th>
                  </>
                )}
                {showDeliveryPercent && (
                  <th className="px-3 py-3 text-right font-semibold">Delivery %</th>
                )}
                <th className="px-3 py-3 text-right font-semibold">Gross Sales (LKR)</th>
                {showGrowthColumn && (
                  <th className="px-3 py-3 text-right font-semibold">Growth %</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.storeId} className="border-b border-navy-border/60 last:border-0">
                  {showRankColumn && (
                    <td className="px-3 py-3 tabular-nums text-muted">
                      {paginate ? safePage * pageSize + index + 1 : index + 1}
                    </td>
                  )}
                  <td className="px-3 py-3 font-medium text-fg">{shortBranchName(row.branchName)}</td>
                  {showTierColumn && (
                    <td className="px-3 py-3">
                      <BranchTierBadge tier={row.tier} />
                    </td>
                  )}
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-fg">
                    {row.totalOrders}
                  </td>
                  {showEngagementColumns && (
                    <>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-brand">
                        {row.webOrders ?? 0}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-orange-500">
                        {row.mobileOrders ?? 0}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-400">
                        {row.newCustomers ?? 0}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-pink-500">
                        {row.loyalCustomers ?? 0}
                      </td>
                    </>
                  )}
                  {showDeliveryPercent && (
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-400">
                      {row.deliveryPercent ?? 0}%
                    </td>
                  )}
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-fg">
                    {formatMoneyAmount(row.grossSales)}
                  </td>
                  {showGrowthColumn && (
                    <td className="px-3 py-3 text-right font-bold tabular-nums">
                      <GrowthCell value={row.growthPercent} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginate && filteredRows.length > 0 && (
        <BranchTablePagination
          safePage={safePage}
          totalPages={totalPages}
          pageSize={pageSize}
          itemCount={filteredRows.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
