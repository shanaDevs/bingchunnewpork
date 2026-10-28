'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import Link from 'next/link';
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
  Lock,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PlatformProviderReceivable from '@/components/admin/PlatformProviderReceivable';
import type { PlatformProviderReceivableLkr } from '@bingchun/settlement';
import SettlementStatementView from '@/components/admin/SettlementStatementView';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SETTLEMENT_PAYMENT_METHOD_OPTIONS,
  parseWithdrawalBreakdown,
  withdrawalBreakdownToLkr,
  type SettlementPaymentMethodKey,
  type SettlementStatement,
} from '@/components/admin/settlementTypes';
import { formatMoney } from '@/lib/receipt';
import {
  formatBiweeklyPeriodLabel,
  generateMonthlyPeriods,
  parsePeriodValue,
  periodValueKey,
} from '@/lib/biweeklyPeriods';
import { formatBranchName } from '@/lib/deliveryDisplay';
import {
  fetchPaymentHistoryPendingAll,
  paymentHistoryPendingAllQueryKey,
  type PendingAllBranchRow as PendingBranchRow,
  type PendingAllUnsettledWithdrawal as UnsettledWithdrawalItem,
} from '@/lib/paymentHistoryPendingAll';
import { confirmDialog } from '@/store/confirmStore';
import { hasWithdrawalInvoice } from '@/components/admin/settlementTypes';
import { openWithdrawalInvoice } from '@/lib/adminProtectedFile';

type PayoutRequestRow = {
  withdrawal: UnsettledWithdrawalItem;
  storeId: string;
  storeName: string;
  hasOverlap: boolean;
  dartCodesReceives: number;
  netCommissionReceivable: number;
  netConvenienceFeeReceivable: number;
  netRefundConvenienceFeeReceivable: number;
  orderCount: number;
  selectable: boolean;
};

type BulkResult = {
  storeId: string;
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
  /** Initial range when the modal opens (from payment history page). */
  periodFrom: string;
  periodTo: string;
  onCompleted: () => void;
};

type PayoutTab = 'ready' | 'pending' | 'payout-required';

function formatPeriodLabel(from: string, to: string) {
  return formatBiweeklyPeriodLabel(from, to);
}

function formatWithdrawalPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return 'Period not set';
  return formatBiweeklyPeriodLabel(from, to);
}

function branchPaymentHistoryHref(storeId: string, from: string, to: string) {
  const qs = new URLSearchParams({ storeId, from, to });
  return `/admin/payment-history?${qs.toString()}`;
}

function extractPlatformProviderReceivableLkr(
  withdrawal: UnsettledWithdrawalItem,
): PlatformProviderReceivableLkr | null {
  if (withdrawal.platformProviderReceivable?.lkr) {
    return withdrawal.platformProviderReceivable.lkr;
  }
  const raw = withdrawal.breakdown as {
    platformProviderReceivable?: { lkr?: PlatformProviderReceivableLkr };
  } | null;
  return raw?.platformProviderReceivable?.lkr ?? null;
}

function computeRequestAmounts(withdrawal: UnsettledWithdrawalItem): {
  dartCodesReceives: number;
  netCommissionReceivable: number;
  netConvenienceFeeReceivable: number;
  netRefundConvenienceFeeReceivable: number;
  orderCount: number;
} {
  const receivableLkr = extractPlatformProviderReceivableLkr(withdrawal);
  if (receivableLkr) {
    const breakdown = parseWithdrawalBreakdown(withdrawal.breakdown);
    return {
      dartCodesReceives:
        withdrawal.dartCodesReceives ?? receivableLkr.totalPlatformProviderReceivableLkr,
      netCommissionReceivable: receivableLkr.netPlatformCommissionLkr,
      netConvenienceFeeReceivable: receivableLkr.normalConvenienceFeeLkr,
      netRefundConvenienceFeeReceivable:
        receivableLkr.completedRefundConvenienceFeeLkr +
        receivableLkr.rejectedRefundConvenienceFeeLkr,
      orderCount: breakdown ? withdrawalBreakdownToLkr(breakdown).orderCount : 0,
    };
  }

  const breakdown = parseWithdrawalBreakdown(withdrawal.breakdown);
  if (!breakdown) {
    return {
      dartCodesReceives: withdrawal.dartCodesReceives ?? withdrawal.amountLkr,
      netCommissionReceivable: withdrawal.amountLkr,
      netConvenienceFeeReceivable: 0,
      netRefundConvenienceFeeReceivable: 0,
      orderCount: 0,
    };
  }

  const lkr = withdrawalBreakdownToLkr(breakdown);
  return {
    dartCodesReceives: withdrawal.dartCodesReceives ?? withdrawal.amountLkr,
    netCommissionReceivable: lkr.commissionFee,
    netConvenienceFeeReceivable: lkr.convenienceFee ?? 0,
    netRefundConvenienceFeeReceivable: (lkr.refundConvenienceFee ?? 0) + (lkr.rejectedRefundConvenienceFee ?? 0),
    orderCount: lkr.orderCount,
  };
}

