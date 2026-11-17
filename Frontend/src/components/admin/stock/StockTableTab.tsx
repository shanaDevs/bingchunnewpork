'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  LayoutGrid,
  Pencil,
  Power,
  Search,
  ShoppingBag,
  Target,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { type AdminSession } from '@/lib/adminAuth';
import { getApiBaseUrl } from '@/lib/apiBase';
import { confirmDialog } from '@/store/confirmStore';
import AdminPinGateModal from '@/components/admin/AdminPinGateModal';
import { adminBadgeClass } from '@/lib/adminBadges';
import {
  adminStockFetch,
  batchTypeBadgeClass,
  batchTypeLabel,
  canActivateWithQty,
  canBranchAdminReceiveStock,
  canReceiveStock,
  computeStockFlags,
  hasWeeklyTargetConfigured,
  isBestsellerTag,
  isBranchInactiveItem,
  isFranchiserInactiveItem,
  isNewProductItem,
  isStockInactiveItem,
  isOutOfStockTabItem,
  matchesStockLevelTab,
  qtyStatus,
  type StockBatchRow,
  type StockItem,
  type StockLevelTab,
  type StockResponse,
} from '@/lib/stockApi';
import ProductImage from '@/components/ui/ProductImage';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import ReceiveStockModal from '@/components/admin/stock/ReceiveStockModal';
import ReactivateStockModal from '@/components/admin/stock/ReactivateStockModal';
import StockSettingsDrawer from '@/components/admin/stock/StockSettingsDrawer';
import StockLevelTabs from '@/components/admin/stock/StockLevelTabs';
import AdminTablePagination from '@/components/admin/AdminTablePagination';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';

