'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import MonthPickerSelect, {
  currentMonthKey,
} from '@/components/admin/MonthPickerSelect';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import BranchContributionChart from '@/components/admin/wallet-analysis/BranchContributionChart';
import InflowOutflowTrendChart from '@/components/admin/wallet-analysis/InflowOutflowTrendChart';
import WalletFlowBreakdownChart, {
  DEFAULT_IN_COLORS,
  DEFAULT_OUT_COLORS,
} from '@/components/admin/wallet-analysis/WalletFlowBreakdownChart';
import {
  BranchContributionChartSkeleton,
  WalletFlowChartSkeleton,
  WalletTrendChartSkeleton,
} from '@/components/admin/wallet-analysis/WalletOverviewSkeletons';
import WalletTankCard from '@/components/admin/wallet-analysis/WalletTankCard';
import type {
  WalletAnalysisBranchOption,
  WalletAnalysisSnapshot,
} from '@/components/admin/wallet-analysis/walletAnalysisTypes';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { getApiBaseUrl } from '@/lib/apiBase';

async function fetchWalletAnalysis(
  monthKey: string,
  storeId: string | null,
): Promise<WalletAnalysisSnapshot> {
    const params = new URLSearchParams({ month: monthKey });
  if (storeId) params.set('storeId', storeId);
  const res = await fetch(`${getApiBaseUrl()}/admin/wallet/analysis?${params}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || 'Failed to load wallet analysis');
  }
  return (json.data ?? json) as WalletAnalysisSnapshot;
}

type Props = {
  branches: WalletAnalysisBranchOption[];
  /** When false, defer /admin/wallet/analysis until the wallet list has loaded. */
  walletListReady?: boolean;
};

const compactSelectClass =
  '[&_.input-field]:h-7 [&_.input-field]:min-h-7 [&_.input-field]:rounded-[10px] [&_.input-field]:py-0 [&_.input-field]:text-[11px]';

export default function WalletAnalysisSection({
  branches,
  walletListReady = true,
}: Props) {
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [branchId, setBranchId] = useState('');

  const storeId = branchId || null;
  const monthValid = /^\d{4}-\d{2}$/.test(monthKey);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['wallet-analysis', monthKey, storeId],
    queryFn: () => fetchWalletAnalysis(monthKey, storeId),
    enabled: monthValid && walletListReady,
    staleTime: 60_000,
    gcTime: 60_000,
  });

  const branchStores = useMemo(
    () =>
      [...branches]
        .sort((a, b) =>
          branchDisplayName(a.name).localeCompare(branchDisplayName(b.name)),
        )
        .map((branch) => ({ id: branch.storeId, name: branch.name })),
    [branches],
  );

  const analysisFilters = (
    <div className={`flex flex-wrap items-center justify-end gap-1.5 ${compactSelectClass}`}>
      {isFetching && !isLoading && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating
        </span>
      )}
      <MonthPickerSelect
        value={monthKey}
        onChange={setMonthKey}
        className="h-7 min-w-[8.25rem] rounded-[10px] text-[11px]"
        placeholder="Select month"
      />
      {branchStores.length > 0 && (
        <SearchableBranchSelect
          stores={branchStores}
          value={branchId || undefined}
          onChange={setBranchId}
          formatName={branchDisplayName}
          allowAll
          placeholder="All Branches"
          className="min-w-[8.25rem]"
        />
      )}
    </div>
  );

  return (
    <section className="space-y-3" aria-label="Wallet analysis">
      {isError ? (
        <div className="space-y-2">
          <div className="flex justify-end">{analysisFilters}</div>
          <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-4 py-6 text-center text-sm text-red-600 dark:text-red-300">
            {error instanceof Error ? error.message : 'Failed to load wallet analysis'}
          </div>
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-1 gap-3 lg:h-[260px] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch"
            aria-busy={isLoading && !data}
          >
            {isLoading && !data ? (
              <>
                <WalletTankCard loading balance={0} capacity={0} />
                <WalletTrendChartSkeleton headerRight={analysisFilters} />
              </>
            ) : data ? (
              <>
                <WalletTankCard
                  balance={data.tank.balance}
                  capacity={data.tank.capacity}
                  healthPercent={data.health.percent}
                />
                <InflowOutflowTrendChart data={data.trend} headerRight={analysisFilters} />
              </>
            ) : (
              <div className="flex justify-end lg:col-span-2">{analysisFilters}</div>
            )}
          </div>

          {isLoading && !data ? (
            <div
              className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:h-[240px] lg:grid-cols-3 lg:items-stretch"
              aria-busy
            >
              <BranchContributionChartSkeleton />
              <WalletFlowChartSkeleton
                title="Incoming to Wallet"
                subtitle="Sources adding funds to the wallet"
              />
              <WalletFlowChartSkeleton
                title="Outgoing from Wallet"
                subtitle="Expenses leaving the wallet"
              />
            </div>
          ) : data ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:h-[240px] lg:grid-cols-3 lg:items-stretch">
              <BranchContributionChart data={data.branchContribution} />
              <WalletFlowBreakdownChart
                title="Incoming to Wallet"
                subtitle="Sources adding funds to the wallet"
                data={data.incoming}
                colors={DEFAULT_IN_COLORS}
              />
              <WalletFlowBreakdownChart
                title="Outgoing from Wallet"
                subtitle="Expenses leaving the wallet"
                data={data.outgoing}
                colors={DEFAULT_OUT_COLORS}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
