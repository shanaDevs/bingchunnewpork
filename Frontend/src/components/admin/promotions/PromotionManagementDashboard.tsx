'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Home,
  ImageIcon,
  MapPin,
  MoreVertical,
  FileText,
  Pencil,
  Plus,
  Power,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { confirmDialog } from '@/store/confirmStore';
import { parseBranchShareSplits } from '@/lib/promotionCriteria';
import { formatBranchSelectionLabel } from '@/lib/promotionBranches';
import { getCardDesignForTheme, normalizeCardDesignSet } from '@/lib/promotionCardDesign';
import type { PromotionKind } from '@/lib/promotionTypes';
import { formatPromotionBenefit, formatUsageLimits, isSpinLinkedPromo, kindLabel, promotionKindRequiresCode } from '@/lib/promotionTypes';
import { parsePromoStringArray, parsePromoUsageLimits, type AdminPromoRow } from '@/lib/promotionFormUtils';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import PromotionCardPreview from '@/components/admin/promotions/PromotionCardPreview';
import PromotionDiscountReport from '@/components/admin/promotions/PromotionDiscountReport';
import PromotionReportSheet from '@/components/admin/promotions/PromotionReportSheet';
import { promoStatusLabel } from '@/lib/promotionAdminLabels';
import { useReportStores } from '@/components/admin/reports/ReportBranchFilter';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PROMOS_PAGE_SIZE = ADMIN_TABLE_PAGE_SIZE;

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data.data ?? data;
  });
}

function sharedShareBadge(promo: AdminPromoRow) {
  if (promo.ownership !== 'SHARED') return null;
  const values = Object.values(parseBranchShareSplits(promo.branchShareSplits));
  const varies =
    values.length > 1
    && values.some((s) =>
      s.branchSharePct !== values[0].branchSharePct
      || s.platformSharePct !== values[0].platformSharePct,
    );
  if (varies) return 'Shared · varies by branch';
  if (values.length === 1) {
    return `Shared ${values[0].branchSharePct}% branch · ${values[0].platformSharePct}% platform`;
  }
  if (promo.branchSharePct != null) {
    return `Shared ${promo.branchSharePct}% branch · ${promo.platformSharePct ?? 100 - promo.branchSharePct}% platform`;
  }
  return null;
}

function benefitLabel(promo: AdminPromoRow): string {
  if (promo.promotionKind) {
    return formatPromotionBenefit(
      promo.promotionKind as PromotionKind,
      promo.promotionRules ?? {},
      promo.discountValue,
    );
  }
  return promo.discountType === 'PERCENTAGE'
    ? `${promo.discountValue}%`
    : `LKR ${promo.discountValue}`;
}

type PromoMoreMenuProps = {
  promo: AdminPromoRow;
  trigger: 'icon' | 'label';
  homePending: boolean;
  togglePending: boolean;
  deletePending: boolean;
  isDeletable: boolean;
  onHome: () => void;
  onToggle: () => void;
  onArchive: () => void;
};

