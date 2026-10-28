import type { WithdrawalBreakdown } from '@/components/admin/settlementTypes';

/** Convert wallet cents to LKR; returns 0 for invalid input. */
export function centsToLkr(cents: number | null | undefined): number {
  const n = Number(cents);
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Normalize ISO timestamps to `YYYY-MM-DD` for date inputs. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

/** Platform discount payback is active when the snapshot records a payback total. */
export function paybackEnabledFromBreakdown(b: WithdrawalBreakdown | null): boolean {
  if (!b) return false;
  return (b.platformPaybackTotal ?? 0) > 0;
}

export function valuesDifferByMoreThan(
  live: number | null | undefined,
  stored: number | null | undefined,
  threshold = 1,
): boolean {
  if (live == null || stored == null) return false;
  return Math.abs(live - stored) > threshold;
}

export function formatPayoutPaymentMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Bank Transfer';
    case 'CASH':
      return 'Cash';
    case 'CHECK':
      return 'Check';
    default:
      return method?.trim() || '—';
  }
}
