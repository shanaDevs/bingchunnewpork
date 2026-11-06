import { addDaysToDateStr } from '@/lib/biweeklyPeriods';
import { parseWithdrawalBreakdown } from '@/components/admin/settlementTypes';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';

export function readPayoutCycleStage(
  breakdown: unknown,
  netPreview?: Record<string, unknown> | null,
): 'FIRST' | 'SECOND' | undefined {
  const parsed = parseWithdrawalBreakdown(breakdown);
  if (parsed?.cycleStage === 'FIRST' || parsed?.cycleStage === 'SECOND') {
    return parsed.cycleStage;
  }
  if (breakdown && typeof breakdown === 'object') {
    const rawStage = (breakdown as Record<string, unknown>).cycleStage;
    if (rawStage === 'FIRST' || rawStage === 'SECOND') {
      return rawStage;
    }
  }
  const previewStage = netPreview?.cycleStage;
  if (previewStage === 'FIRST' || previewStage === 'SECOND') {
    return previewStage;
  }
  return undefined;
}

/** Prior 15-day window that pairs with a SECOND payout row (Sep 1–15 before Sep 16–30). */
export function findPairedFirstPayoutPeriodRow<T extends { periodFrom: string; periodTo: string }>(
  rows: T[],
  secondRow: T,
): T | null {
  const expectedFirstTo = addDaysToDateStr(secondRow.periodFrom, -1);
  return (
    rows.find(
      (row) => row.periodFrom < secondRow.periodFrom && row.periodTo === expectedFirstTo,
    ) ?? null
  );
}

/**
 * SECOND payout table: full-cycle convenience lives on the payout-2 row (from preview/breakdown).
 * Do not add payout-1 row amounts here — that double-counted.
 */
export function applySecondCycleListDisplayAmounts(
  secondWindow: PeriodPayoutCardAmounts,
  _firstWindow: PeriodPayoutCardAmounts,
): PeriodPayoutCardAmounts {
  return secondWindow;
}

/** FIRST payout: platform convenience & commission are reconciled in payout 2 — hide in tables. */
export function applyFirstCycleTableDisplayMask(
  amounts: PeriodPayoutCardAmounts,
): PeriodPayoutCardAmounts {
  return {
    ...amounts,
    commissionLkr: null,
    orderConvenienceFeeLkr: null,
  };
}

export function rowIsPairedFirstHalfOfCycle<T extends { periodFrom: string; periodTo: string }>(
  rows: T[],
  row: T,
): boolean {
  return rows.some((candidate) => findPairedFirstPayoutPeriodRow(rows, candidate) === row);
}

export function shouldHideFirstCyclePlatformColumns(
  stage: 'FIRST' | 'SECOND' | undefined,
  rows: { periodFrom: string; periodTo: string }[],
  row: { periodFrom: string; periodTo: string },
  windowAmounts?: PeriodPayoutCardAmounts,
): boolean {
  if (stage === 'SECOND') return false;
  if (stage === 'FIRST') return true;
  if (rowIsPairedFirstHalfOfCycle(rows, row)) return true;
  if (
    stage == null &&
    windowAmounts != null &&
    (windowAmounts.commissionLkr ?? 0) <= 0.001
  ) {
    return true;
  }
  return false;
}

export function resolveSecondCycleTableAmounts(
  secondWindow: PeriodPayoutCardAmounts,
  firstWindow: PeriodPayoutCardAmounts | null | undefined,
): PeriodPayoutCardAmounts {
  if (!firstWindow) return secondWindow;
  return applySecondCycleListDisplayAmounts(secondWindow, firstWindow);
}
