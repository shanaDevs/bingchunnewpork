import { resolvePayoutPeriodRowDisplayAmounts } from '@/components/admin/payoutPeriodRowAmounts';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import type { PayoutListTab, PayoutPeriodRow } from '@/components/admin/payoutPeriodTypes';

export function statusLabel(status: PayoutPeriodRow['status']): string {
  switch (status) {
    case 'PAID':
      return 'Paid';
    case 'PAYMENT_PENDING':
      return 'Payment pending';
    case 'IN_PROGRESS':
      return 'In progress';
    default:
      return 'Pending';
  }
}

export function statusBadgeClass(status: PayoutPeriodRow['status']): string {
  if (status === 'PAID') return 'admin-status-badge--green';
  return 'admin-status-badge--amber';
}

/** Filter period rows for pending vs completed payout summary tabs. */
export function rowMatchesPayoutListTab(row: PayoutPeriodRow, tab: PayoutListTab): boolean {
  if (tab === 'completed') {
    if (row.status === 'PAID') return true;
    if (row.withdrawal?.status === 'APPROVED') return true;
    return false;
  }
  if (row.status === 'PAID') return false;
  if (row.withdrawal?.status === 'APPROVED') return false;
  return true;
}

function previewPeriodTo(row: PayoutPeriodRow): string {
  const through = row.summaryThrough ?? row.periodTo;
  if (through < row.periodFrom) return row.periodFrom;
  return through;
}

export function resolveRowBaseDisplayAmounts(
  row: PayoutPeriodRow,
  previewByKey: Map<string, Record<string, unknown>>,
): PeriodPayoutCardAmounts {
  return resolvePayoutPeriodRowDisplayAmounts({
    amountCents: row.amountCents,
    breakdown: row.breakdown,
    periodFrom: row.periodFrom,
    periodTo: previewPeriodTo(row),
    netPreviewData: previewByKey.get(row.key) ?? null,
  });
}