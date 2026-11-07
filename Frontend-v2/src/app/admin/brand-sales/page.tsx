'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { Download } from 'lucide-react';

import { type TierSummary } from '@/components/admin/BranchTierBanner';
import { BrandSalesPageShellSkeleton } from '@/components/admin/brand-sales/BrandSalesDashboardSkeleton';
import BrandSalesOverviewHero from '@/components/admin/BrandSalesOverviewHero';
import BrandSalesTabPanel, { type BrandAnalyticsPayload } from '@/components/admin/BrandSalesTabPanel';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import {
  adminFetch,
  buildBrandAnalyticsUrl,
  buildBrandBranchPerformanceUrl,
  buildTierAnalyticsUrl,
} from '@/lib/brandSalesReportApi';

type BrandTab = 'overview' | 'top' | 'standard';

const TABS: Array<{ id: BrandTab; label: string; countKey?: 'top' | 'standard' }> = [
  { id: 'overview', label: 'All Branches Overview' },
  { id: 'top', label: 'Delivery & Pickup', countKey: 'top' },
  { id: 'standard', label: 'Pickup Only', countKey: 'standard' },
];

export default function BrandSalesPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [activeTab, setActiveTab] = useState<BrandTab>('overview');
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [branchPeriod, setBranchPeriod] = useState<DashboardPeriod>('month');
  const [branchCustomRange, setBranchCustomRange] = useState<DateRange | undefined>();
  const [peakStoreId, setPeakStoreId] = useState('');

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin');
      return;
    }
    setAdmin(session);
  }, [router]);

  const customReady = period !== 'custom' || !!(customRange?.from && customRange?.to);
  const periodLabel = formatDashboardPeriodLabel(period, customRange);
  const branchCustomReady =
    branchPeriod !== 'custom' || !!(branchCustomRange?.from && branchCustomRange?.to);

  const { data: overviewData, isLoading } = useQuery<BrandAnalyticsPayload & { tierSummary?: TierSummary }>({
    queryKey: ['brand-analytics', period, customRange?.from?.toISOString(), customRange?.to?.toISOString(), peakStoreId || null],
    queryFn: () => adminFetch(buildBrandAnalyticsUrl(period, customRange, peakStoreId || undefined)),
    enabled: !!admin && customReady,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const { data: topTierData, isLoading: topLoading } = useQuery<BrandAnalyticsPayload>({
    queryKey: ['branch-tier-analytics', 'top', period, customRange?.from?.toISOString(), customRange?.to?.toISOString(), peakStoreId || null],
    queryFn: () => adminFetch(buildTierAnalyticsUrl('top', period, customRange, peakStoreId || undefined)),
    enabled: !!admin && customReady && activeTab === 'top',
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const { data: standardTierData, isLoading: standardLoading } = useQuery<BrandAnalyticsPayload>({
    queryKey: ['branch-tier-analytics', 'standard', period, customRange?.from?.toISOString(), customRange?.to?.toISOString(), peakStoreId || null],
    queryFn: () => adminFetch(buildTierAnalyticsUrl('standard', period, customRange, peakStoreId || undefined)),
    enabled: !!admin && customReady && activeTab === 'standard',
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const { data: branchData, isLoading: branchLoading } = useQuery<{
    branchPerformance: BrandAnalyticsPayload['branchPerformance'];
    leastPerformingBranches: BrandAnalyticsPayload['leastPerformingBranches'];
  }>({
    queryKey: ['brand-branch-performance', branchPeriod, branchCustomRange?.from?.toISOString(), branchCustomRange?.to?.toISOString()],
    queryFn: () => adminFetch(buildBrandBranchPerformanceUrl(branchPeriod, branchCustomRange)),
    enabled: !!admin && branchCustomReady && activeTab === 'overview',
    refetchInterval: 60_000,
  });

  const tierCounts = useMemo(() => {
    const stores = overviewData?.stores ?? [];
    return {
      top: stores.filter((s) => s.deliveryEnabled || s.tier === 'top').length,
      standard: stores.filter((s) => !s.deliveryEnabled && s.tier !== 'top').length,
    };
  }, [overviewData?.stores]);

  function exportSummary() {
    if (!overviewData?.branchPerformance) return;
    const rows = [
      ['Branch', 'Tier', 'Orders', 'Gross Sales', 'Growth %'],
      ...overviewData.branchPerformance.map((row) => [
        row.branchName,
        row.tier ?? '',
        row.totalOrders,
        row.grossSales,
        row.growthPercent ?? 0,
      ]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brand-sales-${period}.csv`;
    a.click();
  }

  if (!admin) {
    return <BrandSalesPageShellSkeleton />;
  }

  const overviewLoading = isLoading && !overviewData;
  const activeTierData =
    activeTab === 'top' ? topTierData : activeTab === 'standard' ? standardTierData : overviewData;
  const activeLoading =
    activeTab === 'top'
      ? topLoading && !topTierData
      : activeTab === 'standard'
        ? standardLoading && !standardTierData
        : overviewLoading;

  const activeBranchRows =
    activeTab === 'overview'
      ? branchData?.branchPerformance ?? overviewData?.branchPerformance ?? []
      : activeTierData?.branchPerformance ?? [];

  const activeBranchLoading =
    activeTab === 'overview'
      ? branchLoading && activeBranchRows.length === 0
      : activeLoading;

  return (
    <div className="admin-dashboard mx-auto max-w-[1680px] space-y-3 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-bold text-fg">Brand — Sales Command Center</h1>
          <p className="mt-0.5 text-xs text-muted">
            Cross-branch performance · delivery tiers · {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={setCustomRange}
            compact
          />
          <button
            type="button"
            onClick={exportSummary}
            disabled={!overviewData}
            className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      <BrandSalesOverviewHero
        data={activeTab === 'overview' ? overviewData : activeTierData}
        overviewData={overviewData}
        loading={activeLoading}
        overviewLoading={overviewLoading}
      />

      <div className="flex flex-wrap gap-1 border-b border-[#e2e8f0]">
        {TABS.map((tab) => {
          const count =
            tab.countKey === 'top'
              ? tierCounts.top
              : tab.countKey === 'standard'
                ? tierCounts.standard
                : null;
          const label = count != null ? `${tab.label} (${count})` : tab.label;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'border-[#307ef2] text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <BrandSalesTabPanel
          tier="all"
          data={overviewData}
          loading={overviewLoading}
          period={period}
          customRange={customRange}
          periodLabel={periodLabel}
          branchPeriod={branchPeriod}
          branchCustomRange={branchCustomRange}
          onBranchPeriodChange={setBranchPeriod}
          onBranchCustomRangeChange={setBranchCustomRange}
          branchRows={activeBranchRows}
          branchLoading={activeBranchLoading}
          leastPerforming={branchData?.leastPerformingBranches ?? overviewData?.leastPerformingBranches}
          peakStoreId={peakStoreId}
          onPeakStoreChange={setPeakStoreId}
          showHourlyPeak
          showTopCustomers
        />
      )}

      {activeTab === 'top' && (
        <BrandSalesTabPanel
          tier="top"
          data={topTierData ?? undefined}
          loading={activeLoading}
          period={period}
          customRange={customRange}
          periodLabel={periodLabel}
          branchPeriod={period}
          branchCustomRange={customRange}
          onBranchPeriodChange={setPeriod}
          onBranchCustomRangeChange={setCustomRange}
          branchRows={activeBranchRows}
          branchLoading={activeBranchLoading}
          peakStoreId={peakStoreId}
          onPeakStoreChange={setPeakStoreId}
          showScorecards
        />
      )}

      {activeTab === 'standard' && (
        <BrandSalesTabPanel
          tier="standard"
          data={standardTierData ?? undefined}
          loading={activeLoading}
          period={period}
          customRange={customRange}
          periodLabel={periodLabel}
          branchPeriod={period}
          branchCustomRange={customRange}
          onBranchPeriodChange={setPeriod}
          onBranchCustomRangeChange={setCustomRange}
          branchRows={activeBranchRows}
          branchLoading={activeBranchLoading}
          peakStoreId={peakStoreId}
          onPeakStoreChange={setPeakStoreId}
        />
      )}
    </div>
  );
}
