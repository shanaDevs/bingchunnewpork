import { prisma } from './prisma';
import {
  addDaysToUtcDateStr,
  dayAfterUtcDateStr,
  todayUtcDateStr,
  toUtcDateStr,
} from './utcDateString';

export const PAYOUT_PERIOD_DAYS = [15, 30, 40] as const;
export type PayoutPeriodDays = (typeof PAYOUT_PERIOD_DAYS)[number];

export type ResolvedPayoutPeriod = {
  days: PayoutPeriodDays;
  from: string;
  to: string;
  capped: boolean;
};

export function isValidPayoutPeriodDays(days: number): days is PayoutPeriodDays {
  return (PAYOUT_PERIOD_DAYS as readonly number[]).includes(days);
}

/** @deprecated Alias for UTC payout date helpers — prefer `utcDateString` for new code. */
export const addDaysToDateStr = addDaysToUtcDateStr;
export const todayDateStr = todayUtcDateStr;

/** Earliest PAID order date for the store, or null if none. */
async function getEarliestPaidOrderDate(storeId: string): Promise<string | null> {
  const earliest = await prisma.order.findFirst({
    where: { storeId, paymentStatus: 'PAID' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!earliest) return null;
  return toUtcDateStr(earliest.createdAt);
}

/** Resolve rolling payout window from last payout (or first sale) through N days (capped at today). */
export async function resolvePayoutPeriod(
  storeId: string,
  days: PayoutPeriodDays,
): Promise<ResolvedPayoutPeriod> {
  const nextStart = await getNextPayoutStartDate(storeId);
  const earliestOrder = nextStart ? null : await getEarliestPaidOrderDate(storeId);
  const from = nextStart ?? earliestOrder ?? todayUtcDateStr();
  const today = todayUtcDateStr();
  const idealTo = addDaysToUtcDateStr(from, days - 1);
  // Inclusive end date stays open through `idealTo`; elapses only once today is past it.
  const to = idealTo < today ? idealTo : today;
  return {
    days,
    from,
    to,
    capped: idealTo >= today,
  };
}

export async function resolvePayoutPeriodOptions(
  storeId: string,
): Promise<ResolvedPayoutPeriod[]> {
  return Promise.all(PAYOUT_PERIOD_DAYS.map((days) => resolvePayoutPeriod(storeId, days)));
}

/**
 * Walks successive N-day windows from the payout anchor until the open cycle (ideal end after today).
 * Unlike `resolvePayoutPeriod`, this reaches the current in-progress window when older cycles are still unpaid.
 */
export async function resolveOpenRollingPayoutWindow(
  storeId: string,
  days: PayoutPeriodDays = 15,
): Promise<ResolvedPayoutPeriod | null> {
  let from = await getNextPayoutStartDate(storeId);
  if (!from) {
    from = await getEarliestPaidOrderDate(storeId);
  }
  if (!from) return null;

  const today = todayUtcDateStr();
  for (let i = 0; i < 400; i++) {
    const idealTo = addDaysToUtcDateStr(from, days - 1);
    // Still open on the last day of the window (idealTo === today).
    if (idealTo >= today) {
      return {
        days,
        from,
        to: today,
        capped: true,
      };
    }
    from = dayAfterUtcDateStr(idealTo);
  }
  return null;
}

/** Stores whose N-day rolling window has fully elapsed (`capped === false`). */
export async function listDuePayoutStoreIds(
  storeIds: string[],
  days: PayoutPeriodDays = 15,
): Promise<Array<ResolvedPayoutPeriod & { storeId: string }>> {
  const resolved = await Promise.all(
    storeIds.map(async (storeId) => {
      const period = await resolvePayoutPeriod(storeId, days);
      return { storeId, ...period };
    }),
  );
  return resolved.filter((period) => !period.capped);
}

/** True when a payout window intersects [rangeFrom, rangeTo] (inclusive YYYY-MM-DD). */
export function payoutWindowOverlapsRange(
  windowFrom: string,
  windowTo: string,
  rangeFrom: string,
  rangeTo: string,
): boolean {
  return windowFrom <= rangeTo && windowTo >= rangeFrom;
}

/**
 * Pure elapsed 15/30/40-day windows from a known period start.
 * Optional overlap filter skips windows outside the wallet date range (avoids
 * heavy period breakdown work for payouts-due).
 */
export function buildElapsedPayoutWindowsFromStart(
  startFrom: string | null | undefined,
  days: PayoutPeriodDays = 15,
  max = 12,
  overlap?: { from: string; to: string },
): ResolvedPayoutPeriod[] {
  if (!startFrom) return [];

  const today = todayUtcDateStr();
  const windows: ResolvedPayoutPeriod[] = [];
  let from = startFrom;

  while (windows.length < max) {
    const idealTo = addDaysToUtcDateStr(from, days - 1);
    // Not elapsed until the calendar day after idealTo.
    if (idealTo >= today) break;
    if (overlap && from > overlap.to) break;

    const overlaps =
      !overlap || payoutWindowOverlapsRange(from, idealTo, overlap.from, overlap.to);
    if (overlaps) {
      windows.push({ days, from, to: idealTo, capped: false });
    }
    from = dayAfterUtcDateStr(idealTo);
  }

  return windows;
}

export async function listElapsedPayoutWindows(
  storeId: string,
  days: PayoutPeriodDays = 15,
  max = 12,
  overlap?: { from: string; to: string },
): Promise<ResolvedPayoutPeriod[]> {
  const nextStart = await getNextPayoutStartDate(storeId);
  const earliestOrder = nextStart ? null : await getEarliestPaidOrderDate(storeId);
  const from = nextStart ?? earliestOrder;
  return buildElapsedPayoutWindowsFromStart(from, days, max, overlap);
}

/** Valid calendar payout period starts: 1st or 16th of a month. @deprecated Use rolling payout periods. */
export function isCalendarPeriodStart(dateStr: string): boolean {
  const day = Number(dateStr.slice(8, 10));
  return day === 1 || day === 16;
}

function lastDayOfMonthStr(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return String(lastDay).padStart(2, '0');
}

/** End date for a calendar half-month period starting on the 1st or 16th. @deprecated */
export function getCalendarPeriodEnd(startDateStr: string): string {
  const year = Number(startDateStr.slice(0, 4));
  const month = Number(startDateStr.slice(5, 7));
  const day = Number(startDateStr.slice(8, 10));
  const monthStr = startDateStr.slice(0, 7);

  if (day === 1) return `${monthStr}-15`;
  if (day === 16) return `${monthStr}-${lastDayOfMonthStr(year, month)}`;

  throw new Error(`Invalid payout period start: ${startDateStr} (must be 1st or 16th)`);
}

export function getPayoutPeriodEndDate(startDateStr: string): string {
  return getCalendarPeriodEnd(startDateStr);
}

/** Day after the latest non-rejected withdrawal period end, or null for first request. */
function periodStartDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

function periodEndInclusiveDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T23:59:59.999Z`);
}

export async function findInReviewWithdrawalForPeriod(
  storeId: string,
  periodFrom: string,
  periodTo: string,
) {
  return prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: 'IN_REVIEW',
      periodFrom: periodStartDate(periodFrom),
      periodTo: periodEndInclusiveDate(periodTo),
    },
  });
}

/** Existing branch payout request for this exact window (draft or branch-requested). */
export async function findCompletablePeriodWithdrawal(
  storeId: string,
  periodFrom: string,
  periodTo: string,
) {
  const from = periodStartDate(periodFrom);
  const to = periodEndInclusiveDate(periodTo);
  return prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['IN_REVIEW', 'PENDING'] },
      periodFrom: from,
      periodTo: to,
    },
  });
}

export async function getNextPayoutStartDate(storeId: string): Promise<string | null> {
  const latest = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED', 'IN_REVIEW'] },
      periodTo: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { periodTo: true },
  });
  if (!latest?.periodTo) return null;
  return dayAfterUtcDateStr(toUtcDateStr(latest.periodTo));
}

export {
  determineNextPayoutCycleStage,
  resolveCycleFromDate,
  resolvePayoutCycleContext,
} from './payoutCycle';
export type { PayoutCycleStage, PayoutCycleContext } from './payoutCycle';
