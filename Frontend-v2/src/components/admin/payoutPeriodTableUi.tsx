'use client';

import type { ReactNode } from 'react';
import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatMoneyAmount } from '@/lib/receipt';
import { Skeleton } from '@/components/ui/skeleton';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import type { PayoutListTab, PayoutPeriodRow } from '@/components/admin/payoutPeriodTypes';

const AMOUNT_COLUMNS = [
  'Branch receives',
  'Customer convenience fee',
  'Net platform amount',
  'Delivery fee received',
] as const;

function previewPeriodTo(row: PayoutPeriodRow): string {
  const through = row.summaryThrough ?? row.periodTo;
  if (through < row.periodFrom) return row.periodFrom;
  return through;
}

export function formatPayoutPeriodCell(
  row: PayoutPeriodRow,
  _allPeriodRows?: PayoutPeriodRow[],
  _previewByKey?: Map<string, Record<string, unknown>>,
): ReactNode {
  if (row.status !== 'IN_PROGRESS') {
    return formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo);
  }
  const through = previewPeriodTo(row);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{formatBiweeklyPeriodLabel(row.periodFrom, through)}</span>
      <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
        15-day cycle closes {row.periodTo}
      </span>
    </span>
  );
}

export function formatAmountCell(value: number): string {
  return formatMoneyAmount(value);
}

export function branchPayoutSummaryMetaColumns(listTab: PayoutListTab): ('Status')[] {
  return listTab === 'pending' ? ['Status'] : [];
}

export function payoutSummaryTableMinWidthClass(listTab: PayoutListTab): string {
  return listTab === 'pending' ? 'min-w-[1100px]' : 'min-w-[1000px]';
}

export function PayoutPeriodTableHead({
  metaColumns,
}: {
  metaColumns: Array<'Status'>;
}) {
  const showStatus = metaColumns.includes('Status');
  return (
    <thead>
      <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        <th className="px-3 py-2.5 font-semibold">Payout period</th>
        <th className="px-3 py-2.5 font-semibold">Date</th>
        {AMOUNT_COLUMNS.map((label) => (
          <th key={label} className="px-3 py-2.5 text-right font-semibold">
            {label}
          </th>
        ))}
        {showStatus ? <th className="px-3 py-2.5 font-semibold">Status</th> : null}
        <th className="px-3 py-2.5 font-semibold">Payment</th>
        <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
      </tr>
    </thead>
  );
}

export function PayoutPeriodAmountCells({
  row: _row,
  amounts,
  previewLoading,
  needsPreview,
}: {
  row: PayoutPeriodRow;
  amounts: PeriodPayoutCardAmounts;
  previewLoading: boolean;
  needsPreview: boolean;
}) {
  const values = [
    amounts.branchReceives,
    amounts.orderConvenienceFeeLkr,
    amounts.commissionLkr,
    amounts.deliveryFee,
  ];

  return (
    <>
      {values.map((value, index) => (
        <td
          key={AMOUNT_COLUMNS[index]}
          className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]"
        >
          {needsPreview && previewLoading && index > 0 ? (
            <Skeleton className="ml-auto inline-block h-3.5 w-16 bg-[var(--color-navy-light)]/70" />
          ) : (
            formatAmountCell(value ?? 0)
          )}
        </td>
      ))}
    </>
  );
}