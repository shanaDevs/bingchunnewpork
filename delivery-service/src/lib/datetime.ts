/** Application timezone — Sri Lanka (UTC+5:30). */
export const APP_TIMEZONE = 'Asia/Colombo';

/** Calendar date in Colombo as YYYY-MM-DD. */
export function todayDateString(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now);
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Calendar date in Colombo for an instant, as YYYY-MM-DD. */
export function dateStringInColombo(value: Date | string | number): string {
  return todayDateString(toDate(value));
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
