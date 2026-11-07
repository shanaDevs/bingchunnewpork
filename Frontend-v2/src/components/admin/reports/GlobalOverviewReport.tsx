'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
  downloadCsv,
  formatDateShort,
  formatLkr,
  formatReportPeriodFromDates,
  type LockedStoreReportProps,
  orderModeLabel,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoney, formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type SalesOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  orderMode: string;
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  deliveryFee: number;
  convenientFee: number;
  total: number;
  store?: { name: string };
};

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'branch', label: 'Branch' },
  { key: 'type', label: 'Type' },
  { key: 'subtotal', label: 'Subtotal', align: 'right' as const },
  { key: 'discount', label: 'Applied Discount', align: 'right' as const },
  { key: 'loyaltyDiscount', label: 'Loyalty Discount', align: 'right' as const },
  { key: 'deliveryFee', label: 'Delivery Fee', align: 'right' as const },
  { key: 'convenienceFee', label: 'Conv. Fee', align: 'right' as const },
  { key: 'total', label: 'Total Paid', align: 'right' as const },
];

export default function GlobalOverviewReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));
  const scopeLabel = useReportScopeLabel(storeId, lockedStoreName);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', `${from}T00:00:00.000Z`);
    if (to) params.set('to', `${to}T23:59:59.000Z`);
    if (storeId) params.set('storeId', storeId);
    const qs = params.toString();
    return `/admin/reports/sales${qs ? `?${qs}` : ''}`;
  }, [from, to, storeId]);

  const { data, isFetching } = useQuery<{
    orders: SalesOrder[];
    totalRevenue: number;
    totalDiscount: number;
    totalLoyaltyDiscount: number;
    count: number;
  }>({
    queryKey: ['report-global-overview', queryUrl],
    queryFn: () => adminFetch(queryUrl),
    placeholderData: keepPreviousData,
  });

  const rows = data?.orders ?? [];
  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const totals = useMemo(() => ({
    count: rows.length,
    totalSubtotal: rows.reduce((s, r) => s + r.subtotal, 0),
    totalDiscount: rows.reduce((s, r) => s + (r.discount ?? 0), 0),
    totalLoyaltyDiscount: rows.reduce((s, r) => s + (r.loyaltyDiscount ?? 0), 0),
    totalDelivery: rows.reduce((s, r) => s + r.deliveryFee, 0),
    totalPaid: rows.reduce((s, r) => s + r.total, 0),
  }), [rows]);

  const periodLabel = formatReportPeriodFromDates(from, to);
  const pdfStats = [
    { label: 'Orders', value: String(data?.count ?? 0), tone: 'blue' as const },
    { label: 'Applied Discount', value: formatPrintMoney(data?.totalDiscount ?? totals.totalDiscount), tone: 'yellow' as const },
    { label: 'Loyalty Discount', value: formatPrintMoney(data?.totalLoyaltyDiscount ?? totals.totalLoyaltyDiscount), tone: 'purple' as const },
    { label: 'Total Paid', value: formatPrintMoney(data?.totalRevenue ?? 0), tone: 'green' as const },
  ];
  const pdfColumns = COLUMNS.filter((c) => isVisible(c.key)).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.slice(0, 200).map((r) => ({
        key: r.id,
        cells: [
          isVisible('date') ? formatDateShort(r.createdAt) : null,
          isVisible('orderId') ? r.orderNumber : null,
          isVisible('branch') ? branchDisplayName(r.store?.name) : null,
          isVisible('type') ? orderModeLabel(r.orderMode) : null,
          isVisible('subtotal') ? formatPrintMoneyNoSymbol(r.subtotal) : null,
          isVisible('discount') ? formatPrintMoneyNoSymbol(r.discount ?? 0) : null,
          isVisible('loyaltyDiscount') ? formatPrintMoneyNoSymbol(r.loyaltyDiscount ?? 0) : null,
          isVisible('deliveryFee') ? formatPrintMoneyNoSymbol(r.deliveryFee) : null,
          isVisible('convenienceFee') ? formatPrintMoneyNoSymbol(r.convenientFee) : null,
          isVisible('total') ? formatPrintMoneyNoSymbol(r.total) : null,
        ].filter((c) => c != null) as string[],
      })),
    [rows, isVisible],
  );

  return (
    <>
    <ReportSection
      id="global-overview"
      title="Global Business Overview Sheet"
      description="Ecosystem total sales with fee breakdowns for every paid order."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && !data}
      empty={rows.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      pdfStats={pdfStats}
      controls={
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <p className="text-xs text-muted mb-1">From</p>
            <input type="date" className="input-field text-sm py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted mb-1">To</p>
            <input type="date" className="input-field text-sm py-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {!lockedStoreId && (
            <ReportBranchFilter value={storeId} onChange={setStoreId} layout="stacked" />
          )}
        </div>
      }
      onExportCsv={() =>
        downloadCsv(
          'global-business-overview.csv',
          COLUMNS.map((c) => c.label),
          rows.map((r) => [
            formatDateShort(r.createdAt),
            r.orderNumber,
            branchDisplayName(r.store?.name),
            orderModeLabel(r.orderMode),
            r.subtotal,
            r.discount ?? 0,
            r.loyaltyDiscount ?? 0,
            r.deliveryFee,
            r.convenientFee,
            r.total,
          ]),
        )
      }
      pdfTitle="Global Business Overview Sheet"
      pdfReference={`GBO-${Date.now()}`}
      pdfPeriodLabel={periodLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={4}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={rows.length > 0 ? (
          <tr>
            <td colSpan={Math.max(COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 6, 1)} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Orders" value={String(totals.count)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Subtotal" value={formatLkr(totals.totalSubtotal)} toneClass="text-amber-500" />
            <ReportFooterTotalCell label="Applied Discount" value={formatLkr(totals.totalDiscount)} toneClass="text-yellow-500" />
            <ReportFooterTotalCell label="Loyalty Discount" value={formatLkr(totals.totalLoyaltyDiscount)} toneClass="text-violet-500" />
            <ReportFooterTotalCell label="Total Delivery" value={formatLkr(totals.totalDelivery)} toneClass="text-purple-500" />
            <ReportFooterTotalCell label="Total Paid" value={formatLkr(totals.totalPaid)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.id} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('date') && <td className="px-3 sm:px-4 py-3 text-muted text-xs whitespace-nowrap">{formatDateShort(row.createdAt)}</td>}
            {isVisible('orderId') && <td className="px-3 sm:px-4 py-3 text-fg text-xs font-mono whitespace-nowrap">{row.orderNumber}</td>}
            {isVisible('branch') && <td className="px-3 sm:px-4 py-3 text-muted text-xs max-w-[8rem] truncate" title={branchDisplayName(row.store?.name)}>{branchDisplayName(row.store?.name)}</td>}
            {isVisible('type') && <td className="px-3 sm:px-4 py-3 text-muted text-xs whitespace-nowrap">{orderModeLabel(row.orderMode)}</td>}
            {isVisible('subtotal') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.subtotal)}</td>}
            {isVisible('discount') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.discount ?? 0)}</td>}
            {isVisible('loyaltyDiscount') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.loyaltyDiscount ?? 0)}</td>}
            {isVisible('deliveryFee') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.deliveryFee)}</td>}
            {isVisible('convenienceFee') && <td className="px-3 sm:px-4 py-3 text-right text-muted text-xs whitespace-nowrap">{formatLkr(row.convenientFee)}</td>}
            {isVisible('total') && <td className="px-3 sm:px-4 py-3 text-right text-brand font-semibold text-sm whitespace-nowrap">{formatLkr(row.total)}</td>}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="orders" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Sales"
      reportTitle="Global Business Overview Sheet"
      reportDescription="Ecosystem total sales with fee breakdowns for every paid order."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      statusLine={`Live Report · ${rows.length} order${rows.length === 1 ? '' : 's'}`}
      referencePrefix="GBO"
      stats={pdfStats}
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={4}
      footerTotals={
        rows.length > 0
          ? [
              { label: 'Total Orders', value: String(totals.count), tone: 'blue', prefix: '' },
              { label: 'Total Subtotal', value: formatLkr(totals.totalSubtotal), tone: 'slate' },
              { label: 'Applied Discount', value: formatLkr(totals.totalDiscount), tone: 'slate' },
              { label: 'Loyalty Discount', value: formatLkr(totals.totalLoyaltyDiscount), tone: 'slate' },
              { label: 'Total Delivery', value: formatLkr(totals.totalDelivery), tone: 'slate' },
              { label: 'Total Paid', value: formatLkr(totals.totalPaid), tone: 'green' },
            ]
          : []
      }
      rowCountLabel="orders"
    />
    </>
  );
}
