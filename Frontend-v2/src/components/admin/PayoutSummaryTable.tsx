'use client';

import { useState, type Ref } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '@/lib/datetime';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  hasWithdrawalInvoice,
  resolveWithdrawalPaymentLkr,
} from '@/components/admin/settlementTypes';
import WithdrawalPaymentCell from '@/components/admin/WithdrawalPaymentCell';
import { payoutPeriodRowNeedsLiveNetPreview } from '@/components/admin/payoutPeriodRowAmounts';
import {
  resolveRowBaseDisplayAmounts,
  statusBadgeClass as periodStatusBadgeClass,
  statusLabel as periodStatusLabel,
} from '@/components/admin/payoutPeriodRowModel';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import type { PayoutPeriodRow } from '@/components/admin/payoutPeriodTypes';
import {
  formatAmountCell,
  formatPayoutPeriodCell,
  PayoutPeriodAmountCells,
  PayoutPeriodTableHead,
  PAYOUT_SUMMARY_TABLE_MIN_WIDTH_CLASS,
} from '@/components/admin/payoutPeriodTableUi';
import {
  payoutPeriodDateKey,
  type PayoutSummaryRecord,
} from '@/components/admin/payoutSummaryTableModel';
import {
  openPayoutDraftInvoice,
  openPayoutProof,
  openPayoutProofById,
  openWithdrawalInvoice,
} from '@/lib/adminProtectedFile';
import type { WithdrawalPagination, WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

function withdrawalStatusLabel(status: WithdrawalRow['status']) {
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

function withdrawalStatusBadgeClass(status: WithdrawalRow['status']) {
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

function formatPayoutDate(iso: string) {
  return formatDate(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatWithdrawalPeriod(row: WithdrawalRow) {
  if (!row.periodFrom || !row.periodTo) return '—';
  return formatBiweeklyPeriodLabel(row.periodFrom.slice(0, 10), row.periodTo.slice(0, 10));
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
        'block max-w-[180px] whitespace-normal text-xs leading-snug',
        tone === 'reject' ? 'text-red-400' : 'text-[var(--color-text-muted)]',
      )}
      title={text}
    >
      {text}
    </span>
  );
}

function rowHasProof(row: WithdrawalRow): boolean {
  return Boolean(row.hasProof || row.proofUrl);
}

async function openInvoiceForRecord(record: PayoutSummaryRecord) {
  const period = record.periodRow;
  const withdrawal = record.withdrawal;

  try {
    if (period?.status === 'PAYMENT_PENDING' && period.draftInvoiceUrl) {
      await openPayoutDraftInvoice(period.draftInvoiceUrl);
      return;
    }
    const invoiceUrl = withdrawal?.invoiceUrl ?? period?.withdrawal?.invoiceUrl;
    if (hasWithdrawalInvoice(invoiceUrl)) {
      await openWithdrawalInvoice(invoiceUrl);
      return;
    }
  } catch {
    toast.error('Could not open the payout invoice');
  }
}

async function openProofForRecord(record: PayoutSummaryRecord) {
  const withdrawal = record.withdrawal;
  if (!withdrawal) return;
  try {
    if (withdrawal.proofUrl) {
      await openPayoutProof(withdrawal.proofUrl);
      return;
    }
    await openPayoutProofById('withdrawal', withdrawal.id, { storeId: withdrawal.storeId });
  } catch {
    toast.error('Could not open payment proof');
  }
}

function canOpenInvoice(record: PayoutSummaryRecord): boolean {
  const period = record.periodRow;
  const withdrawal = record.withdrawal;
  if (period?.status === 'PAYMENT_PENDING' && period.draftInvoiceUrl) return true;
  if (period?.status === 'PAID' && hasWithdrawalInvoice(period.withdrawal?.invoiceUrl)) return true;
  return Boolean(withdrawal && withdrawal.status === 'APPROVED' && hasWithdrawalInvoice(withdrawal.invoiceUrl));
}

function canOpenProof(record: PayoutSummaryRecord): boolean {
  const withdrawal = record.withdrawal;
  return Boolean(withdrawal && withdrawal.status === 'APPROVED' && rowHasProof(withdrawal));
}

function recordPeriodDateKey(record: PayoutSummaryRecord) {
  return payoutPeriodDateKey(
    record.periodRow?.periodFrom ?? record.withdrawal?.periodFrom,
    record.periodRow?.periodTo ?? record.withdrawal?.periodTo,
  );
}

function recordDisplayAmounts(
  record: PayoutSummaryRecord,
  displayAmountsByKey: Map<string, PeriodPayoutCardAmounts>,
  previewByKey: Map<string, Record<string, unknown>>,
): PeriodPayoutCardAmounts | null {
  if (record.periodRow) {
    const amounts =
      displayAmountsByKey.get(record.periodRow.key) ??
      resolveRowBaseDisplayAmounts(record.periodRow, previewByKey);
    const withdrawal = record.withdrawal;
    if (withdrawal && withdrawal.status !== 'APPROVED') {
      return { ...amounts, branchReceives: resolveWithdrawalPaymentLkr(withdrawal) };
    }
    return amounts;
  }
  return null;
}

function ActionViewMenu({
  record,
  onBreakdown,
}: {
  record: PayoutSummaryRecord;
  onBreakdown: () => void;
}) {
  const [open, setOpen] = useState(false);
  const invoiceAvailable = canOpenInvoice(record);
  const proofAvailable = canOpenProof(record);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
          'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
        )}
        aria-label="View payout actions"
      >
        View
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-44 gap-0.5 bg-[var(--color-card)] p-1 text-[var(--color-text)] ring-[var(--color-navy-border)]"
      >
        <button
          type="button"
          disabled={!invoiceAvailable}
          onClick={() => {
            setOpen(false);
            void openInvoiceForRecord(record);
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium',
            invoiceAvailable
              ? 'text-[var(--color-text)] hover:bg-[var(--color-input-bg)]'
              : 'cursor-not-allowed text-[var(--color-text-muted)] opacity-50',
          )}
        >
          <FileText size={13} />
          Invoice
        </button>
        <button
          type="button"
          disabled={!proofAvailable}
          onClick={() => {
            setOpen(false);
            void openProofForRecord(record);
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium',
            proofAvailable
              ? 'text-[var(--color-text)] hover:bg-[var(--color-input-bg)]'
              : 'cursor-not-allowed text-[var(--color-text-muted)] opacity-50',
          )}
        >
          <ImageIcon size={13} />
          Proof
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onBreakdown();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-input-bg)]"
        >
          <Eye size={13} />
          Breakdown
        </button>
      </PopoverContent>
    </Popover>
  );
}

