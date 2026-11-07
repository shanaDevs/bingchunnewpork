'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { cn } from '@/lib/utils';
import WalletWithdrawalModal from '@/components/admin/WalletWithdrawalModal';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import { hasWithdrawalInvoice } from '@/components/admin/settlementTypes';
import { openPayoutDraftInvoice, openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WALLET_TAB_TRIGGER_CLASS } from '@/components/admin/useAdminWalletTab';
import { payoutPeriodRowNeedsLiveNetPreview } from '@/components/admin/payoutPeriodRowAmounts';
import {
  dueFocusToPeriodView,
  type DuePeriodFocus,
} from '@/components/admin/payoutPeriodView';
import type { PayoutListTab, PayoutPeriodSort } from '@/components/admin/payoutPeriodTypes';
import {
  isCompletedPayout,
  periodToViewRow,
  resolveRowBaseDisplayAmounts,
  statusBadgeClass,
  statusLabel,
  viewPeriodDisplayForModal,
} from '@/components/admin/payoutPeriodRowModel';
import {
  formatPayoutPeriodCell,
  PayoutPeriodAmountCells,
  PayoutPeriodsTableSkeleton,
  PayoutPeriodTableHead,
} from '@/components/admin/payoutPeriodTableUi';
import { useBranchPayoutPeriodsData } from '@/components/admin/useBranchPayoutPeriodsData';

export type { PayoutPeriodRow, PayoutPeriodSort, PayoutPeriodStatus } from '@/components/admin/payoutPeriodTypes';
export { fetchPayoutPeriods, payoutPeriodsQueryKey } from '@/components/admin/payoutPeriodsApi';

type Props = {
  storeId?: string;
  walletBalance: number;
  availableBalance: number;
  refreshSignal?: number;
  periodSort?: PayoutPeriodSort;
  highlightPeriod?: { periodFrom: string; periodTo: string } | null;
  /** Open the oldest unpaid period from the full list, ignoring the wallet date filter. */
  focusOldestPending?: boolean;
  /** When auto-opening from Payouts Due, use this if the period row is not in the table yet. */
  autoOpenDuePeriod?: DuePeriodFocus | null;
};

