'use client';

import { formatBiweeklyPeriodLabel } from '@/lib/biweeklyPeriods';
import { formatMoneyAmount } from '@/lib/receipt';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import { readPayoutCycleStage } from '@/components/admin/payoutPeriodRowCycleDisplay';
import {
  resolveSecondCycleFullDisplayRange,
  secondCycleFullDisplayRangeFallback,
} from '@/components/admin/payoutSecondCycleDisplayRange';
import {
  PAYOUT_PERIOD_AMOUNT_COLUMNS,
  type PayoutListTab,
  type PayoutPeriodRow,
} from '@/components/admin/payoutPeriodTypes';
import { previewPeriodTo, rowBreakdownForStage } from '@/components/admin/payoutPeriodRowModel';
import { Skeleton } from '@/components/ui/skeleton';

export function formatAmountCell(value: number | null) {
  if (value == null) return '—';
  return formatMoneyAmount(value);
}

export function formatPayoutPeriodCell(
  row: PayoutPeriodRow,
  allRows: PayoutPeriodRow[],
  netPreviewByKey: Map<string, Record<string, unknown>>,
) {
  if (row.status === 'IN_PROGRESS') {
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

  const stage = readPayoutCycleStage(rowBreakdownForStage(row), netPreviewByKey.get(row.key));
  if (stage === 'SECOND') {
    const resolved =
      resolveSecondCycleFullDisplayRange(allRows, row) ?? secondCycleFullDisplayRangeFallback(row);
    return formatBiweeklyPeriodLabel(resolved.displayFrom, resolved.displayTo);
  }

  return formatBiweeklyPeriodLabel(row.periodFrom, row.periodTo);
}

export type PayoutSummaryMetaColumn = 'Status' | 'Payment' | 'Remarks' | 'Reject Reason';

const PAYOUT_SUMMARY_META_SKELETON_WIDTH: Record<PayoutSummaryMetaColumn, string> = {
  Status: 'w-16',
  Payment: 'w-24',
  Remarks: 'w-20',
  'Reject Reason': 'w-24',
};

/** Branch admin Payout Summary — hide remarks/reject reason; hide status on completed tab. */
export function branchPayoutSummaryMetaColumns(
  listTab: PayoutListTab,
): readonly PayoutSummaryMetaColumn[] {
  return listTab === 'completed' ? ['Payment'] : ['Status', 'Payment'];
}

export function payoutSummaryTableMinWidthClass(listTab: PayoutListTab) {
  return listTab === 'completed' ? 'min-w-[1080px]' : 'min-w-[1140px]';
}

export function PayoutPeriodsTableSkeleton({ listTab }: { listTab: PayoutListTab }) {
  const metaColumns = branchPayoutSummaryMetaColumns(listTab);
  return (
    <div className="overflow-x-auto" aria-hidden>
      <table
        className={`w-full ${payoutSummaryTableMinWidthClass(listTab)} text-left text-xs`}
      >
        <PayoutPeriodTableHead metaColumns={metaColumns} />
        <tbody>
          {Array.from({ length: 5 }).map((_, row) => (
            <tr key={row} className="border-b border-[var(--color-navy-border)]/70 last:border-b-0">
              <td className="px-3 py-3">
                <Skeleton className="h-3.5 w-44 bg-[var(--color-navy-light)]/70" />
              </td>
              <td className="px-3 py-3">
                <Skeleton className="h-3.5 w-20 bg-[var(--color-navy-light)]/70" />
              </td>
              {PAYOUT_PERIOD_AMOUNT_COLUMNS.map((label) => (
                <td key={label} className="px-3 py-3 text-right">
                  <Skeleton className="ml-auto h-3.5 w-20 bg-[var(--color-navy-light)]/70" />
                </td>
              ))}
              {metaColumns.map((label) => (
                <td key={label} className="px-3 py-3">
                  <Skeleton
                    className={`h-5 ${PAYOUT_SUMMARY_META_SKELETON_WIDTH[label]} rounded-full bg-[var(--color-navy-light)]/70`}
                  />
                </td>
              ))}
              <td className="px-3 py-3 text-right">
                <Skeleton className="ml-auto h-7 w-14 rounded-lg bg-[var(--color-navy-light)]/70" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PayoutPeriodAmountCells({
  row,
  amounts,
  previewLoading,
  needsPreview,
}: {
  row: PayoutPeriodRow;
  amounts: PeriodPayoutCardAmounts;
  previewLoading: boolean;
  needsPreview: boolean;
}) {
  const feeColumnsLoading = needsPreview && previewLoading;

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
          key={PAYOUT_PERIOD_AMOUNT_COLUMNS[index]}
          className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--color-text)]"
        >
          {feeColumnsLoading && index > 0 ? (
            <Skeleton className="ml-auto inline-block h-3.5 w-16 bg-[var(--color-navy-light)]/70" />
          ) : (
            formatAmountCell(value)
          )}
        </td>
      ))}
    </>
  );
}

export function PayoutPeriodTableHead({
  metaColumns,
}: {
  metaColumns: readonly PayoutSummaryMetaColumn[];
}) {
  return (
    <thead>
      <tr className="border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Payout Period</th>
        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Date</th>
        {PAYOUT_PERIOD_AMOUNT_COLUMNS.map((label) => (
          <th key={label} className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
            {label}
          </th>
        ))}
        {metaColumns.map((label) => (
          <th key={label} className="whitespace-nowrap px-3 py-2.5 font-semibold">
            {label}
          </th>
        ))}
        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Action</th>
      </tr>
    </thead>
  );
}
