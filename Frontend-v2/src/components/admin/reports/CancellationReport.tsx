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
import ReportBranchFilter, { useReportScopeLabel } from '@/components/admin/reports/ReportBranchFilter';
import AdminReportPreviewSheet from '@/components/admin/reports/AdminReportPreviewSheet';
import {
  adminFetch,
  branchDisplayName,
  buildPeriodQuery,
  downloadCsv,
  formatLkr,
  type LockedStoreReportProps,
  paymentMethodLabel,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type CancellationRow = {
  orderId: string;
  orderNumber: string;
  branchName: string;
  orderValue: number;
  paymentMethod: string;
  refundStatus: string;
  cancelledBy: string;
  reason: string;
};

const COLUMNS = [
  { key: 'orderId', label: 'Order ID' },
  { key: 'branch', label: 'Branch Name' },
  { key: 'value', label: 'Order Value (LKR)', align: 'right' as const },
  { key: 'payment', label: 'Payment Method' },
  { key: 'refund', label: 'Refund Status' },
  { key: 'by', label: 'Cancelled By' },
  { key: 'reason', label: 'Reason For Failure' },
];

export default function CancellationReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));
  const scopeLabel = useReportScopeLabel(storeId, lockedStoreName);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams(buildPeriodQuery(period, customRange));
    params.set('limit', '100');
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/order-cancellations?${params.toString()}`;
  }, [period, customRange, storeId]);

  const { data, isFetching } = useQuery<{ cancellations: CancellationRow[]; count: number }>({
    queryKey: ['report-order-cancellations', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = data?.cancellations ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    cancelled: rows.length,
    totalValue: rows.reduce((s, r) => s + r.orderValue, 0),
  }), [rows]);

  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });
  const pdfStats = [{ label: 'Issues', value: String(data?.count ?? 0), tone: 'yellow' as const }];
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((r) => ({
        key: r.orderId,
        cells: [
          isVisible('orderId') ? r.orderNumber : null,
          isVisible('branch') ? branchDisplayName(r.branchName) : null,
          isVisible('value') ? formatPrintMoneyNoSymbol(r.orderValue) : null,
          isVisible('payment') ? paymentMethodLabel(r.paymentMethod) : null,
          isVisible('refund') ? r.refundStatus : null,
          isVisible('by') ? r.cancelledBy : null,
          isVisible('reason') ? r.reason : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="order-cancellations"
      title="Order Cancellation & Issue Log"
      description="Cancelled and refunded orders with payment and failure reasons."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      pdfStats={pdfStats}
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
          {!lockedStoreId && <ReportBranchFilter value={storeId} onChange={setStoreId} />}
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'order-cancellations.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            r.orderNumber,
            branchDisplayName(r.branchName),
            r.orderValue,
            paymentMethodLabel(r.paymentMethod),
            r.refundStatus,
            r.cancelledBy,
            r.reason,
          ]),
        )
      }
      pdfTitle="Order Cancellation & Issue Log"
      pdfReference={`OCI-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={2}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 2} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Cancelled" value={String(totals.cancelled)} prefix="" toneClass="text-rose-500" />
            <ReportFooterTotalCell label="Total Order Value" value={formatLkr(totals.totalValue)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.orderId} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('orderId') && <td className="px-4 py-3 text-fg text-xs font-mono">{row.orderNumber}</td>}
            {isVisible('branch') && <td className="px-4 py-3 text-muted text-xs">{branchDisplayName(row.branchName)}</td>}
            {isVisible('value') && <td className="px-4 py-3 text-right text-brand font-semibold text-sm">{formatLkr(row.orderValue)}</td>}
            {isVisible('payment') && <td className="px-4 py-3 text-muted text-xs">{paymentMethodLabel(row.paymentMethod)}</td>}
            {isVisible('refund') && <td className="px-4 py-3 text-muted text-xs">{row.refundStatus}</td>}
            {isVisible('by') && <td className="px-4 py-3 text-muted text-xs">{row.cancelledBy}</td>}
            {isVisible('reason') && <td className="px-4 py-3 text-muted text-xs max-w-[280px]">{row.reason}</td>}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="issues" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Cancellations"
      reportTitle="Order Cancellation & Issue Log"
      reportDescription="Cancelled and refunded orders with payment and failure reasons."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      statusLine={`Live Report · ${rows.length} issue${rows.length === 1 ? '' : 's'}`}
      referencePrefix="OCI"
      stats={pdfStats}
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={2}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Cancelled', value: String(totals.cancelled), tone: 'rose', prefix: '' },
              { label: 'Total Order Value', value: formatLkr(totals.totalValue), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="issues"
    />
    </>
  );
}
