'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, CheckCircle, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatMoney } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import type { DeliveryPayoutDueRow } from '@/lib/deliveryPayoutTypes';
import {
  deliveryPayoutDueReviewKey,
  downloadDeliveryPayoutDueStatement,
  fetchDeliveryPayoutDueReviews,
  formatDeliveryPayoutReviewDraftError,
  setDeliveryPayoutDueReview,
  type DeliveryPayoutDueReviewMark,
} from '@/lib/deliveryPayoutDueReview';

type PropsBase = {
  rows: DeliveryPayoutDueRow[];
  loading?: boolean;
  onView?: (row: DeliveryPayoutDueRow) => void;
};

type Props =
  | (PropsBase & {
      allowPay?: true;
      unlockToken: string;
      onReviewAndPay: (row: DeliveryPayoutDueRow) => void;
    })
  | (PropsBase & {
      allowPay: false;
      unlockToken?: string;
      onReviewAndPay?: never;
    })
  | (PropsBase & {
      allowPay?: true;
      unlockToken?: never;
      onReviewAndPay: (row: DeliveryPayoutDueRow) => void;
    });

function reviewMark(row: DeliveryPayoutDueRow): DeliveryPayoutDueReviewMark {
  return {
    periodFrom: row.periodFrom.slice(0, 10),
    periodTo: row.periodTo.slice(0, 10),
  };
}

