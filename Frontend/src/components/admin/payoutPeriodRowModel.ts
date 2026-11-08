import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import {
  resolvePayoutPeriodRowDisplayAmounts,
} from '@/components/admin/payoutPeriodRowAmounts';
import {
  resolveSecondCycleFullDisplayRange,
  secondCycleFullDisplayRangeFallback,
} from '@/components/admin/payoutSecondCycleDisplayRange';
import { readPayoutCycleStage } from '@/components/admin/payoutPeriodRowCycleDisplay';
import { syntheticPeriodViewWithdrawal } from '@/components/admin/payoutPeriodView';
import type {
  PayoutPeriodRow,
  PayoutPeriodSort,
  PayoutPeriodStatus,
} from '@/components/admin/payoutPeriodTypes';

export function isCompletedPayout(status: PayoutPeriodStatus) {
  return status === 'PAID';
}

export function statusLabel(status: PayoutPeriodStatus) {
  if (status === 'PAID') return 'Payment Completed';
  if (status === 'PAYMENT_PENDING') return 'Payment Pending';
  if (status === 'IN_PROGRESS') return 'In progress';
  return 'Pending';
}

export function statusBadgeClass(status: PayoutPeriodStatus) {
  if (status === 'PAID') return 'admin-status-badge--green';
  if (status === 'PAYMENT_PENDING') return 'admin-status-badge--amber';
  return 'admin-status-badge--amber';
}

export function previewPeriodTo(row: PayoutPeriodRow) {
  const through = row.summaryThrough ?? row.periodTo;
  if (through < row.periodFrom) return row.periodFrom;
  return through;
}

export function rowBreakdownForStage(row: PayoutPeriodRow): unknown {
  return row.breakdown ?? row.withdrawal?.breakdown;
}

function asIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toWithdrawalRow(raw: WithdrawalRow, fallbackStoreId?: string): WithdrawalRow {
  return {
    ...raw,
    storeId: raw.storeId ?? fallbackStoreId,
    periodFrom: asIsoDate(raw.periodFrom) ?? raw.periodFrom,
    periodTo: asIsoDate(raw.periodTo) ?? raw.periodTo,
    createdAt: asIsoDate(raw.createdAt) ?? raw.createdAt,
    reviewedAt: asIsoDate(raw.reviewedAt) ?? raw.reviewedAt,
    checkDate: asIsoDate(raw.checkDate) ?? raw.checkDate,
  };
}

export function periodToViewRow(
  row: PayoutPeriodRow,
  storeId?: string,
): {
  withdrawal: WithdrawalRow;
  viewPeriodOnly: boolean;
} {
  if (row.withdrawal) {
    return {
      withdrawal: toWithdrawalRow(row.withdrawal, storeId ?? row.withdrawal.storeId),
      viewPeriodOnly: false,
    };
  }

  return syntheticPeriodViewWithdrawal({
    key: row.key,
    periodFrom: row.periodFrom,
    periodTo: previewPeriodTo(row),
    amountCents: row.amountCents,
    storeId,
    breakdown: row.breakdown,
  });
}

export function viewPeriodDisplayForModal(
  row: PayoutPeriodRow,
  allRows: PayoutPeriodRow[],
  netPreviewByKey: Map<string, Record<string, unknown>>,
): { from: string; to: string; days: number } | undefined {
  const stage = readPayoutCycleStage(rowBreakdownForStage(row), netPreviewByKey.get(row.key));
  if (stage !== 'SECOND') return undefined;
  const resolved =
    resolveSecondCycleFullDisplayRange(allRows, row) ?? secondCycleFullDisplayRangeFallback(row);
  return { from: resolved.displayFrom, to: resolved.displayTo, days: 30 };
}

export function resolveRowBaseDisplayAmounts(
  row: PayoutPeriodRow,
  previewByKey: Map<string, Record<string, unknown>>,
): PeriodPayoutCardAmounts {
  const preview = previewByKey.get(row.key);
  return resolvePayoutPeriodRowDisplayAmounts({
    amountCents: row.amountCents,
    breakdown: row.breakdown,
    periodFrom: row.periodFrom,
    periodTo: previewPeriodTo(row),
    netPreviewData: preview,
  });
}

export function sortPayoutPeriodRows(rows: PayoutPeriodRow[], periodSort: PayoutPeriodSort) {
  return [...rows].sort((a, b) => {
    const byEnd = a.periodTo.localeCompare(b.periodTo);
    if (byEnd !== 0) return periodSort === 'oldest' ? byEnd : -byEnd;
    const byStart = a.periodFrom.localeCompare(b.periodFrom);
    return periodSort === 'oldest' ? byStart : -byStart;
  });
}
