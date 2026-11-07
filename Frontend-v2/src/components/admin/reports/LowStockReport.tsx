'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReportSection, {
  ReportPagination,
  ReportTable,
  useColumnVisibility,
  useReportPagination,
} from '@/components/admin/reports/ReportSection';
import {
  adminStockFetch,
  downloadCsv,
  qtyStatus,
  type StockItem,
  type StockResponse,
} from '@/lib/stockApi';

const COLUMNS = [
  { key: 'product', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'onHand', label: 'On Hand', align: 'right' as const },
  { key: 'lowThreshold', label: 'Low Stock Threshold', align: 'right' as const },
  { key: 'oosThreshold', label: 'Out-of-Stock Threshold', align: 'right' as const },
  { key: 'status', label: 'Status' },
  { key: 'active', label: 'Active' },
];

function statusLabel(item: StockItem): string {
  if (item.isOutOfStock) return 'Out of stock';
  if (item.isLowStock) return 'Low stock';
  return 'In stock';
}

function sortLowStockItems(items: StockItem[]): StockItem[] {
  return [...items].sort((a, b) => {
    if (a.isOutOfStock !== b.isOutOfStock) return a.isOutOfStock ? -1 : 1;
    if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
    return a.onHandQty - b.onHandQty;
  });
}

type LowStockReportProps = {
  storeId: string;
  storeName?: string;
};

export default function LowStockReport({ storeId, storeName }: LowStockReportProps) {
  const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility(COLUMNS.map((c) => c.key));

  const { data, isFetching } = useQuery({
    queryKey: ['branch-low-stock-report', storeId],
    queryFn: () => adminStockFetch<StockResponse>(`/admin/stock?storeId=${encodeURIComponent(storeId)}`),
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return sortLowStockItems(items.filter((item) => item.isLowStock || item.isOutOfStock));
  }, [data?.items]);

  const { page, setPage, pagedRows, totalItems } = useReportPagination(rows);

  const outOfStockCount = useMemo(
    () => rows.filter((item) => item.isOutOfStock).length,
    [rows],
  );
  const lowStockCount = useMemo(
    () => rows.filter((item) => item.isLowStock && !item.isOutOfStock).length,
    [rows],
  );

  const branchLabel = storeName?.replace('Bing Chun - ', '') ?? data?.store.name.replace('Bing Chun - ', '') ?? 'Branch';
  const generatedAt = new Date().toLocaleString();

  const pdfColumns = COLUMNS.filter((c) => visibleColumns[c.key] !== false).map((c) => c.label);
  const pdfRows = useMemo(
    () =>
      rows.map((item) => ({
        key: item.productId,
        cells: [
          visibleColumns.product !== false ? item.name : null,
          visibleColumns.category !== false ? item.category.name : null,
          visibleColumns.onHand !== false ? String(item.onHandQty) : null,
          visibleColumns.lowThreshold !== false ? String(item.lowStockThreshold) : null,
          visibleColumns.oosThreshold !== false ? String(item.onlineOutOfStockThreshold) : null,
          visibleColumns.status !== false ? statusLabel(item) : null,
          visibleColumns.active !== false ? (item.isAvailable ? 'Active' : 'Inactive') : null,
        ].filter((cell) => cell != null) as string[],
      })),
    [rows, visibleColumns],
  );

  function exportCsv() {
    downloadCsv(`low-stock-report-${branchLabel.replace(/\s+/g, '-').toLowerCase()}.csv`, [
      ['Product', 'Category', 'On Hand', 'Low Stock Threshold', 'Out-of-Stock Threshold', 'Status', 'Active'],
      ...rows.map((item) => [
        item.name,
        item.category.name,
        item.onHandQty,
        item.lowStockThreshold,
        item.onlineOutOfStockThreshold,
        statusLabel(item),
        item.isAvailable ? 'Active' : 'Inactive',
      ]),
    ]);
  }

  if (!storeId) {
    return (
      <div className="card p-8 text-center text-muted text-sm">
        Your account is not linked to a branch. Contact a super admin.
      </div>
    );
  }

  return (
    <ReportSection
      id="branch-low-stock"
      title="Low Stock Report"
      description={`Products at or below branch thresholds for ${branchLabel}. Refreshes every minute.`}
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      columnOptions={COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
      loading={isFetching && rows.length === 0}
      empty={rows.length === 0}
      emptyMessage="No low-stock or out-of-stock products right now."
      onExportCsv={exportCsv}
      pdfTitle="Low Stock Report"
      pdfReference={`LSR-${storeId.slice(0, 8).toUpperCase()}`}
      pdfPeriodLabel={`As of ${generatedAt}`}
      pdfFilterLabel={branchLabel}
      pdfStats={[
        { label: 'Out of stock', value: String(outOfStockCount) },
        { label: 'Low stock', value: String(lowStockCount) },
        { label: 'Total flagged', value: String(rows.length) },
      ]}
      pdfColumns={pdfColumns}
      pdfRows={pdfRows}
      alignRightFromColumn={2}
    >
      <ReportTable columns={COLUMNS} visibleColumns={visibleColumns}>
        {pagedRows.map((item) => {
          const status = qtyStatus(item);
          return (
            <tr key={item.productId}>
              {isVisible('product') && (
                <td className="px-3 sm:px-4 py-3">
                  <p className="font-medium text-fg">{item.name}</p>
                </td>
              )}
              {isVisible('category') && (
                <td className="px-3 sm:px-4 py-3 text-muted">{item.category.name}</td>
              )}
              {isVisible('onHand') && (
                <td className="px-3 sm:px-4 py-3 text-right tabular-nums font-semibold">{item.onHandQty}</td>
              )}
              {isVisible('lowThreshold') && (
                <td className="px-3 sm:px-4 py-3 text-right tabular-nums">{item.lowStockThreshold}</td>
              )}
              {isVisible('oosThreshold') && (
                <td className="px-3 sm:px-4 py-3 text-right tabular-nums">{item.onlineOutOfStockThreshold}</td>
              )}
              {isVisible('status') && (
                <td className="px-3 sm:px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status.text}`}>
                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </td>
              )}
              {isVisible('active') && (
                <td className="px-3 sm:px-4 py-3">
                  <span className={`text-xs font-medium ${item.isAvailable ? 'text-emerald-400' : 'text-muted'}`}>
                    {item.isAvailable ? 'Active' : 'Inactive'}
                  </span>
                </td>
              )}
            </tr>
          );
        })}
      </ReportTable>
      <ReportPagination page={page} totalItems={totalItems} onPageChange={setPage} label="products" />
    </ReportSection>
  );
}
