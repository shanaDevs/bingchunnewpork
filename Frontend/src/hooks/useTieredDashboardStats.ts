import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import type { DateRange } from 'react-day-picker';
import type BranchAdminDashboard from '@/components/admin/BranchAdminDashboard';
import type SuperAdminDashboard from '@/components/admin/SuperAdminDashboard';
import { adminApiFetch } from '@/lib/adminApi';
import {
  buildDashboardStatsUrl,
  type DashboardPeriod,
  type DashboardStatsTier,
} from '@/components/admin/DashboardPeriodFilter';

type DashboardStatsPayload = NonNullable<ComponentProps<typeof BranchAdminDashboard>['stats']> &
  NonNullable<ComponentProps<typeof SuperAdminDashboard>['stats']>;

const SUPER_ADMIN_TIERS: DashboardStatsTier[] = ['summary', 'charts', 'charts-wallet', 'details'];

const DASHBOARD_QUERY_OPTS = {
  refetchInterval: 60_000,
  staleTime: 60_000,
};

type Options = {
  period: DashboardPeriod;
  customRange?: DateRange;
  periodQueryKey: (string | null)[];
  customReady: boolean;
  superMode: boolean;
  branchMode: boolean;
};

export function useTieredDashboardStats({
  period,
  customRange,
  periodQueryKey,
  customReady,
  superMode,
  branchMode,
}: Options) {
  const {
    data: branchStats,
    isLoading: branchStatsLoading,
    isFetching: branchStatsFetching,
    isError: statsError,
    refetch: refetchBranchStats,
  } = useQuery<DashboardStatsPayload>({
    queryKey: ['admin-stats', ...periodQueryKey],
    queryFn: () => adminApiFetch<DashboardStatsPayload>(buildDashboardStatsUrl(period, customRange)),
    ...DASHBOARD_QUERY_OPTS,
    enabled: customReady && !superMode,
    placeholderData: branchMode ? keepPreviousData : undefined,
  });

  const tierResults = useQueries({
    queries: SUPER_ADMIN_TIERS.map((tier) => ({
      queryKey: ['admin-dashboard', tier, ...periodQueryKey],
      queryFn: () =>
        adminApiFetch<Partial<DashboardStatsPayload>>(buildDashboardStatsUrl(period, customRange, tier)),
      ...DASHBOARD_QUERY_OPTS,
      enabled: customReady && superMode,
      placeholderData: keepPreviousData,
    })),
  });

  const [summary, charts, chartsWallet, details] = tierResults;

  const stats: DashboardStatsPayload | undefined = superMode
    ? {
        ...(summary.data ?? {}),
        ...(charts.data ?? {}),
        ...(chartsWallet.data ?? {}),
        ...(details.data ?? {}),
      }
    : branchStats;

  const isLoading = superMode ? summary.isLoading : branchStatsLoading;
  const isFetching = superMode
    ? tierResults.some((q) => q.isFetching)
    : branchStatsFetching;

  const refetch = () => {
    if (superMode) {
      for (const q of tierResults) {
        void q.refetch();
      }
      return;
    }
    void refetchBranchStats();
  };

  return {
    stats,
    isLoading,
    isFetching,
    statsError,
    refetch,
    summaryLoading: summary.isLoading && !summary.data,
    chartsLoading: charts.isLoading && !charts.data,
    walletChartsLoading:
      (chartsWallet.isLoading || chartsWallet.isPending) && !chartsWallet.data,
    detailsLoading: details.isLoading && !details.data,
  };
}
