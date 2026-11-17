'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { getApiBaseUrl } from '@/lib/apiBase';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTieredDashboardStats } from '@/hooks/useTieredDashboardStats';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RefreshCw, BarChart2 } from 'lucide-react';
import {
  adminRoleLabel,
  isBranchScoped,
  isCashier,
  isPickupOnlyBranchAdmin,
  isSuperAdmin,
  type AdminSession,
} from '@/lib/adminAuth';
import BranchAdminDashboard from '@/components/admin/BranchAdminDashboard';
import SuperAdminDashboard from '@/components/admin/SuperAdminDashboard';
import DashboardPeriodFilter, {
  buildBranchAnalyticsUrl,
  buildDashboardStatsUrl,
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import type { DateRange } from 'react-day-picker';
import { shortBranchName } from '@/lib/branchName';
import { buildBrandAnalyticsUrl } from '@/lib/brandSalesReportApi';

type Period = Exclude<DashboardPeriod, 'custom'>;

function adminApi<T>(endpoint: string): Promise<T> {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    return d.data ?? d ?? null;
  });
}

function fetchCompletedRefundCount(
  period: DashboardPeriod,
  customRange?: DateRange,
): Promise<number> {
  const { startDate, endDate } = orderDateRange(period, customRange);
  const params = new URLSearchParams({ status: 'COMPLETE', page: '1', limit: '1' });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
    return fetch(`${getApiBaseUrl()}/refunds?${params.toString()}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Request failed');
    const total = d.meta?.total;
    if (typeof total !== 'number') throw new Error('Missing refund count');
    return total;
  });
}

function branchDisplayName(storeName?: string | null) {
  if (!storeName) return null;
  return shortBranchName(storeName);
}

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function dashboardWelcome(admin: AdminSession | null, superMode: boolean) {
  const role = adminRoleLabel(admin?.role);
  if (superMode) return `${timeOfDayGreeting()}, ${role}!`;
  if (isBranchScoped(admin)) {
    const branch = branchDisplayName(admin?.storeName);
    if (branch) return `Welcome ${role}, ${branch}`;
  }
  return `Welcome ${role}`;
}

function dashboardSubtitle(superMode: boolean, period: DashboardPeriod) {
  if (!superMode) return null;
  if (period === 'today') return "Here's what's happening across all branches today.";
  if (period === 'year') return "Here's what's happening across all branches this year.";
  if (period === 'custom') return "Here's what's happening across all branches for the selected range.";
  return "Here's what's happening across all branches this month.";
}

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  useEffect(() => {
    const raw = localStorage.getItem('bc_admin');
    if (raw) setAdmin(JSON.parse(raw));
  }, []);

  const branchMode = isBranchScoped(admin);
  const superMode = isSuperAdmin(admin);
  const cashierMode = isCashier(admin);
  const pickupOnly = isPickupOnlyBranchAdmin(admin);

  const customReady = period !== 'custom' || !!(customRange?.from && customRange?.to);

  const periodQueryKey = [
    period,
    customRange?.from?.toISOString() ?? null,
    customRange?.to?.toISOString() ?? null,
  ];

  const {
    stats,
    isLoading,
    isFetching,
    statsError,
    refetch,
    summaryLoading,
    chartsLoading,
    walletChartsLoading,
    detailsLoading,
  } = useTieredDashboardStats({
    period,
    customRange,
    periodQueryKey,
    customReady,
    superMode,
    branchMode,
  });
  const { data: brandOverview, isLoading: brandLoading } = useQuery<{
    branchPerformance?: Array<{
      branchName: string;
      grossSales: number;
      totalOrders?: number;
      tier?: string;
      deliveryEnabled?: boolean;
    }>;
    orderSummaryByBranch?: Array<{
      label: string;
      delivery: number;
      pickupCash: number;
      pickupOnline: number;
      pickupCard: number;
      orderCount?: number;
      grossSales?: number;
    }>;
    branchDeliveryPickup?: Array<{
      storeId: string;
      branchName: string;
      delivery: number;
      pickup: number;
    }>;
    stores?: Array<{ id: string; name: string; deliveryEnabled?: boolean; tier?: string }>;
  }>({
    queryKey: [
      'brand-analytics',
      period,
      customRange?.from?.toISOString() ?? null,
      customRange?.to?.toISOString() ?? null,
    ],
    queryFn: () => adminApi(buildBrandAnalyticsUrl(period, customRange)),
    enabled: superMode && customReady,
    refetchInterval: 60000,
    staleTime: 60000,
  });
  const {
    data: branchAnalytics,
    isError: branchAnalyticsError,
    isFetching: branchAnalyticsFetching,
    refetch: refetchBranchAnalytics,
  } = useQuery<{
    paymentChannelBreakdown?: {
      pickupCashCount: number;
      pickupCardCount: number;
      pickupOnlineCount: number;
      deliveryOnlineCount: number;
    };
    topCustomers?: Array<{
      rank: number;
      name: string;
      phone?: string;
      email?: string;
      orders: number;
      totalSpend: number;
    }>;
    outflowByMethod?: Array<{ key: string; label: string; amount: number }>;
    refundByMonth?: Array<{ month: string; count: number; amountLkr: number }>;
    discountsByMonth?: Array<{ month: string; totalDiscount: number }>;
  }>({
    queryKey: [
      'branch-analytics-dashboard',
      period,
      customRange?.from?.toISOString() ?? null,
      customRange?.to?.toISOString() ?? null,
    ],
    queryFn: () => adminApi(buildBranchAnalyticsUrl(period, customRange)),
    enabled: branchMode && !cashierMode && customReady,
    refetchInterval: 60000,
    staleTime: 60000,
    retry: 1,
    placeholderData: keepPreviousData,
  });
  const {
    data: refundCompletedCount,
    isError: refundCompletedError,
    isFetching: refundCompletedFetching,
    refetch: refetchRefundCompleted,
  } = useQuery<number>({
    queryKey: [
      'branch-refund-completed-count',
      period,
      customRange?.from?.toISOString() ?? null,
      customRange?.to?.toISOString() ?? null,
    ],
    queryFn: () => fetchCompletedRefundCount(period, customRange),
    enabled: branchMode && !cashierMode && customReady,
    refetchInterval: 60000,
    staleTime: 60000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  const handlePresetPeriod = (next: Period) => {
    setPeriod(next);
    setCustomRange(undefined);
  };

  const handleCustomRangeChange = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setPeriod('custom');
    }
  };

  const periodLabel = formatDashboardPeriodLabel(period, customRange);
  const refreshBusy = superMode
    ? isFetching
    : isFetching || branchAnalyticsFetching || refundCompletedFetching;
  const analyticsEnabled = branchMode && !cashierMode && customReady;

  const subtitle = dashboardSubtitle(superMode, period);

  return (
    <div className={`admin-dashboard mx-auto max-w-[1400px]${superMode ? ' admin-dashboard--super' : ''}`}>
      <div className="admin-dashboard__header mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-fg sm:text-[1.65rem]">
            {dashboardWelcome(admin, superMode)}
          </h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={handlePresetPeriod}
            onCustomRangeChange={handleCustomRangeChange}
            compact={superMode}
          />
          <button
            type="button"
            onClick={() => {
              void refetch();
              if (branchMode && !cashierMode) {
                void refetchBranchAnalytics();
                void refetchRefundCompleted();
              }
            }}
            disabled={refreshBusy}
            className="btn-outline flex items-center gap-1.5 px-3 py-2 text-sm"
          >
            <RefreshCw size={14} className={refreshBusy ? 'animate-spin' : ''} />
            Refresh
          </button>
          {superMode && (
            <Link href="/admin/reports" className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-sm">
              <BarChart2 size={14} /> Full Report
            </Link>
          )}
        </div>
      </div>

      {superMode ? (
        <SuperAdminDashboard
          stats={stats ?? null}
          brandOverview={brandOverview}
          period={period}
          customRange={customRange}
          periodLabel={periodLabel}
          summaryLoading={summaryLoading}
          chartsLoading={chartsLoading}
          walletChartsLoading={walletChartsLoading}
          detailsLoading={detailsLoading}
          brandLoading={brandLoading}
        />
      ) : (
        <BranchAdminDashboard
          stats={stats ?? null}
          loading={!stats && isLoading && !statsError}
          updating={Boolean(stats) && refreshBusy}
          periodLabel={periodLabel}
          pickupOnly={pickupOnly}
          cashierMode={cashierMode}
          branchAnalytics={branchAnalytics}
          branchAnalyticsReady={Boolean(branchAnalytics) && !branchAnalyticsError}
          branchAnalyticsLoading={analyticsEnabled && !branchAnalytics && !branchAnalyticsError}
          refundCompletedCount={refundCompletedError ? undefined : refundCompletedCount}
          refundCompletedLoading={
            analyticsEnabled && refundCompletedCount === undefined && !refundCompletedError
          }
        />
      )}
    </div>
  );
}
