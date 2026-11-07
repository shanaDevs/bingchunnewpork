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
import {
  adminFetch,
  branchDisplayName,
  buildPeriodQuery,
  downloadCsv,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';

type BranchFulfillment = {
  branchName: string;
  totalOrders: number;
  avgPreparationMinutes: number;
  avgDispatchMinutes: number;
  delayedOrders: number;
  delayPercentage: number;
};

const COLUMNS = [
  { key: 'branch', label: 'Branch Name' },
  { key: 'total', label: 'Total Orders Handled', align: 'right' as const },
  { key: 'prep', label: 'Avg. Preparation Time', align: 'right' as const },
  { key: 'dispatch', label: 'Avg. Delivery Dispatch Time', align: 'right' as const },
  { key: 'delayed', label: 'Total Delayed Orders', align: 'right' as const },
  { key: 'delayPct', label: 'Delay Percentage (%)', align: 'right' as const },
];



function minutesLabel(value: number) {
  if (!value) return '0 min';
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return `${h}h ${m}m`;
}

export default function FulfillmentReport() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeId, setStoreId] = useState('');
  const [orderMode, setOrderMode] = useState<'ALL' | 'TAKEAWAY' | 'DELIVERY'>('ALL');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams(buildPeriodQuery(period, customRange));
    params.set('orderMode', orderMode);
    params.set('delayedOnly', String(delayedOnly));
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/order-fulfillment?${params.toString()}`;
  }, [period, customRange, storeId, orderMode, delayedOnly]);

  const { data, isFetching } = useQuery<{
    branches: BranchFulfillment[];
    delayThresholdMinutes: number;
  }>({
    queryKey: ['report-order-fulfillment', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = data?.branches ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
    totalDelayed: rows.reduce((s, r) => s + r.delayedOrders, 0),
  }), [rows]);

  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });
  const filterLabel = `${orderMode} · ${delayedOnly ? 'Delayed only' : 'All'}`;
  const reportDescription = `Prep and dispatch speed by branch. Delayed when fulfillment exceeds ~${data?.delayThresholdMinutes ?? 45} minutes.`;
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: r.branchName,
        cells: [
          isVisible('branch') ? branchDisplayName(r.branchName) : null,
          isVisible('total') ? String(r.totalOrders) : null,
          isVisible('prep') ? minutesLabel(r.avgPreparationMinutes) : null,
          isVisible('dispatch') ? minutesLabel(r.avgDispatchMinutes) : null,
          isVisible('delayed') ? String(r.delayedOrders) : null,
          isVisible('delayPct') ? `${r.delayPercentage}%` : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="order-fulfillment"
      title="Order Fulfillment & Efficiency Analytics"
      description={reportDescription}
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
            <label htmlFor="delayedOnly" className="text-[11px] font-medium text-muted uppercase tracking-wider">Performance Level</label>
            <select
              id="delayedOnly"
              value={delayedOnly ? 'delayed' : 'all'}
              onChange={(e) => setDelayedOnly(e.target.value === 'delayed')}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="all">Show All</option>
              <option value="delayed">Delayed Orders Only</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="orderType" className="text-[11px] font-medium text-muted uppercase tracking-wider">Order Type</label>
            <select
              id="orderType"
              value={orderMode}
              onChange={(e) => setOrderMode(e.target.value as any)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="TAKEAWAY">Pickup</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </div>
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'order-fulfillment.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            branchDisplayName(r.branchName),
            r.totalOrders,
            minutesLabel(r.avgPreparationMinutes),
            minutesLabel(r.avgDispatchMinutes),
            r.delayedOrders,
            r.delayPercentage,
          ]),
        )
      }
      pdfTitle="Order Fulfillment & Efficiency Analytics"
      pdfReference={`OFE-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfFilterLabel={filterLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={1}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 2} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Orders" value={String(totals.totalOrders)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Delayed" value={String(totals.totalDelayed)} prefix="" toneClass="text-rose-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.branchName} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('branch') && <td className="px-4 py-3 text-fg text-sm">{branchDisplayName(row.branchName)}</td>}
            {isVisible('total') && <td className="px-4 py-3 text-right text-fg text-sm">{row.totalOrders}</td>}
            {isVisible('prep') && <td className="px-4 py-3 text-right text-muted text-xs">{minutesLabel(row.avgPreparationMinutes)}</td>}
            {isVisible('dispatch') && <td className="px-4 py-3 text-right text-muted text-xs">{minutesLabel(row.avgDispatchMinutes)}</td>}
            {isVisible('delayed') && <td className="px-4 py-3 text-right text-amber-300 text-sm">{row.delayedOrders}</td>}
            {isVisible('delayPct') && (
              <td className="px-4 py-3 text-right text-brand font-semibold text-sm">{row.delayPercentage}%</td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="branches" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Fulfillment"
      reportTitle="Order Fulfillment & Efficiency Analytics"
      reportDescription={reportDescription}
      scopeLabel={storeId ? 'Selected Branch' : 'All Branches'}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${rows.length} branch${rows.length === 1 ? '' : 'es'}`}
      referencePrefix="OFE"
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={1}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Orders', value: String(totals.totalOrders), tone: 'blue', prefix: '' },
              { label: 'Total Delayed', value: String(totals.totalDelayed), tone: 'rose', prefix: '' },
            ]
          : []
      }
      rowCountLabel="branches"
    />
    </>
  );
}
