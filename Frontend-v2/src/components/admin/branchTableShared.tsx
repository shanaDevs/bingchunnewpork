'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { shortBranchName } from '@/lib/branchName';

export type BranchTier = 'top' | 'standard';
export type BranchTierFilter = 'all' | 'top' | 'standard';

export function branchTierLabel(tier: BranchTier | undefined): string {
  return tier === 'top' ? 'Delivery & Pickup' : 'Pickup Only';
}

export function BranchTierBadge({ tier }: { tier?: BranchTier }) {
  const isTop = tier === 'top';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
        isTop ? 'bg-indigo-500/15 text-indigo-400' : 'bg-amber-500/15 text-amber-500'
      }`}
    >
      {branchTierLabel(tier)}
    </span>
  );
}

export function branchMatchesSearch(branchName: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  const short = shortBranchName(branchName).toLowerCase();
  return short.includes(trimmed) || branchName.toLowerCase().includes(trimmed);
}

export function filterRowsByTier<T extends { tier?: BranchTier }>(
  list: T[],
  tierFilter: BranchTierFilter,
): T[] {
  if (tierFilter === 'top') return list.filter((row) => row.tier === 'top');
  if (tierFilter === 'standard') return list.filter((row) => row.tier === 'standard');
  return list;
}

export function useTablePagination(
  itemCount: number,
  paginate: boolean,
  pageSize: number,
  resetKeys: unknown[],
) {
  const scopeKey = resetKeys.map((key) => String(key ?? '')).join('\x1e');
  const [scopeState, setScopeState] = useState({ scopeKey, page: 0 });

  const page = scopeState.scopeKey === scopeKey ? scopeState.page : 0;

  const setPage = (update: (currentPage: number) => number) => {
    setScopeState((prev) => {
      const current = prev.scopeKey === scopeKey ? prev.page : 0;
      return { scopeKey, page: update(current) };
    });
  };

  const totalPages = paginate ? Math.max(1, Math.ceil(itemCount / pageSize)) : 1;
  const safePage = Math.min(page, totalPages - 1);

  const visibleSlice = useMemo(() => {
    if (!paginate) return { start: 0, end: itemCount };
    const start = safePage * pageSize;
    return { start, end: start + pageSize };
  }, [paginate, safePage, pageSize, itemCount]);

  return { safePage, totalPages, setPage, visibleSlice };
}

type BranchTablePaginationProps = {
  safePage: number;
  totalPages: number;
  pageSize: number;
  itemCount: number;
  onPageChange: (update: (page: number) => number) => void;
};

export function BranchTablePagination({
  safePage,
  totalPages,
  pageSize,
  itemCount,
  onPageChange,
}: BranchTablePaginationProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-navy-border/60 pt-3">
      <p className="text-xs text-muted">
        Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, itemCount)} of {itemCount}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
          disabled={safePage <= 0}
          onClick={() => onPageChange((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <span className="text-xs font-medium text-muted">
          Page {safePage + 1} of {totalPages}
        </span>
        <button
          type="button"
          className="btn-outline flex items-center gap-1 px-3 py-1.5 text-xs"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange((p) => Math.min(totalPages - 1, p + 1))}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}