type Props = {
  records: PayoutSummaryRecord[];
  allPeriodRows: PayoutPeriodRow[];
  previewByKey: Map<string, Record<string, unknown>>;
  previewLoadingByKey: Map<string, boolean>;
  displayAmountsByKey: Map<string, PeriodPayoutCardAmounts>;
  highlightPeriod?: { periodFrom: string; periodTo: string } | null;
  highlightRowRef?: Ref<HTMLTableRowElement>;
  onViewRecord: (record: PayoutSummaryRecord) => void;
  pagination?: WithdrawalPagination | null;
  onPageChange?: (page: number) => void;
  paginationLoading?: boolean;
};

export default function PayoutSummaryTable({
  records,
  allPeriodRows,
  previewByKey,
  previewLoadingByKey,
  displayAmountsByKey,
  highlightPeriod,
  highlightRowRef,
  onViewRecord,
  pagination,
  onPageChange,
  paginationLoading = false,
}: Props) {
  const highlightPeriodKey = payoutPeriodDateKey(
    highlightPeriod?.periodFrom,
    highlightPeriod?.periodTo,
  );
  const firstHighlightKey =
    highlightPeriodKey == null
      ? null
      : records.find((record) => recordPeriodDateKey(record) === highlightPeriodKey)?.key ?? null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className={`w-full ${PAYOUT_SUMMARY_TABLE_MIN_WIDTH_CLASS} text-left text-xs`}>
          <PayoutPeriodTableHead />
          <tbody>
            {records.map((record) => {
              const periodRow = record.periodRow;
              const withdrawal = record.withdrawal;
              const highlighted =
                highlightPeriodKey != null &&
                recordPeriodDateKey(record) === highlightPeriodKey;
              const amounts = recordDisplayAmounts(record, displayAmountsByKey, previewByKey);
              const previewLoading = periodRow
                ? (previewLoadingByKey.get(periodRow.key) ?? false)
                : false;
              const needsPreview = periodRow
                ? payoutPeriodRowNeedsLiveNetPreview(periodRow.breakdown)
                : false;
              const useWithdrawalStatus =
                withdrawal?.status === 'APPROVED' || withdrawal?.status === 'REJECTED';

              return (
                <tr
                  key={record.key}
                  ref={record.key === firstHighlightKey ? highlightRowRef : undefined}
                  className={cn(
                    'border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40',
                    highlighted &&
                      'bg-[var(--color-brand-subtle)]/40 ring-1 ring-inset ring-[var(--color-brand)]/30',
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--color-text)]">
                    {periodRow
                      ? formatPayoutPeriodCell(periodRow, allPeriodRows, previewByKey)
                      : withdrawal
                        ? formatWithdrawalPeriod(withdrawal)
                        : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[var(--color-text-muted)]">
                    {withdrawal?.createdAt ? formatPayoutDate(withdrawal.createdAt) : '—'}
                  </td>
                  {periodRow && amounts ? (
                    <PayoutPeriodAmountCells
                      row={periodRow}
                      amounts={amounts}
                      previewLoading={previewLoading}
                      needsPreview={needsPreview}
                    />
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]">
                        {withdrawal
                          ? formatAmountCell(resolveWithdrawalPaymentLkr(withdrawal))
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-text-muted)]">—</td>
                      <td className="px-3 py-3 text-right text-[var(--color-text-muted)]">—</td>
                      <td className="px-3 py-3 text-right text-[var(--color-text-muted)]">—</td>
                    </>
                  )}
                  <td className="px-3 py-3">
                    {useWithdrawalStatus && withdrawal ? (
                      <span className={cn('admin-status-badge', withdrawalStatusBadgeClass(withdrawal.status))}>
                        {withdrawalStatusLabel(withdrawal.status)}
                      </span>
                    ) : periodRow ? (
                      <span className={cn('admin-status-badge', periodStatusBadgeClass(periodRow.status))}>
                        {periodStatusLabel(periodRow.status)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {withdrawal ? <WithdrawalPaymentCell row={withdrawal} /> : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <NoteCell value={withdrawal?.remarks} />
                  </td>
                  <td className="px-3 py-3">
                    <NoteCell
                      value={withdrawal?.rejectionReason}
                      tone={withdrawal?.status === 'REJECTED' ? 'reject' : 'muted'}
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ActionViewMenu record={record} onBreakdown={() => onViewRecord(record)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && onPageChange && (
        <div className="sticky bottom-0 z-[1] flex items-center justify-between border-t border-[var(--color-navy-border)] bg-[var(--color-navy-card)] px-4 py-3 sm:px-5">
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {pagination.page} of {pagination.pages}
            {pagination.total > 0 ? ` · ${pagination.total} total` : ''}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1 || paginationLoading}
              onClick={() => onPageChange(pagination.page - 1)}
              className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages || paginationLoading}
              onClick={() => onPageChange(pagination.page + 1)}
              className="rounded-lg border border-[var(--color-navy-border)] p-2 text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