function PromoMoreMenu({
  promo,
  trigger,
  homePending,
  togglePending,
  deletePending,
  isDeletable,
  onHome,
  onToggle,
  onArchive,
}: PromoMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const spinLinked = isSpinLinkedPromo(promo);
  const onHomeLabel = promo.showOnHome !== false ? 'Hide from home' : 'Show on home';
  const toggleLabel = promo.isActive ? 'Deactivate' : 'Activate';
  const archiveDisabled = spinLinked || !isDeletable || deletePending;

  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={
          trigger === 'icon'
            ? 'promo-management__more-icon'
            : 'promo-management__footer-more'
        }
        aria-label="More actions"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {trigger === 'icon' ? (
          <MoreVertical size={16} />
        ) : (
          <>
            More
            <ChevronDown size={14} />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="promo-management__menu w-52 gap-0.5 p-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="promo-management__menu-item"
          disabled={spinLinked || homePending}
          title={spinLinked ? 'Spin offers are not shown on home' : onHomeLabel}
          onClick={() => runAndClose(onHome)}
        >
          <Home size={14} />
          {spinLinked ? 'Home (Spin Wheel)' : onHomeLabel}
        </button>
        <button
          type="button"
          className="promo-management__menu-item"
          disabled={togglePending}
          title={spinLinked ? 'Manage in Spin Wheel' : toggleLabel}
          onClick={() => runAndClose(onToggle)}
        >
          <Power size={14} />
          {spinLinked ? 'Manage in Spin Wheel' : toggleLabel}
        </button>
        <button
          type="button"
          className="promo-management__menu-item promo-management__menu-item--danger"
          disabled={archiveDisabled}
          title={
            spinLinked
              ? 'Remove this prize in Spin Wheel'
              : isDeletable
                ? 'Archive promotion'
                : 'Deactivate first to archive'
          }
          onClick={() => runAndClose(() => void onArchive())}
        >
          <Trash2 size={14} />
          {spinLinked ? 'Archive in Spin Wheel' : 'Archive'}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export default function PromotionManagementDashboard({ branchMode = false }: { branchMode?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageTab = searchParams.get('tab') === 'promotions' ? 'promotions' : 'analyze';
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [detailsPromo, setDetailsPromo] = useState<AdminPromoRow | null>(null);
  const qc = useQueryClient();
  const { data: stores = [] } = useReportStores();

  const { data: promos = [], isLoading } = useQuery<AdminPromoRow[]>({
    queryKey: ['admin-promos'],
    queryFn: () => adminFetch('/promos/admin/all'),
  });

  /** Newest first (createdAt desc), then sortOrder, then id for stable ties. */
  const sortedPromos = useMemo(
    () =>
      [...promos].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return a.id.localeCompare(b.id);
      }),
    [promos],
  );

  const totalPages = Math.max(1, Math.ceil(sortedPromos.length / PROMOS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageList = buildPageList(safePage, totalPages);
  const pagedPromos = useMemo(() => {
    const start = (safePage - 1) * PROMOS_PAGE_SIZE;
    return sortedPromos.slice(start, start + PROMOS_PAGE_SIZE);
  }, [sortedPromos, safePage]);
  const rangeStart = sortedPromos.length === 0 ? 0 : (safePage - 1) * PROMOS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PROMOS_PAGE_SIZE, sortedPromos.length);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const activeCount = useMemo(() => promos.filter((p) => p.isActive).length, [promos]);
  const inactiveCount = promos.length - activeCount;
  const activePromos = useMemo(() => sortedPromos.filter((p) => p.isActive), [sortedPromos]);
  const inactivePromos = useMemo(() => sortedPromos.filter((p) => !p.isActive), [sortedPromos]);
  const selectedList = useMemo(
    () => sortedPromos.filter((p) => selectedIds.has(p.id)),
    [sortedPromos, selectedIds],
  );
  const selectedActive = selectedList.filter((p) => p.isActive);
  const selectedInactive = selectedList.filter((p) => !p.isActive);
  const allActiveSelected =
    activePromos.length > 0 && activePromos.every((p) => selectedIds.has(p.id));
  const allInactiveSelected =
    inactivePromos.length > 0 && inactivePromos.every((p) => selectedIds.has(p.id));

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/promos/admin/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      toast.success(vars.isActive ? 'Promotion activated' : 'Promotion deactivated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });

  const homeMutation = useMutation({
    mutationFn: ({ id, showOnHome }: { id: string; showOnHome: boolean }) =>
      adminFetch(`/promos/admin/${id}`, { method: 'PUT', body: JSON.stringify({ showOnHome }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      toast.success(vars.showOnHome ? 'Shown on home page' : 'Hidden from home page');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update home visibility'),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: { id: string; sortOrder: number }[]) =>
      adminFetch('/promos/admin/reorder', { method: 'PUT', body: JSON.stringify({ order }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promos'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/promos/admin/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      toast.success('Promotion archived (soft deleted)');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      adminFetch('/promos/admin/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (result: { deleted?: number }) => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      setSelectedIds(new Set());
      toast.success(
        result?.deleted && result.deleted > 1
          ? `${result.deleted} promotions archived`
          : 'Promotion archived (soft deleted)',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to archive selected'),
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      adminFetch('/promos/admin/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids, isActive }),
      }),
    onSuccess: (result: { updated?: number; isActive?: boolean }) => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      const n = result?.updated ?? 0;
      if (n === 0) {
        toast.success(result?.isActive ? 'Already active' : 'Already inactive');
      } else {
        toast.success(
          result?.isActive
            ? `${n} promotion${n === 1 ? '' : 's'} activated`
            : `${n} promotion${n === 1 ? '' : 's'} deactivated`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update status'),
  });

  function isPromoDeletable(promo: AdminPromoRow): boolean {
    return !promo.isActive;
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectGroup(group: 'active' | 'inactive') {
    const list = group === 'active' ? activePromos : inactivePromos;
    const allSelected = group === 'active' ? allActiveSelected : allInactiveSelected;
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((p) => next.delete(p.id));
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDeactivate() {
    if (selectedActive.length === 0) {
      toast.error('Select active promotions to deactivate');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Deactivate selected',
      message: `Deactivate ${selectedActive.length} promotion${selectedActive.length === 1 ? '' : 's'}? They will stop showing to customers.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!confirmed) return;
    bulkStatusMutation.mutate({ ids: selectedActive.map((p) => p.id), isActive: false });
  }

  async function handleBulkActivate() {
    if (selectedInactive.length === 0) {
      toast.error('Select inactive promotions to activate');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Activate selected',
      message: `Activate ${selectedInactive.length} promotion${selectedInactive.length === 1 ? '' : 's'}?`,
      confirmLabel: 'Activate',
    });
    if (!confirmed) return;
    bulkStatusMutation.mutate({ ids: selectedInactive.map((p) => p.id), isActive: true });
  }

  async function handleDelete(promo: AdminPromoRow) {
    if (isSpinLinkedPromo(promo)) {
      router.push('/admin/spin');
      return;
    }
    if (!isPromoDeletable(promo)) {
      toast.error('Deactivate the promotion before deleting');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Archive promotion',
      message: `Archive "${promo.code}"? It will be soft-deleted (hidden from customers, kept for records).`,
      confirmLabel: 'Archive',
      variant: 'danger',
    });

    if (!confirmed) return;
    deleteMutation.mutate(promo.id, {
      onSuccess: () => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(promo.id);
          return next;
        });
      },
    });
  }

  async function handleBulkDelete() {
    if (selectedInactive.length === 0) {
      toast.error('Select deactivated promotions to archive. Active ones must be turned off first.');
      return;
    }
    if (selectedList.some((p) => p.isActive)) {
      toast.error('Deselect active promotions, or deactivate them before archiving');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Archive selected promotions',
      message: `Archive ${selectedInactive.length} deactivated promotion${selectedInactive.length === 1 ? '' : 's'}? They will be soft-deleted (kept for records, hidden from customers).`,
      confirmLabel: 'Archive all',
      variant: 'danger',
    });

    if (!confirmed) return;
    bulkDeleteMutation.mutate(selectedInactive.map((p) => p.id));
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = sortedPromos.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    reorderMutation.mutate(next.map((id, sortOrder) => ({ id, sortOrder })));
    setDragId(null);
  }

  function openCreate() {
    router.push('/admin/promos/new');
  }

  function openEdit(promo: AdminPromoRow) {
    if (isSpinLinkedPromo(promo)) {
      router.push('/admin/spin');
      return;
    }
    router.push(`/admin/promos/${promo.id}/edit`);
  }

  function setPageTab(next: 'analyze' | 'promotions') {
    if (next === 'analyze') {
      router.replace('/admin/promos', { scroll: false });
      return;
    }
    router.replace('/admin/promos?tab=promotions', { scroll: false });
  }

  function handleHomeAction(promo: AdminPromoRow) {
    if (isSpinLinkedPromo(promo)) {
      router.push('/admin/spin');
      return;
    }
    homeMutation.mutate({ id: promo.id, showOnHome: !(promo.showOnHome !== false) });
  }

  function handleToggleAction(promo: AdminPromoRow) {
    if (isSpinLinkedPromo(promo)) {
      router.push('/admin/spin');
      return;
    }
    toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive });
  }

  return (
    <div className="promo-management">
      <div className="promo-management__header">
        <div className="promo-management__header-main">
          <h1 className="promo-management__title">
            <Tag size={20} className="text-brand" aria-hidden />
            {branchMode ? 'Branch Promotions' : 'Promotion Management'}
          </h1>
          <span className="promo-management__count-pill promo-management__count-pill--active">
            {activeCount} Active
          </span>
          <span className="promo-management__count-pill promo-management__count-pill--inactive">
            {inactiveCount} Inactive
          </span>
          {pageTab === 'promotions' && !branchMode && (
            <span className="promo-management__drag-hint">
              <GripVertical size={14} aria-hidden />
              Drag cards to reorder
            </span>
          )}
          {pageTab === 'analyze' && (
            <span className="promo-management__drag-hint promo-management__drag-hint--muted">
              Discount usage by branch and promotion for a date range
            </span>
          )}
        </div>

        {pageTab === 'promotions' && (
          <div className="promo-management__header-actions">
            {activePromos.length > 0 && (
              <button
                type="button"
                className="promo-management__select-control"
                onClick={() => toggleSelectGroup('active')}
                aria-pressed={allActiveSelected}
              >
                {allActiveSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                Select active
              </button>
            )}
            {inactivePromos.length > 0 && (
              <button
                type="button"
                className="promo-management__select-control"
                onClick={() => toggleSelectGroup('inactive')}
                aria-pressed={allInactiveSelected}
              >
                {allInactiveSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                Select inactive
              </button>
            )}
            <button type="button" onClick={openCreate} className="btn-primary px-4 py-2.5 text-sm">
              <Plus size={15} /> Create Promotion
            </button>
          </div>
        )}
      </div>

      <div className="promo-management__tabs" role="tablist" aria-label="Promotion pages">
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'analyze'}
          className={`promo-management__tab${pageTab === 'analyze' ? ' promo-management__tab--active' : ''}`}
          onClick={() => setPageTab('analyze')}
        >
          Analyze
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageTab === 'promotions'}
          className={`promo-management__tab${pageTab === 'promotions' ? ' promo-management__tab--active' : ''}`}
          onClick={() => setPageTab('promotions')}
        >
          Promotions
        </button>
      </div>

      {pageTab === 'analyze' && <PromotionDiscountReport />}

      {pageTab === 'promotions' && (
        <>
          {selectedIds.size > 0 && (
            <div className="promo-management__bulk-bar" role="region" aria-label="Bulk actions">
              <p className="promo-management__bulk-count">
                {selectedIds.size} selected
                {(selectedActive.length > 0 || selectedInactive.length > 0) && (
                  <span className="promo-management__bulk-hint">
                    {' '}· {selectedActive.length} active · {selectedInactive.length} inactive
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-outline px-3 py-2 text-sm"
                  onClick={clearSelection}
                >
                  <X size={14} /> Clear
                </button>
                <button
                  type="button"
                  className="btn-outline px-3 py-2 text-sm"
                  onClick={() => void handleBulkDeactivate()}
                  disabled={selectedActive.length === 0 || bulkStatusMutation.isPending}
                  title="Deactivate selected active promotions"
                >
                  <Power size={14} />
                  {bulkStatusMutation.isPending ? 'Updating…' : `Deactivate ${selectedActive.length || ''}`.trim()}
                </button>
                <button
                  type="button"
                  className="btn-outline px-3 py-2 text-sm"
                  onClick={() => void handleBulkActivate()}
                  disabled={selectedInactive.length === 0 || bulkStatusMutation.isPending}
                  title="Activate selected inactive promotions"
                >
                  <Power size={14} className="text-green-400" />
                  {`Activate ${selectedInactive.length || ''}`.trim()}
                </button>
                <button
                  type="button"
                  className="btn-primary px-3 py-2 text-sm promo-management__bulk-delete"
                  onClick={() => void handleBulkDelete()}
                  disabled={selectedInactive.length === 0 || bulkDeleteMutation.isPending}
                >
                  <Trash2 size={14} />
                  {bulkDeleteMutation.isPending
                    ? 'Archiving…'
                    : `Archive ${selectedInactive.length || ''}`.trim()}
                </button>
              </div>
            </div>
          )}

          <div className="promo-management__grid">
            {isLoading && (
              <p className="promo-management__grid-message text-muted text-sm">Loading promotions...</p>
            )}
            {!isLoading && sortedPromos.length === 0 && (
              <div className="promo-management__grid-message card p-8 text-center text-muted text-sm">
                No promotions yet. Create your first promotional card.
              </div>
            )}
            {pagedPromos.map((promo) => {
              const selected = selectedIds.has(promo.id);
              const shareLabel = sharedShareBadge(promo);
              const status = promoStatusLabel(promo);
              const title = promo.title?.trim() || promo.code;
              const description = promo.description?.trim() || '';
              const showDescription =
                Boolean(description) && description.toLowerCase() !== title.toLowerCase();
              const requiresCode = !promo.promotionKind
                || promotionKindRequiresCode(promo.promotionKind as PromotionKind);
              const moreProps = {
                promo,
                homePending: homeMutation.isPending,
                togglePending: toggleMutation.isPending,
                deletePending: deleteMutation.isPending,
                isDeletable: isPromoDeletable(promo),
                onHome: () => handleHomeAction(promo),
                onToggle: () => handleToggleAction(promo),
                onArchive: () => void handleDelete(promo),
              } as const;

              return (
                <article
                  key={promo.id}
                  className={[
                    'promo-management__card card',
                    dragId === promo.id ? 'promo-management__card--dragging' : '',
                    !promo.isActive ? 'promo-management__card--inactive' : '',
                    selected ? 'promo-management__card--selected' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={() => handleDragStart(promo.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(promo.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <div className="promo-management__card-toolbar">
                    <div className="promo-management__card-toolbar-left">
                      <button
                        type="button"
                        className="promo-management__select-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(promo.id);
                        }}
                        aria-label={selected ? 'Deselect promotion' : 'Select promotion'}
                        aria-pressed={selected}
                        title={selected ? 'Deselect' : 'Select'}
                      >
                        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <button type="button" className="promo-management__drag" aria-label="Drag to reorder">
                        <GripVertical size={16} />
                      </button>
                    </div>
                    <div className="promo-management__card-toolbar-right">
                      <span
                        className={[
                          'promo-management__status-badge',
                          status === 'Active' ? 'promo-management__status-badge--active' : '',
                          status === 'Inactive' ? 'promo-management__status-badge--inactive' : '',
                          status === 'Scheduled' ? 'promo-management__status-badge--scheduled' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {status}
                      </span>
                      <PromoMoreMenu {...moreProps} trigger="icon" />
                    </div>
                  </div>

                  <div className="promo-management__card-body">
                    <div className="promo-management__preview-panel">
                      {promo.cardDesign ? (
                        <div className="promo-management__previews promo-management__previews--grid">
                          {(['landscape', 'portrait'] as const).flatMap((orientation) =>
                            (['dark', 'light'] as const).map((themeMode) => (
                              <PromotionCardPreview
                                key={`${promo.id}-${orientation}-${themeMode}`}
                                design={getCardDesignForTheme(normalizeCardDesignSet(promo.cardDesign, promo.code), themeMode)}
                                orientation={orientation}
                                themeMode={themeMode}
                                sizeMode="responsive"
                                previewMaxHeight={orientation === 'portrait' ? 72 : 56}
                              />
                            )),
                          )}
                        </div>
                      ) : (
                        <div className="promo-management__creative-empty">
                          <ImageIcon size={22} aria-hidden />
                          <span>No creative uploaded</span>
                        </div>
                      )}
                    </div>

                    <div className="promo-management__meta">
                      {requiresCode ? (
                        <span className="promo-management__code">{promo.code}</span>
                      ) : (
                        <span className="promo-management__direct-badge">Add to Cup — no code</span>
                      )}
                      <h3 className="promo-management__card-title">{title}</h3>
                      {showDescription && (
                        <p className="promo-management__card-desc">{description}</p>
                      )}

                      <div className="promo-management__badge-row">
                        {promo.promotionKind && (
                          <span className="promo-management__type-badge">
                            {kindLabel(promo.promotionKind as PromotionKind)}
                          </span>
                        )}
                        {isSpinLinkedPromo(promo) && (
                          <span className="promo-management__type-badge">Spin Wheel</span>
                        )}
                        <span className="promo-management__benefit-badge">{benefitLabel(promo)}</span>
                      </div>

                      {shareLabel && (
                        <span className="promo-management__share-badge">{shareLabel}</span>
                      )}

                      <div className="promo-management__stat-row">
                        <span className="promo-management__stat">
                          <BarChart3 size={13} aria-hidden />
                          {formatUsageLimits(
                            parsePromoUsageLimits(promo.usageLimits, promo.maxUses),
                            promo.usedCount,
                          )}
                        </span>
                        <span className="promo-management__stat">
                          <MapPin size={13} aria-hidden />
                          {formatBranchSelectionLabel(
                            parsePromoStringArray(promo.storeIds),
                            stores,
                            branchDisplayName,
                          )}
                        </span>
                      </div>

                      {promo.expiresAt && (
                        <p className="promo-management__end-date">
                          <Calendar size={13} aria-hidden />
                          Ends {new Date(promo.expiresAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="promo-management__card-footer">
                    <div className="promo-management__card-footer-actions">
                      <button
                        type="button"
                        className="promo-management__edit-btn"
                        onClick={() => openEdit(promo)}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="promo-management__edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsPromo(promo);
                        }}
                      >
                        <FileText size={14} />
                        View Details
                      </button>
                    </div>
                    <PromoMoreMenu {...moreProps} trigger="label" />
                  </div>
                </article>
              );
            })}
          </div>

          {!isLoading && sortedPromos.length > 0 && (
            <div className="admin-table-pagination promo-management__pagination">
              <p className="admin-table-pagination__summary text-xs text-muted">
                Showing{' '}
                <span className="text-fg font-semibold tabular-nums">
                  {rangeStart}–{rangeEnd}
                </span>{' '}
                of{' '}
                <span className="text-fg font-semibold tabular-nums">{sortedPromos.length}</span>{' '}
                promotions
              </p>
              <nav className="admin-table-pagination__nav" aria-label="Promotions pagination">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="admin-table-pagination__arrow"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="admin-table-pagination__pages">
                  {pageList.map((item, i) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${i}`} className="admin-table-pagination__ellipsis" aria-hidden>
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        aria-label={`Page ${item}`}
                        aria-current={item === safePage ? 'page' : undefined}
                        className={`admin-table-pagination__page${item === safePage ? ' admin-table-pagination__page--active' : ''}`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="admin-table-pagination__arrow"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </nav>
            </div>
          )}
          <PromotionReportSheet
            open={detailsPromo != null}
            onClose={() => setDetailsPromo(null)}
            promo={detailsPromo}
            stores={stores}
          />
        </>
      )}
    </div>
  );
}
