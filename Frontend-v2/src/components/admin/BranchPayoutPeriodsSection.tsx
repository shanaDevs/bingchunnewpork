'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import WalletWithdrawalModal from '@/components/admin/WalletWithdrawalModal';
import {
  filterWithdrawalsForCompletedPayoutTab,
  type WithdrawalPagination,
  type WithdrawalRow,
} from '@/components/admin/WalletWithdrawalTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WALLET_TAB_TRIGGER_CLASS } from '@/components/admin/useAdminWalletTab';
import {
  dueFocusToPeriodView,
  type DuePeriodFocus,
} from '@/components/admin/payoutPeriodView';
import type { PayoutListTab, PayoutPeriodSort } from '@/components/admin/payoutPeriodTypes';
import {
  isCompletedPayout,
  periodToViewRow,
  viewPeriodDisplayForModal,
} from '@/components/admin/payoutPeriodRowModel';
import { PayoutPeriodsTableSkeleton } from '@/components/admin/payoutPeriodTableUi';
import { useBranchPayoutPeriodsData } from '@/components/admin/useBranchPayoutPeriodsData';
import PayoutSummaryTable from '@/components/admin/PayoutSummaryTable';
import {
  buildPayoutSummaryRecords,
  type PayoutSummaryRecord,
} from '@/components/admin/payoutSummaryTableModel';

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
  withdrawals?: WithdrawalRow[];
  withdrawalsLoading?: boolean;
  withdrawalStoreNames?: Record<string, string>;
  withdrawalPagination?: WithdrawalPagination | null;
  onWithdrawalPageChange?: (page: number) => void;
  onViewWithdrawal?: (row: WithdrawalRow) => void;
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
  withdrawals,
  withdrawalsLoading = false,
  withdrawalPagination = null,
  onWithdrawalPageChange,
  onViewWithdrawal,
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

  const completedWithdrawalRows = useMemo(
    () => filterWithdrawalsForCompletedPayoutTab(withdrawals ?? []),
    [withdrawals],
  );

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

  const summaryRecords = useMemo(
    () =>
      buildPayoutSummaryRecords({
        listTab,
        periodTabRows: tabRows,
        allPeriodRows: rows,
        withdrawals:
          listTab === 'completed' && withdrawals != null ? completedWithdrawalRows : undefined,
      }),
    [listTab, tabRows, rows, completedWithdrawalRows],
  );

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
  }, [
    activeHighlight?.periodFrom,
    activeHighlight?.periodTo,
    periodsLoading,
    listTab,
    summaryRecords.length,
  ]);

  function openRecord(record: PayoutSummaryRecord) {
    if (record.withdrawal && onViewWithdrawal && listTab === 'completed') {
      onViewWithdrawal(record.withdrawal);
      return;
    }
    if (record.periodRow) {
      setViewRow({
        ...periodToViewRow(record.periodRow, storeId),
        periodDisplay: viewPeriodDisplayForModal(record.periodRow, rows, previewByKey),
      });
      return;
    }
    if (record.withdrawal) {
      setViewRow({
        withdrawal: record.withdrawal,
        viewPeriodOnly: false,
      });
    }
  }

  const tableLoading =
    periodsLoading || (listTab === 'completed' && withdrawals != null && withdrawalsLoading);

  const showEmptyPeriods = !periodsLoading && rows.length === 0;
  const showEmptyTab =
    !tableLoading &&
    rows.length > 0 &&
    summaryRecords.length === 0;

  return (
    <div className="mb-7 overflow-hidden rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Payout Summary</h3>
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

      {tableLoading && <PayoutPeriodsTableSkeleton listTab={listTab} />}

      {showEmptyPeriods && (
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

      {showEmptyTab && (
        <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            {listTab === 'pending' ? 'No pending payouts' : 'No completed payouts'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-[var(--color-text-muted)]">
            {listTab === 'pending'
              ? 'Open cycles, unpaid periods, and payouts in review show here.'
              : 'Paid and rejected payout records appear here.'}
          </p>
        </div>
      )}

      {!tableLoading && summaryRecords.length > 0 && (
        <PayoutSummaryTable
          listTab={listTab}
          records={summaryRecords}
          allPeriodRows={rows}
          previewByKey={previewByKey}
          previewLoadingByKey={previewLoadingByKey}
          displayAmountsByKey={displayAmountsByKey}
          highlightPeriod={activeHighlight}
          highlightRowRef={highlightRowRef}
          onViewRecord={openRecord}
          pagination={
            listTab === 'completed' && onWithdrawalPageChange ? withdrawalPagination : null
          }
          onPageChange={listTab === 'completed' ? onWithdrawalPageChange : undefined}
          paginationLoading={withdrawalsLoading}
        />
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
