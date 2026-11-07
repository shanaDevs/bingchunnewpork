'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Download,
  DollarSign,
  History,
  Layers,
  Package,
  Tag,
} from 'lucide-react';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  adminStockFetch,
  batchTypeBadgeClass,
  batchTypeLabel,
  exportLedgerExcel,
  fetchMovementLedger,
  type StockItem,
  type StockLedgerDayBatch,
  type StockLedgerResponse,
  type StockLedgerRow,
  type StockMovementTab,
  type StockProductPricing,
} from '@/lib/stockApi';
import toast from 'react-hot-toast';

interface StockMovementPanelProps {
  storeId: string;
  products: StockItem[];
  stores?: { id: string; name: string }[];
  onStoreChange?: (storeId: string) => void;
  defaultTab?: StockMovementTab;
}

const LEDGER_COL_COUNT = 11;

const LEDGER_HEADERS = [
  'Date',
  'Open Stock',
  'Stock Value',
  'Stock In',
  'Stock Out',
  'LKR In',
  'LKR Out',
  'Stock Margin',
  'LKR Margin',
  'Discount (LKR)',
  'Batch Number',
] as const;

const MOVEMENT_TABS = [
  { key: 'product_wise' as const, label: 'Product-wise Ledger', Icon: Package },
  { key: 'all_products' as const, label: 'All Products', Icon: History },
];

function formatLedgerDate(isoDate: string): string {
  return formatDate(`${isoDate}T12:00:00`);
}

