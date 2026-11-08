'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, History, Layers, PackagePlus, RefreshCw, RotateCcw, Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminSession, isBranchAdmin, isCashier, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { adminApiFetch } from '@/lib/adminApi';
import { hasMenuUpdateAccess, type AdminPermission } from '@/lib/adminPermissions';
import {
  adminStockFetch,
  exportStockCsv,
  isNewProductItem,
  type StockMainTab,
  type StockResponse,
} from '@/lib/stockApi';
import StockMovementPanel from '@/components/admin/stock/StockMovementPanel';
import StockTableTab from '@/components/admin/stock/StockTableTab';
import BatchesTab from '@/components/admin/stock/BatchesTab';
import ResetStockModal from '@/components/admin/stock/ResetStockModal';
import BulkRestockModal from '@/components/admin/stock/BulkRestockModal';
import { confirmDialog } from '@/store/confirmStore';

export default function AdminStockPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightHandledRef = useRef<string | null>(null);

  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [storeId, setStoreId] = useState('');
  const [mainTab, setMainTab] = useState<StockMainTab>('table');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [bulkRestockModalOpen, setBulkRestockModalOpen] = useState(false);

  useEffect(() => {
    setAdmin(getAdminSession());
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'movement') setMainTab('movement');
    else if (tabParam === 'batches' && !isSuperAdmin(admin)) setMainTab('batches');
    else if (tabParam === 'batches') setMainTab('table');
  }, [searchParams, admin]);

  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId || highlightHandledRef.current === highlightId) return;
    highlightHandledRef.current = highlightId;
    setMainTab('table');
    setPendingHighlight(highlightId);
    setSearchInput('');
    setAppliedSearch('');
    setCategory('all');
  }, [searchParams]);

  const isSuper = isSuperAdmin(admin);

  const { data: permissionRows = [] } = useQuery<AdminPermission[]>({
    queryKey: ['admin-me-permissions', admin?.id, 'stock'],
    queryFn: () => adminApiFetch<AdminPermission[]>('/admin/me/permissions'),
    enabled: Boolean(admin && !isSuper),
    staleTime: 60_000,
  });

  const permissionsMap = useMemo(
    () => Object.fromEntries(permissionRows.map((row) => [row.menu, row])) as Record<string, AdminPermission>,
    [permissionRows],
  );

  const canEditStock = useMemo(() => {
    if (!admin || isSuper) return false;
    if (isBranchAdmin(admin)) return true;
    if (isCashier(admin)) return hasMenuUpdateAccess(permissionsMap, 'STOCK');
    return false;
  }, [admin, isSuper, permissionsMap]);

  useEffect(() => {
    if (isSuper && mainTab === 'batches') setMainTab('table');
  }, [isSuper, mainTab]);

  useEffect(() => {
    if (admin && !isSuper && admin.storeId) setStoreId(admin.storeId);
  }, [admin, isSuper]);

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: () => adminStockFetch<{ id: string; name: string }[]>('/stores'),
    enabled: Boolean(admin && isSuper),
  });

  useEffect(() => {
    if (isSuper && stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [isSuper, stores, storeId]);

  const { data: categories = [] } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ['admin-categories'],
    queryFn: () => adminStockFetch('/menu/categories'),
    enabled: Boolean(admin),
  });

  const effectiveStoreId = isSuper ? storeId || stores[0]?.id || '' : admin?.storeId || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stock', effectiveStoreId, appliedSearch, category],
    queryFn: () => {
      const params = new URLSearchParams({ storeId: effectiveStoreId });
      if (appliedSearch.trim()) params.set('search', appliedSearch.trim());
      if (category !== 'all') params.set('category', category);
      return adminStockFetch<StockResponse>(`/admin/stock?${params.toString()}`);
    },
    enabled: Boolean(admin && effectiveStoreId),
    refetchInterval: 60_000,
  });

  const syncBranch = useMutation({
    mutationFn: () =>
      adminStockFetch<{ rowsCreated: number; message: string }>('/admin/stock/sync', {
        method: 'POST',
        body: JSON.stringify({ storeId: effectiveStoreId }),
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['admin-stock'] });
      toast.success(result.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allItems = data?.items ?? [];
  const storeLabel = data?.store.name.replace('Bing Chun - ', '') ?? admin?.storeName?.replace('Bing Chun - ', '') ?? 'Branch';
  const canSyncBranch = canEditStock;
  const newProductCount = allItems.filter((item) => isNewProductItem(item)).length;
  // First-time onboard only: every product on the branch is still never-stocked.
  const isNewlyRegisteredBranchStock =
    allItems.length > 0 && newProductCount === allItems.length;

  const exportItems = useMemo(() => allItems, [allItems]);

  function handleMainTabChange(tab: StockMainTab) {
    if (tab === 'batches' && isSuper) return;
    setMainTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'movement') params.set('tab', 'movement');
    else if (tab === 'batches') params.set('tab', 'batches');
    else params.delete('tab');
    const qs = params.toString();
    router.replace(qs ? `/admin/stock?${qs}` : '/admin/stock', { scroll: false });
  }

  async function handleSyncBranch() {
    if (!canSyncBranch || !effectiveStoreId) return;

    const confirmed = await confirmDialog({
      title: 'Sync all products to branch?',
      message: `This will add every catalog product to ${storeLabel} that is not already assigned. New products are added with 0 stock and marked inactive. Existing branch stock is not changed.`,
      confirmLabel: 'Sync products',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    syncBranch.mutate();
  }

  function runSearch() {
    setAppliedSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    setAppliedSearch('');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-fg">Branch Stock</h1>
        {mainTab === 'table' && (
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {canSyncBranch && effectiveStoreId && (
              <>
                {isNewlyRegisteredBranchStock && (
                  <button
                    type="button"
                    className="btn-outline inline-flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap"
                    onClick={() => setBulkRestockModalOpen(true)}
                  >
                    <PackagePlus size={16} />
                    Bulk Restock
                    {` (${newProductCount})`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-outline inline-flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap"
                  onClick={() => setResetModalOpen(true)}
                >
                  <RotateCcw size={16} />
                  Reset Stock
                </button>
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap"
                  disabled={syncBranch.isPending}
                  onClick={() => void handleSyncBranch()}
                >
                  <RefreshCw size={16} className={syncBranch.isPending ? 'animate-spin' : undefined} />
                  {syncBranch.isPending ? 'Syncing…' : 'Sync products'}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-outline inline-flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap"
              onClick={() => exportStockCsv(exportItems, storeLabel)}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {([
          ['table', 'Stock Table', Table2],
          ...(!isSuper ? [['batches', 'Batches', Layers] as const] : []),
          ['movement', 'Stock Movement', History],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleMainTabChange(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${mainTab === key ? 'bg-brand text-white' : 'bg-navy-light text-muted hover:text-fg'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {mainTab === 'table' ? (
        <StockTableTab
          admin={admin}
          canEditStock={canEditStock}
          data={data}
          isLoading={isLoading}
          error={error as Error | null}
          effectiveStoreId={effectiveStoreId}
          appliedSearch={appliedSearch}
          isSuper={isSuper}
          stores={stores}
          categories={categories}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onRunSearch={runSearch}
          onClearSearch={clearSearch}
          category={category}
          onCategoryChange={setCategory}
          onStoreChange={setStoreId}
          pendingHighlight={pendingHighlight}
          onHighlightHandled={() => setPendingHighlight(null)}
          onHighlightNotFound={() => {
            setPendingHighlight(null);
            toast.error('Product not found in this branch stock list.');
          }}
        />
      ) : mainTab === 'batches' ? (
        <BatchesTab storeId={effectiveStoreId} products={allItems} />
      ) : (
        <StockMovementPanel
          storeId={effectiveStoreId}
          products={allItems}
          stores={stores}
          onStoreChange={setStoreId}
          defaultTab="product_wise"
        />
      )}

      {resetModalOpen && effectiveStoreId && (
        <ResetStockModal
          storeId={effectiveStoreId}
          products={allItems}
          onClose={() => setResetModalOpen(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['admin-stock'] });
            void qc.invalidateQueries({ queryKey: ['admin-stock-batches'] });
          }}
        />
      )}

      {bulkRestockModalOpen && effectiveStoreId && (
        <BulkRestockModal
          storeId={effectiveStoreId}
          products={allItems}
          categories={categories}
          onClose={() => setBulkRestockModalOpen(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['admin-stock'] });
            void qc.invalidateQueries({ queryKey: ['admin-stock-batches'] });
          }}
        />
      )}
    </div>
  );
}
