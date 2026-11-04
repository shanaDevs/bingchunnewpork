'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { formatMoneyAmount } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  fetchPayoutPeriodNetPreview,
  resolvePayoutPeriodRowDisplayAmounts,
} from '@/components/admin/payoutPeriodRowAmounts';
import { Skeleton } from '@/components/ui/skeleton';
import { isOldestUnpaidBranchPayoutRow } from '@/lib/branchPayoutsDue';

export type PayoutDueRow = {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  days: number;
  netAmountCents: number;
  orderCount: number;
  breakdown?: unknown | null;
};

type Props = {
  rows: PayoutDueRow[];
  loading?: boolean;
  loadingMore?: boolean;
  onView?: (row: PayoutDueRow) => void;
  onReviewAndPay: (row: PayoutDueRow) => void;
};

const ALLOCATION_COLUMNS = [
  'Branch payout',
  'Customer convenience fee',
  'Platform commission',
  'Delivery fee received',
] as const;

const PAYOUTS_DUE_TABLE_COL_COUNT = 3 + ALLOCATION_COLUMNS.length + 2;

const PAYOUTS_DUE_SKELETON_WIDTHS = [
  'w-28',
  'w-36',
  'w-10',
  'w-16',
  'w-16',
  'w-16',
  'w-16',
  'w-14',
  'w-20',
] as const;

function PayoutsDueTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24 bg-[var(--color-navy-light)]/70" />
          <Skeleton className="h-3 w-40 bg-[var(--color-navy-light)]/70" />
        </div>
        <Skeleton className="h-8 w-full max-w-[220px] rounded-[12px] bg-[var(--color-navy-light)]/70 sm:w-[220px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">
                Branch
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">
                Period
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                Orders
              </th>
              {ALLOCATION_COLUMNS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-2.5 text-right font-semibold whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                Wallet view
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, row) => (
              <tr
                key={row}
                className="border-b border-[var(--color-navy-border)]/70 last:border-b-0"
              >
                {Array.from({ length: PAYOUTS_DUE_TABLE_COL_COUNT }).map((__, col) => (
                  <td
                    key={col}
                    className={
                      col >= 2 && col <= 6 ? 'px-3 py-3 text-right' : 'px-3 py-3'
                    }
                  >
                    <Skeleton
                      className={cn(
                        'h-3.5 bg-[var(--color-navy-light)]/70',
                        PAYOUTS_DUE_SKELETON_WIDTHS[col] ?? 'w-20',
                        col >= 2 && col <= 6 && 'ml-auto',
                        col >= 7 && 'ml-auto inline-block',
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function branchLabel(name: string) {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}

export const PAYOUTS_DUE_PAGE_SIZE = 10;

function payoutDueRowKey(row: PayoutDueRow) {
  return `${row.storeId}-${row.periodFrom}-${row.periodTo}`;
}

function PayoutDueAllocationCells({
  row,
  netPreviewData,
  previewLoading,
}: {
  row: PayoutDueRow;
  netPreviewData?: Record<string, unknown>;
  previewLoading: boolean;
}) {
  const needsPreview = row.breakdown == null;
  const amounts = resolvePayoutPeriodRowDisplayAmounts({
    amountCents: row.netAmountCents,
    breakdown: row.breakdown,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    netPreviewData: needsPreview ? netPreviewData : undefined,
  });

  const feeColumnsLoading = needsPreview && previewLoading;
  const values = [
    amounts.branchReceives,
    amounts.orderConvenienceFeeLkr,
    amounts.commissionLkr,
    amounts.deliveryFee,
  ];

  return (
    <>
      {values.map((value, index) => (
        <td
          key={ALLOCATION_COLUMNS[index]}
          className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]"
        >
          {feeColumnsLoading && index > 0 ? (
            <Skeleton className="ml-auto inline-block h-3.5 w-16 bg-[var(--color-navy-light)]/70" />
          ) : (
            formatMoneyAmount(value)
          )}
        </td>
      ))}
    </>
  );
}

export default function PayoutsDuePanel({
  rows,
  loading,
  loadingMore = false,
  onView,
  onReviewAndPay,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const count = rows.length;
  const apiBase = getApiBaseUrl();

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const raw = row.storeName.toLowerCase();
      const label = branchLabel(row.storeName).toLowerCase();
      return raw.includes(q) || label.includes(q);
    });
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAYOUTS_DUE_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [rows, searchQuery]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAYOUTS_DUE_PAGE_SIZE;
    return filteredRows.slice(start, start + PAYOUTS_DUE_PAGE_SIZE);
  }, [filteredRows, page]);

  const canReviewAndPay = useMemo(
    () => (row: PayoutDueRow) => isOldestUnpaidBranchPayoutRow(row, rows),
    [rows],
  );

  const rowsNeedingPreview = useMemo(
    () => pageRows.filter((row) => row.breakdown == null),
    [pageRows],
  );

  const previewQueries = useQueries({
    queries: rowsNeedingPreview.map((row) => ({
      queryKey: ['payout-due-net-preview', row.storeId, row.periodFrom, row.periodTo] as const,
      queryFn: () => fetchPayoutPeriodNetPreview(apiBase, row.storeId, row.periodFrom, row.periodTo),
      staleTime: 45_000,
    })),
  });

  const previewByKey = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    rowsNeedingPreview.forEach((row, index) => {
      const data = previewQueries[index]?.data;
      if (data) map.set(payoutDueRowKey(row), data);
    });
    return map;
  }, [previewQueries, rowsNeedingPreview]);

  const previewLoadingByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    rowsNeedingPreview.forEach((row, index) => {
      const query = previewQueries[index];
      map.set(payoutDueRowKey(row), Boolean(query?.isLoading || query?.isFetching));
    });
    return map;
  }, [previewQueries, rowsNeedingPreview]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      {(loading || loadingMore) && count === 0 && <PayoutsDueTableSkeleton />}

      {!loading && !loadingMore && count === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CheckCircle size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No payouts due</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            Branches appear here automatically once their 15-day payout period is complete.
          </p>
        </div>
      )}

      {!loading && count > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Payouts Due</h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                {count} period{count === 1 ? '' : 's'} · oldest first · 15-day cycle
              </span>
            </div>
            <div className="relative w-full max-w-[220px] sm:w-auto">
              <Search
                size={13}
                className="pointer-events-none absolute top-1/2 left-2.5 z-[2] -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="text"
                placeholder="Search branches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search branches"
                className="input-field h-8 w-full rounded-[12px] py-0 pr-3 text-xs"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
              No branches match &ldquo;{searchQuery.trim()}&rdquo;
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">
                    Branch
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold whitespace-nowrap">
                    Period
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Orders
                  </th>
                  {ALLOCATION_COLUMNS.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2.5 text-right font-semibold whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Wallet view
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const key = payoutDueRowKey(row);
                  const payEnabled = canReviewAndPay(row);
                  return (
                  <tr
                    key={key}
                    className="border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40"
                  >
                    <td className="px-3 py-3 font-medium text-[var(--color-text)]">
                      {branchLabel(row.storeName)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                      {formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo)}
                      <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-text)]">
                        {row.days} days
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                      {row.orderCount}
                    </td>
                    <PayoutDueAllocationCells
                      row={row}
                      netPreviewData={previewByKey.get(key)}
                      previewLoading={previewLoadingByKey.get(key) ?? false}
                    />
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onView?.(row)}
                        aria-label={`Wallet view for ${branchLabel(row.storeName)}`}
                        className={cn(
                          'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                          'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                        )}
                      >
                        View
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {payEnabled ? (
                        <button
                          type="button"
                          onClick={() => onReviewAndPay(row)}
                          className={cn(
                            'inline-flex items-center rounded-lg border border-[var(--color-brand)] px-3 py-1.5',
                            'text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-subtle)]',
                          )}
                        >
                          Review & Pay
                        </button>
                      ) : (
                        <span
                          className="inline-flex max-w-[9.5rem] flex-col items-end gap-0.5 text-[10px] font-medium text-[var(--color-text-muted)]"
                          title="Pay the earlier period for this branch first"
                        >
                          <span className="rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5 text-xs font-semibold opacity-50">
                            Review & Pay
                          </span>
                          Pay earlier period first
                        </span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {loadingMore && (
            <div className="flex items-center justify-center gap-2 border-t border-[var(--color-navy-border)] px-5 py-3 text-xs text-[var(--color-text-muted)]">
              <Loader2 size={14} className="animate-spin text-[var(--color-brand)]" />
              Loading more branches…
            </div>
          )}

          {filteredRows.length > PAYOUTS_DUE_PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[var(--color-navy-border)] px-5 py-3">
              <span className="text-xs text-[var(--color-text-muted)]">
                Page {page} of {totalPages}
                {filteredRows.length > 0 ? ` · ${filteredRows.length} total` : ''}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
