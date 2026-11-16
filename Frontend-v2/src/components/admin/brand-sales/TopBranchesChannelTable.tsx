'use client';

import { useMemo, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { TopBranchesChannelTableSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import {
  topBranchesChannelColumns,
  topBranchesChannelCsvRow,
  topBranchesChannelPdfRow,
  type BranchChannelMetric,
  type TopBranchesChannelRow,
} from '@/components/admin/brand-sales/topBranchesChannelReport';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import {
  BranchTablePagination,
  BranchTierBadge,
  branchMatchesSearch,
  filterRowsByTier,
  useTablePagination,
  type BranchTierFilter,
} from '@/components/admin/branchTableShared';
import { downloadCsv } from '@/components/admin/reports/reportUtils';
import { formatMoneyAmount } from '@/lib/receipt';
import { shortBranchName } from '@/lib/branchName';

export type { BranchChannelMetric, TopBranchesChannelRow };

function ChannelAmountCell({ metric }: { metric: BranchChannelMetric }) {
  if (metric.amount <= 0) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span className="font-semibold tabular-nums text-fg">{formatMoneyAmount(metric.amount)}</span>
  );
}

function MoneyDashCell({ value }: { value: number }) {
  if (value <= 0) return <span className="text-muted">—</span>;
  return <span className="font-semibold tabular-nums text-fg">{formatMoneyAmount(value)}</span>;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });

  const reportOptions = useMemo(
    () => ({ showTierColumn, hideDeliveryOnline }),
    [showTierColumn, hideDeliveryOnline],
  );

  const filteredRows = useMemo(() => {
    let list = [...rows].sort(
      (a, b) => b.grossSales - a.grossSales || b.totalOrders - a.totalOrders,
    );
    list = filterRowsByTier(list, tierFilter);
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter((row) => branchMatchesSearch(row.branchName, query));
    }
    return list;
  }, [rows, search, tierFilter]);

  const exportColumns = useMemo(() => topBranchesChannelColumns(reportOptions), [reportOptions]);

  const exportCsvRows = useMemo(
    () => filteredRows.map((row) => topBranchesChannelCsvRow(row, reportOptions)),
    [filteredRows, reportOptions],
  );

  const pdfRows = useMemo(
    () => filteredRows.map((row) => topBranchesChannelPdfRow(row, reportOptions)),
    [filteredRows, reportOptions],
  );

  const canExport = filteredRows.length > 0;

  function exportCsv() {
    if (!canExport) return;
    downloadCsv(`branch-sales-performance-${period}.csv`, exportColumns, exportCsvRows);
  }

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
    return <TopBranchesChannelTableSkeleton hideDeliveryOnline={hideDeliveryOnline} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={!canExport}
            onClick={() => setPreviewOpen(true)}
            aria-label="Export branch sales performance as PDF"
          >
            <Printer size={13} />
            PDF
          </button>
          <button
            type="button"
            className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs"
            disabled={!canExport}
            onClick={exportCsv}
            aria-label="Export branch sales performance as CSV"
          >
            <Download size={13} />
            CSV
          </button>
        </div>
        <DashboardPeriodFilter
          period={period}
          customRange={customRange}
          onPeriodChange={onPeriodChange}
          onCustomRangeChange={onCustomRangeChange}
          compact
          className="ml-auto"
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
                      <BranchTierBadge tier={row.tier} />
                    </td>
                  )}
                  <td className="px-3 py-3 font-bold tabular-nums text-fg">{row.totalOrders}</td>
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
                  <td className="px-3 py-3">
                    <MoneyDashCell value={row.totalDiscount} />
                  </td>
                  <td className="px-3 py-3">
                    <MoneyDashCell value={row.totalRefunds} />
                  </td>
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

      <AdminReportPreviewSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        docTitle="Branch Sales"
        reportTitle="Branch Sales Performance"
        reportDescription="Compare performance across all branches."
        scopeLabel="All Branches"
        periodLabel={periodLabel}
        statusLine={`Live Report · ${filteredRows.length} branch${filteredRows.length === 1 ? '' : 'es'}`}
        referencePrefix="BSP"
        columns={exportColumns}
        rows={pdfRows}
        alignRightFromColumn={showTierColumn ? 3 : 2}
        rowCountLabel="branches"
        onExportExcel={exportCsv}
      />
    </div>
  );
}