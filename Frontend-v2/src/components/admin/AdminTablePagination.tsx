'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ADMIN_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/pagination';

interface AdminTablePaginationProps {
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  rangeStart: number;
  rangeEnd: number;
  totalItems: number;
  safePage: number;
  totalPages: number;
  pageList: (number | 'ellipsis')[];
  onPageChange: (page: number) => void;
  itemLabel: string;
  ariaLabel?: string;
  className?: string;
  /** When false, hides the items-per-page selector (fixed page size). */
  showPageSizeSelect?: boolean;
}

export default function AdminTablePagination({
  pageSize,
  onPageSizeChange,
  rangeStart,
  rangeEnd,
  totalItems,
  safePage,
  totalPages,
  pageList,
  onPageChange,
  itemLabel,
  ariaLabel = 'Table pagination',
  className,
  showPageSizeSelect = true,
}: AdminTablePaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div className={['admin-table-pagination', className].filter(Boolean).join(' ')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {showPageSizeSelect && onPageSizeChange && (
          <label className="inline-flex items-center gap-2 text-xs text-muted">
            <span>Items per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-navy-border bg-input-bg px-2 text-xs text-fg"
            >
              {ADMIN_TABLE_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="admin-table-pagination__summary text-xs text-muted">
          Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
          <span className="text-fg font-semibold tabular-nums">{totalItems.toLocaleString()}</span> {itemLabel}
        </p>
      </div>
      {totalPages > 1 && (
        <nav className="admin-table-pagination__nav" aria-label={ariaLabel}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
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
                  onClick={() => onPageChange(item)}
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
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="admin-table-pagination__arrow"
            aria-label="Next page"
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
    </div>
  );
}
