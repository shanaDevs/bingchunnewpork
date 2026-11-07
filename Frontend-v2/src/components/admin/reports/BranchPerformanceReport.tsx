'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
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
import { TrendingUp, AlertCircle, Activity } from 'lucide-react';
import {
  adminFetch,
  branchDisplayName,
  buildPeriodQuery,
  downloadCsv,
  formatLkr,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type BranchRow = {
  storeId: string;
  branchName: string;
  location?: string;
  totalOrders: number;
  grossSales: number;
  aov?: number;
  performanceStatus?: string;
  rank?: number;
};

const COLUMNS = [
  { key: 'rank', label: 'Rank' },
  { key: 'branchName', label: 'Branch Name' },
  { key: 'location', label: 'Location/Region' },
  { key: 'totalOrders', label: 'Total Orders Count', align: 'right' as const },
  { key: 'grossSales', label: 'Total Gross Sales (LKR)', align: 'right' as const },
  { key: 'aov', label: 'AOV (LKR)', align: 'right' as const },
  { key: 'status', label: 'Performance Status' },
];

export default function BranchPerformanceReport() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeId, setStoreId] = useState('');
  const [orderMode, setOrderMode] = useState<'ALL' | 'TAKEAWAY' | 'DELIVERY'>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<'ALL' | 'CASH' | 'CARD' | 'ONLINE'>('ALL');
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams(buildPeriodQuery(period, customRange));
    params.set('orderMode', orderMode);
    params.set('paymentMethod', paymentMethod);
    params.set('metric', metric);
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/brand-branch-performance?${params.toString()}`;
  }, [period, customRange, storeId, orderMode, paymentMethod, metric]);

  const { data, isFetching } = useQuery<{ branchPerformance: BranchRow[] }>({
    queryKey: ['report-branch-performance', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => data?.branchPerformance ?? [], [data?.branchPerformance]);
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);
  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });
  const filterLabel = `${orderMode} · ${paymentMethod} · ${metric}`;

  const totals = useMemo(() => ({
    totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
    totalGross: rows.reduce((s, r) => s + r.grossSales, 0),
  }), [rows]);

  const pdfColumns = COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r, i) => ({
        key: r.storeId,
        cells: [
          visibleColumns.rank !== false ? String(r.rank ?? i + 1) : null,
          visibleColumns.branchName !== false ? branchDisplayName(r.branchName) : null,
          visibleColumns.location !== false ? r.location ?? '—' : null,
          visibleColumns.totalOrders !== false ? String(r.totalOrders) : null,
          visibleColumns.grossSales !== false ? formatPrintMoneyNoSymbol(r.grossSales) : null,
          visibleColumns.aov !== false
            ? formatPrintMoneyNoSymbol(r.aov ?? (r.totalOrders ? Math.round(r.grossSales / r.totalOrders) : 0))
            : null,
          visibleColumns.status !== false ? r.performanceStatus ?? '—' : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, visibleColumns],
  );

  return (
    <>
    <ReportSection
      id="branch-performance"
      title="Branch Performance Report"
      description="Top and least selling branches by revenue or order count."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      controls={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
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
          <ReportBranchFilter value={storeId} onChange={setStoreId} />
          <div className="flex items-center gap-2">
            <label htmlFor="orderCategory" className="text-[11px] font-medium text-muted uppercase tracking-wider">Category</label>
            <select
              id="orderCategory"
              value={orderMode}
              onChange={(e) => setOrderMode(e.target.value as typeof orderMode)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="TAKEAWAY">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="orderMethod" className="text-[11px] font-medium text-muted uppercase tracking-wider">Method</label>
            <select
              id="orderMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="ONLINE">Online</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="viewMetric" className="text-[11px] font-medium text-muted uppercase tracking-wider">Metric</label>
            <select
              id="viewMetric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="revenue">Revenue</option>
              <option value="orders">Orders</option>
            </select>
          </div>
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'branch-performance.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r, i) => [
            r.rank ?? i + 1,
            branchDisplayName(r.branchName),
            r.location ?? '—',
            r.totalOrders,
            r.grossSales,
            r.aov ?? (r.totalOrders ? Math.round(r.grossSales / r.totalOrders) : 0),
            r.performanceStatus ?? '—',
          ]),
        )
      }
      pdfTitle="Branch Performance Report"
      pdfReference="BPR-PREVIEW"
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
            <ReportFooterTotalCell label="Total Gross Sales" value={formatLkr(totals.totalGross)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row, index) => (
          <tr key={row.storeId} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('rank') && (
              <td className="px-4 py-3 text-muted text-xs font-bold">{row.rank ?? (page - 1) * 10 + index + 1}</td>
            )}
            {isVisible('branchName') && (
              <td className="px-4 py-3 text-fg text-sm">{branchDisplayName(row.branchName)}</td>
            )}
            {isVisible('location') && (
              <td className="px-4 py-3 text-muted text-xs">{row.location ?? '—'}</td>
            )}
            {isVisible('totalOrders') && (
              <td className="px-4 py-3 text-right text-fg text-sm">{row.totalOrders}</td>
            )}
            {isVisible('grossSales') && (
              <td className="px-4 py-3 text-right text-brand font-semibold text-sm">
                {formatLkr(row.grossSales)}
              </td>
            )}
            {isVisible('aov') && (
              <td className="px-4 py-3 text-right text-muted text-xs">
                {formatLkr(row.aov ?? (row.totalOrders ? Math.round(row.grossSales / row.totalOrders) : 0))}
              </td>
            )}
            {isVisible('status') && (
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                    row.performanceStatus === 'Top Performer'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : row.performanceStatus === 'Needs Attention'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {row.performanceStatus === 'Top Performer' && <TrendingUp size={12} />}
                  {row.performanceStatus === 'Needs Attention' && <AlertCircle size={12} />}
                  {row.performanceStatus !== 'Top Performer' && row.performanceStatus !== 'Needs Attention' && <Activity size={12} />}
                  {row.performanceStatus ?? '—'}
                </span>
              </td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="branches" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Branches"
      reportTitle="Branch Performance Report"
      reportDescription="Top and least selling branches by revenue or order count."
      scopeLabel={storeId ? 'Selected Branch' : 'All Branches'}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${rows.length} branch${rows.length === 1 ? '' : 'es'}`}
      referencePrefix="BPR"
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={3}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Orders', value: String(totals.totalOrders), tone: 'blue', prefix: '' },
              { label: 'Total Gross Sales', value: formatLkr(totals.totalGross), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="branches"
    />
    </>
  );
}
