export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DELIVERY_PAYOUT_PERIOD_DAYS = [30] as const;
export type DeliveryPayoutPeriodDays = (typeof DELIVERY_PAYOUT_PERIOD_DAYS)[number];

/** Elapsed-window payout length (same as the only configured period option). */
export const DELIVERY_PAYOUT_ELAPSED_DAYS: DeliveryPayoutPeriodDays = DELIVERY_PAYOUT_PERIOD_DAYS[0];

export type ResolvedDeliveryPayoutPeriod = {
  days: DeliveryPayoutPeriodDays;
  from: string;
  to: string;
  capped?: boolean;
};

/** In-progress delivery payout cycle (full 30-day close date + summary through today). */
export type OpenDeliveryPayoutWindow = {
  days: DeliveryPayoutPeriodDays;
  from: string;
  cycleTo: string;
  through: string;
  capped: true;
};

/**
 * Walks successive N-day windows from the payout anchor until the open cycle (ideal end on or after today).
 * Unlike `resolveDeliveryPayoutPeriodWindow`, this reaches the current in-progress window when older cycles are still unpaid.
 */
export function resolveOpenDeliveryPayoutWindow(params: {
  periodStart: string;
  days: DeliveryPayoutPeriodDays;
  today: string;
}): OpenDeliveryPayoutWindow | null {
  const { days, today } = params;
  let from = params.periodStart;
  if (!DATE_RE.test(from) || from > today) return null;

  for (let i = 0; i < 400; i++) {
    const cycleTo = addDaysToDateStr(from, days - 1);
    if (cycleTo >= today) {
      return { days, from, cycleTo, through: today, capped: true };
    }
    from = addDaysToDateStr(cycleTo, 1);
  }
  return null;
}

export function isDeliveryPayoutPeriodDays(days: number): days is DeliveryPayoutPeriodDays {
  return (DELIVERY_PAYOUT_PERIOD_DAYS as readonly number[]).includes(days);
}

export function minDateStr(dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => Boolean(d && DATE_RE.test(d)));
  if (valid.length === 0) return null;
  return valid.reduce((earliest, next) => (next < earliest ? next : earliest));
}

/** Rolling payout window: start through N days, capped at yesterday so the end is never today. */
export function resolveDeliveryPayoutPeriodWindow(params: {
  from: string;
  days: DeliveryPayoutPeriodDays;
  today: string;
}): ResolvedDeliveryPayoutPeriod {
  const { from, days, today } = params;
  const maxEnd = yesterdayUtcDateStr(today);
  const idealTo = addDaysToDateStr(from, days - 1);
  const capped = idealTo > maxEnd;
  const to = capped ? maxEnd : idealTo;
  return { days, from, to, capped };
}

export const BUSINESS_TZ = 'Asia/Colombo';

export function toUtcDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Civil YYYY-MM-DD in Sri Lanka (no DST). */
export function toBusinessDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return toUtcDateStr(d);
  return `${year}-${month}-${day}`;
}

export function todayUtcDateStr(now = new Date()): string {
  return toBusinessDateStr(now);
}

export function businessDayStartUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+05:30`);
}

export function businessDayEndUtc(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+05:30`);
}

export function daysInclusive(from: string, to: string): number {
  const start = businessDayStartUtc(from).getTime();
  const end = businessDayStartUtc(to).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toUtcDateStr(d);
}

export function yesterdayUtcDateStr(today = todayUtcDateStr()): string {
  return addDaysToDateStr(today, -1);
}

export function nextPeriodStartFromPeriodTo(periodTo: Date | string): string {
  const dateStr = typeof periodTo === 'string' ? periodTo.slice(0, 10) : toUtcDateStr(periodTo);
  return addDaysToDateStr(dateStr, 1);
}

/**
 * Span from last approved payout (or first fee) through today.
 * Includes unpaid elapsed due windows — not used for Delivery Wallet live totals.
 */
export function resolveLiveDeliveryWalletRange(params: {
  lastApprovedPeriodTo: Date | string | null | undefined;
  earliestFeeDate: string | null;
  today: string;
}): { from: string; to: string } | null {
  const fromApproved = params.lastApprovedPeriodTo
    ? nextPeriodStartFromPeriodTo(params.lastApprovedPeriodTo)
    : null;
  const from = fromApproved ?? params.earliestFeeDate;
  if (!from || from > params.today) return null;
  return { from, to: params.today };
}

/**
 * Wallet live range: the in-progress 30-day cycle through today.
 * Walks past unpaid elapsed windows so paid and due periods are excluded.
 */
export function resolveOpenCycleLiveWalletRange(params: {
  periodStart: string | null;
  today: string;
}): { from: string; to: string } | null {
  if (!params.periodStart) return null;
  const open = resolveOpenDeliveryPayoutWindow({
    periodStart: params.periodStart,
    days: DELIVERY_PAYOUT_ELAPSED_DAYS,
    today: params.today,
  });
  if (!open) return null;
  return { from: open.from, to: open.through };
}

export function validateDeliveryPayoutRange(params: {
  from: string;
  to: string;
  today: string;
  nextPeriodStart: string | null;
}): { ok: true } | { ok: false; message: string } {
  const { from, to, today, nextPeriodStart } = params;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, message: 'Dates must be YYYY-MM-DD' };
  }
  if (from > to) {
    return { ok: false, message: 'Start date must be on or before end date' };
  }
  if (to >= today) {
    return { ok: false, message: 'Payout end date must be before today' };
  }
  if (nextPeriodStart && from !== nextPeriodStart) {
    return { ok: false, message: `Payout period must start on ${nextPeriodStart}` };
  }
  return { ok: true };
}

export function canOpenPayoutRequest(nextPeriodStart: string | null, today: string): boolean {
  if (!nextPeriodStart) return true;
  return nextPeriodStart < today;
}