function buildPayoutRequestRows(rows: PendingBranchRow[]): PayoutRequestRow[] {
  const result: PayoutRequestRow[] = [];

  for (const row of rows) {
    if (row.hasOverlap) continue;

    for (const withdrawal of row.unsettledWithdrawals) {
      const amounts = computeRequestAmounts(withdrawal);
      result.push({
        withdrawal,
        storeId: row.storeId,
        storeName: row.storeName,
        hasOverlap: row.hasOverlap,
        dartCodesReceives: amounts.dartCodesReceives,
        netCommissionReceivable: amounts.netCommissionReceivable,
        netConvenienceFeeReceivable: amounts.netConvenienceFeeReceivable,
        netRefundConvenienceFeeReceivable: amounts.netRefundConvenienceFeeReceivable,
        orderCount: amounts.orderCount,
        selectable: withdrawal.status === 'APPROVED',
      });
    }
  }

  return result;
}

function WithdrawalBreakdownPanel({ withdrawal }: { withdrawal: UnsettledWithdrawalItem }) {
  const breakdown = parseWithdrawalBreakdown(withdrawal.breakdown);
  const receivableLkr = extractPlatformProviderReceivableLkr(withdrawal);

  if (!breakdown && !receivableLkr) {
    return (
      <p className="py-3 text-sm text-[var(--color-text-muted)]">
        No payout breakdown snapshot was stored for this request.
      </p>
    );
  }

  if (receivableLkr) {
    return (
      <div>
        <PlatformProviderReceivable breakdownLkr={receivableLkr} className="mb-0" />
      </div>
    );
  }

  return (
    <p className="py-3 text-sm text-[var(--color-text-muted)]">
      Platform provider receivable is not available for this legacy payout snapshot.
    </p>
  );
}

type ProcessPaymentRequestTableRowProps = {
  dateRangeText: string;
  branchName: string;
  totalReceivableLkr: number;
  remarks?: string | null;
  storeId: string;
  rangeFrom: string;
  rangeTo: string;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleReceivable?: () => void;
  showReceivableToggle?: boolean;
  selection?: {
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
    ariaLabel: string;
  };
  expandedContent?: ReactNode;
};