export default function DeliveryPayoutsDuePanel({
  rows,
  loading,
  onView,
  onReviewAndPay,
  allowPay = true,
  unlockToken,
}: Props) {
  const queryClient = useQueryClient();
  const reviewWorkflow = allowPay && Boolean(unlockToken);
  const [reviewBusyKey, setReviewBusyKey] = useState<string | null>(null);
  const [downloadBusyKey, setDownloadBusyKey] = useState<string | null>(null);

  const reviewsQuery = useQuery({
    queryKey: ['delivery-payout-due-reviews', unlockToken],
    queryFn: () => fetchDeliveryPayoutDueReviews(unlockToken!),
    enabled: reviewWorkflow,
    staleTime: 15_000,
  });

  const inReviewKeys = useMemo(
    () => new Set((reviewsQuery.data ?? []).map((mark) => deliveryPayoutDueReviewKey(mark))),
    [reviewsQuery.data],
  );

  const count = rows.length;
  const platformFeePercent = rows[0]?.platformFeePercent;
  const gatewayFeePercent = rows[0]?.gatewayFeePercent;
  const reviewsReady = !reviewWorkflow || reviewsQuery.isSuccess;
  const reviewsError = reviewWorkflow && reviewsQuery.isError;

  async function toggleReview(row: DeliveryPayoutDueRow, next: boolean) {
    if (!unlockToken) return;
    if (next && !row.payable) {
      toast.error(formatDeliveryPayoutReviewDraftError('Only the earliest due delivery period can be saved as draft.'));
      return;
    }
    const mark = reviewMark(row);
    const key = deliveryPayoutDueReviewKey(mark);
    const previous = reviewsQuery.data ?? [];
    setReviewBusyKey(key);
    queryClient.setQueryData<DeliveryPayoutDueReviewMark[]>(
      ['delivery-payout-due-reviews', unlockToken],
      (current = []) => {
        let updated = [...current];
        updated = updated.filter((item) => deliveryPayoutDueReviewKey(item) !== key);
        if (next) updated.push(mark);
        return updated;
      },
    );
    try {
      await setDeliveryPayoutDueReview(unlockToken, mark, next);
    } catch (err) {
      queryClient.setQueryData(['delivery-payout-due-reviews', unlockToken], previous);
      const message = err instanceof Error ? err.message : 'Could not update review status';
      toast.error(formatDeliveryPayoutReviewDraftError(message));
    } finally {
      setReviewBusyKey(null);
    }
  }

  async function handleDownload(row: DeliveryPayoutDueRow) {
    if (!unlockToken) return;
    const key = deliveryPayoutDueReviewKey(reviewMark(row));
    setDownloadBusyKey(key);
    try {
      await downloadDeliveryPayoutDueStatement(unlockToken, row.periodFrom, row.periodTo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the payout statement');
    } finally {
      setDownloadBusyKey(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
          <Loader2 size={18} className="animate-spin text-[var(--color-brand)]" />
          Loading delivery payouts due…
        </div>
      )}

      {!loading && count === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CheckCircle size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No delivery payouts due</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            {allowPay
              ? 'Completed 30-day delivery periods appear here for Super Admin payout.'
              : 'Completed 30-day periods. Pay from main admin Wallet → Payouts Due → Delivery.'}
          </p>
        </div>
      )}

      {!loading && count > 0 && (
        <>
          <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Delivery payouts due</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              {count} period{count === 1 ? '' : 's'} · 30-day cycle
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {reviewWorkflow && (
                    <th className="px-3 py-2.5 font-semibold" scope="col">
                      Draft
                    </th>
                  )}
                  <th className="px-3 py-2.5 font-semibold">Partner</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gross</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Platform fee
                    {typeof platformFeePercent === 'number' ? ` (${platformFeePercent}%)` : ''}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                    Gateway fee
                    {typeof gatewayFeePercent === 'number' ? ` (${gatewayFeePercent}%)` : ''}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">Net due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-3 py-2.5 text-right font-semibold">View</th>
                  {reviewWorkflow && (
                    <th className="px-3 py-2.5 text-right font-semibold">PDF</th>
                  )}
                  {allowPay ? (
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  ) : (
                    <th className="px-3 py-2.5 text-right font-semibold">Status</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = deliveryPayoutDueReviewKey(reviewMark(row));
                  const inReview = inReviewKeys.has(key);
                  const reviewBusy = reviewBusyKey === key;
                  const downloadBusy = downloadBusyKey === key;
                  const payNote =
                    !row.payable
                      ? 'Pay earlier period first'
                      : reviewsError
                        ? 'Review status unavailable'
                        : !reviewsReady
                          ? 'Loading review status…'
                          : !inReview
                            ? 'Save as draft first'
                            : null;

                  return (
                    <tr
                      key={`${row.periodFrom}-${row.periodTo}`}
                      className={cn(
                        'border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40',
                        inReview && 'bg-amber-500/[0.06]',
                      )}
                    >
                      {reviewWorkflow && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={inReview}
                            disabled={!reviewsReady || reviewBusy || (!inReview && !row.payable)}
                            title={
                              !inReview && !row.payable
                                ? 'Only the earliest due period can be saved as draft'
                                : undefined
                            }
                            aria-label="Save delivery payout as draft"
                            onChange={(event) => void toggleReview(row, event.target.checked)}
                            className="h-4 w-4 accent-[var(--color-brand)] disabled:cursor-not-allowed"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 font-medium text-[var(--color-text)]">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/12 text-sky-500">
                            <Bike size={14} strokeWidth={2.25} />
                          </span>
                          Delivery Partner
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text-muted)]">
                        {formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo)}
                        <span className="ml-1.5 text-[10px] font-semibold text-[var(--color-text)]">
                          {row.days} days
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                        {formatMoney(row.grossDeliveryFee)}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]"
                        title={
                          typeof row.platformFeePercent === 'number'
                            ? `Platform fee (${row.platformFeePercent}%)`
                            : undefined
                        }
                      >
                        {typeof row.platformFee === 'number' ? formatMoney(row.platformFee) : '—'}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums text-[var(--color-text-muted)]"
                        title={
                          typeof row.gatewayFeePercent === 'number'
                            ? `Gateway fee (${row.gatewayFeePercent}%)`
                            : undefined
                        }
                      >
                        {typeof row.gatewayFee === 'number' ? formatMoney(row.gatewayFee) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                        {formatMoney(row.netForDelivery)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text)]">
                        {row.orderCount}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onView?.(row)}
                          className={cn(
                            'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                            'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                          )}
                        >
                          View
                        </button>
                      </td>
                      {reviewWorkflow && (
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            disabled={!inReview || downloadBusy}
                            title={!inReview ? 'Save as draft first' : undefined}
                            onClick={() => void handleDownload(row)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                              'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                              'disabled:cursor-not-allowed disabled:opacity-60',
                            )}
                          >
                            {downloadBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <FileText size={12} />
                            )}
                            PDF
                          </button>
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        {allowPay ? (
                          payNote == null ? (
                            <button
                              type="button"
                              onClick={() => onReviewAndPay?.(row)}
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
                              title={payNote}
                            >
                              <span className="rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5 text-xs font-semibold opacity-50">
                                Review & Pay
                              </span>
                              <span className="text-right">{payNote}</span>
                            </span>
                          )
                        ) : (
                          <span
                            className={cn(
                              'text-[10px] font-semibold',
                              row.payable ? 'text-emerald-400' : 'text-[var(--color-text-muted)]',
                            )}
                          >
                            {row.payable ? 'Ready to pay' : 'Earlier period pending'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}