import type { PayoutListTab, PayoutPeriodRow } from '@/components/admin/payoutPeriodTypes';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

export type PayoutSummaryRecord = {
  key: string;
  periodRow: PayoutPeriodRow | null;
  withdrawal: WithdrawalRow | null;
};

export function payoutPeriodDateKey(from?: string | null, to?: string | null): string | null {
  if (!from || !to) return null;
  return `${from.slice(0, 10)}|${to.slice(0, 10)}`;
}

export function findPeriodRowForWithdrawal(
  rows: PayoutPeriodRow[],
  withdrawal: Pick<WithdrawalRow, 'periodFrom' | 'periodTo'>,
): PayoutPeriodRow | null {
  const key = payoutPeriodDateKey(withdrawal.periodFrom, withdrawal.periodTo);
  if (!key) return null;
  return rows.find((row) => payoutPeriodDateKey(row.periodFrom, row.periodTo) === key) ?? null;
}

export function isPaidOrRejectedWithdrawal(row: Pick<WithdrawalRow, 'status'>): boolean {
  return row.status === 'APPROVED' || row.status === 'REJECTED';
}

/**
 * View-only row list for Payout Summary.
 * Pending = period rows. Completed = each paid/rejected payout record when
 * withdrawals are provided; otherwise the paid period rows.
 */
export function buildPayoutSummaryRecords(params: {
  listTab: PayoutListTab;
  periodTabRows: PayoutPeriodRow[];
  allPeriodRows: PayoutPeriodRow[];
  withdrawals?: WithdrawalRow[];
}): PayoutSummaryRecord[] {
  const { listTab, periodTabRows, allPeriodRows, withdrawals } = params;

  if (listTab === 'pending' || withdrawals == null) {
    return periodTabRows.map((periodRow) => ({
      key: periodRow.key,
      periodRow,
      withdrawal: periodRow.withdrawal ?? null,
    }));
  }

  return withdrawals.filter(isPaidOrRejectedWithdrawal).map((withdrawal) => ({
    key: withdrawal.id,
    periodRow: findPeriodRowForWithdrawal(allPeriodRows, withdrawal),
    withdrawal,
  }));
}