function ProcessPaymentRequestTableRow({
  dateRangeText,
  branchName,
  totalReceivableLkr,
  remarks,
  storeId,
  rangeFrom,
  rangeTo,
  onClose,
  isExpanded = false,
  onToggleReceivable,
  showReceivableToggle = false,
  selection,
  expandedContent,
}: ProcessPaymentRequestTableRowProps) {
  const isNegative = totalReceivableLkr < 0;

  return (
    <>
      <tr className="process-payment-modal__request-tr">
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
            {selection && (
              <input
                type="checkbox"
                checked={selection.checked}
                disabled={selection.disabled}
                onChange={selection.onChange}
                className="process-payment-modal__request-checkbox"
                aria-label={selection.ariaLabel}
              />
            )}
            <Link
              href={branchPaymentHistoryHref(storeId, rangeFrom, rangeTo)}
              onClick={onClose}
              className="process-payment-modal__request-action-btn"
            >
              View branch
            </Link>
            {showReceivableToggle && onToggleReceivable && (
              <button
                type="button"
                onClick={onToggleReceivable}
                className="process-payment-modal__request-action-btn"
              >
                {isExpanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                Receivable
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

function ProcessPaymentModalBodySkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="process-payment-modal__summary-grid mb-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="process-payment-modal__summary-card">
            <Skeleton className="size-10 shrink-0 rounded-xl bg-[var(--color-navy-light)]/50" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24 bg-[var(--color-navy-light)]/50" />
              <Skeleton className="h-7 w-32 bg-[var(--color-navy-light)]/50" />
              <Skeleton className="h-3 w-40 bg-[var(--color-navy-light)]/40" />
            </div>
          </div>
        ))}
      </div>

      <div className="process-payment-modal__section-head">
        <Skeleton className="h-4 w-36 bg-[var(--color-navy-light)]/50" />
        <Skeleton className="mt-2 h-3 w-64 max-w-full bg-[var(--color-navy-light)]/40" />
      </div>

      <div className="process-payment-modal__tabs mb-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="process-payment-modal__tab pointer-events-none">
            <Skeleton className="h-4 w-28 bg-[var(--color-navy-light)]/50" />
            <Skeleton className="ml-2 h-5 w-6 rounded-full bg-[var(--color-navy-light)]/40" />
          </div>
        ))}
      </div>

      <div className="process-payment-modal__request-table-wrap">
        <div className="space-y-0 p-3">
          {[0, 1, 2, 3].map((i) => (
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
  periodFrom,
  periodTo,
  onCompleted,
}: Props) {
  const apiBase = getApiBaseUrl();
  const queryClient = useQueryClient();
    const onCloseRef = useRef(onClose);

  const [portalReady, setPortalReady] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(periodFrom);
  const [rangeTo, setRangeTo] = useState(periodTo);
  const [defaultRange, setDefaultRange] = useState({ from: periodFrom, to: periodTo });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [paymentMethod, setPaymentMethod] = useState<SettlementPaymentMethodKey | ''>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [statement, setStatement] = useState<SettlementStatement | null>(null);
  const [activeTab, setActiveTab] = useState<PayoutTab>('ready');

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

  const rangeValid = !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;

  const {
    data: pendingAllData,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: paymentHistoryPendingAllQueryKey(rangeFrom, rangeTo),
    queryFn: () => fetchPaymentHistoryPendingAll(rangeFrom, rangeTo),
    enabled: open && rangeValid,
    staleTime: 60_000,
  });

  const rows = pendingAllData?.items ?? [];
  const totalWalletRemaining = pendingAllData?.totalWalletRemaining ?? 0;
  const loading =
    open && rangeValid && (isPending || (isFetching && !pendingAllData));
  const loadError = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load branches'
    : '';

  const periodLabel = useMemo(
    () => formatPeriodLabel(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );

  const periodOptions = useMemo(() => generateMonthlyPeriods(), []);

  const rangeIsDefault =
    rangeFrom === defaultRange.from && rangeTo === defaultRange.to;

  const clearRange = useCallback(() => {
    setRangeFrom(defaultRange.from);
    setRangeTo(defaultRange.to);
  }, [defaultRange.from, defaultRange.to]);

  useEffect(() => {
    if (!open) {
      setExpanded({});
      setSelected({});
      setPaymentMethod('');
      setReceiptFile(null);
      setSubmitting(false);
      setResults(null);
      return;
    }
    const nextDefault = { from: periodFrom, to: periodTo };
    setDefaultRange(nextDefault);
    setRangeFrom(periodFrom);
    setRangeTo(periodTo);
    setResults(null);
    setExpanded({});
  }, [open, periodFrom, periodTo]);

  useEffect(() => {
    if (!open || loading || !pendingAllData) return;
    // Show all unsettled PENDING/APPROVED requests (not period-scoped), so Ready/Pending
    // are not emptied when withdrawal windows differ from the commission period.
    const requestRows = buildPayoutRequestRows(
      pendingAllData.items.filter((row) => !row.hasOverlap),
    );
    const initialSelected: Record<string, boolean> = {};
    for (const row of requestRows) {
      if (row.selectable) initialSelected[row.withdrawal.id] = true;
    }
    setSelected(initialSelected);
  }, [open, loading, pendingAllData, rangeFrom, rangeTo, dataUpdatedAt]);

  const payoutRequestRows = useMemo(
    () => buildPayoutRequestRows(rows),
    [rows],
  );

  const branchesAwaitingPayout = useMemo(
    () =>
      rows.filter((row) => {
        if (row.hasOverlap) return false;
        // Exclude stores that already have any unsettled PENDING/APPROVED request.
        const unsettledRequests = row.unsettledWithdrawals.filter(
          (w) => w.status === 'PENDING' || w.status === 'APPROVED',
        );
        return unsettledRequests.length === 0;
      }),
    [rows],
  );

  const selectableRows = useMemo(
    () => payoutRequestRows.filter((row) => row.selectable),
    [payoutRequestRows],
  );
  const pendingApprovalRows = useMemo(
    () =>
      payoutRequestRows.filter(
        (row) => !row.selectable && row.withdrawal.status === 'PENDING',
      ),
    [payoutRequestRows],
  );

  const readyToProcessTotal = useMemo(
    () => selectableRows.reduce((sum, row) => sum + row.dartCodesReceives, 0),
    [selectableRows],
  );

  const hiddenSettledCount = useMemo(
    () => rows.filter((row) => row.hasOverlap).length,
    [rows],
  );

  const selectedItems = useMemo(
    () =>
      selectableRows
        .filter((row) => selected[row.withdrawal.id])
        .map((row) => ({
          storeId: row.storeId,
          withdrawalId: row.withdrawal.id,
        })),
    [selectableRows, selected],
  );

  const totalPendingAll = useMemo(
    () => rows.reduce((sum, row) => sum + row.pendingDues, 0),
    [rows],
  );

  useEffect(() => {
    if (!open || loading) return;
    if (selectableRows.length > 0) setActiveTab('ready');
    else if (pendingApprovalRows.length > 0) setActiveTab('pending');
    else if (branchesAwaitingPayout.length > 0) setActiveTab('payout-required');
    else setActiveTab('ready');
  }, [
    open,
    loading,
    rangeFrom,
    rangeTo,
    selectableRows.length,
    pendingApprovalRows.length,
    branchesAwaitingPayout.length,
  ]);

  const selectedPeriodTotal = useMemo(
    () =>
      selectableRows
        .filter((row) => selected[row.withdrawal.id])
        .reduce((sum, row) => sum + row.dartCodesReceives, 0),
    [selectableRows, selected],
  );

  const remainingAfterProcessing = Math.max(0, totalPendingAll - selectedPeriodTotal);

  const openStatement = async (settlementId: string) => {
    try {
      const res = await fetch(`${apiBase}/admin/payment-history/settlements/${settlementId}`, {
        headers: adminAuthHeaders(), credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load statement');
      setStatement(json.data as SettlementStatement);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load statement');
    }
  };

  const handleSubmit = async () => {
    if (!paymentMethod) {
      toast.error('Select a payment method');
      return;
    }
    if (!receiptFile) {
      toast.error('Payment receipt proof is required');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Select at least one approved payout request');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Process payments?',
      message: `Settle commission for ${selectedItems.length} payout request(s) for ${periodLabel}?`,
      confirmLabel: 'Yes, process',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setSubmitting(true);
    setResults(null);

    try {
      const form = new FormData();
      form.append('from', rangeFrom);
      form.append('to', rangeTo);
      form.append('paymentMethod', paymentMethod);
      form.append('items', JSON.stringify(selectedItems));
      form.append('receipt', receiptFile);

      const res = await fetch(`${apiBase}/admin/payment-history/settlement/bulk`, {
        method: 'POST',
        headers: adminAuthHeaders(), credentials: 'include',
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
        await queryClient.invalidateQueries({
          queryKey: ['payment-history-pending-all'],
        });
        await refetch();
      } else {
        toast.error(`${successCount} succeeded, ${failCount} failed`);
        onCompleted();
        await queryClient.invalidateQueries({
          queryKey: ['payment-history-pending-all'],
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!portalReady) return null;

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
                  <div className="process-payment-modal__period-bar mb-5">
                    <div className="process-payment-modal__period-label">
                      <div className="process-payment-modal__period-icon" aria-hidden>
                        <CalendarRange size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                          Commission period
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
                          {periodLabel}
                        </p>
                      </div>
                    </div>
                    <div className="process-payment-modal__period-controls">
                      <select
                        id="process-payment-period"
                        aria-label="Billing period"
                        value={rangeFrom && rangeTo ? periodValueKey(rangeFrom, rangeTo) : ''}
                        disabled={submitting}
                        onChange={(e) => {
                          const parsed = parsePeriodValue(e.target.value);
                          if (!parsed) return;
                          setRangeFrom(parsed.from);
                          setRangeTo(parsed.to);
                        }}
                        className="process-payment-modal__period-select input-field !w-[14rem] !min-w-[14rem] shrink-0 px-3 py-2 text-sm"
                      >
                        <option value="">Select period…</option>
                        {periodOptions.map((period) => (
                          <option
                            key={period.from}
                            value={periodValueKey(period.from, period.to)}
                          >
                            {period.label}
                          </option>
                        ))}
                      </select>
                      {loading && (
                        <Skeleton className="size-4 shrink-0 rounded-full bg-[var(--color-navy-light)]/50" />
                      )}
                      <button
                        type="button"
                        onClick={clearRange}
                        disabled={submitting || loading || rangeIsDefault}
                        className="process-payment-modal__period-clear payment-history-header__btn payment-history-header__btn--ghost shrink-0 whitespace-nowrap disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {loadError && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      {loadError}
                    </div>
                  )}

                  {loading && <ProcessPaymentModalBodySkeleton />}

                  {!loading && !loadError && (
                    <div className="process-payment-modal__summary-grid mb-5">
                      <div className="process-payment-modal__summary-card process-payment-modal__summary-card--amber">
                        <div className="process-payment-modal__summary-icon" aria-hidden>
                          <ClipboardList size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Total Outstanding
                          </p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text)]">
                            {formatMoney(selectedPeriodTotal > 0 ? remainingAfterProcessing : totalPendingAll)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {selectedPeriodTotal > 0
                              ? 'Outstanding after settling selected branches'
                              : 'Across all branches'}
                            {selectedPeriodTotal > 0 && (
                              <span className="mt-0.5 block text-emerald-400/80">
                                − {formatMoney(selectedPeriodTotal)} from selection
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="process-payment-modal__summary-card process-payment-modal__summary-card--green">
                        <div className="process-payment-modal__summary-icon" aria-hidden>
                          <CheckCircle2 size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Ready to Process
                          </p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text)]">
                            {formatMoney(readyToProcessTotal)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {selectableRows.length} approved request
                            {selectableRows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="process-payment-modal__summary-card process-payment-modal__summary-card--blue">
                        <div className="process-payment-modal__summary-icon" aria-hidden>
                          <Wallet size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Wallet Available
                          </p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text)]">
                            {formatMoney(totalWalletRemaining)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            Available after payouts
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!loading && hiddenSettledCount > 0 && (
                    <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                      {hiddenSettledCount} branch(es) already settled for this period — hidden.
                    </p>
                  )}

                  {!loading && (
                    <div className="process-payment-modal__section-head">
                      <h3 className="process-payment-modal__section-title">Payout requests</h3>
                      <p className="process-payment-modal__section-subtitle">
                        Requests are grouped by their next required action.
                      </p>
                    </div>
                  )}

                  {!loading && (
                    <div className="process-payment-modal__tabs mb-4" role="tablist" aria-label="Payout request groups">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'ready'}
                        className={`process-payment-modal__tab${activeTab === 'ready' ? ' process-payment-modal__tab--active' : ''}`}
                        onClick={() => setActiveTab('ready')}
                      >
                        Ready to process
                        <span className="process-payment-modal__tab-badge">{selectableRows.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'pending'}
                        className={`process-payment-modal__tab${activeTab === 'pending' ? ' process-payment-modal__tab--active' : ''}`}
                        onClick={() => setActiveTab('pending')}
                      >
                        Pending approval
                        <span className="process-payment-modal__tab-badge">{pendingApprovalRows.length}</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'payout-required'}
                        className={`process-payment-modal__tab${activeTab === 'payout-required' ? ' process-payment-modal__tab--active' : ''}`}
                        onClick={() => setActiveTab('payout-required')}
                      >
                        Payout required first
                        <span className="process-payment-modal__tab-badge">{branchesAwaitingPayout.length}</span>
                      </button>
                    </div>
                  )}

                  {!loading && activeTab === 'ready' && selectableRows.length > 0 && (
                    <div className="mb-4 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const next: Record<string, boolean> = {};
                          for (const row of selectableRows) next[row.withdrawal.id] = true;
                          setSelected(next);
                        }}
                        disabled={selectableRows.length === 0}
                        className="font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-40"
                      >
                        Select all approved
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected({})}
                        className="font-semibold text-[var(--color-text-muted)] hover:underline"
                      >
                        Deselect all
                      </button>
                    </div>
                  )}

                  {!loading &&
                    activeTab === 'ready' &&
                    selectableRows.length === 0 &&
                    !loadError && (
                    <div className="rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-6 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        No approved payout requests
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        Approved requests for {periodLabel} will appear here when branches are ready
                        to settle.
                        {hiddenSettledCount > 0
                          ? ` ${hiddenSettledCount} branch(es) already settled for this period.`
                          : ''}
                      </p>
                    </div>
                  )}

                  {!loading &&
                    activeTab === 'pending' &&
                    pendingApprovalRows.length === 0 &&
                    !loadError && (
                    <div className="rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-6 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        No pending payout requests
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        Branch payout requests awaiting approval will appear here.
                      </p>
                    </div>
                  )}

                  {!loading &&
                    activeTab === 'payout-required' &&
                    branchesAwaitingPayout.length === 0 &&
                    !loadError && (
                    <div className="rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/30 px-6 py-12 text-center">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        No branches awaiting payout submission
                      </p>
                      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                        Branches with commission due but no payout request will appear here.
                      </p>
                    </div>
                  )}

                  {!loading && activeTab === 'payout-required' && branchesAwaitingPayout.length > 0 && (
                    <ProcessPaymentRequestTable>
                      {branchesAwaitingPayout.map((row) => (
                        <ProcessPaymentRequestTableRow
                          key={row.storeId}
                          dateRangeText={periodLabel}
                          branchName={row.storeName}
                          totalReceivableLkr={row.dartCodesReceives ?? row.periodCommission}
                          storeId={row.storeId}
                          rangeFrom={rangeFrom}
                          rangeTo={rangeTo}
                          onClose={onClose}
                        />
                      ))}
                    </ProcessPaymentRequestTable>
                  )}

                  {!loading && activeTab === 'pending' && pendingApprovalRows.length > 0 && (
                    <ProcessPaymentRequestTable>
                      {pendingApprovalRows.map((row) => {
                        const { withdrawal } = row;
                        const isExpanded = !!expanded[withdrawal.id];

                        return (
                          <ProcessPaymentRequestTableRow
                            key={withdrawal.id}
                            dateRangeText={formatWithdrawalPeriod(
                              withdrawal.periodFrom,
                              withdrawal.periodTo,
                            )}
                            branchName={row.storeName}
                            totalReceivableLkr={row.dartCodesReceives}
                            remarks={withdrawal.remarks}
                            storeId={row.storeId}
                            rangeFrom={rangeFrom}
                            rangeTo={rangeTo}
                            onClose={onClose}
                            isExpanded={isExpanded}
                            showReceivableToggle
                            onToggleReceivable={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [withdrawal.id]: !prev[withdrawal.id],
                              }))
                            }
                            expandedContent={<WithdrawalBreakdownPanel withdrawal={withdrawal} />}
                          />
                        );
                      })}
                    </ProcessPaymentRequestTable>
                  )}

                  {!loading && activeTab === 'ready' && selectableRows.length > 0 && (
                    <ProcessPaymentRequestTable>
                      {selectableRows.map((row) => {
                        const { withdrawal } = row;
                        const isExpanded = !!expanded[withdrawal.id];

                        return (
                          <ProcessPaymentRequestTableRow
                            key={withdrawal.id}
                            dateRangeText={formatWithdrawalPeriod(
                              withdrawal.periodFrom,
                              withdrawal.periodTo,
                            )}
                            branchName={row.storeName}
                            totalReceivableLkr={row.dartCodesReceives}
                            remarks={withdrawal.remarks}
                            storeId={row.storeId}
                            rangeFrom={rangeFrom}
                            rangeTo={rangeTo}
                            onClose={onClose}
                            isExpanded={isExpanded}
                            showReceivableToggle
                            onToggleReceivable={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [withdrawal.id]: !prev[withdrawal.id],
                              }))
                            }
                            selection={{
                              checked: !!selected[withdrawal.id],
                              disabled: submitting,
                              onChange: () =>
                                setSelected((prev) => ({
                                  ...prev,
                                  [withdrawal.id]: !prev[withdrawal.id],
                                })),
                              ariaLabel: `Select ${formatBranchName(row.storeName)} for settlement`,
                            }}
                            expandedContent={<WithdrawalBreakdownPanel withdrawal={withdrawal} />}
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
                        {results.map((result) => (
                          <div
                            key={result.storeId}
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
                    {activeTab !== 'ready' ? (
                      <div className="process-payment-modal__footer-lock">
                        <span className="process-payment-modal__footer-lock-icon" aria-hidden>
                          <Lock size={14} />
                        </span>
                        <span>
                          Payment controls are available only in{' '}
                          <button
                            type="button"
                            onClick={() => setActiveTab('ready')}
                            className="font-semibold text-[var(--color-brand)] hover:underline"
                          >
                            Ready to process
                          </button>
                          .
                        </span>
                      </div>
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
                        disabled={
                          submitting ||
                          activeTab !== 'ready' ||
                          selectedItems.length === 0 ||
                          !paymentMethod ||
                          !receiptFile
                        }
                        onClick={handleSubmit}
                        className="payment-history-header__btn payment-history-header__btn--primary inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            Processing…
                          </>
                        ) : (
                          `Process ${selectedItems.length || 0} payment${selectedItems.length !== 1 ? 's' : ''}`
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