export default function BranchPayoutPeriodsSection({
  storeId,
  walletBalance,
  availableBalance,
  refreshSignal = 0,
  periodSort = 'newest',
  highlightPeriod = null,
  focusOldestPending = false,
  autoOpenDuePeriod = null,
}: Props) {
  const apiBase = getApiBaseUrl();
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const openedOldestPending = useRef(false);
  const [viewRow, setViewRow] = useState<{
    withdrawal: WithdrawalRow;
    viewPeriodOnly: boolean;
    periodDisplay?: { from: string; to: string; days: number };
  } | null>(null);
  const [listTab, setListTab] = useState<PayoutListTab>('pending');

  const {
    rows,
    periodsLoading,
    previewByKey,
    previewLoadingByKey,
    displayRows,
    tabRows,
    displayAmountsByKey,
    oldestPending,
    refetch,
  } = useBranchPayoutPeriodsData({
    apiBase,
    storeId,
    periodSort,
    focusOldestPending,
    listTab,
  });

  useEffect(() => {
    if (refreshSignal > 0) void refetch();
  }, [refreshSignal, refetch]);

  const highlightedPeriodRow = useMemo(() => {
    if (!highlightPeriod) return null;
    return (
      displayRows.find(
        (row) =>
          row.periodFrom === highlightPeriod.periodFrom &&
          row.periodTo === highlightPeriod.periodTo,
      ) ?? null
    );
  }, [displayRows, highlightPeriod]);

  const periodRowToAutoOpen = highlightedPeriodRow ?? oldestPending;

  const activeHighlight = periodRowToAutoOpen
    ? { periodFrom: periodRowToAutoOpen.periodFrom, periodTo: periodRowToAutoOpen.periodTo }
    : highlightPeriod;

  useEffect(() => {
    openedOldestPending.current = false;
  }, [storeId]);

  useEffect(() => {
    if (!focusOldestPending || periodsLoading || openedOldestPending.current) return;

    if (periodRowToAutoOpen) {
      openedOldestPending.current = true;
      setViewRow({
        ...periodToViewRow(periodRowToAutoOpen, storeId),
        periodDisplay: viewPeriodDisplayForModal(periodRowToAutoOpen, rows, previewByKey),
      });
      return;
    }

    if (autoOpenDuePeriod) {
      openedOldestPending.current = true;
      setViewRow(dueFocusToPeriodView(autoOpenDuePeriod));
    }
  }, [
    focusOldestPending,
    periodsLoading,
    periodRowToAutoOpen,
    storeId,
    autoOpenDuePeriod,
    rows,
    previewByKey,
  ]);

  useEffect(() => {
    if (!highlightedPeriodRow) return;
    setListTab(isCompletedPayout(highlightedPeriodRow.status) ? 'completed' : 'pending');
  }, [highlightedPeriodRow]);

  useEffect(() => {
    if (!activeHighlight || periodsLoading) return;
    const el = highlightRowRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeHighlight?.periodFrom, activeHighlight?.periodTo, periodsLoading, listTab, tabRows.length]);

  return (
    <div className="mb-7 overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">15-Day Payout Periods</h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            View only · amounts in LKR
          </span>
        </div>
        <Tabs
          value={listTab}
          onValueChange={(value) => setListTab(value as PayoutListTab)}
        >
          <TabsList className="branch-wallet-page__tabs h-9 w-fit justify-start gap-0.5 overflow-y-hidden rounded-full border border-[var(--color-navy-border)] bg-[var(--color-input-bg)] p-0.5">
            <TabsTrigger
              value="pending"
              className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}
            >
              Pending Payouts
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className={`branch-wallet-page__tab ${WALLET_TAB_TRIGGER_CLASS}`}
            >
              Completed Payouts
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {periodsLoading && <PayoutPeriodsTableSkeleton />}

      {!periodsLoading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand-subtle)] text-[var(--color-brand)]">
            <CalendarRange size={28} />
          </div>
          <p className="text-base font-semibold text-[var(--color-text)]">No payout periods yet</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--color-text-muted)]">
            Your current 15-day cycle and completed cycles appear here for review before payout.
          </p>
        </div>
      )}

      {!periodsLoading && rows.length > 0 && tabRows.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {listTab === 'pending' ? 'No pending payouts' : 'No completed payouts'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-[var(--color-text-muted)]">
            {listTab === 'pending'
              ? 'Open cycles, unpaid periods, and payouts in review show here.'
              : 'Periods show here after payment is completed.'}
          </p>
        </div>
      )}

      {!periodsLoading && tabRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs">
            <PayoutPeriodTableHead />
            <tbody>
              {tabRows.map((row) => {
                const highlighted =
                  activeHighlight != null &&
                  row.periodFrom === activeHighlight.periodFrom &&
                  row.periodTo === activeHighlight.periodTo;
                return (
                <tr
                  key={row.key}
                  ref={highlighted ? highlightRowRef : undefined}
                  className={cn(
                    'border-b border-[var(--color-navy-border)]/70 last:border-b-0 hover:bg-[var(--color-input-bg)]/40',
                    highlighted && 'bg-[var(--color-brand-subtle)]/40 ring-1 ring-inset ring-[var(--color-brand)]/30',
                  )}
                >
                  <td className="px-3 py-3 whitespace-nowrap text-[var(--color-text)]">
                    {formatPayoutPeriodCell(row, rows, previewByKey)}
                  </td>
                  <PayoutPeriodAmountCells
                    row={row}
                    amounts={
                      displayAmountsByKey.get(row.key) ??
                      resolveRowBaseDisplayAmounts(row, previewByKey)
                    }
                    previewLoading={previewLoadingByKey.get(row.key) ?? false}
                    needsPreview={payoutPeriodRowNeedsLiveNetPreview(row.breakdown)}
                  />
                  <td className="px-3 py-3">
                    <span className={cn('admin-status-badge', statusBadgeClass(row.status))}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {row.status === 'PAYMENT_PENDING' && row.draftInvoiceUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            void openPayoutDraftInvoice(row.draftInvoiceUrl!).catch(() => {
                              toast.error('Could not open the payout invoice');
                            });
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-[var(--color-brand)] px-3 py-1.5',
                            'text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-subtle)]',
                          )}
                        >
                          <FileText size={12} />
                          Invoice
                        </button>
                      )}
                      {row.status === 'PAID' && hasWithdrawalInvoice(row.withdrawal?.invoiceUrl) && (
                        <button
                          type="button"
                          onClick={() => {
                            void openWithdrawalInvoice(row.withdrawal?.invoiceUrl).catch(() => {
                              toast.error('Could not open the payout invoice');
                            });
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border border-[var(--color-brand)] px-3 py-1.5',
                            'text-xs font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-subtle)]',
                          )}
                        >
                          <FileText size={12} />
                          Invoice
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setViewRow({
                            ...periodToViewRow(row, storeId),
                            periodDisplay: viewPeriodDisplayForModal(row, rows, previewByKey),
                          })
                        }
                        className={cn(
                          'inline-flex items-center rounded-lg border border-[var(--color-navy-border)] px-3 py-1.5',
                          'text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-input-bg)]',
                        )}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WalletWithdrawalModal
        open={!!viewRow}
        onClose={() => setViewRow(null)}
        viewWithdrawal={viewRow?.withdrawal ?? null}
        viewPeriodOnly={viewRow?.viewPeriodOnly ?? false}
        viewPeriodDisplay={viewRow?.periodDisplay}
        walletBalance={walletBalance}
        availableBalance={availableBalance}
        storeId={storeId ?? viewRow?.withdrawal.storeId}
        apiBase={apiBase}
        onSubmitted={() => undefined}
        showGatewayFees={false}
      />
    </div>
  );
}
