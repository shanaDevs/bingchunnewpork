/** Application timezone — Sri Lanka (UTC+5:30). */
export const APP_TIMEZONE = 'Asia/Colombo';

export const APP_LOCALE = 'en-LK';

/** Set Node process timezone before any date logic runs. */
export function configureAppTimezone(): void {
  process.env.TZ = APP_TIMEZONE;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return toDate(value).toLocaleString(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

export function formatDate(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatDateTime(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatTime(
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatDateTime(value, {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/** Calendar date in Colombo as YYYY-MM-DD. */
export function todayDateString(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now);
}

/** Calendar date in Colombo for an instant, as YYYY-MM-DD. */
export function dateStringInColombo(value: Date | string | number): string {
  return todayDateString(toDate(value));
}

export function assertReceivedAtIsToday(receivedAt: Date): void {
  if (dateStringInColombo(receivedAt) !== todayDateString()) {
    throw new Error('Received date must be today');
  }
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Day of week in Colombo (0 = Sunday … 6 = Saturday). */
export function getColomboDayOfWeek(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
  }).format(now);
  const index = WEEKDAY_NAMES.indexOf(weekday as (typeof WEEKDAY_NAMES)[number]);
  return index >= 0 ? index : now.getDay();
}

export function getWeeklyResetDayLabel(day: number): string {
  return WEEKDAY_NAMES[day] ?? 'Unknown';
}

/** Hour and minute in Colombo (24h). */
export function getColomboHourMinute(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

export function parseClockTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 23 * 60;
  return hours * 60 + minutes;
}

/** Parse YYYY-MM-DD query param; optionally snap to end of local calendar day. */
export function parseDateQuery(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
}

export function todayDateRange(now = new Date()): { from: Date; to: Date } {
  const today = todayDateString(now);
  return {
    from: parseDateQuery(today)!,
    to: parseDateQuery(today, true)!,
  };
}

/**
 * Re-offer a past-day unclaimed job on today's calendar (Colombo), keeping the
 * original local time-of-day when that instant is still in the future today.
 */
export function rescheduleMissedJobToToday(priorScheduledAt: Date, now = new Date()): Date {
  const { from: todayStart, to: todayEnd } = todayDateRange(now);
  if (priorScheduledAt >= todayStart) return priorScheduledAt;

  const { hour, minute } = getColomboHourMinute(priorScheduledAt);
  const candidate = new Date(todayStart);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() < now.getTime()) return now;
  if (candidate > todayEnd) return now;
  return candidate;
}
