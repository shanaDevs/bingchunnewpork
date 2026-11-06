import { addDaysToDateStr } from '@/lib/biweeklyPeriods';
import { findPairedFirstPayoutPeriodRow } from '@/components/admin/payoutPeriodRowCycleDisplay';

export const FULL_CYCLE_INCLUSIVE_DAYS = 30;

function normalizeYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const ymd = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/**
 * Second-cycle payouts use a full 30-day window (both 15-day halves).
 * Display spans from the first half's start through the second half's end.
 */
export function resolveSecondCycleFullDisplayRange<T extends { periodFrom: string; periodTo: string }>(
  rows: T[],
  secondRow: T,
): { displayFrom: string; displayTo: string } | null {
  const first = findPairedFirstPayoutPeriodRow(rows, secondRow);
  if (!first) return null;
  return { displayFrom: first.periodFrom, displayTo: secondRow.periodTo };
}

/** When the paired first row is missing: 30 inclusive days ending at the second window's end. */
export function secondCycleFullDisplayRangeFallback(secondRow: { periodTo: string }): {
  displayFrom: string;
  displayTo: string;
} {
  return {
    displayFrom: addDaysToDateStr(secondRow.periodTo, -(FULL_CYCLE_INCLUSIVE_DAYS - 1)),
    displayTo: secondRow.periodTo,
  };
}

/**
 * Display range for payout modals. SECOND cycle shows the full 30-day calculation
 * window from the first payout start through the second window's end.
 * Settlement still uses the 15-day `periodFrom`/`periodTo` window.
 */
export function resolvePayoutCycleDisplayRange(params: {
  cycleStage?: 'FIRST' | 'SECOND' | null;
  cycleFrom?: string | null;
  periodFrom: string;
  periodTo: string;
  periodDays?: number | null;
}): { displayFrom: string; displayTo: string; displayDays: number } {
  const { cycleStage, cycleFrom, periodFrom, periodTo, periodDays } = params;
  if (cycleStage !== 'SECOND' || !periodTo) {
    return {
      displayFrom: periodFrom,
      displayTo: periodTo,
      displayDays: periodDays ?? 15,
    };
  }

  const firstStart = normalizeYmd(cycleFrom);
  const fallback = secondCycleFullDisplayRangeFallback({ periodTo });
  const displayFrom =
    firstStart && (!periodFrom || firstStart < periodFrom) ? firstStart : fallback.displayFrom;

  return {
    displayFrom,
    displayTo: periodTo,
    displayDays: FULL_CYCLE_INCLUSIVE_DAYS,
  };
}
