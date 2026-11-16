import type { PayoutDueRow } from '@/components/admin/PayoutsDuePanel';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';

export type DuePeriodFocus = {
  storeId: string;
  periodFrom: string;
  periodTo: string;
  netAmountCents: number;
};

export function duePeriodFocusFromRow(row: PayoutDueRow): DuePeriodFocus {
  return {
    storeId: row.storeId,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    netAmountCents: row.netAmountCents,
  };
}

/** Synthetic withdrawal for read-only 15-day period breakdown (no saved withdrawal yet). */
export function syntheticPeriodViewWithdrawal(params: {
  key: string;
  periodFrom: string;
  periodTo: string;
  amountCents: number;
  storeId?: string;
  breakdown?: unknown;
}): { withdrawal: WithdrawalRow; viewPeriodOnly: true } {
  return {
    withdrawal: {
      id: params.key,
      amount: params.amountCents,
      status: 'PENDING',
      remarks: null,
      periodFrom: params.periodFrom,
      periodTo: params.periodTo,
      rejectionReason: null,
      createdAt: params.periodTo,
      storeId: params.storeId,
      breakdown: params.breakdown as WithdrawalRow['breakdown'],
    },
    viewPeriodOnly: true,
  };
}

export function dueFocusToPeriodView(focus: DuePeriodFocus) {
  return syntheticPeriodViewWithdrawal({
    key: `due-${focus.periodFrom}-${focus.periodTo}`,
    periodFrom: focus.periodFrom,
    periodTo: focus.periodTo,
    amountCents: focus.netAmountCents,
    storeId: focus.storeId,
  });
}

/** Payouts Due “View” — period breakdown only (no branch payables shell). */
export function dueRowToPeriodView(row: PayoutDueRow) {
  const base = syntheticPeriodViewWithdrawal({
    key: `due-${row.storeId}-${row.periodFrom}-${row.periodTo}`,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    amountCents: row.netAmountCents,
    storeId: row.storeId,
    breakdown: row.breakdown,
  });
  return {
    ...base,
    periodDisplay: {
      from: row.periodFrom.slice(0, 10),
      to: row.periodTo.slice(0, 10),
      days: row.days,
    },
  };
}