function MiniSparkline({ tone }: { tone: 'green' | 'gray' | 'amber' | 'red' | 'purple' }) {
  const colors = {
    green: '#22c55e',
    gray: '#94a3b8',
    amber: '#f59e0b',
    red: '#ef4444',
    purple: '#a855f7',
  };
  const points =
    tone === 'green'
      ? '2,14 8,10 14,12 20,6 26,8 32,4'
      : tone === 'amber'
        ? '2,12 8,8 14,10 20,12 26,9 32,11'
        : tone === 'red'
          ? '2,6 8,10 14,8 20,12 26,10 32,14'
          : tone === 'purple'
            ? '2,10 8,8 14,6 20,9 26,7 32,5'
            : '2,10 8,10 14,10 20,10 26,10 32,10';

  return (
    <svg viewBox="0 0 34 16" className="h-4 w-16 opacity-80" aria-hidden>
      <polyline
        fill="none"
        stroke={colors[tone]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function StockKpiCard({
  label,
  count,
  suffix,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  count: number;
  suffix: string;
  tone: 'green' | 'gray' | 'amber' | 'red' | 'purple';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
}) {
  const styles = {
    green: { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
    gray: { bg: 'bg-slate-500/10', text: 'text-slate-400' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
    red: { bg: 'bg-red-500/10', text: 'text-red-500' },
    purple: { bg: 'bg-violet-500/10', text: 'text-violet-500' },
  }[tone];

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-4 flex items-center gap-4 text-left w-full${
        onClick ? ' cursor-pointer transition-colors hover:bg-navy-light/40' : ''
      }`}
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.bg}`}>
        <Icon size={20} className={styles.text} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${styles.text}`}>{label}</p>
        <p className="text-2xl font-bold text-fg tabular-nums leading-tight mt-0.5">{count}</p>
        <p className="text-[11px] text-muted mt-0.5">{suffix}</p>
      </div>
      <div className="shrink-0 self-end pb-1">
        <MiniSparkline tone={tone} />
      </div>
    </Wrapper>
  );
}

function formatBranchName(name: string): string {
  return name.replace('Bing Chun - ', '');
}

interface StockTableTabProps {
  admin: AdminSession | null;
  canEditStock: boolean;
  data: StockResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  effectiveStoreId: string;
  appliedSearch: string;
  isSuper: boolean;
  stores: { id: string; name: string }[];
  categories: { id: string; name: string; slug: string }[];
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onRunSearch: () => void;
  onClearSearch: () => void;
  category: string;
  onCategoryChange: (value: string) => void;
  onStoreChange: (id: string) => void;
  pendingHighlight: string | null;
  onHighlightHandled: () => void;
  onHighlightNotFound: () => void;
}

export default function StockTableTab({
  admin,
  canEditStock,
  data,
  isLoading,
  error,
  effectiveStoreId,
  appliedSearch,
  isSuper,
  stores,
  categories,
  searchInput,
  onSearchInputChange,
  onRunSearch,
  onClearSearch,
  category,
  onCategoryChange,
  onStoreChange,
  pendingHighlight,
  onHighlightHandled,
  onHighlightNotFound,
}: StockTableTabProps) {
  const qc = useQueryClient();
  const [stockLevelTab, setStockLevelTab] = useState<StockLevelTab>('low_stock');
  const [topUpItem, setTopUpItem] = useState<StockItem | null>(null);
  const [reactivateItem, setReactivateItem] = useState<StockItem | null>(null);
  const [settingsItem, setSettingsItem] = useState<StockItem | null>(null);
  const [settingsSetupIntent, setSettingsSetupIntent] = useState<'receive' | 'reactivate' | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const pendingDeactivateItemRef = useRef<StockItem | null>(null);
  const [adjustModalPurpose, setAdjustModalPurpose] = useState<'default' | 'activate'>('default');
  const [flashProductId, setFlashProductId] = useState<string | null>(null);
  const highlightSyncAttemptedRef = useRef(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<StockBatchRow[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(ADMIN_TABLE_PAGE_SIZE);

  function patchStockItem(
    productId: string,
    patch: Partial<
      Pick<
        StockItem,
        | 'weeklyRemainingQty'
        | 'weeklyTargetQty'
        | 'weeklyReceivedQty'
        | 'onHandQty'
        | 'onlineAvailableQty'
        | 'lowStockThreshold'
        | 'onlineOutOfStockThreshold'
        | 'isAvailable'
        | 'isLowStock'
        | 'isOutOfStock'
        | 'isNewProduct'
        | 'isComingSoon'
        | 'batchCount'
        | 'totalBatchCount'
        | 'frozenBatchCount'
        | 'frozenQty'
        | 'isBranchDeactivated'
        | 'stockPercent'
      >
    >,
  ) {
    qc.setQueryData<StockResponse>(
      ['admin-stock', effectiveStoreId, appliedSearch, category],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((row) => (row.productId === productId ? { ...row, ...patch } : row)),
        };
      },
    );
  }

  const allItems = data?.items ?? [];
  const searchActive = appliedSearch.trim().length > 0;

  const filteredItems = useMemo(() => {
    return allItems
      .filter((item) => searchActive || matchesStockLevelTab(item, stockLevelTab))
      .sort((a, b) => {
        if (!searchActive && stockLevelTab === 'new_products') {
          const aTime = a.productCreatedAt ? new Date(a.productCreatedAt).getTime() : 0;
          const bTime = b.productCreatedAt ? new Date(b.productCreatedAt).getTime() : 0;
          return bTime - aTime;
        }
        if (a.isOutOfStock === b.isOutOfStock) return 0;
        return a.isOutOfStock ? -1 : 1;
      });
  }, [allItems, searchActive, stockLevelTab]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredItems.length);

  useEffect(() => {
    setPage(1);
  }, [stockLevelTab, appliedSearch, category, effectiveStoreId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    highlightSyncAttemptedRef.current = false;
  }, [pendingHighlight]);

  useEffect(() => {
    if (!pendingHighlight || isLoading) return;

    const index = allItems.findIndex((item) => item.productId === pendingHighlight);
    if (index < 0) {
      if (!highlightSyncAttemptedRef.current && effectiveStoreId) {
        highlightSyncAttemptedRef.current = true;
        void (async () => {
          try {
            await adminStockFetch('/admin/stock/sync', {
              method: 'POST',
              body: JSON.stringify({ storeId: effectiveStoreId }),
            });
            await qc.invalidateQueries({ queryKey: ['admin-stock'] });
          } catch {
            onHighlightNotFound();
          }
        })();
        return;
      }
      onHighlightNotFound();
      return;
    }

    const item = allItems[index];
    const expectedTab: StockLevelTab = isStockInactiveItem(item)
      ? 'inactive'
      : isNewProductItem(item)
      ? 'new_products'
      : item.isOutOfStock
        ? 'out_of_stock'
        : item.isLowStock
          ? 'low_stock'
          : 'in_stock';

    if (!searchActive && stockLevelTab !== expectedTab) {
      setStockLevelTab(expectedTab);
      return;
    }

    const indexInFiltered = filteredItems.findIndex((i) => i.productId === pendingHighlight);
    if (indexInFiltered < 0) {
      onHighlightNotFound();
      return;
    }

    const targetPage = Math.floor(indexInFiltered / pageSize) + 1;
    if (safePage !== targetPage) {
      setPage(targetPage);
      return;
    }

    const timer = window.setTimeout(() => {
      const row = document.getElementById(`stock-row-${pendingHighlight}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashProductId(pendingHighlight);
      onHighlightHandled();
      window.setTimeout(() => setFlashProductId(null), 3500);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pendingHighlight, filteredItems, allItems, isLoading, stockLevelTab, searchActive, effectiveStoreId, safePage, pageSize, onHighlightHandled, onHighlightNotFound, qc]);

  const kpi = useMemo(
    () => ({
      active: allItems.filter((i) => i.isAvailable && !i.isOutOfStock && !isStockInactiveItem(i)).length,
      inactive: allItems.filter((i) => isStockInactiveItem(i)).length,
      lowStock: allItems.filter(
        (i) => !isStockInactiveItem(i) && !isNewProductItem(i) && i.isLowStock && !i.isOutOfStock,
      ).length,
      outOfStock: allItems.filter((i) => isOutOfStockTabItem(i)).length,
      all: allItems.length,
      inStock: allItems.filter(
        (i) => !isStockInactiveItem(i) && !isNewProductItem(i) && !i.isLowStock && !i.isOutOfStock,
      ).length,
      newProducts: allItems.filter((i) => isNewProductItem(i)).length,
    }),
    [allItems],
  );

  async function toggleExpandedBatches(item: StockItem) {
    if (expandedProductId === item.productId) {
      setExpandedProductId(null);
      setExpandedBatches([]);
      return;
    }
    setExpandedProductId(item.productId);
    setLoadingBatches(true);
    try {
      const data = await adminStockFetch<{ batches: StockBatchRow[] }>(
        `/admin/stock/${item.productId}/batches?storeId=${effectiveStoreId}`,
      );
      setExpandedBatches(data.batches);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load batches');
      setExpandedProductId(null);
    } finally {
      setLoadingBatches(false);
    }
  }

  function openReceiveModal(item: StockItem, purpose: 'default' | 'activate' = 'default') {
    setAdjustModalPurpose(purpose);
    setTopUpItem(item);
  }

  function openSettings(
    item: StockItem,
    intent: 'receive' | 'reactivate' | null = null,
  ) {
    setSettingsSetupIntent(intent);
    setSettingsItem(item);
  }

  async function handlePowerToggle(item: StockItem) {
    if (isBranchInactiveItem(item)) {
      if (!hasWeeklyTargetConfigured(item)) {
        openSettings(item, 'reactivate');
        return;
      }
      setReactivateItem(item);
      return;
    }
    if (item.isAvailable) {
      const confirmed = await confirmDialog({
        title: 'Deactivate product?',
        message: `${item.name} will be hidden from customers and remaining stock will be frozen.`,
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
      if (!confirmed) return;
      pendingDeactivateItemRef.current = item;
      setPinGateOpen(true);
    }
  }

  async function deactivateProduct(item: StockItem, password: string) {
    setTogglingProductId(item.productId);
    try {
      await adminStockFetch(`/admin/stock/${item.productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: false, storeId: effectiveStoreId, password }),
      });
      patchStockItem(item.productId, {
        isAvailable: false,
        isOutOfStock: true,
        isNewProduct: false,
        isComingSoon: false,
        isBranchDeactivated: true,
        onHandQty: 0,
        onlineAvailableQty: 0,
        batchCount: 0,
        frozenBatchCount: 0,
        frozenQty: 0,
      });
      toast.success(`${item.name} deactivated`);
      void qc.invalidateQueries({ queryKey: ['admin-stock'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to deactivate product');
    } finally {
      setTogglingProductId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StockKpiCard label="Active" count={kpi.active} suffix="Products" tone="green" icon={ShoppingBag} />
        <StockKpiCard
          label="Inactive"
          count={kpi.inactive}
          suffix="Products"
          tone="gray"
          icon={Power}
          onClick={() => setStockLevelTab('inactive')}
        />
        <StockKpiCard label="Low Stock" count={kpi.lowStock} suffix="Products" tone="amber" icon={AlertTriangle} />
        <StockKpiCard label="Out of Stock" count={kpi.outOfStock} suffix="Products" tone="red" icon={XCircle} />
        <StockKpiCard label="All Products" count={kpi.all} suffix="Total" tone="purple" icon={LayoutGrid} />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className={`input-icon-wrap min-w-[240px] flex-1 max-w-md${searchInput ? ' input-icon-wrap--end' : ''}`}>
            <Search size={16} className="input-icon" aria-hidden />
            <input
              className="input-field"
              placeholder="Search products..."
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onRunSearch();
                }
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                className="input-action p-1 text-muted hover:text-fg"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <button type="button" className="btn-primary shrink-0 px-4 py-2" onClick={onRunSearch}>
            Find
          </button>

          <select
            className="input-field w-auto min-w-[140px] max-w-[180px]"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isSuper && stores.length > 0 && (
            <SearchableBranchSelect
              stores={stores}
              value={effectiveStoreId || undefined}
              onChange={onStoreChange}
              formatName={formatBranchName}
              allowAll={false}
              placeholder="Select branch…"
              className="min-w-[150px] max-w-[180px]"
            />
          )}
        </div>
      </div>

      <StockLevelTabs
        activeTab={stockLevelTab}
        counts={{
          newProducts: kpi.newProducts,
          inStock: kpi.inStock,
          lowStock: kpi.lowStock,
          outOfStock: kpi.outOfStock,
          inactive: kpi.inactive,
        }}
        onChange={setStockLevelTab}
      />

      {error && <p className="text-red-400 text-sm">{error.message}</p>}

      {!admin || (!effectiveStoreId && !isLoading) ? (
        <p className="text-muted">
          {isSuper ? 'Select a branch or sign in again to view stock.' : 'Sign in again to view your branch stock.'}
        </p>
      ) : isLoading ? (
        <div className="card p-12 text-center text-muted">Loading products…</div>
      ) : (
        <div className="card flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[960px] text-sm">
              <thead>
                <tr>
                  <th className="p-3 w-14" aria-label="Image" />
                  <th className="p-3 text-left font-medium">Name</th>
                  <th className="p-3 text-left font-medium">Category</th>
                  <th className="p-3 text-left font-medium">Price (LKR)</th>
                  <th className="p-3 text-left font-medium">Weekly Target</th>
                  <th className="p-3 text-left font-medium">On Hand</th>
                  <th className="p-3 w-28 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted">
                      {searchActive
                        ? `No products match "${appliedSearch.trim()}".`
                        : 'No products found for this filter.'}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const status = qtyStatus(item);
                    const branchInactive = isBranchInactiveItem(item);
                    const franchiserInactive = isFranchiserInactiveItem(item);
                    const stockInactive = isStockInactiveItem(item);
                    const displayOnHand = branchInactive ? (item.frozenQty ?? 0) : item.onHandQty;
                    const displayBatchCount = branchInactive
                      ? (item.frozenBatchCount ?? 0)
                      : item.batchCount;
                    const isExpanded = expandedProductId === item.productId;

                    return (
                      <Fragment key={item.productId}>
                      <tr
                        id={`stock-row-${item.productId}`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${item.name}, ${status.label}. Click to ${isExpanded ? 'hide' : 'view'} batches.`}
                        onClick={() => void toggleExpandedBatches(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void toggleExpandedBatches(item);
                          }
                        }}
                        className={`cursor-pointer transition-colors hover:bg-navy-light/30 ${
                          isExpanded ? 'admin-table__row--expanded' : ''
                        } ${item.isOutOfStock && !isNewProductItem(item) && !stockInactive ? 'bg-red-500/[0.06]' : ''} ${
                          isNewProductItem(item) ? 'bg-indigo-500/[0.06]' : ''
                        } ${
                          stockInactive ? 'bg-slate-500/[0.06]' : ''
                        } ${
                          flashProductId === item.productId ? 'ring-2 ring-brand bg-brand/10 transition-colors' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <ChevronDown
                              size={14}
                              aria-hidden
                              className={`shrink-0 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                            <ProductImage
                              name={item.name}
                              imageUrl={item.imageUrl}
                              contain
                              className="h-10 w-10 rounded-lg bg-brand-subtle/30 p-0.5"
                            />
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 min-w-[160px]">
                            <span className="font-medium text-fg">{item.name}</span>
                            {isNewProductItem(item) && (
                              <span className={`${adminBadgeClass('indigo')} shrink-0 uppercase tracking-wide`}>
                                New
                              </span>
                            )}
                            {isBestsellerTag(item.tag) && (
                              <span className={`${adminBadgeClass('purple')} shrink-0`}>
                                {item.tag}
                              </span>
                            )}
                            {branchInactive && (
                              <span className={`${adminBadgeClass('neutral')} shrink-0 uppercase tracking-wide`}>
                                Branch Inactive
                              </span>
                            )}
                            {franchiserInactive && (
                              <span className={`${adminBadgeClass('neutral')} shrink-0 uppercase tracking-wide`}>
                                Franchiser Inactive
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-muted">{item.category.name}</td>
                        <td className="p-3 font-medium tabular-nums">LKR {item.basePrice.toLocaleString()}</td>
                        <td className="p-3">
                          <div className="tabular-nums">
                            {item.weeklyTargetQty === 0 ? (
                              <span className="text-xs font-medium text-amber-500">Not set</span>
                            ) : (
                              <>
                                <span className="font-semibold text-fg">{item.weeklyTargetQty}</span>
                                <span className="text-xs text-muted ml-1">({item.weeklyReceivedQty} recv.)</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                            <span className="font-semibold tabular-nums">{displayOnHand}</span>
                            <span className="text-xs text-muted">
                              ({displayBatchCount} batch{displayBatchCount === 1 ? '' : 'es'}
                              {branchInactive ? ', frozen' : ''})
                            </span>
                            <span className={`text-xs font-medium ${status.text}`}>{status.label}</span>
                          </div>
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {canEditStock ? (
                          <div className="flex items-center gap-1">
                            {(branchInactive || item.isAvailable) && (
                              <button
                                type="button"
                                disabled={togglingProductId === item.productId}
                                title={
                                  branchInactive
                                    ? 'Reactivate branch-inactive product'
                                    : 'Deactivate product'
                                }
                                onClick={() => {
                                  if (togglingProductId === item.productId) return;
                                  void handlePowerToggle(item);
                                }}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                  branchInactive
                                    ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                    : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
                                } ${
                                  togglingProductId === item.productId
                                    ? 'cursor-not-allowed opacity-40'
                                    : ''
                                }`}
                                aria-label={
                                  branchInactive
                                    ? `Reactivate ${item.name}`
                                    : `Deactivate ${item.name}`
                                }
                              >
                                <Power size={14} />
                              </button>
                            )}
                            {!stockInactive && !hasWeeklyTargetConfigured(item) && canReceiveStock(item) && (
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 text-amber-400 transition-colors hover:bg-amber-500/10"
                                aria-label={`Set weekly target for ${item.name}`}
                                title="Set weekly target before receiving stock"
                                onClick={() => openSettings(item, 'receive')}
                              >
                                <Target size={14} />
                              </button>
                            )}
                            {canBranchAdminReceiveStock(item) && !stockInactive && (
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-navy-border text-muted transition-colors hover:bg-navy-light hover:text-fg"
                                aria-label={`Receive stock for ${item.name}`}
                                title={
                                  !item.isAvailable && !stockInactive
                                    ? 'Receive stock to activate'
                                    : 'Receive stock'
                                }
                                onClick={() => {
                                  openReceiveModal(
                                    item,
                                    !item.isAvailable && !stockInactive ? 'activate' : 'default',
                                  );
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="inline-flex h-8 px-2 items-center justify-center rounded-lg border border-navy-border text-xs text-muted transition-colors hover:bg-navy-light hover:text-fg"
                              onClick={() => openSettings(item)}
                            >
                              Settings
                            </button>
                          </div>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedProductId === item.productId && (
                        <tr key={`${item.productId}-batches`} className="bg-navy-light/20">
                          <td colSpan={7} className="p-4">
                            {loadingBatches ? (
                              <p className="text-sm text-muted">Loading batches…</p>
                            ) : expandedBatches.length === 0 ? (
                              <p className="text-sm text-muted">No batches yet.</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted uppercase">FIFO batches (oldest first)</p>
                                {expandedBatches.map((batch) => (
                                  <div
                                    key={batch.id}
                                    className="flex flex-wrap items-center gap-4 text-sm border border-navy-border rounded-lg px-3 py-2"
                                  >
                                    <span className="font-mono text-xs">
                                      {batch.batchType === 'RESET' && batch.batchGroupNumber
                                        ? batch.batchGroupNumber
                                        : batch.batchNumber}
                                    </span>
                                    {batch.batchType && (
                                      <span
                                        className={`${batchTypeBadgeClass(batch.batchType)} uppercase tracking-wide`}
                                      >
                                        {batchTypeLabel(batch.batchType)}
                                      </span>
                                    )}
                                    <span>{new Date(batch.receivedAt).toLocaleDateString()}</span>
                                    <span className="tabular-nums">
                                      {batch.remainingQty} / {batch.receivedQty} remaining
                                    </span>
                                    <span className="text-muted">{batch.status}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <AdminTablePagination
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalItems={filteredItems.length}
            safePage={safePage}
            totalPages={totalPages}
            pageList={buildPageList(safePage, totalPages)}
            onPageChange={setPage}
            itemLabel="products"
            ariaLabel="Stock table pagination"
          />
        </div>
      )}

      {topUpItem && effectiveStoreId && (
        <ReceiveStockModal
          item={topUpItem}
          storeId={effectiveStoreId}
          purpose={adjustModalPurpose}
          onClose={() => {
            setTopUpItem(null);
            setAdjustModalPurpose('default');
          }}
          onSuccess={(result) => {
            const remaining = result.weeklyRemainingQty;
            const received =
              result.weeklyReceivedQty ??
              result.weeklyBaseQty ??
              topUpItem.weeklyReceivedQty;
            const onlineAvailableQty = Math.max(0, remaining - topUpItem.onlineOutOfStockThreshold);
            const flags = computeStockFlags(remaining, topUpItem.weeklyTargetQty, {
              ...topUpItem,
              onlineAvailableQty,
            });
            const activated = adjustModalPurpose === 'activate' && canActivateWithQty(remaining, topUpItem);
            patchStockItem(topUpItem.productId, {
              weeklyRemainingQty: remaining,
              weeklyReceivedQty: received,
              onHandQty: remaining,
              onlineAvailableQty,
              batchCount: Math.max(1, topUpItem.batchCount),
              totalBatchCount: Math.max(1, topUpItem.totalBatchCount ?? topUpItem.batchCount),
              isNewProduct: false,
              isComingSoon: false,
              ...flags,
              isAvailable: activated ? true : topUpItem.isAvailable,
            });
            void qc.invalidateQueries({ queryKey: ['admin-stock'] });
            setAdjustModalPurpose('default');
          }}
        />
      )}

      {reactivateItem && effectiveStoreId && (
        <ReactivateStockModal
          item={reactivateItem}
          storeId={effectiveStoreId}
          onClose={() => setReactivateItem(null)}
          onSuccess={(newQty) => {
            const flags = computeStockFlags(newQty, reactivateItem.weeklyTargetQty, {
              ...reactivateItem,
              onlineAvailableQty: Math.max(0, newQty - reactivateItem.onlineOutOfStockThreshold),
            });
            patchStockItem(reactivateItem.productId, {
              isAvailable: true,
              isBranchDeactivated: false,
              frozenBatchCount: 0,
              frozenQty: 0,
              onHandQty: newQty,
              weeklyRemainingQty: newQty,
              onlineAvailableQty: Math.max(0, newQty - reactivateItem.onlineOutOfStockThreshold),
              ...flags,
            });
            void qc.invalidateQueries({ queryKey: ['admin-stock'] });
            setReactivateItem(null);
          }}
        />
      )}

      {settingsItem && effectiveStoreId && (
        <StockSettingsDrawer
          item={settingsItem}
          storeId={effectiveStoreId}
          setupBeforeReceive={settingsSetupIntent !== null || settingsItem.weeklyTargetQty <= 0}
          onClose={() => {
            setSettingsItem(null);
            setSettingsSetupIntent(null);
          }}
          onSuccess={(saved) => {
            const thresholds = {
              lowStockThreshold: saved.lowStockThreshold,
              onlineOutOfStockThreshold: saved.onlineOutOfStockThreshold,
            };
            const onlineAvailableQty = Math.max(
              0,
              settingsItem.onHandQty - saved.onlineOutOfStockThreshold,
            );
            const updatedItem: StockItem = {
              ...settingsItem,
              weeklyTargetQty: saved.weeklyTargetQty,
              weeklyReceivedQty: saved.weeklyReceivedQty,
              ...thresholds,
              ...computeStockFlags(settingsItem.onHandQty, saved.weeklyTargetQty, {
                ...thresholds,
                onlineAvailableQty,
              }),
              isNewProduct:
                settingsItem.onHandQty === 0 &&
                saved.weeklyTargetQty === 0 &&
                saved.weeklyReceivedQty === 0 &&
                (settingsItem.totalBatchCount ?? settingsItem.batchCount ?? 0) === 0,
              isComingSoon:
                settingsItem.onHandQty === 0 &&
                saved.weeklyTargetQty === 0 &&
                saved.weeklyReceivedQty === 0 &&
                (settingsItem.totalBatchCount ?? settingsItem.batchCount ?? 0) === 0,
            };
            patchStockItem(settingsItem.productId, updatedItem);
            void qc.invalidateQueries({ queryKey: ['admin-stock'] });

            const intent = settingsSetupIntent;
            setSettingsSetupIntent(null);

            if (saved.weeklyTargetQty > 0 && intent === 'receive') {
              openReceiveModal(
                updatedItem,
                !updatedItem.isAvailable && !isStockInactiveItem(updatedItem) ? 'activate' : 'default',
              );
            } else if (saved.weeklyTargetQty > 0 && intent === 'reactivate') {
              setReactivateItem(updatedItem);
            }
          }}
        />
      )}

      <AdminPinGateModal
        open={pinGateOpen}
        onClose={() => {
          if (togglingProductId) return;
          setPinGateOpen(false);
        }}
        onVerified={(pin) => {
          const item = pendingDeactivateItemRef.current;
          pendingDeactivateItemRef.current = null;
          if (!item) return;
          void deactivateProduct(item, pin);
        }}
        apiBase={getApiBaseUrl()}
        busy={Boolean(togglingProductId)}
        titleId="stock-deactivate-pin-title"
        inputId="stock-deactivate-pin"
        description="Enter your admin PIN to deactivate this product."
      />
    </div>
  );
}

export { type StockTableTabProps };
