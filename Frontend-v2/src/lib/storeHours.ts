/** Bing Chun Sri Lanka standard store hours (daily). */
export const STORE_OPEN_HOUR = 9;
export const STORE_CLOSE_HOUR = 23;

export const STORE_HOURS_LABEL = '9:00 AM – 11:00 PM';

export const OPERATING_HOURS = Array.from(
  { length: STORE_CLOSE_HOUR - STORE_OPEN_HOUR + 1 },
  (_, index) => STORE_OPEN_HOUR + index,
);

export function isOperatingHour(hour: number) {
  return hour >= STORE_OPEN_HOUR && hour <= STORE_CLOSE_HOUR;
}

export function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}
