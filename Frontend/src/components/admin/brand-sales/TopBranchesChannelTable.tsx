'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { TopBranchesChannelTableSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import DashboardPeriodFilter, {
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import type { BranchTierFilter } from '@/components/admin/BranchSalesPerformanceTable';
import { shortBranchName } from '@/lib/branchName';
import { formatMoneyAmount } from '@/lib/receipt';

export type BranchChannelMetric = {
  amount: number;
  orders: number;
};

export type TopBranchesChannelRow = {
  storeId: string;
  branchName: string;
  tier: 'top' | 'standard';
  totalOrders: number;
  grossSales: number;
  pickupCash: BranchChannelMetric;
  pickupCard: BranchChannelMetric;
  pickupOnline: BranchChannelMetric;
  deliveryOnline: BranchChannelMetric;
  totalDiscount: number;
  totalRefunds: number;
};

function ChannelAmountCell({ metric }: { metric: BranchChannelMetric }) {
  if (metric.amount <= 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span className="font-semibold tabular-nums text-fg">{formatMoneyAmount(metric.amount)}</span>
  );
}

type Props = {
  rows: TopBranchesChannelRow[];
  period: DashboardPeriod;
  customRange: DateRange | undefined;
  onPeriodChange: (period: Exclude<DashboardPeriod, 'custom'>) => void;
  onCustomRangeChange: (range: DateRange | undefined) => void;
  loading?: boolean;
  tierFilter?: BranchTierFilter;
  showTierColumn?: boolean;
  hideDeliveryOnline?: boolean;
  paginate?: boolean;
  pageSize?: number;
};

export default function TopBranchesChannelTable({
  rows,
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
  loading,
  tierFilter = 'all',
  showTierColumn = false,
  hideDeliveryOnline = false,
  paginate = true,
  pageSize = 10,
}: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = [...rows].sort((a, b) => b.grossSales - a.grossSales || b.totalOrders - a.totalOrders);
    if (tierFilter === 'top') list = list.filter((row) => row.tier === 'top');
    if (tierFilter === 'standard') list = list.filter((row) => row.tier === 'standard');
    if (query) {
      list = list.filter((row) => {
        const short = shortBranchName(row.branchName).toLowerCase();
        return short.includes(query) || row.branchName.toLowerCase().includes(query);
      });
    }
    return list;
  }, [rows, search, tierFilter]);

  useEffect(() => {
    setPage(0);
  }, [search, tierFilter, rows.length, period, customRange?.from, customRange?.to]);

  const totalPages = paginate ? Math.max(1, Math.ceil(filteredRows.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleRows = useMemo(() => {
    if (!paginate) return filteredRows;
    const start = safePage * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, paginate, safePage, pageSize]);

  if (loading) {
    return <TopBranchesChannelTableSkeleton hideDeliveryOnline={hideDeliveryOnline} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid w-full grid-cols-[minmax(160px,1fr)_auto] items-center gap-2">
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
          {search.trim() ? 'No branches match your search' : 'No branch sales data for this period'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-navy-border text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3 font-semibold">Branch Name</th>
                {showTierColumn && <th className="px-3 py-3 font-semibold">Tier</th>}
                <th className="px-3 py-3 font-semibold">Total Orders</th>
                <th className="px-3 py-3 font-semibold">Sales (LKR)</th>
                <th className="px-3 py-3 font-semibold">Pickup Cash</th>
                <th className="px-3 py-3 font-semibold">Pickup Card</th>
                <th className="px-3 py-3 font-semibold">Pickup Online</th>
                {!hideDeliveryOnline && (
                  <th className="px-3 py-3 font-semibold">Delivery Online</th>
                )}
                <th className="px-3 py-3 font-semibold">Discounts</th>
                <th className="px-3 py-3 font-semibold">Refunds</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.storeId} className="border-b border-navy-border/60 last:border-0">
                  <td className="px-3 py-3 font-medium text-fg" title={row.branchName}>
                    {shortBranchName(row.branchName)}
                  </td>
                  {showTierColumn && (
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          row.tier === 'top'
                            ? 'bg-indigo-500/15 text-indigo-400'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {row.tier === 'top' ? 'Delivery & Pickup' : 'Pickup Only'}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-3 font-bold tabular-nums text-fg">
                    {row.totalOrders}
                  </td>
                  <td className="px-3 py-3 font-bold tabular-nums text-fg">
                    {formatMoneyAmount(row.grossSales)}
                  </td>
                  <td className="px-3 py-3">
                    <ChannelAmountCell metric={row.pickupCash} />
                  </td>
                  <td className="px-3 py-3">
                    <ChannelAmountCell metric={row.pickupCard} />
                  </td>
                  <td className="px-3 py-3">
                    <ChannelAmountCell metric={row.pickupOnline} />
                  </td>
                  {!hideDeliveryOnline && (
                    <td className="px-3 py-3">
                      <ChannelAmountCell metric={row.deliveryOnline} />
                    </td>
                  )}
                  <td className="px-3 py-3 font-semibold tabular-nums text-fg">
                    {row.totalDiscount > 0 ? formatMoneyAmount(row.totalDiscount) : '—'}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-fg">
                    {row.totalRefunds > 0 ? formatMoneyAmount(row.totalRefunds) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginate && filteredRows.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 pt-3">
          <p className="text-xs text-muted">
            Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filteredRows.length)} of{' '}
            {filteredRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <span className="text-xs font-medium text-muted">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