function formatLedgerDateTime(iso: string): string {
  const formatted = formatDateTime(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatted.replace(',', ' ·');
}

function formatQty(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

function formatLkr(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

function batchStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function batchStatusClass(status: string): string {
  if (status === 'ACTIVE') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'DEPLETED') return 'bg-navy-light text-muted';
  if (status === 'WRITTEN_OFF') return 'bg-red-500/15 text-red-400';
  return 'bg-navy-light text-muted';
}

function LedgerBatchAccordion({
  row,
  catalogUnitCost,
  showProduct,
  onToggle,
}: {
  row: StockLedgerRow;
  catalogUnitCost: number;
  showProduct: boolean;
  onToggle: () => void;
}) {
  const batches = row.batches ?? [];
  const receivedTotal = batches.reduce((sum, batch) => sum + batch.receivedQty, 0);
  const dateLabel = formatLedgerDate(row.date);

  return (
    <tr className="bg-sky-500/5">
      <td colSpan={LEDGER_COL_COUNT} className="p-0">
        <div className="border-t border-sky-500/20 bg-sky-500/[0.03] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h4 className="text-sm font-semibold text-fg">Batches received on {dateLabel}</h4>
            <span className="inline-flex items-center rounded-full bg-navy-light px-2.5 py-0.5 text-[11px] font-medium text-muted">
              {batches.length} batch{batches.length === 1 ? '' : 'es'} · {receivedTotal.toLocaleString()} units
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted">
                  <th className="p-3 text-left font-medium">Batch number</th>
                  {showProduct && <th className="p-3 text-left font-medium">Product</th>}
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="p-3 text-left font-medium">Received</th>
                  <th className="p-3 text-left font-medium">Unit cost (LKR)</th>
                  <th className="p-3 text-left font-medium">Remaining</th>
                  <th className="p-3 text-left font-medium">Received time</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <LedgerBatchRow
                    key={batch.id}
                    batch={batch}
                    catalogUnitCost={catalogUnitCost}
                    showProduct={showProduct}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sky-500/10 px-4 py-2.5 text-sm">
            <span className="font-medium text-fg">Day total · {dateLabel}</span>
            <div className="flex items-center gap-6 tabular-nums">
              <span>
                <span className="text-muted mr-2">Stock Margin</span>
                <span className="font-semibold text-brand">{formatQty(row.stockMargin)}</span>
              </span>
              <span>
                <span className="text-muted mr-2">LKR Margin</span>
                <span className="font-semibold text-brand">{formatLkr(row.lkrMargin)}</span>
              </span>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              Hide details
              <ChevronUp size={14} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function displayBatchNumber(batch: StockLedgerDayBatch): string {
  if (batch.batchType === 'RESET' && batch.batchGroupNumber) return batch.batchGroupNumber;
  return batch.batchNumber;
}

function LedgerBatchRow({
  batch,
  catalogUnitCost,
  showProduct,
}: {
  batch: StockLedgerDayBatch;
  catalogUnitCost: number;
  showProduct: boolean;
}) {
  const unitCost = batch.unitCost ?? catalogUnitCost;

  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="p-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-emerald-500/70" />
            <span className="font-mono text-xs">{displayBatchNumber(batch)}</span>
          </div>
          {batch.batchType && (
            <span
              className={`${batchTypeBadgeClass(batch.batchType)} uppercase tracking-wide`}
            >
              {batchTypeLabel(batch.batchType)}
            </span>
          )}
        </div>
      </td>
      {showProduct && <td className="p-3">{batch.productName ?? '—'}</td>}
      <td className="p-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${batchStatusClass(batch.status)}`}>
          {batchStatusLabel(batch.status)}
        </span>
      </td>
      <td className="p-3 tabular-nums">{batch.receivedQty.toLocaleString()} units</td>
      <td className="p-3 tabular-nums">LKR {unitCost.toLocaleString()}</td>
      <td className="p-3 tabular-nums">{batch.remainingQty.toLocaleString()} units</td>
      <td className="p-3 text-muted whitespace-nowrap">{formatLedgerDateTime(batch.receivedAt)}</td>
    </tr>
  );
}

function LedgerDayRow({
  row,
  catalogUnitCost,
  showProduct,
  expanded,
  onToggle,
}: {
  row: StockLedgerRow;
  catalogUnitCost: number;
  showProduct: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const batches = row.batches ?? [];
  const hasMultipleBatches = batches.length > 1;
  const receivedTotal = batches.reduce((sum, batch) => sum + batch.receivedQty, 0);
  const hasMovement = (row.stockIn ?? 0) > 0 || (row.stockOut ?? 0) > 0 || batches.length > 0;

  return (
    <>
      <tr className={expanded ? 'bg-sky-500/5' : hasMovement ? 'hover:bg-navy-light/20' : undefined}>
        <td className="p-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {hasMultipleBatches ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-navy-light hover:text-fg"
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide batch details' : 'Show batch details'}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            ) : (
              <span className="inline-block w-6" />
            )}
            <span className="font-medium">{formatLedgerDate(row.date)}</span>
          </div>
        </td>
        <td className="p-3 tabular-nums">{formatQty(row.openStock)}</td>
        <td className="p-3 tabular-nums">{formatLkr(row.stockValue)}</td>
        <td className={`p-3 tabular-nums ${(row.stockIn ?? 0) > 0 ? 'text-emerald-400 font-medium' : ''}`}>
          {formatQty(row.stockIn)}
        </td>
        <td className="p-3 tabular-nums">{formatQty(row.stockOut)}</td>
        <td className="p-3 tabular-nums">{formatLkr(row.lkrIn)}</td>
        <td className="p-3 tabular-nums">{formatLkr(row.lkrOut)}</td>
        <td className="p-3 tabular-nums font-medium">{formatQty(row.stockMargin)}</td>
        <td className="p-3 tabular-nums font-medium">{formatLkr(row.lkrMargin)}</td>
        <td className="p-3 tabular-nums">{formatLkr(row.discountTotal)}</td>
        <td className="p-3">
          {batches.length === 0 ? (
            <span className="text-muted">—</span>
          ) : batches.length === 1 ? (
            <div className="flex items-start gap-2 min-w-[140px]">
              <Layers size={14} className="mt-0.5 shrink-0 text-muted" />
              <div>
                <p className="font-mono text-xs">{displayBatchNumber(batches[0])}</p>
                {batches[0].batchType && (
                  <span
                    className={`mt-1 ${batchTypeBadgeClass(batches[0].batchType)} uppercase tracking-wide`}
                  >
                    {batchTypeLabel(batches[0].batchType)}
                  </span>
                )}
                <p className="text-[11px] text-muted">{batches[0].receivedQty.toLocaleString()} units received</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 min-w-[180px]">
              <div className="flex items-start gap-2">
                <Layers size={14} className="mt-0.5 shrink-0 text-muted" />
                <div>
                  <p className="text-sm font-medium">{batches.length} batches</p>
                  <p className="text-[11px] text-muted">{receivedTotal.toLocaleString()} units received</p>
                </div>
              </div>
              {!expanded && (
                <button
                  type="button"
                  onClick={onToggle}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-brand hover:underline"
                >
                  View details
                  <ChevronDown size={14} />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {expanded && hasMultipleBatches && (
        <LedgerBatchAccordion
          row={row}
          catalogUnitCost={catalogUnitCost}
          showProduct={showProduct}
          onToggle={onToggle}
        />
      )}
    </>
  );
}

function LedgerTable({
  ledger,
  isLoading,
  isError,
  error,
  emptyMessage,
  pageRows,
  showOpening,
  showBroughtForward,
  showProductInBatches,
  pagination,
}: {
  ledger?: StockLedgerResponse;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  emptyMessage: string;
  pageRows: StockLedgerResponse['rows'];
  showOpening: boolean;
  showBroughtForward: boolean;
  showProductInBatches: boolean;
  pagination: React.ReactNode;
}) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const catalogUnitCost = ledger?.product.cost ?? 0;

  useEffect(() => {
    setExpandedDates(new Set());
  }, [ledger?.from, ledger?.to, ledger?.product.id]);

  function toggleExpanded(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="admin-table w-full text-sm">
          <thead>
            <tr>
              {LEDGER_HEADERS.map((header) => (
                <th key={header} className="p-3 text-left font-medium whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={LEDGER_COL_COUNT} className="p-10 text-center text-muted">
                  Loading ledger…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={LEDGER_COL_COUNT} className="p-10 text-center text-red-400">
                  {error?.message || 'Failed to load ledger'}
                </td>
              </tr>
            ) : !ledger ? (
              <tr>
                <td colSpan={LEDGER_COL_COUNT} className="p-10 text-center text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              <>
                {showOpening && (
                  <tr className="bg-navy-light/20">
                    <td className="p-3 whitespace-nowrap font-medium">
                      Opening Balance ({formatLedgerDate(ledger.opening.date)})
                    </td>
                    <td className="p-3 tabular-nums">{formatQty(ledger.opening.stock)}</td>
                    <td className="p-3 tabular-nums">{formatLkr(ledger.opening.value)}</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                    <td className="p-3 tabular-nums">{formatLkr(ledger.opening.lkrMargin)}</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <LedgerDayRow
                    key={row.date}
                    row={row}
                    catalogUnitCost={catalogUnitCost}
                    showProduct={showProductInBatches}
                    expanded={expandedDates.has(row.date)}
                    onToggle={() => toggleExpanded(row.date)}
                  />
                ))}
                {showBroughtForward && (
                  <tr className="bg-brand/10 border-t-2 border-brand/30">
                    <td className="p-3 font-semibold whitespace-nowrap">
                      Brought Forward ({formatLedgerDate(ledger.broughtForward.date)})
                    </td>
                    <td className="p-3 tabular-nums font-semibold">{formatQty(ledger.broughtForward.stock)}</td>
                    <td className="p-3 tabular-nums font-semibold">{formatLkr(ledger.broughtForward.value)}</td>
                    <td className="p-3" colSpan={4} />
                    <td className="p-3 tabular-nums font-semibold">{formatQty(ledger.broughtForward.stock)}</td>
                    <td className="p-3 tabular-nums font-semibold">{formatLkr(ledger.broughtForward.lkrMargin)}</td>
                    <td className="p-3">—</td>
                    <td className="p-3">—</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      {pagination}
    </div>
  );
}

function formatBranchName(name: string): string {
  return name.replace('Bing Chun - ', '');
}

function LedgerFilterRow({
  stores,
  storeId,
  onStoreChange,
  from,
  to,
  onFromChange,
  onToChange,
  showProduct,
  selectedProductId,
  onProductChange,
  products,
}: {
  stores: { id: string; name: string }[];
  storeId: string;
  onStoreChange?: (storeId: string) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  showProduct?: boolean;
  selectedProductId?: string;
  onProductChange?: (value: string) => void;
  products?: StockItem[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {stores.length > 0 && onStoreChange && (
        <div className="min-w-[200px] max-w-xs">
          <label className="text-xs text-muted uppercase tracking-wide">Branch</label>
          <SearchableBranchSelect
            stores={stores}
            value={storeId || undefined}
            onChange={onStoreChange}
            formatName={formatBranchName}
            allowAll={false}
            placeholder="Select branch…"
            className="mt-1"
          />
        </div>
      )}
      <div>
        <label className="text-xs text-muted uppercase tracking-wide">From</label>
        <input
          type="date"
          className="input-field max-w-[160px] mt-1 block"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-muted uppercase tracking-wide">To</label>
        <input
          type="date"
          className="input-field max-w-[160px] mt-1 block"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
        />
      </div>
      {showProduct && onProductChange && products && (
        <div className="min-w-[200px] max-w-xs">
          <label className="text-xs text-muted uppercase tracking-wide">Product</label>
          <select
            className="input-field mt-1 w-full"
            value={selectedProductId ?? ''}
            onChange={(e) => onProductChange(e.target.value)}
            disabled={!storeId}
          >
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function formatDateRangeLabel(from: string, to: string): string {
  if (!from || !to) return 'Select a date range';
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const fromLabel = fromDate.toLocaleDateString(undefined, opts);
  const toLabel = toDate.toLocaleDateString(undefined, opts);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
}

function StockPriceCard({
  label,
  amount,
  subtitle,
  tone,
  icon: Icon,
}: {
  label: string;
  amount: number | null;
  subtitle: string;
  tone: 'blue' | 'emerald';
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const styles = {
    blue: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  }[tone];

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.bg}`}>
        <Icon size={20} className={styles.text} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${styles.text}`}>{label}</p>
        <p className="text-2xl font-bold text-fg tabular-nums leading-tight mt-0.5">
          {amount == null ? '—' : `LKR ${amount.toLocaleString()}`}
        </p>
        <p className="text-[11px] text-muted mt-0.5 truncate">{subtitle}</p>
      </div>
    </div>
  );
}

export default function StockMovementPanel({
  storeId,
  products,
  stores = [],
  onStoreChange,
  defaultTab = 'product_wise',
}: StockMovementPanelProps) {
  const [tab, setTab] = useState<StockMovementTab>(defaultTab);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const [productWiseFrom, setProductWiseFrom] = useState('');
  const [productWiseTo, setProductWiseTo] = useState('');
  const [allProductsFrom, setAllProductsFrom] = useState('');
  const [allProductsTo, setAllProductsTo] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [exporting, setExporting] = useState(false);

  const from = tab === 'product_wise' ? productWiseFrom : allProductsFrom;
  const to = tab === 'product_wise' ? productWiseTo : allProductsTo;

  useEffect(() => {
    setSelectedProductId('');
  }, [storeId]);

  useEffect(() => {
    setPage(1);
  }, [tab, storeId, productWiseFrom, productWiseTo, allProductsFrom, allProductsTo, selectedProductId]);

  const allProductsLedgerQuery = useQuery({
    queryKey: ['admin-stock-ledger-all', storeId, allProductsFrom, allProductsTo],
    queryFn: () => {
      const params = new URLSearchParams({ storeId, from: allProductsFrom, to: allProductsTo });
      return adminStockFetch<StockLedgerResponse>(`/admin/stock/movement-ledger?${params}`);
    },
    enabled: Boolean(storeId && tab === 'all_products' && allProductsFrom && allProductsTo),
  });

  const productLedgerQuery = useQuery({
    queryKey: ['admin-stock-ledger', storeId, selectedProductId, productWiseFrom, productWiseTo],
    queryFn: () => {
      const params = new URLSearchParams({
        storeId,
        productId: selectedProductId,
        from: productWiseFrom,
        to: productWiseTo,
      });
      return adminStockFetch<StockLedgerResponse>(`/admin/stock/movement-ledger?${params}`);
    },
    enabled: Boolean(
      storeId && tab === 'product_wise' && selectedProductId && productWiseFrom && productWiseTo,
    ),
  });

  const activeLedgerQuery = tab === 'all_products' ? allProductsLedgerQuery : productLedgerQuery;
  const ledger = activeLedgerQuery.data;

  const selectedProduct = products.find((p) => p.productId === selectedProductId);
  const pricingReady = Boolean(storeId && selectedProductId && productWiseFrom && productWiseTo);
  const rangeLabel = formatDateRangeLabel(productWiseFrom, productWiseTo);

  const pricingQuery = useQuery({
    queryKey: ['admin-stock-pricing', storeId, selectedProductId, productWiseFrom, productWiseTo],
    queryFn: () => {
      const params = new URLSearchParams({ storeId, from: productWiseFrom, to: productWiseTo });
      return adminStockFetch<StockProductPricing>(
        `/admin/stock/${selectedProductId}/pricing?${params.toString()}`,
      );
    },
    enabled: pricingReady && tab === 'product_wise',
  });

  const pricing = pricingQuery.data;

  const ledgerRowCount = ledger?.rows.length ?? 0;
  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerRowCount / pageSize));
  const ledgerSafePage = Math.min(page, ledgerTotalPages);

  useEffect(() => {
    if (page > ledgerTotalPages) setPage(ledgerTotalPages);
  }, [page, ledgerTotalPages]);

  const ledgerPageRows = useMemo(() => {
    if (!ledger) return [];
    const start = (ledgerSafePage - 1) * pageSize;
    return ledger.rows.slice(start, start + pageSize);
  }, [ledger, ledgerSafePage, pageSize]);

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  async function handleExport() {
    if (!from || !to) {
      toast.error('Select a date range before exporting');
      return;
    }

    if (tab === 'product_wise' && !selectedProductId) {
      toast.error('Select a product before exporting');
      return;
    }

    setExporting(true);
    try {
      const freshLedger = await fetchMovementLedger({
        storeId,
        from,
        to,
        productId: tab === 'product_wise' ? selectedProductId : undefined,
      });
      if (freshLedger.rows.length === 0) {
        toast.error('No ledger data to export for this date range');
        return;
      }
      const tabSuffix =
        tab === 'product_wise' && selectedProductId ? `-${selectedProductId}` : '-all-products';
      exportLedgerExcel(`stock-ledger-${from}-to-${to}${tabSuffix}.xlsx`, freshLedger);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const canExport = Boolean(
    from &&
      to &&
      storeId &&
      !exporting &&
      (tab === 'product_wise'
        ? Boolean(selectedProductId && ledger && ledger.rows.length > 0)
        : Boolean(ledger && ledger.rows.length > 0)),
  );

  if (!storeId) {
    return <p className="text-muted">Select a branch to view stock movement.</p>;
  }

  const allProductsEmptyMessage =
    !storeId || !allProductsFrom || !allProductsTo
      ? 'Select a branch and date range to view the ledger.'
      : 'No ledger data for this period.';

  const productWiseEmptyMessage =
    !storeId || !selectedProductId || !productWiseFrom || !productWiseTo
      ? 'Select a branch, product, and date range to view the ledger.'
      : 'No ledger data for this period.';

  const ledgerRangeStart = ledgerRowCount === 0 ? 0 : (ledgerSafePage - 1) * pageSize + 1;
  const ledgerRangeEnd = Math.min(ledgerSafePage * pageSize, ledgerRowCount);
  const ledgerPageList = buildPageList(ledgerSafePage, ledgerTotalPages);

  const ledgerPagination =
    ledger && ledgerRowCount > 0 ? (
      <AdminTablePagination
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        rangeStart={ledgerRangeStart}
        rangeEnd={ledgerRangeEnd}
        totalItems={ledgerRowCount}
        safePage={ledgerSafePage}
        totalPages={ledgerTotalPages}
        pageList={ledgerPageList}
        onPageChange={setPage}
        itemLabel="days"
        ariaLabel="Ledger pagination"
      />
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-muted text-sm">
          {tab === 'product_wise'
            ? 'Product-wise valuation ledger: daily opening stock, movements, and closing margins.'
            : 'All-products valuation ledger: branch-wide daily totals across every product.'}
        </p>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-2 shrink-0"
          onClick={() => void handleExport()}
          disabled={!canExport}
        >
          <Download size={16} />
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MOVEMENT_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === key ? 'bg-brand text-white' : 'bg-navy-light text-muted hover:text-fg'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'product_wise' ? (
        <div className="space-y-6">
          <LedgerFilterRow
            stores={stores}
            storeId={storeId}
            onStoreChange={onStoreChange}
            from={productWiseFrom}
            to={productWiseTo}
            onFromChange={setProductWiseFrom}
            onToChange={setProductWiseTo}
            showProduct
            selectedProductId={selectedProductId}
            onProductChange={setSelectedProductId}
            products={products}
          />

          {pricingReady && (
            <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">
              <StockPriceCard
                label="Unit cost"
                amount={
                  pricingQuery.isLoading ? null : pricing?.unitCost ?? selectedProduct?.cost ?? null
                }
                subtitle={
                  pricingQuery.isLoading
                    ? 'Loading…'
                    : pricing && pricing.batchesInRange > 0
                      ? `${pricing.receivedQtyInRange.toLocaleString()} units received · ${rangeLabel}`
                      : `Catalog cost · no batches in ${rangeLabel}`
                }
                tone="blue"
                icon={Tag}
              />
              <StockPriceCard
                label="Selling price"
                amount={
                  pricingQuery.isLoading
                    ? null
                    : pricing?.sellingPrice ?? selectedProduct?.basePrice ?? null
                }
                subtitle={
                  pricingQuery.isLoading ? 'Loading…' : `Current catalog price · ${rangeLabel}`
                }
                tone="emerald"
                icon={DollarSign}
              />
            </div>
          )}
          {!pricingReady && (
            <p className="text-sm text-muted">
              Select a product and date range to view unit cost and selling price.
            </p>
          )}
          {pricingQuery.isError && (
            <p className="text-sm text-red-400">{(pricingQuery.error as Error).message}</p>
          )}

          <LedgerTable
            ledger={ledger}
            isLoading={activeLedgerQuery.isLoading}
            isError={activeLedgerQuery.isError}
            error={activeLedgerQuery.error as Error | null}
            emptyMessage={productWiseEmptyMessage}
            pageRows={ledgerPageRows}
            showOpening={Boolean(ledger && ledgerSafePage === 1)}
            showBroughtForward={Boolean(ledger && ledgerSafePage === ledgerTotalPages)}
            showProductInBatches={false}
            pagination={ledgerPagination}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <LedgerFilterRow
            stores={stores}
            storeId={storeId}
            onStoreChange={onStoreChange}
            from={allProductsFrom}
            to={allProductsTo}
            onFromChange={setAllProductsFrom}
            onToChange={setAllProductsTo}
          />

          <LedgerTable
            ledger={ledger}
            isLoading={activeLedgerQuery.isLoading}
            isError={activeLedgerQuery.isError}
            error={activeLedgerQuery.error as Error | null}
            emptyMessage={allProductsEmptyMessage}
            pageRows={ledgerPageRows}
            showOpening={Boolean(ledger && ledgerSafePage === 1)}
            showBroughtForward={Boolean(ledger && ledgerSafePage === ledgerTotalPages)}
            showProductInBatches
            pagination={ledgerPagination}
          />
        </div>
      )}
    </div>
  );
}
