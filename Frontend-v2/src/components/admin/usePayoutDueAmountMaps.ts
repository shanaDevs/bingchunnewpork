import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  fetchPayoutPeriodNetPreview,
  payoutPeriodRowNeedsLiveNetPreview,
  resolvePayoutPeriodRowDisplayAmounts,
} from '@/components/admin/payoutPeriodRowAmounts';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import {
  applyFirstCycleTableDisplayMask,
  readPayoutCycleStage,
  shouldHideFirstCyclePlatformColumns,
} from '@/components/admin/payoutPeriodRowCycleDisplay';
import type { PayoutDueRow } from '@/components/admin/payoutDueTypes';

export function payoutDueRowKey(row: PayoutDueRow) {
  return `${row.storeId}-${row.periodFrom}-${row.periodTo}`;
}

function resolveDueRowBaseAmounts(
  row: PayoutDueRow,
  previewByKey: Map<string, Record<string, unknown>>,
): PeriodPayoutCardAmounts {
  const preview = previewByKey.get(payoutDueRowKey(row));
  return resolvePayoutPeriodRowDisplayAmounts({
    amountCents: row.netAmountCents,
    breakdown: row.breakdown,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    netPreviewData: preview,
  });
}

export function usePayoutDueAmountMaps(
  rows: PayoutDueRow[],
  pageRows: PayoutDueRow[],
  apiBase: string,
) {
  const rowsNeedingPreview = useMemo(
    () => pageRows.filter((row) => payoutPeriodRowNeedsLiveNetPreview(row.breakdown)),
    [pageRows],
  );

  const previewQueries = useQueries({
    queries: rowsNeedingPreview.map((row) => ({
      queryKey: ['payout-due-net-preview', row.storeId, row.periodFrom, row.periodTo] as const,
      queryFn: () => fetchPayoutPeriodNetPreview(apiBase, row.storeId, row.periodFrom, row.periodTo),
      staleTime: 45_000,
    })),
  });

  const { previewByKey, previewLoadingByKey } = useMemo(() => {
    const previewByKey = new Map<string, Record<string, unknown>>();
    const previewLoadingByKey = new Map<string, boolean>();

    rowsNeedingPreview.forEach((row, index) => {
      const key = payoutDueRowKey(row);
      const query = previewQueries[index];
      const data = query?.data;
      if (data) previewByKey.set(key, data);
      previewLoadingByKey.set(key, Boolean(query?.isLoading || query?.isFetching));
    });

    return { previewByKey, previewLoadingByKey };
  }, [previewQueries, rowsNeedingPreview]);

  const displayAmountsByDueKey = useMemo(() => {
    const baseByKey = new Map<string, PeriodPayoutCardAmounts>();
    for (const row of rows) {
      baseByKey.set(payoutDueRowKey(row), resolveDueRowBaseAmounts(row, previewByKey));
    }

    const displayByKey = new Map<string, PeriodPayoutCardAmounts>();
    for (const row of rows) {
      const key = payoutDueRowKey(row);
      const windowAmounts = baseByKey.get(key)!;
      const stage = readPayoutCycleStage(row.breakdown, previewByKey.get(key));
      if (shouldHideFirstCyclePlatformColumns(stage, rows, row, windowAmounts)) {
        displayByKey.set(key, applyFirstCycleTableDisplayMask(windowAmounts));
      } else {
        displayByKey.set(key, windowAmounts);
      }
    }
    return displayByKey;
  }, [rows, previewByKey]);

  return {
    displayAmountsByDueKey,
    previewByKey,
    previewLoadingByKey,
    resolveDueRowBaseAmounts: (row: PayoutDueRow) => resolveDueRowBaseAmounts(row, previewByKey),
  };
}
