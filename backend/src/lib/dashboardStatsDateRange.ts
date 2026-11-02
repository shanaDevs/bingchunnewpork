import { AppError } from '../middleware/errorHandler';
import { dateStringInColombo, formatDateTime } from './datetime';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const COLOMBO_OFFSET_MS = 330 * 60 * 1000;
export const MAX_REPORT_DATE_SPAN_DAYS = 92;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfDayColombo(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000+05:30`);
}

export function endOfDayColombo(dateStr: string) {
  return new Date(`${dateStr}T23:59:59.999+05:30`);
}

export function assertMaxDateSpan(gte: Date, lte: Date, maxDays = MAX_REPORT_DATE_SPAN_DAYS) {
  const spanDays = Math.ceil((lte.getTime() - gte.getTime()) / 86_400_000) + 1;
  if (spanDays > maxDays) {
    throw new AppError(`Date range cannot exceed ${maxDays} days`, 400);
  }
}

export function paidSalesWhere(base: Record<string, unknown>) {
  return {
    ...base,
    paymentStatus: 'PAID' as const,
    status: { not: 'CANCELLED' as const },
  };
}

/** Preset dashboard periods use Colombo calendar days — same as the admin orders page date filters. */
export function periodRange(period: 'today' | 'month' | 'year', now = new Date()) {
  const todayStr = dateStringInColombo(now);
  if (period === 'today') {
    return { gte: startOfDayColombo(todayStr), lte: endOfDayColombo(todayStr) };
  }
  if (period === 'month') {
    const [y, m] = todayStr.split('-').map(Number);
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    return { gte: startOfDayColombo(startStr), lte: endOfDayColombo(todayStr) };
  }
  const y = todayStr.slice(0, 4);
  return { gte: startOfDayColombo(`${y}-01-01`), lte: endOfDayColombo(todayStr) };
}

/** Parse YYYY-MM-DD query params the same way for orders lists and dashboard stats. */
export function createdAtRangeFromDateStrings(startDate?: string, endDate?: string) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  const start = startDate?.trim();
  const end = endDate?.trim();
  if (start && DATE_ONLY.test(start)) {
    createdAt.gte = startOfDayColombo(start);
  }
  if (end && DATE_ONLY.test(end)) {
    createdAt.lte = endOfDayColombo(end);
  }
  if (!createdAt.gte && !createdAt.lte) return undefined;
  return createdAt;
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveSelectedRange(
  period: 'today' | 'month' | 'year' | 'custom',
  now: Date,
  from?: string,
  to?: string,
) {
  if (period === 'custom' && from && to) {
    const gte = startOfDayColombo(from);
    const lte = endOfDayColombo(to);
    if (gte > lte) {
      throw new Error('Invalid custom date range');
    }
    const cappedLte = lte > endOfDay(now) ? endOfDay(now) : lte;
    assertMaxDateSpan(gte, cappedLte);
    return { gte, lte: cappedLte };
  }
  return periodRange(period === 'custom' ? 'month' : period, now);
}

export type ChartRange = {
  gte: Date;
  lte: Date;
  keys: string[];
  granularity: 'day' | 'month';
};

function customChartRange(from: Date, to: Date): ChartRange {
  const gte = startOfDay(from);
  const lte = endOfDay(to);
  const daySpan = Math.ceil((lte.getTime() - gte.getTime()) / 86_400_000) + 1;

  if (daySpan <= 62) {
    const keys: string[] = [];
    const cursor = new Date(gte);
    while (cursor <= lte) {
      keys.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { gte, lte, keys, granularity: 'day' };
  }

  const keys: string[] = [];
  const cursor = new Date(gte.getFullYear(), gte.getMonth(), 1);
  while (cursor <= lte) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { gte, lte, keys, granularity: 'month' };
}

function monthlyChartRange(period: 'today' | 'month' | 'year', now = new Date()): Omit<ChartRange, 'granularity'> {
  if (period === 'year') {
    const year = now.getFullYear();
    const keys: string[] = [];
    for (let m = 0; m <= now.getMonth(); m++) {
      keys.push(monthKey(new Date(year, m, 1)));
    }
    return { gte: new Date(year, 0, 1), lte: now, keys };
  }
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return {
    gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
    lte: now,
    keys,
  };
}

export function resolveChartRange(
  period: 'today' | 'month' | 'year' | 'custom',
  selectedRange: { gte: Date; lte: Date },
  now = new Date(),
): ChartRange {
  if (period === 'custom') {
    return customChartRange(selectedRange.gte, selectedRange.lte);
  }
  const preset = monthlyChartRange(period, now);
  return { ...preset, granularity: 'month' as const };
}

export function getColomboClock(d: Date) {
  const colombo = new Date(d.getTime() + COLOMBO_OFFSET_MS);
  return { hour: colombo.getUTCHours(), day: colombo.getUTCDay() };
}

export function monthChartLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return formatDateTime(new Date(y, m - 1, 1), { month: 'short', year: 'numeric' });
}

export function dayChartLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return formatDateTime(new Date(y, m - 1, d), { month: 'short', day: 'numeric' });
}

export function chartBucketLabel(key: string, granularity: ChartRange['granularity']) {
  return granularity === 'day' ? dayChartLabel(key) : monthChartLabel(key);
}

export function chartBucketKey(date: Date, granularity: ChartRange['granularity']) {
  return granularity === 'day' ? dayKey(date) : monthKey(date);
}

/** Calendar from/to (YYYY-MM-DD) for one dashboard chart bucket, capped at chart end. */
export function resolveChartBucketDateRange(
  key: string,
  granularity: ChartRange['granularity'],
  chartLte: Date,
): { from: string; to: string } {
  if (granularity === 'day') {
    return { from: key, to: key };
  }
  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const from = `${key}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${key}-${String(lastDay).padStart(2, '0')}`;
  const chartEnd = dateStringInColombo(chartLte);
  const to = chartEnd >= from && chartEnd <= monthEnd ? chartEnd : monthEnd;
  return { from, to };
}
