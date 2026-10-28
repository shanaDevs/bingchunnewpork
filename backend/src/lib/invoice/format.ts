import type { SettlementPaymentMethod } from '@prisma/client';
import { formatDate } from '../datetime';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatCalendarDateLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return formatDate(new Date(Date.UTC(year, month - 1, day)), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Calendar bounds from stored UTC instants — avoids local TZ shifting period end by +1 day. */
export function formatSettlementPeriodLabel(from: Date, to: Date): string {
  const fromYmd = toDateStr(from);
  const toYmd = toDateStr(to);
  return fromYmd === toYmd
    ? formatCalendarDateLabel(fromYmd)
    : `${formatCalendarDateLabel(fromYmd)} – ${formatCalendarDateLabel(toYmd)}`;
}

export function formatAmountOnly(cents: number): string {
  return (cents / 100).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatLkr(cents: number): string {
  return `LKR ${formatAmountOnly(cents)}`;
}

/** Invoice amounts: `LKR 28,080.00` or `- LKR 2,312.80` for negatives. */
export function formatInvoiceLkr(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const formatted = (abs / 100).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `- LKR ${formatted}` : `LKR ${formatted}`;
}

/** Header date: September 16, 2026 */
export function formatInvoiceDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Statement period: Aug 29, 2026 – Sep 12, 2026 */
export function formatInvoicePeriodLabel(from: Date, to: Date): string {
  const fmt = (d: Date): string => {
    const ymd = toDateStr(d);
    const [year, month, day] = ymd.split('-').map(Number);
    if (!year || !month || !day) return ymd;
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  const fromLabel = fmt(from);
  const toLabel = fmt(to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
}

export function formatMinus(cents: number): string {
  if (cents <= 0) return formatAmountOnly(0);
  return `- ${formatAmountOnly(cents)}`;
}

export function formatPlus(cents: number): string {
  if (cents <= 0) return formatLkr(0);
  return `+ ${formatLkr(cents)}`;
}

export function paymentMethodLabel(method: SettlementPaymentMethod): string {
  if (method === 'BANK_TRANSFER') return 'Bank Transfer';
  if (method === 'CHECK') return 'Check';
  if (method === 'ONLINE') return 'Online';
  return 'Cash';
}

export function netTransferableEarningsLabel(asOf: Date): string {
  return `Net Transferable Earnings (calculated up to ${formatCalendarDateLabel(toDateStr(asOf))})`;
}

export function branchDisplayName(name: string): string {
  return name.replace(/^Bing Chun\s*[-–]\s*/i, '').trim() || name;
}
