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
  downloadCsv,
  formatLkr,
  defaultReportMonthDateStrings,
  formatReportPeriodFromDates,
  type LockedStoreReportProps,
  ReportFooterTotalCell,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoneyNoSymbol } from '@/components/admin/AdminPrintReport';

type ProductRow = {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  totalQuantity: number;
  pickupQuantity: number;
  deliveryQuantity: number;
  totalRevenue: number;
};

const COLUMNS = [
  { key: 'sku', label: 'Item Code / SKU' },
  { key: 'productName', label: 'Product Name' },
  { key: 'category', label: 'Category' },
  { key: 'totalQuantity', label: 'Total Quantity Sold', align: 'right' as const },
  { key: 'pickupQuantity', label: 'Pickup Quantity', align: 'right' as const },
  { key: 'deliveryQuantity', label: 'Delivery Quantity', align: 'right' as const },
  { key: 'totalRevenue', label: 'Total Revenue Generated (LKR)', align: 'right' as const },
];

export default function ProductPerformanceReport({ lockedStoreId, lockedStoreName }: LockedStoreReportProps) {
  const [orderMode, setOrderMode] = useState<'ALL' | 'TAKEAWAY' | 'DELIVERY'>('ALL');
  const [sortBy, setSortBy] = useState<'top' | 'least'>('top');
  const [metric, setMetric] = useState<'quantity' | 'revenue'>('quantity');
  const monthDefaults = defaultReportMonthDateStrings();
  const [from, setFrom] = useState(monthDefaults.from);
  const [to, setTo] = useState(monthDefaults.to);
  const [storeId, setStoreId] = useState(lockedStoreId ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));
  const scopeLabel = useReportScopeLabel(storeId, lockedStoreName);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      orderMode,
      sortBy,
      metric,
      limit: '50',
    });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (storeId) params.set('storeId', storeId);
    return `/admin/reports/top-products?${params.toString()}`;
  }, [orderMode, sortBy, metric, from, to, storeId]);

  const { data = [], isFetching } = useQuery<ProductRow[]>({
    queryKey: ['report-product-performance', queryUrl],
    queryFn: () =>
      adminFetch(queryUrl).then((res) => (Array.isArray(res) ? (res as ProductRow[]) : [])),
    placeholderData: keepPreviousData,
  });

  const { page, setPage, pagedRows, totalItems } = useReportPagination(data);

  const totals = useMemo(() => ({
    totalQty: data.reduce((s, r) => s + r.totalQuantity, 0),
    totalPickup: data.reduce((s, r) => s + r.pickupQuantity, 0),
    totalDelivery: data.reduce((s, r) => s + r.deliveryQuantity, 0),
    totalRev: data.reduce((s, r) => s + r.totalRevenue, 0),
  }), [data]);

  const periodLabel = formatReportPeriodFromDates(from, to);
  const filterLabel = `${orderMode} · ${sortBy} · ${metric}`;
  const previewLeftColumns = 1 + COLUMNS.filter(
    (c) =>
      visibleColumns[c.key] !== false &&
      !['totalQuantity', 'pickupQuantity', 'deliveryQuantity', 'totalRevenue'].includes(c.key),
  ).length;
  const pdfColumns = [
    '#',
    ...COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) =>
      c.key === 'totalRevenue' ? 'Total Revenue (LKR)' : c.label,
    ),
  ];
  const pdfRows = useMemo(
    () =>
      data.map((r, index) => ({
        key: r.productId,
        cells: [
          String(index + 1),
          visibleColumns.sku !== false ? r.sku : null,
          visibleColumns.productName !== false ? r.productName : null,
          visibleColumns.category !== false ? r.category : null,
          visibleColumns.totalQuantity !== false ? String(r.totalQuantity) : null,
          visibleColumns.pickupQuantity !== false ? String(r.pickupQuantity) : null,
          visibleColumns.deliveryQuantity !== false ? String(r.deliveryQuantity) : null,
          visibleColumns.totalRevenue !== false ? formatPrintMoneyNoSymbol(r.totalRevenue) : null,
        ].filter((c) => c != null) as string[],
      })),
    [data, visibleColumns],
  );
  const exportCsv = () =>
    downloadCsv(
      'product-performance.csv',
      COLUMNS.map((c) => c.label),
      data.map((r) => [
        r.sku,
        r.productName,
        r.category,
        r.totalQuantity,
        r.pickupQuantity,
        r.deliveryQuantity,
        r.totalRevenue,
      ]),
    );
  const pdfStats = [
    { label: 'Total Products', value: String(data.length) },
    { label: 'Total Quantity Sold', value: String(totals.totalQty) },
    { label: 'Total Delivery Quantity', value: String(totals.totalDelivery) },
    { label: 'Total Revenue Generated', value: `LKR ${formatPrintMoneyNoSymbol(totals.totalRev)}` },
  ];
  const previewFooterTotals =
    data.length > 0
      ? [
          visibleColumns.totalQuantity !== false
            ? { label: 'Total Quantity Sold', value: String(totals.totalQty) }
            : null,
          visibleColumns.pickupQuantity !== false
            ? { label: 'Pickup Quantity', value: String(totals.totalPickup) }
            : null,
          visibleColumns.deliveryQuantity !== false
            ? { label: 'Delivery Quantity', value: String(totals.totalDelivery) }
            : null,
          visibleColumns.totalRevenue !== false
            ? { label: 'Total Revenue', value: formatPrintMoneyNoSymbol(totals.totalRev) }
            : null,
        ].filter((item): item is { label: string; value: string } => item != null)
      : [];

  return (
    <>
    <ReportSection
      id="product-performance"
      title="Product Performance Report"
      description="Top and least selling drinks by quantity or revenue."
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && data.length === 0}
      empty={data.length === 0}
      onPdfClick={() => setPreviewOpen(true)}
      controls={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap gap-3 items-end border-r border-navy-border/50 pr-4">
            <div className="flex items-center gap-2">
              <label htmlFor="fromDate" className="text-[11px] font-medium text-muted uppercase tracking-wider">From</label>
              <input
                id="fromDate"
                type="date"
                className="input-field text-sm px-2 py-1 h-[32px] rounded-lg"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="toDate" className="text-[11px] font-medium text-muted uppercase tracking-wider">To</label>
              <input
                id="toDate"
                type="date"
                className="input-field text-sm px-2 py-1 h-[32px] rounded-lg"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          {!lockedStoreId && <ReportBranchFilter value={storeId} onChange={setStoreId} />}
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
            <label htmlFor="sortBy" className="text-[11px] font-medium text-muted uppercase tracking-wider">Sort</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="top">Top Selling</option>
              <option value="least">Least Selling</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="metric" className="text-[11px] font-medium text-muted uppercase tracking-wider">Metric</label>
            <select
              id="metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              className="input-field text-sm rounded-lg px-2 py-1 h-[32px] min-w-[100px] cursor-pointer"
            >
              <option value="quantity">Quantity</option>
              <option value="revenue">Revenue</option>
            </select>
          </div>
        </div>
      }
      onExportCsv={exportCsv}
      pdfTitle="Product Performance Report"
      pdfReference="PPR-PREVIEW"
      pdfPeriodLabel={periodLabel}
      pdfFilterLabel={filterLabel}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={3}
    >
      <ReportTable
        columns={COLUMNS}
        visibleColumns={visibleColumns}
        footer={data.length > 0 ? (
          <tr>
            <td colSpan={COLUMNS.filter((c) => visibleColumns[c.key] !== false).length - 2} className="border-t-[3px] border-blue-900/60" />
            <ReportFooterTotalCell label="Total Qty Sold" value={String(totals.totalQty)} prefix="" toneClass="text-blue-500" />
            <ReportFooterTotalCell label="Total Revenue" value={formatLkr(totals.totalRev)} toneClass="text-emerald-500" />
          </tr>
        ) : undefined}
      >
        {pagedRows.map((row) => (
          <tr key={row.productId} className="border-b border-navy-border hover:bg-navy-light/20">
            {isVisible('sku') && <td className="px-4 py-3 text-muted text-xs font-mono">{row.sku}</td>}
            {isVisible('productName') && <td className="px-4 py-3 text-fg text-sm">{row.productName}</td>}
            {isVisible('category') && <td className="px-4 py-3 text-muted text-xs">{row.category}</td>}
            {isVisible('totalQuantity') && (
              <td className="px-4 py-3 text-right text-brand font-semibold text-sm">{row.totalQuantity}</td>
            )}
            {isVisible('pickupQuantity') && (
              <td className="px-4 py-3 text-right text-muted text-xs">{row.pickupQuantity}</td>
            )}
            {isVisible('deliveryQuantity') && (
              <td className="px-4 py-3 text-right text-muted text-xs">{row.deliveryQuantity}</td>
            )}
            {isVisible('totalRevenue') && (
              <td className="px-4 py-3 text-right text-fg text-sm">{formatLkr(row.totalRevenue)}</td>
            )}
          </tr>
        ))}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="products" />
    </ReportSection>

    <AdminReportPreviewSheet
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      docTitle="Products"
      reportTitle="Product Performance Report"
      reportDescription="Top and least selling drinks by quantity or revenue."
      scopeLabel={scopeLabel}
      periodLabel={periodLabel}
      filterLabel={filterLabel}
      statusLine={`Live Report · ${data.length} product${data.length === 1 ? '' : 's'}`}
      referencePrefix="PPR"
      stats={pdfStats}
      columns={pdfColumns}
      rows={pdfRows}
      alignRightFromColumn={previewLeftColumns}
      footerTotals={previewFooterTotals}
      rowCountLabel="products"
      onExportExcel={exportCsv}
    />
    </>
  );
}
