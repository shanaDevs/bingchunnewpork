/** UTC calendar date as YYYY-MM-DD (payout periods use UTC midnight boundaries). */

export function toUtcDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function dayAfterUtcDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return toUtcDateStr(d);
}

export function addDaysToUtcDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toUtcDateStr(d);
}

export function todayUtcDateStr(): string {
  return toUtcDateStr(new Date());
}
