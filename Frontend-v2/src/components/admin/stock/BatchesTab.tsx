'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Boxes, CalendarDays, Layers3, RotateCcw, Search, ShieldX } from 'lucide-react';
import { adminStockFetch, batchTypeBadgeClass, batchTypeLabel, type BatchType, type StockItem } from '@/lib/stockApi';
import ProductImage from '@/components/ui/ProductImage';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { formatDate, formatTime } from '@/lib/datetime';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';

interface BatchesTabProps {
  storeId: string;
  products: StockItem[];
}

type BranchBatch = {
  id: string;
  batchNumber: string;
  batchType?: BatchType;
  batchGroupNumber?: string | null;
  receivedQty: number;
  remainingQty: number;
  receivedAt: string;
  status: string;
  unitCost?: number | null;
  note?: string | null;
  product: { id: string; name: string; imageUrl?: string | null };
};

type BatchStatus = 'ALL' | 'ACTIVE' | 'DEPLETED' | 'WRITTEN_OFF';
type BatchTypeFilter = 'ALL' | BatchType;
type BatchSort = 'oldest' | 'newest';

function isLowRemaining(batch: BranchBatch): boolean {
  return (
    batch.status === 'ACTIVE' &&
    batch.receivedQty > 0 &&
    batch.remainingQty / batch.receivedQty <= 0.1
  );
}

