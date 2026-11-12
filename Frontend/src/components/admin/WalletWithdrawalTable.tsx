'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, FileText, History, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { formatStoredPayoutPeriodLabel } from '@/components/admin/payoutSecondCycleDisplayRange';
import { formatMoneyAmount } from '@/lib/receipt';
import { cn } from '@/lib/utils';
import { openPayoutProof, openPayoutProofById, openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import {
  hasWithdrawalInvoice,
  parseWithdrawalBreakdown,
  resolveWithdrawalPaymentLkr,
  withdrawalAmountParts,
  type WithdrawalBreakdown,
} from '@/components/admin/settlementTypes';
import WithdrawalBreakdownDisplay from '@/components/admin/WithdrawalBreakdownDisplay';
import WithdrawalPaymentCell from '@/components/admin/WithdrawalPaymentCell';

export type WithdrawalRow = {
  id: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'IN_REVIEW';
  remarks: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  rejectionReason: string | null;
  paymentMethod?: string | null;
  proofUrl?: string | null;
  hasProof?: boolean;
  checkNumber?: string | null;
  checkDate?: string | null;
  invoiceUrl?: string | null;
  invoiceRef?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  storeId?: string;
  isAdvance?: boolean;
  /** Stored on the withdrawal row. Breakdown JSON wins when it also has a stage. */
  cycleStage?: 'FIRST' | 'SECOND' | null;
  breakdown?: WithdrawalBreakdown | null;
};

export function isWithdrawalInReview(row: Pick<WithdrawalRow, 'status'>): boolean {
  return row.status === 'IN_REVIEW';
}

/** Completed Payout Summary — hide branch drafts still awaiting platform review. */
export function filterWithdrawalsForCompletedPayoutTab(rows: WithdrawalRow[]): WithdrawalRow[] {
  return rows.filter((row) => !isWithdrawalInReview(row));
}

function statusLabel(status: WithdrawalRow['status']) {
  switch (status) {
    case 'APPROVED':
      return 'Paid';
    case 'PENDING':
      return 'Pending Approval';
    case 'IN_REVIEW':
      return 'In review';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function statusBadgeClass(status: WithdrawalRow['status']) {
  switch (status) {
    case 'APPROVED':
      return 'admin-status-badge--green';
    case 'PENDING':
      return 'admin-status-badge--amber';
    case 'REJECTED':
      return 'admin-status-badge--red';
    default:
      return 'admin-status-badge--neutral';
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPeriod(row: WithdrawalRow) {
  return formatStoredPayoutPeriodLabel(row);
}

function NoteCell({
  value,
  tone = 'muted',
}: {
  value: string | null | undefined;
  tone?: 'muted' | 'reject';
}) {
  const text = value?.trim();
  if (!text) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }

  return (
    <span
      className={cn(
        'block max-w-[220px] whitespace-normal text-sm leading-snug',
        tone === 'reject' ? 'text-red-400' : 'text-[var(--color-text-muted)]',
      )}
      title={text}
    >
      {text}
    </span>
  );
}

export const WITHDRAWAL_PAGE_SIZE = 10;

const WITHDRAWAL_SKELETON_WIDTHS = ['w-20', 'w-28', 'w-24', 'w-16', 'w-16', 'w-20', 'w-24', 'w-28', 'w-24', 'w-12'] as const;

function WithdrawalTableBodySkeleton({ colCount, rows = 6 }: { colCount: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b border-[var(--color-navy-border)]/60 last:border-b-0">
          {Array.from({ length: colCount }).map((__, col) => (
            <td
              key={col}
              className={col >= 3 && col <= 4 ? 'px-5 py-3 text-right' : 'px-5 py-3'}
            >
              <Skeleton
                className={`h-3.5 bg-[var(--color-navy-light)]/70 ${WITHDRAWAL_SKELETON_WIDTHS[col] ?? 'w-20'} ${col >= 3 && col <= 4 ? 'ml-auto' : ''}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export type WithdrawalPagination = {
  page: number;
  pages: number;
  total: number;
  limit: number;
};

type Props = {
  rows: WithdrawalRow[];
  loading?: boolean;
  showStore?: boolean;
  showAdvance?: boolean;
  storeNames?: Record<string, string>;
  onCancel?: (id: string) => void;
  cancellingId?: string | null;
  onView?: (row: WithdrawalRow) => void;
  pagination?: WithdrawalPagination | null;
  onPageChange?: (page: number) => void;
  /** Shown in place of the empty-history message when the list request failed. */
  error?: string | null;
  /** Hide title block (e.g. when nested under Payout Summary on branch wallet). */
  hideHeader?: boolean;
};

async function openInvoice(row: WithdrawalRow) {
  try {
    await openWithdrawalInvoice(row.invoiceUrl);
  } catch {
    toast.error('Could not open invoice');
  }
}

function rowHasProof(row: WithdrawalRow): boolean {
  return Boolean(row.hasProof || row.proofUrl);
}

async function openProof(row: WithdrawalRow) {
  try {
    if (row.proofUrl) {
      await openPayoutProof(row.proofUrl);
      return;
    }
    await openPayoutProofById('withdrawal', row.id, { storeId: row.storeId });
  } catch {
    toast.error('Could not open payment proof');
  }
}

export default function WalletWithdrawalTable({
  rows,
  loading,
  showStore,
  showAdvance = true,
  storeNames,
  onCancel,
  cancellingId,
  onView,
  pagination,
  onPageChange,
  error,
  hideHeader = false,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const colCount =
    10 + (showAdvance ? 1 : 0) + (showStore ? 1 : 0) + (onCancel ? 1 : 0);
  const useModalView = !!onView;

  return (
    <div
      className={cn(
        'admin-orders-table overflow-hidden',
        !hideHeader && 'card',
      )}
    >
      {!hideHeader && (
        <div className="flex items-center gap-2 border-b border-[var(--color-navy-border)] px-5 py-4">
          <History size={18} className="text-[var(--color-brand)]" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Withdrawal History</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Fund payouts recorded for this branch
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-navy-border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <th className="px-5 py-3">Date</th>
              {showStore && <th className="px-5 py-3">Branch</th>}
              <th className="px-5 py-3">Period</th>
              <th className="px-5 py-3 text-right">Branch receives</th>
              {showAdvance && <th className="px-5 py-3 text-right">Advance</th>}
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Payment</th>
              <th className="px-5 py-3">Remarks</th>
              <th className="px-5 py-3">Reject reason</th>
              <th className="px-5 py-3">Invoice</th>
              <th className="px-5 py-3">Proof</th>
              <th className="px-5 py-3">Breakdown</th>
              {onCancel && <th className="px-5 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <WithdrawalTableBodySkeleton colCount={colCount} />}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className={cn(
                    'px-5 py-10 text-center',
                    error ? 'text-red-400' : 'text-muted',
                  )}
                >
                  {error || 'No withdrawal records yet'}
                </td>
              </tr>
            )}
            {!loading && rows.map((row) => {
              const breakdown = parseWithdrawalBreakdown(row.breakdown);
              const amounts = withdrawalAmountParts(row);
              const isExpanded = expandedId === row.id;
              return (
              <Fragment key={row.id}>
              <tr
                className="border-b border-[var(--color-navy-border)] last:border-b-0 hover:bg-[var(--color-input-bg)]/40"
              >
                <td className="px-5 py-3 text-[var(--color-text)]">{formatDate(row.createdAt)}</td>
                {showStore && (
                  <td className="px-5 py-3 text-[var(--color-text-muted)]">
                    {row.storeId && storeNames?.[row.storeId]
                      ? storeNames[row.storeId]
                      : row.storeId ?? '—'}
                  </td>
                )}
                <td className="whitespace-nowrap px-5 py-3 text-xs text-[var(--color-text-muted)]">
                  {formatPeriod(row)}
                </td>
                <td className="px-5 py-3 text-right font-medium tabular-nums text-[var(--color-text)]">
                  {formatMoneyAmount(resolveWithdrawalPaymentLkr(row))}
                </td>
                {showAdvance && (
                  <td className="px-5 py-3 text-right tabular-nums">
                    {amounts.advanceLkr > 0.001 ? (
                      <span className="font-medium text-amber-400">
                        {formatMoneyAmount(amounts.advanceLkr)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3">
                  <span
                    className={`admin-status-badge admin-status-badge--md ${statusBadgeClass(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <WithdrawalPaymentCell row={row} />
                </td>
                <td className="px-5 py-3">
                  <NoteCell value={row.remarks} />
                </td>
                <td className="px-5 py-3">
                  <NoteCell
                    value={row.rejectionReason}
                    tone={row.status === 'REJECTED' ? 'reject' : 'muted'}
                  />
                </td>
                <td className="px-5 py-3">
                  {row.status === 'APPROVED' && hasWithdrawalInvoice(row.invoiceUrl) ? (
                    <button
                      type="button"
                      onClick={() => void openInvoice(row)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)] hover:underline"
                    >
                      <FileText size={13} />
                      View invoice
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {row.status === 'APPROVED' && rowHasProof(row) ? (
                    <button
                      type="button"
                      onClick={() => void openProof(row)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)] hover:underline"
                    >
                      <ImageIcon size={13} />
                      View
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {useModalView ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(row);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline"
                    >
                      <Eye size={13} />
                      View
                    </button>
                  ) : breakdown ? (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-brand)] hover:underline"
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                {onCancel && (
                  <td className="px-5 py-3 text-right">
                    {row.status === 'PENDING' ? (
                      <button
                        type="button"
                        onClick={() => onCancel(row.id)}
                        disabled={cancellingId === row.id}
                        className="text-xs font-medium text-[var(--color-brand)] hover:underline disabled:opacity-50"
                      >
                        {cancellingId === row.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                )}
              </tr>
              {!useModalView && isExpanded && breakdown && (
                <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/20">
                  <td colSpan={colCount} className="px-5 py-4">
                    <WithdrawalBreakdownDisplay breakdown={breakdown} variant="table" />
                  </td>
                </tr>
              )}
              </Fragment>
            );
            })}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="sticky bottom-0 z-[1] flex items-center justify-between border-t border-[var(--color-navy-border)] bg-[var(--color-navy-card)] px-5 py-3">
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {pagination.page} of {pagination.pages}
            {pagination.total > 0 ? ` · ${pagination.total} total` : ''}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => onPageChange?.(pagination.page - 1)}
              className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages || loading}
              onClick={() => onPageChange?.(pagination.page + 1)}
              className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
