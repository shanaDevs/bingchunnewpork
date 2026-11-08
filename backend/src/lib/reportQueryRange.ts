import { dateStringInColombo } from './datetime';
import {
  assertMaxDateSpan,
  endOfDayColombo,
  startOfDayColombo,
} from './dashboardStatsDateRange';

export function defaultColomboMonthDayStrings(now = new Date()): { from: string; to: string } {
  const to = dateStringInColombo(now);
  const [y, m] = to.split('-');
  const from = `${y}-${m}-01`;
  return { from, to };
}

/** Default = current calendar month (Colombo). Enforces MAX_REPORT_DATE_SPAN_DAYS. */
export function resolveReportDayRange(from?: string, to?: string, now = new Date()) {
  const defaults = defaultColomboMonthDayStrings(now);
  const fromStr = from ?? defaults.from;
  const toStr = to ?? defaults.to;
  const gte = startOfDayColombo(fromStr);
  const lte = endOfDayColombo(toStr);
  assertMaxDateSpan(gte, lte);
  return { gte, lte, from: fromStr, to: toStr };
}

/** When both dates are omitted, returns null (no range filter). Otherwise enforces maxDays. */
export function resolveOptionalReportDayRange(
  from?: string,
  to?: string,
  maxDays = 366,
) {
  if (!from && !to) return null;
  const fromStr = from ?? to!;
  const toStr = to ?? from!;
  const gte = startOfDayColombo(fromStr);
  const lte = endOfDayColombo(toStr);
  assertMaxDateSpan(gte, lte, maxDays);
  return { gte, lte, from: fromStr, to: toStr };
}