function statusLabel(batch: BranchBatch): string {
  if (batch.status === 'ACTIVE' && isLowRemaining(batch)) return 'Low remaining';
  return batch.status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(batch: BranchBatch): string {
  if (batch.status === 'WRITTEN_OFF') return 'bg-red-500/10 text-red-400';
  if (batch.status === 'DEPLETED') return 'bg-slate-500/10 text-slate-400';
  if (isLowRemaining(batch)) return 'bg-amber-500/10 text-amber-400';
  return 'bg-emerald-500/10 text-emerald-400';
}

export default function BatchesTab({ storeId, products }: BatchesTabProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus>('ACTIVE');
  const [batchTypeFilter, setBatchTypeFilter] = useState<BatchTypeFilter>('ALL');
  const [productId, setProductId] = useState('ALL');
  const [receivedDate, setReceivedDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    status: 'ACTIVE' as BatchStatus,
    batchType: 'ALL' as BatchTypeFilter,
    productId: 'ALL',
    receivedDate: '',
  });
  const [sort, setSort] = useState<BatchSort>('oldest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stock-batches', storeId],
    queryFn: () =>
      adminStockFetch<{ batches: BranchBatch[] }>(
        `/admin/stock/batches?${new URLSearchParams({ storeId }).toString()}`,
      ),
    enabled: Boolean(storeId),
  });

  const batches = data?.batches ?? [];
  const activeBatches = batches.filter((batch) => batch.status === 'ACTIVE');
  const kpis = {
    active: activeBatches.length,
    remaining: activeBatches.reduce((sum, batch) => sum + batch.remainingQty, 0),
    low: activeBatches.filter(isLowRemaining).length,
    writtenOff: batches.filter((batch) => batch.status === 'WRITTEN_OFF').length,
  };

  const filteredBatches = useMemo(() => {
    const term = appliedFilters.search.trim().toLowerCase();
    return batches
      .filter((batch) => {
        if (appliedFilters.status !== 'ALL' && batch.status !== appliedFilters.status) return false;
        if (appliedFilters.batchType !== 'ALL' && batch.batchType !== appliedFilters.batchType) return false;
        if (appliedFilters.productId !== 'ALL' && batch.product.id !== appliedFilters.productId) {
          return false;
        }
        if (
          appliedFilters.receivedDate &&
          batch.receivedAt.slice(0, 10) !== appliedFilters.receivedDate
        ) {
          return false;
        }
        return (
          !term ||
          batch.product.name.toLowerCase().includes(term) ||
          batch.batchNumber.toLowerCase().includes(term) ||
          (batch.batchGroupNumber ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const difference = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
        return sort === 'oldest' ? difference : -difference;
      });
  }, [appliedFilters, batches, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageBatches = filteredBatches.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredBatches.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredBatches.length);

  useEffect(() => {
    setPage(1);
  }, [appliedFilters, sort]);

  function applyFilters() {
    setAppliedFilters({ search, status, batchType: batchTypeFilter, productId, receivedDate });
  }

  function resetFilters() {
    setSearch('');
    setStatus('ACTIVE');
    setBatchTypeFilter('ALL');
    setProductId('ALL');
    setReceivedDate('');
    setAppliedFilters({ search: '', status: 'ACTIVE', batchType: 'ALL', productId: 'ALL', receivedDate: '' });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Active batches',
            value: kpis.active.toLocaleString(),
            helper: 'Currently available batches',
            icon: Boxes,
            iconClass: 'bg-blue-500/10 text-blue-400',
          },
          {
            label: 'Units remaining',
            value: kpis.remaining.toLocaleString(),
            helper: 'Across all active batches',
            icon: Layers3,
            iconClass: 'bg-emerald-500/10 text-emerald-400',
          },
          {
            label: 'Low remaining',
            value: kpis.low.toLocaleString(),
            helper: 'Active batches at 10% or less',
            icon: AlertCircle,
            iconClass: 'bg-amber-500/10 text-amber-400',
          },
          {
            label: 'Written off',
            value: kpis.writtenOff.toLocaleString(),
            helper: 'Unavailable batches',
            icon: ShieldX,
            iconClass: 'bg-red-500/10 text-red-400',
          },
        ].map(({ label, value, helper, icon: Icon, iconClass }) => (
          <div key={label} className="card flex items-center gap-4 p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-fg">{value}</p>
              <p className="mt-0.5 text-[11px] text-muted">{helper}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(230px,1.35fr)_minmax(150px,0.75fr)_minmax(190px,0.95fr)_minmax(170px,0.8fr)_96px_120px] xl:items-end">
          <label>
            <span className="sr-only">Search batches</span>
            <span className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input-field h-11 w-full"
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Search product or batch number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyFilters();
                }}
              />
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Batch type</span>
            <select
              className="input-field h-11 w-full"
              value={batchTypeFilter}
              onChange={(event) => setBatchTypeFilter(event.target.value as BatchTypeFilter)}
            >
              <option value="ALL">All types</option>
              <option value="RESET">Reset</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Product</span>
            <select
              className="input-field h-11 w-full"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              <option value="ALL">All products</option>
              {products.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">Received date</span>
            <span className="relative block">
              <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="date"
                className="input-field h-11 w-full"
                style={{ paddingLeft: '2.5rem' }}
                value={receivedDate}
                onChange={(event) => setReceivedDate(event.target.value)}
              />
            </span>
          </label>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-brand/50 px-4 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
            onClick={resetFilters}
          >
            <RotateCcw size={15} />
            Reset
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
            onClick={applyFilters}
          >
            Apply filters
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">
          {filteredBatches.length.toLocaleString()} batch{filteredBatches.length === 1 ? '' : 'es'}
        </p>
        <label className="inline-flex items-center gap-3 text-xs text-muted">
          <span className="whitespace-nowrap">FIFO priority</span>
          <select
            className="input-field h-11 w-44"
            value={sort}
            onChange={(event) => setSort(event.target.value as BatchSort)}
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-muted">Loading batches…</div>
        ) : error ? (
          <div className="p-10 text-center text-red-400">
            {(error as Error).message || 'Failed to load batches'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-sm">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[19%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Batch number</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Received date</th>
                  <th className="px-4 py-3 text-left">Received qty</th>
                  <th className="min-w-[210px] px-4 py-3 text-left">Remaining</th>
                  <th className="px-4 py-3 text-left">Unit cost</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-muted">
                      No batches found.
                    </td>
                  </tr>
                ) : (
                  pageBatches.map((batch) => {
                    const percentage =
                      batch.receivedQty > 0
                        ? Math.max(0, Math.min(100, (batch.remainingQty / batch.receivedQty) * 100))
                        : 0;
                    const low = isLowRemaining(batch);
                    return (
                      <tr key={batch.id}>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <ProductImage
                              name={batch.product.name}
                              imageUrl={batch.product.imageUrl}
                              contain
                              className="h-10 w-10 rounded-lg"
                            />
                            <span className="font-medium text-fg">{batch.product.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs">
                          {batch.batchType === 'RESET' && batch.batchGroupNumber
                            ? batch.batchGroupNumber
                            : batch.batchNumber}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`${batchTypeBadgeClass(batch.batchType, 'md')} uppercase tracking-wide`}
                          >
                            {batchTypeLabel(batch.batchType)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <p>{formatDate(batch.receivedAt)}</p>
                          <p className="mt-0.5 text-xs text-muted">{formatTime(batch.receivedAt)}</p>
                        </td>
                        <td className="px-4 py-3.5 tabular-nums">{batch.receivedQty.toLocaleString()} units</td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold tabular-nums text-fg">
                            {batch.remainingQty.toLocaleString()} / {batch.receivedQty.toLocaleString()} units
                          </p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-light">
                            <div
                              className={`h-full rounded-full ${low ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className={`mt-1 text-[11px] ${low ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}% remaining
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">
                          {batch.unitCost == null ? '—' : `LKR ${batch.unitCost.toLocaleString()}`}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(batch)}`}>
                            {statusLabel(batch)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <AdminTablePagination
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          totalItems={filteredBatches.length}
          safePage={safePage}
          totalPages={totalPages}
          pageList={buildPageList(safePage, totalPages)}
          onPageChange={setPage}
          itemLabel="batches"
          ariaLabel="Batch pagination"
        />
      </div>
    </div>
  );
}
