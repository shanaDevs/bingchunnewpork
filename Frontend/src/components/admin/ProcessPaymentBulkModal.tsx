'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SettlementStatementView from '@/components/admin/SettlementStatementView';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SETTLEMENT_PAYMENT_METHOD_OPTIONS,
  type SettlementPaymentMethodKey,
  type SettlementStatement,
} from '@/components/admin/settlementTypes';
import { formatMoney } from '@/lib/receipt';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatBranchName } from '@/lib/deliveryDisplay';
import {
  fetchReadyToProcessMonthDetail,
  fetchReadyToProcessMonths,
  readyToProcessMonthDetailQueryKey,
  readyToProcessMonthsQueryKey,
  type ReadyToProcessBranchRow,
  type ReadyToProcessMonthRow,
} from '@/lib/readyToProcess';
import { confirmDialog } from '@/store/confirmStore';
import { hasWithdrawalInvoice } from '@/components/admin/settlementTypes';
import { openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import PlatformProviderReceivable from '@/components/admin/PlatformProviderReceivable';
import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';

type BulkResult = {
  storeId: string;
  withdrawalId?: string;
  storeName: string;
  success: boolean;
  statementRef?: string;
  settlementId?: string;
  invoiceUrl?: string;
  error?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  periodFrom: string;
  periodTo: string;
  onCompleted: () => void;
};

function formatWithdrawalPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return 'Period not set';
  return formatBiweeklyPeriodLabel(from, to);
}

type PeriodBounds = { periodFrom: string | null; periodTo: string | null };

/** One period label, or the spanning range when a branch has multiple payouts in the month. */
function formatBranchWithdrawalPeriods(periods: PeriodBounds[]): string {
  const withBounds = periods.filter((p) => p.periodFrom && p.periodTo);
  if (withBounds.length === 0) return 'Period not set';
  if (withBounds.length === 1) {
    return formatWithdrawalPeriod(withBounds[0]!.periodFrom, withBounds[0]!.periodTo);
  }
  const from = withBounds.reduce(
    (min, p) => (p.periodFrom! < min ? p.periodFrom! : min),
    withBounds[0]!.periodFrom!,
  );
  const to = withBounds.reduce(
    (max, p) => (p.periodTo! > max ? p.periodTo! : max),
    withBounds[0]!.periodTo!,
  );
  return formatWithdrawalPeriod(from, to);
}

function branchExpandKey(month: string, storeId: string) {
  return `${month}:${storeId}`;
}

function PeriodReceivablePanel({
  receivableLkr,
  paybackEnabled,
  sharedPromoPlatformLkr,
}: {
  receivableLkr: PlatformProviderReceivableLkr | null | undefined;
  paybackEnabled: boolean;
  sharedPromoPlatformLkr: number;
}) {
  if (!receivableLkr) {
    return (
      <p className="py-3 text-sm text-[var(--color-text-muted)]">
        Platform provider receivable is not available for this period preview.
      </p>
    );
  }

  return (
    <div>
      <PlatformProviderReceivable
        breakdownLkr={receivableLkr}
        paybackEnabled={paybackEnabled}
        sharedPromoPlatformLkr={sharedPromoPlatformLkr}
        className="mb-0"
      />
    </div>
  );
}

type ProcessPaymentRequestTableRowProps = {
  dateRangeText: string;
  branchName: string;
  totalReceivableLkr: number;
  remarks?: string | null;
  isExpanded?: boolean;
  onToggleReceivable?: () => void;
  expandedContent?: ReactNode;
  nested?: boolean;
};

