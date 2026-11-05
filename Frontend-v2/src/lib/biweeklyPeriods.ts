import { formatDate, todayDateString as colomboTodayDateString } from '@/lib/datetime';

export type BiweeklyPeriod = { from: string; to: string; label: string };

export const PAYOUT_PERIOD_PRESETS = [15, 30, 40] as const;
export type PayoutPeriodPreset = (typeof PAYOUT_PERIOD_PRESETS)[number];

export type RollingPeriodOption = {
  days: PayoutPeriodPreset;
  from: string;
  to: string;
  capped: boolean;
  label: string;
};

export function todayDateStr(): string {
  return colomboTodayDateString();
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isCalendarPeriodStart(dateStr: string): boolean {
  const day = Number(dateStr.slice(8, 10));
  return day === 1 || day === 16;
}

/** End date for a calendar half-month period starting on the 1st or 16th. */
export function getCalendarPeriodEnd(startDateStr: string): string {
  const year = Number(startDateStr.slice(0, 4));
  const month = Number(startDateStr.slice(5, 7));
  const day = Number(startDateStr.slice(8, 10));
  const monthStr = startDateStr.slice(0, 7);

  if (day === 1) return `${monthStr}-15`;
  if (day === 16) {
    return `${monthStr}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`;
  }

  throw new Error(`Invalid payout period start: ${startDateStr}`);
}

export function getPayoutPeriodEndDate(startDateStr: string): string {
  return getCalendarPeriodEnd(startDateStr);
}

export function formatBiweeklyPeriodLabel(from: string, to: string): string {
  const fmt = (d: string, withYear: boolean) =>
    formatDate(`${d}T12:00:00`, {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear
    ? `${fmt(from, false)} – ${fmt(to, true)}`
    : `${fmt(from, true)} – ${fmt(to, true)}`;
}

export function periodValueKey(from: string, to: string): string {
  return `${from}|${to}`;
}

export function parsePeriodValue(value: string): { from: string; to: string } | null {
  const [from, to] = value.split('|');
  if (!from || !to) return null;
  return { from, to };
}

export function buildRollingPeriod(from: string, days: number): { from: string; to: string } {
  const to = addDaysToDateStr(from, days - 1);
  const today = todayDateStr();
  // Inclusive end stays open through `to`; only cap when the ideal end is still ahead.
  const cappedTo = to < today ? to : today;
  return { from, to: cappedTo };
}

export function rollingPeriodLabel(from: string, to: string, days: number, capped = false): string {
  const range = formatBiweeklyPeriodLabel(from, to);
  return capped ? `${days} days · ${range} (to today)` : `${days} days · ${range}`;
}

export function isValidPayoutRange(from: string, to: string): boolean {
  if (!from || !to || from > to || to > todayDateStr()) return false;
  const spanDays =
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  return spanDays >= 1 && spanDays <= 40;
}

export function isValidCalendarPeriodRange(from: string, to: string): boolean {
  return (
    !!from &&
    !!to &&
    from <= to &&
    to <= todayDateStr() &&
    isCalendarPeriodStart(from) &&
    to === getCalendarPeriodEnd(from)
  );
}

/** @deprecated Use isValidCalendarPeriodRange */
export function isValidBiweeklyRange(from: string, to: string): boolean {
  return isValidCalendarPeriodRange(from, to);
}

/** Map any calendar date to its fixed half-month period (1–15 or 16–EOM). */
export function resolveCalendarPeriodForDate(dateStr: string): BiweeklyPeriod {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const monthStr = dateStr.slice(0, 7);

  if (day <= 15) {
    const from = `${monthStr}-01`;
    const to = `${monthStr}-15`;
    return { from, to, label: formatBiweeklyPeriodLabel(from, to) };
  }

  const from = `${monthStr}-16`;
  const to = `${monthStr}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`;
  return { from, to, label: formatBiweeklyPeriodLabel(from, to) };
}

/** @deprecated Use resolveCalendarPeriodForDate */
export function resolveBiweeklyPeriodForDate(dateStr: string): BiweeklyPeriod {
  return resolveCalendarPeriodForDate(dateStr);
}

export function applyBiweeklyPeriodFromDate(dateStr: string): { from: string; to: string } {
  const { from, to } = resolveCalendarPeriodForDate(dateStr);
  return { from, to };
}

/** Generate calendar half-month periods (most recent first). */
export function generateCalendarPeriods(
  year = new Date().getFullYear(),
  countBack = 26,
): BiweeklyPeriod[] {
  const today = todayDateStr();
  const result: BiweeklyPeriod[] = [];

  let y = year;
  let m = 12;

  while (result.length < countBack) {
    for (let half = 2; half >= 1; half--) {
      const monthStr = `${y}-${String(m).padStart(2, '0')}`;
      const from = half === 1 ? `${monthStr}-01` : `${monthStr}-16`;
      if (from > today) continue;
      const to = getCalendarPeriodEnd(from);
      result.push({ from, to, label: formatBiweeklyPeriodLabel(from, to) });
      if (result.length >= countBack) break;
    }

    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
      if (y < year - 5) break;
    }
  }

  return result;
}

/** Full calendar month (1st through last day, or today for the current month). */
export function resolveMonthlyPeriodForDate(dateStr: string): BiweeklyPeriod {
  const ym = dateStr.slice(0, 7);
  const [year, month] = ym.split('-').map(Number);
  const from = `${ym}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
  const to = monthEnd <= dateStr ? monthEnd : dateStr;
  const monthLabel = new Date(`${ym}-01T12:00:00`).toLocaleDateString('en-LK', {
    month: 'long',
    year: 'numeric',
  });
  const label =
    to === monthEnd && to < todayDateStr()
      ? monthLabel
      : to === todayDateStr() && from.slice(0, 7) === todayDateStr().slice(0, 7)
        ? `${monthLabel} (to date)`
        : monthLabel;
  return { from, to, label };
}

/** Generate full calendar months for DartCodes settlement (most recent first). */
export function generateMonthlyPeriods(countBack = 24): BiweeklyPeriod[] {
  const today = todayDateStr();
  const result: BiweeklyPeriod[] = [];
  const anchor = new Date();

  for (let i = 0; i < countBack; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const from = `${ym}-01`;
    const lastDay = lastDayOfMonth(d.getFullYear(), d.getMonth() + 1);
    const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;
    if (from > today) continue;
    const to = i === 0 ? (today < monthEnd ? today : monthEnd) : monthEnd;
    const monthLabel = d.toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
    const label =
      i === 0 && to < monthEnd ? `${monthLabel} (to date)` : monthLabel;
    result.push({ from, to, label });
  }

  return result;
}

/** @deprecated Use generateCalendarPeriods */
export function generateBiweeklyPeriods(
  year = new Date().getFullYear(),
  countBack = 26,
): BiweeklyPeriod[] {
  return generateCalendarPeriods(year, countBack);
}

export function buildLockedPeriod(from: string, to: string): BiweeklyPeriod {
  return { from, to, label: formatBiweeklyPeriodLabel(from, to) };
}
