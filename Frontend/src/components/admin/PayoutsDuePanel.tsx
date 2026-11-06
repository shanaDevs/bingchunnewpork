'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ChevronLeft, ChevronRight, Download, FileText, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatMoneyAmount } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatBranchName } from '@/lib/deliveryDisplay';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBase';
import { payoutPeriodRowNeedsLiveNetPreview } from '@/components/admin/payoutPeriodRowAmounts';
import { readPayoutCycleStage } from '@/components/admin/payoutPeriodRowCycleDisplay';
import { resolveListedPayoutPeriodDisplay } from '@/components/admin/payoutSecondCycleDisplayRange';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import {
  PayoutsDueTableHead,
  PayoutsDueTableSkeleton,
  PAYOUTS_DUE_ALLOCATION_COLUMNS,
} from '@/components/admin/payoutsDueTableShared';
import {
  payoutDueRowKey,
  usePayoutDueAmountMaps,
} from '@/components/admin/usePayoutDueAmountMaps';
import { Skeleton } from '@/components/ui/skeleton';
import { isOldestUnpaidBranchPayoutRow } from '@/lib/branchPayoutsDue';
import {
  downloadPayoutReviewPdf,
  downloadPayoutReviewZip,
  fetchPayoutReviews,
  payoutReviewMarkKey,
  payoutReviewPdfFilename,
  setPayoutInReview,
  type PayoutReviewMark,
} from '@/lib/payoutReviewDownload';
import type { PayoutDueRow } from '@/components/admin/payoutDueTypes';

export type { PayoutDueRow } from '@/components/admin/payoutDueTypes';

type Props = {
  rows: PayoutDueRow[];
  loading?: boolean;
  loadingMore?: boolean;
  onView?: (row: PayoutDueRow) => void;
  onReviewAndPay: (row: PayoutDueRow) => void;
};

export const PAYOUTS_DUE_PAGE_SIZE = 10;

function PayoutDueAllocationCells({
  amounts,
  previewLoading,
  needsPreview,
}: {
  amounts: PeriodPayoutCardAmounts;
  previewLoading: boolean;
  needsPreview: boolean;
}) {
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
          key={PAYOUTS_DUE_ALLOCATION_COLUMNS[index]}
          className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]"
        >
          {feeColumnsLoading && index > 0 ? (
            <Skeleton className="ml-auto inline-block h-3.5 w-16 bg-[var(--color-navy-light)]/70" />
          ) : value == null ? (
            '—'
          ) : (
            formatMoneyAmount(value)
          )}
        </td>
      ))}
    </>
  );
}

