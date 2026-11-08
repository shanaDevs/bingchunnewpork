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

function cycleFromFromBreakdown(breakdown: unknown): string | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const value = (breakdown as Record<string, unknown>).cycleFrom;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Table label for a listed 15-day payout row. SECOND shows the full 30-day calculation
 * window; settlement still uses the row's `periodFrom`/`periodTo`.
 */
export function resolveListedPayoutPeriodDisplay<T extends { periodFrom: string; periodTo: string }>(params: {
  row: T;
  rows: T[];
  cycleStage?: 'FIRST' | 'SECOND' | null;
  cycleFrom?: string | null;
  breakdown?: unknown;
  periodDays?: number | null;
}): { displayFrom: string; displayTo: string; displayDays: number } {
  const { row, rows, periodDays } = params;
  const cycleFrom = params.cycleFrom ?? cycleFromFromBreakdown(params.breakdown);
  const pairedFirst = findPairedFirstPayoutPeriodRow(rows, row);
  const isSecond = params.cycleStage === 'SECOND' || (params.cycleStage !== 'FIRST' && pairedFirst != null);

  if (!isSecond) {
    return {
      displayFrom: row.periodFrom,
      displayTo: row.periodTo,
      displayDays: periodDays ?? 15,
    };
  }

  if (pairedFirst) {
    return {
      displayFrom: pairedFirst.periodFrom,
      displayTo: row.periodTo,
      displayDays: FULL_CYCLE_INCLUSIVE_DAYS,
    };
  }

  return resolvePayoutCycleDisplayRange({
    cycleStage: 'SECOND',
    cycleFrom,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    periodDays,
  });
}
