'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import ReportBranchFilter from '@/components/admin/reports/ReportBranchFilter';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import {
  adminFetch,
  branchDisplayName,
  buildPeriodQuery,
  downloadCsv,
  formatLkr,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type CustomerRow = {
  rank: number;
  id?: string;
  name: string;
  phone?: string;
  orders: number;
  totalSpend: number;
  homeBranch?: string;
  favoriteProduct?: string;
};

const COLUMNS = [
  { key: 'rank', label: 'Customer ID / Rank' },
  { key: 'name', label: 'Customer Name' },
  { key: 'phone', label: 'Contact Number' },
  { key: 'orders', label: 'Total Orders Placed', align: 'right' as const },
  { key: 'spend', label: 'Total Amount Spent (LKR)', align: 'right' as const },
  { key: 'branch', label: 'Favorite Branch' },
  { key: 'product', label: 'Most Ordered Product' },
];



export default function HighValueCustomersReport() {
  const [sortBy, setSortBy] = useState<'spend' | 'orders'>('spend');
  const [timeMode, setTimeMode] = useState<'all' | 'range'>('all');
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeId, setStoreId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams(
      timeMode === 'all' ? 'period=all' : buildPeriodQuery(period, customRange),
    );
    params.set('sortBy', sortBy);
    params.set('limit', '50');
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/top-customers?${params.toString()}`;
  }, [timeMode, period, customRange, sortBy, storeId]);

  const { data, isFetching } = useQuery<{ topCustomers: CustomerRow[] }>({
    queryKey: ['report-high-value-customers', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = data?.topCustomers ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);
  const periodLabel =
    timeMode === 'all'
      ? 'All Time'
      : formatDashboardPeriodLabel(period, customRange, { includeDates: true });

  const totals = useMemo(() => ({
    totalOrders: rows.reduce((s, r) => s + r.orders, 0),
    totalSpend: rows.reduce((s, r) => s + r.totalSpend, 0),
  }), [rows]);

  const filterLabel = sortBy === 'spend' ? 'Sorted by spend' : 'Sorted by frequency';
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: `${r.rank}-${r.phone ?? r.name}`,
        cells: [
          isVisible('rank') ? String(r.rank) : null,
          isVisible('name') ? r.name : null,
          isVisible('phone') ? r.phone ?? '—' : null,
          isVisible('orders') ? String(r.orders) : null,
          isVisible('spend') ? formatPrintMoneyNoSymbol(r.totalSpend) : null,
          isVisible('branch') ? branchDisplayName(r.homeBranch) : null,
          isVisible('product') ? r.favoriteProduct ?? '—' : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, visibleColumns],
  );

  return (
    <>
    <ReportSection
      id="high-value-customers"
      title="High-Value Customers Ledger"
      description="Top spending and most frequent customers across the brand."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      controls={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ReportBranchFilter value={storeId} onChange={setStoreId} />
          <div className="flex items-center gap-2">
            <label htmlFor="sortBy" className="text-[11px] font-medium text-muted uppercase tracking-wider">Sort</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="spend">Total Spend</option>
              <option value="orders">Order Frequency</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="timeMode" className="text-[11px] font-medium text-muted uppercase tracking-wider">Time Period</label>
            <select
              id="timeMode"
              value={timeMode}
              onChange={(e) => setTimeMode(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="range">Custom Range</option>
            </select>
          </div>
          {timeMode === 'range' && (
            <DashboardPeriodFilter
              period={period}
              customRange={customRange}
              onPeriodChange={setPeriod}
              onCustomRangeChange={(range) => {
                setCustomRange(range);
                if (range?.from && range?.to) setPeriod('custom');
              }}
              compact
            />
          )}
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'high-value-customers.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            r.id ? `${r.rank} / ${r.id.slice(0, 8)}` : r.rank,
            r.name,
            r.phone ?? '—',
            r.orders,
            r.totalSpend,
            branchDisplayName(r.homeBranch),
            r.favoriteProduct ?? '—',
          ]),
        )
      }
      pdfTitle="High-Value Customers Ledger"
      pdfReference={`HVC-${format(new Date(), 'yyyyMMdd')}`}
      pdfPeriodLabel={periodLabel}
      pdfFilterLabel={filterLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={3}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 2} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Orders" value={String(totals.totalOrders)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Spend" value={formatLkr(totals.totalSpend)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={`${row.rank}-${row.phone ?? row.name}`} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('rank') && (
              <td className="px-4 py-3 text-muted text-xs font-mono">
                #{row.rank}
                {row.id ? ` · ${row.id.slice(0, 8).toUpperCase()}` : ''}
              </td>
            )}
            {isVisible('name') && <td className="px-4 py-3 text-fg text-sm">{row.name}</td>}
            {isVisible('phone') && <td className="px-4 py-3 text-muted text-xs">{row.phone ?? '—'}</td>}
            {isVisible('orders') && (
              <td className="px-4 py-3 text-right text-fg text-sm">{row.orders}</td>
            )}
            {isVisible('spend') && (
              <td className="px-4 py-3 text-right text-brand font-semibold text-sm">
                {formatLkr(row.totalSpend)}
              </td>
            )}
            {isVisible('branch') && (
              <td className="px-4 py-3 text-muted text-xs">{branchDisplayName(row.homeBranch)}</td>
            )}
            {isVisible('product') && (
              <td className="px-4 py-3 text-muted text-xs">{row.favoriteProduct ?? '—'}</td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="customers" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Customers"
      reportTitle="High-Value Customers Ledger"
      reportDescription="Top spending and most frequent customers across the brand."
      scopeLabel={storeId ? 'Selected Branch' : 'All Branches'}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${rows.length} customer${rows.length === 1 ? '' : 's'}`}
      referencePrefix="HVC"
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={3}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Orders', value: String(totals.totalOrders), tone: 'blue', prefix: '' },
              { label: 'Total Spend', value: formatLkr(totals.totalSpend), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="customers"
    />
    </>
  );
}
