'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  fetchPayoutPeriods,
  payoutPeriodsQueryKey,
} from '@/components/admin/BranchPayoutPeriodsSection';
import {
  aggregatePaidPayoutPeriodExpensesCents,
  type PayoutPeriodExpensesCents,
} from '@/components/admin/payoutPeriodRowAmounts';

export function usePaidPayoutPeriodExpenses(storeId?: string) {
  const apiBase = getApiBaseUrl();
  const { data, isPending, isFetching } = useQuery({
    queryKey: payoutPeriodsQueryKey(storeId),
    queryFn: () => fetchPayoutPeriods(apiBase, storeId),
    enabled: Boolean(storeId),
  });

  const expenses: PayoutPeriodExpensesCents | null = useMemo(
    () => (data ? aggregatePaidPayoutPeriodExpensesCents(data) : null),
    [data],
  );

  const loading = Boolean(storeId) && (isPending || (isFetching && data === undefined));

  return { expenses, loading };
}
