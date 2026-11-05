/** Application timezone — Sri Lanka (UTC+5:30). */
export const APP_TIMEZONE = 'Asia/Colombo';

export const APP_LOCALE = 'en-LK';

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

/** Day of week in Colombo (0 = Sunday … 6 = Saturday). */
export function getColomboDayOfWeek(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
  }).format(now);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const index = days.indexOf(weekday);
  return index >= 0 ? index : now.getDay();
}

export const WEEKLY_RESET_DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function getWeeklyResetDayLabel(day: number): string {
  return WEEKLY_RESET_DAY_LABELS[day] ?? 'Unknown';
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

/** Add calendar days to a YYYY-MM-DD string (local calendar math). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Next occurrence of the configured weekly reset day in Colombo (includes today if it matches). */
export function getNextScheduledResetDate(weeklyResetDay: number | null, now = new Date()): string {
  const todayStr = todayDateString(now);
  if (weeklyResetDay == null) return todayStr;

  const todayDow = getColomboDayOfWeek(now);
  const daysUntil = (weeklyResetDay - todayDow + 7) % 7;
  return addDaysToDateString(todayStr, daysUntil);
}

/** Next calendar date for a weekday strictly after fromDate (same weekday → +7 days). */
export function getNextResetDateAfter(fromDateStr: string, dayOfWeek: number): string {
  const fromDow = getColomboDayOfWeek(new Date(`${fromDateStr}T12:00:00`));
  let daysUntil = (dayOfWeek - fromDow + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  return addDaysToDateString(fromDateStr, daysUntil);
}

export function formatDateWithWeekday(value: Date | string | number): string {
  return formatDateTime(value, {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Human-readable duration from minutes for display only (does not alter stored values). */
export function formatDurationMinutes(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value === 0) return '0 min';

  const totalMinutes = Math.round(value);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