function ProcessPaymentRequestTableRow({
  dateRangeText,
  branchName,
  totalReceivableLkr,
  remarks,
  isExpanded = false,
  onToggleReceivable,
  expandedContent,
  nested = false,
}: ProcessPaymentRequestTableRowProps) {
  const isNegative = totalReceivableLkr < 0;

  return (
    <>
      <tr
        className={`process-payment-modal__request-tr${nested ? ' process-payment-modal__request-tr--nested' : ''}`}
      >
        <td className="process-payment-modal__request-td process-payment-modal__request-td--date">
          <span className="process-payment-modal__request-date">
            <CalendarRange size={13} className="shrink-0" aria-hidden />
            <span>{dateRangeText}</span>
          </span>
        </td>
        <td className="process-payment-modal__request-td process-payment-modal__request-td--branch">
          <span className="process-payment-modal__request-branch">{formatBranchName(branchName)}</span>
          {remarks?.trim() ? (
            <span className="process-payment-modal__request-remarks">{remarks.trim()}</span>
          ) : null}
        </td>
        <td className="process-payment-modal__request-td process-payment-modal__request-td--amount">
          <span
            className={`process-payment-modal__request-total-amount${
              isNegative ? ' process-payment-modal__request-total-amount--negative' : ''
            }`}
          >
            {formatMoney(totalReceivableLkr)}
          </span>
        </td>
        <td className="process-payment-modal__request-td process-payment-modal__request-td--action">
          <div className="process-payment-modal__request-actions">
            {onToggleReceivable && (
              <button
                type="button"
                onClick={onToggleReceivable}
                className="process-payment-modal__request-action-btn"
                aria-expanded={isExpanded}
              >
                {isExpanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                View receivable
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && expandedContent ? (
        <tr className="process-payment-modal__request-tr process-payment-modal__request-tr--expanded">
          <td colSpan={4} className="process-payment-modal__request-td process-payment-modal__request-td--expanded">
            <div className="process-payment-modal__request-expanded">{expandedContent}</div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ProcessPaymentRequestTable({ children }: { children: ReactNode }) {
  return (
    <div className="process-payment-modal__request-table-wrap">
      <table className="process-payment-modal__request-table">
        <thead>
          <tr>
            <th scope="col">Date Range</th>
            <th scope="col">Branch</th>
            <th scope="col">Total Receivable</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function MonthBranchBreakdown({
  month,
  branches,
  expandedBranch,
  setExpandedBranch,
}: {
  month: string;
  branches: ReadyToProcessBranchRow[];
  expandedBranch: Record<string, boolean>;
  setExpandedBranch: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div className="process-payment-modal__month-detail border-t border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/20 px-2 py-3">
      <ProcessPaymentRequestTable>
        {branches.map((branch) => {
          const expandKey = branchExpandKey(month, branch.storeId);
          const isExpanded = !!expandedBranch[expandKey];
          const periodLabel = formatBranchWithdrawalPeriods(branch.periods);

          return (
            <ProcessPaymentRequestTableRow
              key={branch.storeId}
              nested
              dateRangeText={periodLabel}
              branchName={branch.storeName}
              totalReceivableLkr={branch.totalReceivable}
              isExpanded={isExpanded}
              onToggleReceivable={() =>
                setExpandedBranch((prev) => ({
                  ...prev,
                  [expandKey]: !prev[expandKey],
                }))
              }
              expandedContent={
                <PeriodReceivablePanel
                  receivableLkr={branch.platformProviderReceivable.lkr}
                  paybackEnabled={branch.platformDiscountPaybackEnabled}
                  sharedPromoPlatformLkr={branch.sharedPromoPlatformLkr}
                />
              }
            />
          );
        })}
      </ProcessPaymentRequestTable>
    </div>
  );
}

function ProcessPaymentModalBodySkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="process-payment-modal__summary-grid mb-5">
        {[0, 1].map((i) => (
          <div key={i} className="process-payment-modal__summary-card">
            <Skeleton className="size-10 shrink-0 rounded-xl bg-[var(--color-navy-light)]/50" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24 bg-[var(--color-navy-light)]/50" />
              <Skeleton className="h-7 w-32 bg-[var(--color-navy-light)]/50" />
            </div>
          </div>
        ))}
      </div>
      <div className="process-payment-modal__request-table-wrap">
        <div className="space-y-0 p-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="grid grid-cols-4 gap-3 border-b border-[var(--color-navy-border)] py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-36 bg-[var(--color-navy-light)]/40" />
              <Skeleton className="h-4 w-24 bg-[var(--color-navy-light)]/50" />
              <Skeleton className="ml-auto h-4 w-24 bg-[var(--color-navy-light)]/50" />
              <Skeleton className="ml-auto h-8 w-24 rounded-lg bg-[var(--color-navy-light)]/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProcessPaymentBulkModal({
  open,
  onClose,
  onCompleted,
}: Props) {
  const apiBase = getApiBaseUrl();
  const queryClient = useQueryClient();
  const onCloseRef = useRef(onClose);

  const [portalReady, setPortalReady] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedBranch, setExpandedBranch] = useState<Record<string, boolean>>({});
  const [paymentMethod, setPaymentMethod] = useState<SettlementPaymentMethodKey | ''>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [statement, setStatement] = useState<SettlementStatement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, submitting]);

  const {
    data: months = [],
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch: refetchMonths,
  } = useQuery({
    queryKey: readyToProcessMonthsQueryKey(),
    queryFn: fetchReadyToProcessMonths,
    enabled: open,
    staleTime: 60_000,
  });

  const {
    data: monthDetail,
    isFetching: monthDetailFetching,
    isError: monthDetailError,
    error: monthDetailQueryError,
  } = useQuery({
    queryKey: readyToProcessMonthDetailQueryKey(expandedMonth ?? ''),
    queryFn: () => fetchReadyToProcessMonthDetail(expandedMonth!),
    enabled: open && !!expandedMonth,
    staleTime: 60_000,
  });

  const loading = open && (isPending || (isFetching && months.length === 0));
  const loadError = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load months'
    : '';

  useEffect(() => {
    if (!open) {
      setExpandedMonth(null);
      setExpandedBranch({});
      setPaymentMethod('');
      setReceiptFile(null);
      setSubmitting(false);
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    if (!monthDetail || monthDetail.month !== expandedMonth) return;
    setExpandedBranch({});
  }, [expandedMonth, monthDetail]);

  const listTotalReceivable = useMemo(
    () => months.reduce((sum, m) => sum + m.totalReceivable, 0),
    [months],
  );

  /** All completed branch payout periods for the expanded month (included in one bulk submit). */
  const monthPayoutItems = useMemo(() => {
    if (!monthDetail) return [];
    const items: Array<{ storeId: string; withdrawalId: string }> = [];
    for (const branch of monthDetail.branches) {
      for (const p of branch.periods) {
        items.push({ storeId: branch.storeId, withdrawalId: p.withdrawalId });
      }
    }
    return items;
  }, [monthDetail]);

  const monthTotalReceivable = monthDetail?.totalReceivable ?? 0;

  const expandedMonthLabel = useMemo(() => {
    if (!expandedMonth) return '';
    return months.find((m) => m.month === expandedMonth)?.label ?? expandedMonth;
  }, [expandedMonth, months]);

  const openStatement = async (settlementId: string) => {
    try {
      const res = await fetch(`${apiBase}/admin/payment-history/settlements/${settlementId}`, {
        headers: adminAuthHeaders(),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load statement');
      setStatement(json.data as SettlementStatement);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load statement');
    }
  };

  const handleSubmit = async () => {
    if (!expandedMonth || !monthDetail) {
      toast.error('Expand a month to process payments');
      return;
    }
    if (!paymentMethod) {
      toast.error('Select a payment method');
      return;
    }
    if (!receiptFile) {
      toast.error('Payment receipt proof is required');
      return;
    }
    if (monthPayoutItems.length === 0) {
      toast.error('No payout periods ready for this month');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Process monthly payment?',
      message: `Submit platform provider payment for all ${monthDetail.branches.length} branch${monthDetail.branches.length !== 1 ? 'es' : ''} in ${expandedMonthLabel} (${formatMoney(monthTotalReceivable)} total)?`,
      confirmLabel: 'Yes, process',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setSubmitting(true);
    setResults(null);

    try {
      const form = new FormData();
      form.append('paymentMethod', paymentMethod);
      form.append('items', JSON.stringify(monthPayoutItems));
      form.append('receipt', receiptFile);

      const res = await fetch(`${apiBase}/admin/payment-history/settlement/bulk`, {
        method: 'POST',
        headers: adminAuthHeaders(),
        credentials: 'include',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Processing failed');

      const bulkResults = (json.data?.results ?? []) as BulkResult[];
      setResults(bulkResults);

      const successCount = bulkResults.filter((r) => r.success).length;
      const failCount = bulkResults.length - successCount;
      if (failCount === 0) {
        toast.success(`Processed ${successCount} settlement(s)`);
        onCompleted();
        await queryClient.invalidateQueries({ queryKey: readyToProcessMonthsQueryKey() });
        if (expandedMonth) {
          await queryClient.invalidateQueries({
            queryKey: readyToProcessMonthDetailQueryKey(expandedMonth),
          });
        }
        await refetchMonths();
      } else {
        toast.error(`${successCount} succeeded, ${failCount} failed`);
        onCompleted();
        await queryClient.invalidateQueries({ queryKey: readyToProcessMonthsQueryKey() });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMonth = useCallback((row: ReadyToProcessMonthRow) => {
    setExpandedMonth((prev) => (prev === row.month ? null : row.month));
    setResults(null);
  }, []);

  if (!portalReady) return null;

  const canSubmit =
    !!expandedMonth &&
    !!monthDetail &&
    monthPayoutItems.length > 0 &&
    !!paymentMethod &&
    !!receiptFile &&
    !submitting;

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1200] bg-black/55 backdrop-blur-sm"
              onClick={() => !submitting && onClose()}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal
              aria-label="Process payment"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1201] flex items-center justify-center p-4 sm:p-6"
              onClick={() => !submitting && onClose()}
            >
              <div
                className="card flex max-h-[min(95vh,960px)] w-full max-w-6xl flex-col overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-[var(--color-navy-border)] px-6 py-5">
                  <div>
                    <h2 className="text-xl font-semibold text-[var(--color-text)]">Process Payment</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      Review platform provider receivable amounts and process approved commission
                      payments.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text)] disabled:opacity-50"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {loadError && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      {loadError}
                    </div>
                  )}

                  {loading && <ProcessPaymentModalBodySkeleton />}

                  {!loading && !loadError && (
                    <div className="process-payment-modal__summary-grid mb-5">
                      <div className="process-payment-modal__summary-card process-payment-modal__summary-card--green">
                        <div className="process-payment-modal__summary-icon" aria-hidden>
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Ready to Process
                          </p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text)]">
                            {formatMoney(listTotalReceivable)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {months.length} month{months.length !== 1 ? 's' : ''} with completed branch
                            payouts
                          </p>
                        </div>
                      </div>
                      {expandedMonth && monthDetail && (
                        <div className="process-payment-modal__summary-card process-payment-modal__summary-card--amber">
                          <div className="process-payment-modal__summary-icon" aria-hidden>
                            <ClipboardList size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              {expandedMonthLabel}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text)]">
                              {formatMoney(monthTotalReceivable)}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              All branches included in this payment
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!loading && (
                    <div className="process-payment-modal__section-head">
                      <h3 className="process-payment-modal__section-title">Ready to process</h3>
                      <p className="process-payment-modal__section-subtitle">
                        Monthly totals from branches with completed payout periods. Expand a month to
                        review branch breakdowns and process the full month in one payment.
                      </p>
                    </div>
                  )}

                  {!loading && months.length === 0 && !loadError && (
                    <div className="rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-6 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Nothing ready to process
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        Months appear here after branch payout periods are approved and platform
                        commission is still outstanding.
                      </p>
                    </div>
                  )}

                  {!loading && months.length > 0 && (
                    <ProcessPaymentRequestTable>
                      {months.map((row) => {
                        const isExpanded = expandedMonth === row.month;
                        return (
                          <ProcessPaymentRequestTableRow
                            key={row.month}
                              dateRangeText={row.label}
                              branchName={`${row.branchCount} branch${row.branchCount !== 1 ? 'es' : ''}`}
                              totalReceivableLkr={row.totalReceivable}
                              isExpanded={isExpanded}
                              onToggleReceivable={() => toggleMonth(row)}
                              expandedContent={
                                monthDetailFetching && isExpanded ? (
                                  <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
                                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                                    Loading branch breakdown…
                                  </div>
                                ) : monthDetailError && isExpanded ? (
                                  <p className="py-3 text-sm text-red-400">
                                    {monthDetailQueryError instanceof Error
                                      ? monthDetailQueryError.message
                                      : 'Failed to load breakdown'}
                                  </p>
                                ) : monthDetail && isExpanded ? (
                                  <MonthBranchBreakdown
                                    month={row.month}
                                    branches={monthDetail.branches}
                                    expandedBranch={expandedBranch}
                                    setExpandedBranch={setExpandedBranch}
                                  />
                                ) : null
                              }
                            />
                        );
                      })}
                    </ProcessPaymentRequestTable>
                  )}

                  {results && results.length > 0 && (
                    <div className="mt-5 overflow-hidden rounded-xl border border-[var(--color-navy-border)]">
                      <div className="border-b border-[var(--color-navy-border)] px-4 py-3">
                        <h3 className="text-sm font-semibold text-[var(--color-text)]">Results</h3>
                      </div>
                      <div className="divide-y divide-[var(--color-navy-border)]">
                        {results.map((result, index) => (
                          <div
                            key={
                              result.withdrawalId ??
                              result.settlementId ??
                              `${result.storeId}-${result.statementRef ?? result.error}-${index}`
                            }
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                          >
                            <div>
                              <p className="font-medium">{formatBranchName(result.storeName)}</p>
                              {result.success ? (
                                <p className="text-xs text-emerald-400">{result.statementRef}</p>
                              ) : (
                                <p className="text-xs text-red-400">{result.error}</p>
                              )}
                            </div>
                            {result.success && (
                              <div className="flex flex-wrap gap-3">
                                {hasWithdrawalInvoice(result.invoiceUrl) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void openWithdrawalInvoice(result.invoiceUrl).catch(() => {
                                        toast.error('Could not open invoice');
                                      });
                                    }}
                                    className="text-xs font-semibold text-[var(--color-brand)] hover:underline"
                                  >
                                    View invoice
                                  </button>
                                )}
                                {result.settlementId && (
                                  <button
                                    type="button"
                                    onClick={() => openStatement(result.settlementId!)}
                                    className="text-xs font-semibold text-[var(--color-brand)] hover:underline"
                                  >
                                    View statement
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--color-navy-border)] px-6 py-5">
                  <div className="process-payment-modal__footer">
                    {!expandedMonth ? (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Expand a month above to enter payment details and process settlements.
                      </p>
                    ) : (
                      <div className="process-payment-modal__footer-controls">
                        <div className="min-w-[140px] flex-1">
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                            Payment method
                          </label>
                          <select
                            value={paymentMethod}
                            onChange={(e) =>
                              setPaymentMethod(e.target.value as SettlementPaymentMethodKey)
                            }
                            disabled={submitting}
                            className="input-field w-full text-sm"
                          >
                            <option value="">Select…</option>
                            {SETTLEMENT_PAYMENT_METHOD_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-[180px] flex-1">
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                            Receipt proof <span className="text-red-500">*</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--color-navy-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                            <Upload size={14} className="shrink-0 text-[var(--color-brand)]" />
                            <span className="truncate">
                              {receiptFile ? receiptFile.name : 'Upload image or PDF (required)'}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              className="sr-only"
                              disabled={submitting}
                              required
                              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="process-payment-modal__footer-actions">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="payment-history-header__btn payment-history-header__btn--ghost"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={handleSubmit}
                        className="payment-history-header__btn payment-history-header__btn--primary inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            Processing…
                          </>
                        ) : (
                          'Process monthly payment'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettlementStatementView statement={statement} onClose={() => setStatement(null)} />
    </>,
    document.body,
  );
}
