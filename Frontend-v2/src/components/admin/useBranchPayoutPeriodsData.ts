import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { PeriodPayoutCardAmounts } from '@/components/admin/periodPayoutSplitDisplay';
import {
  applyFirstCycleTableDisplayMask,
  readPayoutCycleStage,
  shouldHideFirstCyclePlatformColumns,
} from '@/components/admin/payoutPeriodRowCycleDisplay';
import {
  fetchPayoutPeriodNetPreview,
  payoutPeriodRowNeedsLiveNetPreview,
} from '@/components/admin/payoutPeriodRowAmounts';
import { fetchPayoutPeriods, payoutPeriodsQueryKey } from '@/components/admin/payoutPeriodsApi';
import {
  isCompletedPayout,
  previewPeriodTo,
  resolveRowBaseDisplayAmounts,
  sortPayoutPeriodRows,
} from '@/components/admin/payoutPeriodRowModel';
import type { PayoutListTab, PayoutPeriodSort } from '@/components/admin/payoutPeriodTypes';

type Params = {
  apiBase: string;
  storeId?: string;
  periodSort: PayoutPeriodSort;
  focusOldestPending: boolean;
  listTab: PayoutListTab;
};

export function useBranchPayoutPeriodsData({
  apiBase,
  storeId,
  periodSort,
  focusOldestPending,
  listTab,
}: Params) {
  const {
    data: payoutPeriodsData,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: payoutPeriodsQueryKey(storeId),
    queryFn: () => fetchPayoutPeriods(apiBase, storeId),
    enabled: Boolean(storeId),
  });

  const rows = payoutPeriodsData ?? [];
  const periodsLoading =
    !storeId || isPending || (isFetching && payoutPeriodsData === undefined);

  const rowsNeedingPreview = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.periodFrom &&
          previewPeriodTo(row) &&
          payoutPeriodRowNeedsLiveNetPreview(row.breakdown),
      ),
    [rows],
  );

  const previewQueries = useQueries({
    queries: rowsNeedingPreview.map((row) => ({
      queryKey: [
        'payout-period-net-preview',
        storeId,
        row.periodFrom,
        previewPeriodTo(row),
      ] as const,
      queryFn: () =>
        fetchPayoutPeriodNetPreview(apiBase, storeId!, row.periodFrom, previewPeriodTo(row)),
      enabled: Boolean(storeId),
      staleTime: 45_000,
    })),
  });

  const previewByKey = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    rowsNeedingPreview.forEach((row, index) => {
      const data = previewQueries[index]?.data;
      if (data) map.set(row.key, data);
    });
    return map;
  }, [rowsNeedingPreview, previewQueries]);

  const previewLoadingByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    rowsNeedingPreview.forEach((row, index) => {
      map.set(row.key, previewQueries[index]?.isLoading ?? false);
    });
    return map;
  }, [rowsNeedingPreview, previewQueries]);

  const displayRows = useMemo(
    () => sortPayoutPeriodRows(rows, focusOldestPending ? 'oldest' : periodSort),
    [rows, periodSort, focusOldestPending],
  );

  const tabRows = useMemo(
    () =>
      displayRows.filter((row) =>
        listTab === 'completed' ? isCompletedPayout(row.status) : !isCompletedPayout(row.status),
      ),
    [displayRows, listTab],
  );

  const displayAmountsByKey = useMemo(() => {
    const baseByKey = new Map<string, PeriodPayoutCardAmounts>();
    for (const row of rows) {
      baseByKey.set(row.key, resolveRowBaseDisplayAmounts(row, previewByKey));
    }

    const displayByKey = new Map<string, PeriodPayoutCardAmounts>();
    for (const row of rows) {
      const windowAmounts = baseByKey.get(row.key)!;
      const stage = readPayoutCycleStage(row.breakdown, previewByKey.get(row.key));
      if (shouldHideFirstCyclePlatformColumns(stage, rows, row, windowAmounts)) {
        displayByKey.set(row.key, applyFirstCycleTableDisplayMask(windowAmounts));
      } else {
        displayByKey.set(row.key, windowAmounts);
      }
    }
    return displayByKey;
  }, [rows, previewByKey]);

  const oldestPending = useMemo(
    () => (focusOldestPending ? displayRows.find((row) => row.status === 'PENDING') ?? null : null),
    [displayRows, focusOldestPending],
  );

  return {
    rows,
    periodsLoading,
    previewByKey,
    previewLoadingByKey,
    displayRows,
    tabRows,
    displayAmountsByKey,
    oldestPending,
    refetch,
  };
}