function PayoutDueTableRow({
  row,
  storeRows,
  amounts,
  netPreview,
  previewLoading,
  payEnabled,
  inReview,
  reviewBusy,
  downloadBusy,
  reviewsReady,
  reviewsError,
  onToggleReview,
  onDownload,
  onView,
  onReviewAndPay,
}: {
  row: PayoutDueRow;
  storeRows: PayoutDueRow[];
  amounts: PeriodPayoutCardAmounts;
  netPreview?: Record<string, unknown> | null;
  previewLoading: boolean;
  payEnabled: boolean;
  inReview: boolean;
  reviewBusy: boolean;
  downloadBusy: boolean;
  reviewsReady: boolean;
  reviewsError: boolean;
  onToggleReview: (row: PayoutDueRow, inReview: boolean) => void;
  onDownload: (row: PayoutDueRow, filename: string) => void;
  onView?: (row: PayoutDueRow) => void;
  onReviewAndPay: (row: PayoutDueRow) => void;
}) {
  const branchName = formatBranchName(row.storeName);
  const cycleStage = readPayoutCycleStage(row.breakdown, netPreview);
  const periodDisplay = resolveListedPayoutPeriodDisplay({
    row,
    rows: storeRows,
    cycleStage,
    breakdown: row.breakdown,
    periodDays: row.days,
  });
  const payNote = !payEnabled
    ? 'Pay earlier period first'
    : reviewsError
      ? 'Review status unavailable'
      : !reviewsReady
        ? 'Loading review status…'
        : !inReview
          ? 'Mark as In Review first'
          : null;

  return (
    <tr
      className={cn(
        'border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40',
        inReview && 'bg-amber-500/[0.06]',
      )}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={inReview}
          disabled={!reviewsReady || reviewBusy}
          aria-label={`Mark ${branchName} payout in review`}
          onChange={(event) => onToggleReview(row, event.target.checked)}
          className="h-4 w-4 accent-[var(--color-brand)] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-3 py-3 font-medium text-[var(--color-text)]">{branchName}</td>
      <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
        {formatBiweeklyPeriodLabel(periodDisplay.displayFrom, periodDisplay.displayTo)}
        <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-text)]">
          {periodDisplay.displayDays} days
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
        {row.orderCount}
      </td>
      <PayoutDueAllocationCells
        amounts={amounts}
        previewLoading={previewLoading}
        needsPreview={payoutPeriodRowNeedsLiveNetPreview(row.breakdown)}
      />
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          onClick={() => onView?.(row)}
          aria-label={`Wallet view for ${branchName}`}
          className={cn(
            'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
            'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
          )}
        >
          View
        </button>
      </td>
      <td className="px-3 py-3 text-right">
        <button
          type="button"
          disabled={downloadBusy}
          onClick={() =>
            onDownload(
              row,
              payoutReviewPdfFilename(
                row.storeName,
                periodDisplay.displayFrom,
                periodDisplay.displayTo,
                cycleStage,
              ),
            )
          }
          aria-label={`Download payout PDF for ${branchName}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
            'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {downloadBusy ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
          PDF
        </button>
      </td>
      <td className="px-3 py-3 text-right">
        {payNote == null ? (
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
            title={payNote ?? undefined}
          >
            <span className="rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5 text-xs font-semibold opacity-50">
              Review & Pay
            </span>
            {payNote}
          </span>
        )}
      </td>
    </tr>
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
  const [reviewBusyKey, setReviewBusyKey] = useState<string | null>(null);
  const [downloadBusyKey, setDownloadBusyKey] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const count = rows.length;
  const apiBase = getApiBaseUrl();
  const queryClient = useQueryClient();
  const reviewsQuery = useQuery({
    queryKey: ['branch-payout-reviews'],
    queryFn: fetchPayoutReviews,
    staleTime: 15_000,
  });
  const inReviewKeys = useMemo(
    () => new Set((reviewsQuery.data ?? []).map((mark) => payoutReviewMarkKey(mark))),
    [reviewsQuery.data],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const raw = row.storeName.toLowerCase();
      const label = formatBranchName(row.storeName).toLowerCase();
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

  const { displayAmountsByDueKey, previewByKey, previewLoadingByKey, resolveDueRowBaseAmounts } =
    usePayoutDueAmountMaps(rows, pageRows, apiBase);

  function reviewMark(row: PayoutDueRow): PayoutReviewMark {
    return {
      storeId: row.storeId,
      periodFrom: row.periodFrom.slice(0, 10),
      periodTo: row.periodTo.slice(0, 10),
    };
  }

  async function toggleReview(row: PayoutDueRow, next: boolean) {
    const mark = reviewMark(row);
    const key = payoutReviewMarkKey(mark);
    const previous = reviewsQuery.data ?? [];
    setReviewBusyKey(key);
    queryClient.setQueryData<PayoutReviewMark[]>(['branch-payout-reviews'], (current = []) => {
      const without = current.filter((item) => payoutReviewMarkKey(item) !== key);
      return next ? [...without, mark] : without;
    });
    try {
      await setPayoutInReview(mark, next);
    } catch (err) {
      queryClient.setQueryData(['branch-payout-reviews'], previous);
      toast.error(err instanceof Error ? err.message : 'Could not update review status');
    } finally {
      setReviewBusyKey(null);
    }
  }

  async function downloadOne(row: PayoutDueRow, filename: string) {
    const key = payoutDueRowKey(row);
    setDownloadBusyKey(key);
    try {
      await downloadPayoutReviewPdf(reviewMark(row), filename);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the payout invoice');
    } finally {
      setDownloadBusyKey(null);
    }
  }

  async function downloadAllListed() {
    if (filteredRows.length === 0 || downloadingAll) return;
    if (filteredRows.length > 40) {
      toast.error('Download all is limited to 40 payouts. Narrow the branch search first.');
      return;
    }
    setDownloadingAll(true);
    try {
      await downloadPayoutReviewZip(filteredRows.map(reviewMark));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the payout invoices');
    } finally {
      setDownloadingAll(false);
    }
  }

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
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <button
                type="button"
                disabled={downloadingAll || filteredRows.length === 0 || loadingMore}
                onClick={() => void downloadAllListed()}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-[var(--color-navy-border)] px-3',
                  'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {downloadingAll ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Download all
              </button>
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
          </div>

          {reviewsQuery.isError && (
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-2 text-xs text-amber-700 sm:px-5">
              <span>Could not load which payouts are in review.</span>
              <button
                type="button"
                onClick={() => void reviewsQuery.refetch()}
                className="font-semibold text-[var(--color-brand)] hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {filteredRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
              No branches match &ldquo;{searchQuery.trim()}&rdquo;
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-xs">
                <PayoutsDueTableHead />
                <tbody>
                  {pageRows.map((row) => {
                    const key = payoutDueRowKey(row);
                    const reviewKey = payoutReviewMarkKey(reviewMark(row));
                    return (
                      <PayoutDueTableRow
                        key={key}
                        row={row}
                        storeRows={rows.filter((candidate) => candidate.storeId === row.storeId)}
                        amounts={displayAmountsByDueKey.get(key) ?? resolveDueRowBaseAmounts(row)}
                        netPreview={previewByKey.get(key)}
                        previewLoading={previewLoadingByKey.get(key) ?? false}
                        payEnabled={canReviewAndPay(row)}
                        inReview={inReviewKeys.has(reviewKey)}
                        reviewBusy={reviewBusyKey === reviewKey}
                        downloadBusy={downloadBusyKey === key || downloadingAll}
                        reviewsReady={reviewsQuery.isSuccess}
                        reviewsError={reviewsQuery.isError}
                        onToggleReview={(target, next) => void toggleReview(target, next)}
                        onDownload={(target, filename) => void downloadOne(target, filename)}
                        onView={onView}
                        onReviewAndPay={onReviewAndPay}
                      />
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
