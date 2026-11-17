'use client';

import { adminAuthHeaders } from '@/lib/adminSession';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  Package,
  Timer,
  Truck,
  Wallet,
  Wifi,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { adminBadgeClass, DELIVERY_JOB_STATUS_LABEL, type AdminBadgeVariant } from '@/lib/adminBadges';
import { getAdminSession, isDeliveryAdmin, isSuperAdmin } from '@/lib/adminAuth';
import { hasMenuReadAccess } from '@/lib/adminPermissions';
import { formatDateTime, formatDurationMinutes } from '@/lib/datetime';
import { displayRideId, formatBranchName } from '@/lib/deliveryDisplay';
import { deliveryWalletFetch } from '@/lib/deliveryWalletApi';
import {
  clearDeliveryWalletUnlockToken,
  readDeliveryWalletUnlockToken,
} from '@/lib/deliveryWalletSession';
import type { DeliveryWalletSummary } from '@/lib/deliveryPayoutTypes';
import { formatMoney } from '@/lib/receipt';
import AdminDeliveryJobDrawer from '@/components/admin/AdminDeliveryJobDrawer';
import AdminRiderKpiDetailModal from '@/components/admin/AdminRiderKpiDetailModal';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { DeliveryStatusChart, DeliveryTrendChart } from '@/components/admin/DeliveryPartnerCharts';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import type { AnalyticsFilters } from '@/components/admin/AdminDriverOpsPanel';
import { RiderAvatar } from '@/components/admin/deliveryAnalyticsUi';

async function adminFetch(endpoint: string) {
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

const JOB_STATUS_BADGE: Record<string, AdminBadgeVariant> = {
  SCHEDULED: 'blue',
  ASSIGNED: 'yellow',
  QUEUED: 'purple',
  IN_PROGRESS: 'orange',
  RETURNING: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
  VEHICLE_FAILURE: 'red',
};

const EMPTY_STATUS_COUNTS = {
  SCHEDULED: 0,
  ASSIGNED: 0,
  QUEUED: 0,
  IN_PROGRESS: 0,
  RETURNING: 0,
  COMPLETED: 0,
  CANCELLED: 0,
  VEHICLE_FAILURE: 0,
};

type DashboardResponse = {
  live: {
    riderStatus: {
      online: number;
      onDelivery: number;
      offDuty: number;
    };
    jobsInProgress: number;
    activeJobs: Array<{
      id: string;
      rideCode: string | null;
      storeId: string;
      driverId: string | null;
      riderName: string | null;
      status: string;
      orderCount: number;
      totalDistanceKm: number | null;
      scheduledAt: string | null;
      startedAt: string | null;
    }>;
  };
  period: {
    completedJobs: number;
    distinctOrders: number;
    attendanceDays: number;
    onlineTimeMinutes: number;
    totalDistanceKm: number;
    averageTimePerOrderMinutes: number | null;
    averageStationTimeMinutes: number | null;
    topRiders: Array<{
      riderId: string;
      riderName: string;
      completedJobs: number;
      distinctOrders: number;
      totalDistanceKm: number;
      onlineTimeMinutes: number;
    }>;
    statusCounts?: Record<string, number>;
    daily?: Array<{
      date: string;
      completedJobs: number;
      distinctOrders: number;
      totalDistanceKm: number;
    }>;
    topBranches?: Array<{
      storeId: string;
      storeName: string;
      completedJobs: number;
      distinctOrders: number;
      totalDistanceKm: number;
    }>;
  };
  attention?: {
    openComplaints: number;
    vehicleFailures: number;
    openVehicleBreakdowns?: number;
    pendingBranchRequests: number;
  };
};

type Props = {
  appliedFilters: AnalyticsFilters;
  pendingFilters: AnalyticsFilters;
  onPendingFiltersChange: (filters: AnalyticsFilters) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onDateRangeChange: (dateFrom: string, dateTo: string) => void;
  superAdmin: boolean;
  branchStoreId?: string;
  stores: { id: string; name: string }[];
  filterDrivers: { id: string; name: string; store?: { name: string } | null }[];
  queryEnabled: boolean;
  onNavigateToDrivers: () => void;
  onViewAllJobs: (filters: AnalyticsFilters) => void;
  onViewAllAnalytics: (filters: AnalyticsFilters) => void;
  onOpenComplaints: () => void;
  onOpenFailures: () => void;
  onOpenRequests: () => void;
};

function buildDashboardQuery(filters: AnalyticsFilters) {
  const qs = new URLSearchParams();
  if (filters.storeId) qs.set('storeId', filters.storeId);
  if (filters.driverId) qs.set('driverId', filters.driverId);
  if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) qs.set('dateTo', filters.dateTo);
  const query = qs.toString();
  return query ? `?${query}` : '';
}

function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function inferPeriod(
  dateFrom?: string,
  dateTo?: string,
): { period: DashboardPeriod; customRange?: DateRange } {
  const presets: Array<Exclude<DashboardPeriod, 'custom'>> = ['today', 'month', 'year'];
  for (const preset of presets) {
    const range = orderDateRange(preset);
    if (dateFrom === range.startDate && dateTo === range.endDate) {
      return { period: preset };
    }
  }
  if (dateFrom && dateTo) {
    return {
      period: 'custom',
      customRange: {
        from: new Date(`${dateFrom}T00:00:00`),
        to: new Date(`${dateTo}T00:00:00`),
      },
    };
  }
  return { period: 'month' };
}

function isWalletPinError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /pin required/i.test(message);
}

function scopedWallet(summary: DeliveryWalletSummary, storeId?: string) {
  if (!storeId) {
    return {
      grossDeliveryFee: summary.grossDeliveryFee,
      netForDelivery: summary.netForDelivery,
      orderCount: summary.orderCount,
      branches: summary.branches,
    };
  }
  const branch = summary.branches.find((row) => row.storeId === storeId);
  if (!branch) {
    return { grossDeliveryFee: 0, netForDelivery: 0, orderCount: 0, branches: [] };
  }
  return {
    grossDeliveryFee: branch.grossDeliveryFee,
    netForDelivery: branch.netForDelivery,
    orderCount: branch.orderCount,
    branches: [branch],
  };
}

export default function AdminDeliveryDashboard({
  appliedFilters,
  pendingFilters,
  onPendingFiltersChange,
  onApplyFilters,
  onResetFilters,
  onDateRangeChange,
  superAdmin,
  branchStoreId,
  stores,
  filterDrivers,
  queryEnabled,
  onNavigateToDrivers,
  onViewAllJobs,
  onViewAllAnalytics,
  onOpenComplaints,
  onOpenFailures,
  onOpenRequests,
}: Props) {
  const [drawerJob, setDrawerJob] = useState<{ jobId: string; storeId: string } | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [unlockToken, setUnlockToken] = useState('');
  const session = getAdminSession();
  const roleCanReadWallet = isSuperAdmin(session) || isDeliveryAdmin(session);

  useEffect(() => {
    setUnlockToken(readDeliveryWalletUnlockToken());
  }, []);

  useEffect(() => {
    const next = inferPeriod(appliedFilters.dateFrom, appliedFilters.dateTo);
    setPeriod(next.period);
    setCustomRange(next.customRange);
  }, [appliedFilters.dateFrom, appliedFilters.dateTo]);

  const dashboardQuery = buildDashboardQuery(appliedFilters);
  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-delivery-dashboard', dashboardQuery],
    queryFn: async () =>
      (await adminFetch(`/admin/delivery-dashboard${dashboardQuery}`)).data as DashboardResponse,
    enabled: queryEnabled,
  });

  const permissionsQuery = useQuery({
    queryKey: ['admin-me-permissions', session?.id],
    enabled: !!session && !roleCanReadWallet,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/admin/me/permissions`, {
        headers: adminAuthHeaders(),
        credentials: 'include',
      });
      const json = await res.json();
      const list = json.data ?? json;
      const map: Record<string, { canRead: boolean }> = {};
      if (Array.isArray(list)) {
        list.forEach((permission: { menu?: string; canRead?: boolean }) => {
          if (permission.menu) map[permission.menu] = { canRead: Boolean(permission.canRead) };
        });
      }
      return map;
    },
  });

  const canReadWallet =
    roleCanReadWallet || hasMenuReadAccess(permissionsQuery.data ?? {}, 'DELIVERY_WALLET');
  const walletAccessPending = !roleCanReadWallet && permissionsQuery.isLoading;

  const earningsQuery = useQuery({
    queryKey: [
      'delivery-dashboard-earnings',
      unlockToken,
      appliedFilters.dateFrom ?? '',
      appliedFilters.dateTo ?? '',
    ],
    enabled: canReadWallet && !!unlockToken && !!appliedFilters.dateFrom && !!appliedFilters.dateTo,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({
        from: appliedFilters.dateFrom!,
        to: appliedFilters.dateTo!,
      });
      return deliveryWalletFetch<DeliveryWalletSummary>(
        `/admin/delivery-wallet?${params.toString()}`,
        unlockToken,
      );
    },
  });

  useEffect(() => {
    if (!isWalletPinError(earningsQuery.error)) return;
    clearDeliveryWalletUnlockToken();
    setUnlockToken('');
  }, [earningsQuery.error]);

  const storeScope = appliedFilters.storeId || (!superAdmin ? branchStoreId : undefined);
  const earnings = earningsQuery.data ? scopedWallet(earningsQuery.data, storeScope) : null;
  const walletUnlocked = !!unlockToken && !isWalletPinError(earningsQuery.error);
  const showBranchFees = walletUnlocked && !!earnings && !appliedFilters.driverId;

  const branchRows = useMemo(() => {
    const ops = data?.period.topBranches ?? [];
    if (!showBranchFees || !earnings || earnings.branches.length === 0) return ops;
    const opsByStore = new Map(ops.map((row) => [row.storeId, row]));
    return [...earnings.branches]
      .sort((a, b) => b.netForDelivery - a.netForDelivery || b.orderCount - a.orderCount)
      .slice(0, 5)
      .map((row) => {
        const opsRow = opsByStore.get(row.storeId);
        return {
          storeId: row.storeId,
          storeName: row.storeName,
          completedJobs: opsRow?.completedJobs ?? 0,
          distinctOrders: opsRow?.distinctOrders ?? row.orderCount,
          totalDistanceKm: opsRow?.totalDistanceKm ?? 0,
          netForDelivery: row.netForDelivery,
          orderCount: row.orderCount,
        };
      });
  }, [data?.period.topBranches, earnings, showBranchFees]);

  const filterFieldClass =
    'bg-navy-light border border-navy-border rounded-lg px-3 text-sm text-fg min-w-0 h-9 w-full';

  function applyPreset(next: Exclude<DashboardPeriod, 'custom'>) {
    const range = orderDateRange(next);
    onDateRangeChange(range.startDate ?? '', range.endDate ?? '');
  }

  function applyCustomRange(range: DateRange | undefined) {
    setCustomRange(range);
    if (range?.from && range?.to) {
      setPeriod('custom');
      onDateRangeChange(format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd'));
    }
  }

  const cardHeaderClass = 'border-b border-navy-border px-4 py-3';
  const live = data?.live;
  const periodStats = data?.period;
  const attention = data?.attention;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Partner overview</h2>
          <p className="mt-0.5 text-sm text-muted">
            {periodLabel}. Live fleet and open issues stay current and ignore this period.
          </p>
        </div>
        <DashboardPeriodFilter
          period={period}
          customRange={customRange}
          onPeriodChange={applyPreset}
          onCustomRangeChange={applyCustomRange}
          compact
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {superAdmin ? (
          <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
            <SearchableBranchSelect
              stores={stores}
              value={pendingFilters.storeId || undefined}
              onChange={(nextStoreId) =>
                onPendingFiltersChange({
                  ...pendingFilters,
                  storeId: nextStoreId,
                  driverId: '',
                })
              }
              formatName={(name) => formatBranchName(name)}
              placeholder="All branches"
              className={filterFieldClass}
            />
          </div>
        ) : null}
        <div className="min-w-[180px] flex-1 sm:max-w-[220px]">
          <select
            aria-label="Rider"
            value={pendingFilters.driverId ?? ''}
            onChange={(e) => onPendingFiltersChange({ ...pendingFilters, driverId: e.target.value })}
            className={filterFieldClass}
          >
            <option value="">All riders</option>
            {filterDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.store?.name
                  ? `${driver.name} · ${formatBranchName(driver.store.name)}`
                  : driver.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={onApplyFilters} className="btn-primary h-9 px-4 text-sm">
          Apply
        </button>
        <button type="button" onClick={onResetFilters} className="btn-outline h-9 px-4 text-sm">
          Reset
        </button>
      </div>

      {isError ? (
        <div className="card py-10 text-center text-sm text-red-400">
          {(error as Error).message || 'Failed to load dashboard.'}
        </div>
      ) : (
        <>
          <div
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
              canReadWallet || walletAccessPending ? 'xl:grid-cols-4' : 'xl:grid-cols-3'
            }`}
          >
            {walletAccessPending ? (
              <div className="card flex min-h-[7.25rem] items-center justify-center">
                <DashSkel className="h-8 w-24" />
              </div>
            ) : canReadWallet ? (
              walletUnlocked ? (
                <DashboardKpiCard
                  variant="finance"
                  icon={Wallet}
                  label="Net for delivery"
                  loading={earningsQuery.isLoading}
                  value={earningsQuery.isError ? '—' : formatMoney(earnings?.netForDelivery ?? 0)}
                  hint={
                    earningsQuery.isError
                      ? 'Could not load wallet totals.'
                      : appliedFilters.driverId
                        ? 'Branch total. Rider filter does not change fees.'
                        : `Gross ${formatMoney(earnings?.grossDeliveryFee ?? 0)} · ${earnings?.orderCount ?? 0} orders`
                  }
                  href="/wallet"
                />
              ) : (
                <DashboardKpiCard
                  variant="finance"
                  icon={Lock}
                  label="Partner earnings"
                  value="Unlock"
                  hint="Enter the wallet PIN to see fees for this period."
                  href="/wallet"
                />
              )
            ) : null}

            <DashboardKpiCard
              variant="finance"
              icon={CheckCircle2}
              tone="green"
              label="Completed jobs"
              loading={isLoading}
              value={periodStats?.completedJobs ?? 0}
              hint={`${periodStats?.distinctOrders ?? 0} orders · ${formatDistance(periodStats?.totalDistanceKm)}`}
              onClick={() => onViewAllJobs(appliedFilters)}
            />
            <DashboardKpiCard
              variant="finance"
              icon={Wifi}
              tone="green"
              label="Riders online"
              loading={isLoading}
              value={live?.riderStatus.online ?? 0}
              hint={`${live?.riderStatus.onDelivery ?? 0} on delivery · ${live?.riderStatus.offDuty ?? 0} off duty`}
              onClick={onNavigateToDrivers}
            />
            <DashboardKpiCard
              variant="finance"
              icon={Truck}
              tone="orange"
              label="Jobs in progress"
              loading={isLoading}
              value={live?.jobsInProgress ?? 0}
              hint="Live runs. Opens the jobs list."
              onClick={() => onViewAllJobs(appliedFilters)}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-12 lg:items-stretch">
            <section className="card flex min-h-[280px] flex-col p-4 lg:col-span-7">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-fg">Completed jobs</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  {periodLabel} · jobs · distance (km)
                </p>
              </div>
              <DeliveryTrendChart data={periodStats?.daily ?? []} loading={isLoading} />
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-navy-border pt-3 text-xs">
                <PeriodStat
                  icon={Timer}
                  label="Avg / order"
                  value={
                    periodStats?.averageTimePerOrderMinutes != null
                      ? `${periodStats.averageTimePerOrderMinutes.toFixed(1)} min`
                      : '—'
                  }
                />
                <PeriodStat
                  icon={Clock}
                  label="Avg station"
                  value={
                    periodStats?.averageStationTimeMinutes != null
                      ? `${periodStats.averageStationTimeMinutes.toFixed(1)} min`
                      : '—'
                  }
                />
                <PeriodStat
                  icon={Wifi}
                  label="Online time"
                  value={formatDurationMinutes(periodStats?.onlineTimeMinutes ?? 0)}
                />
              </div>
            </section>
            <section className="card flex min-h-[280px] flex-col p-4 lg:col-span-5">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-fg">Job status</h2>
                <p className="mt-0.5 text-[11px] text-muted">
                  Scheduled or completed in {periodLabel}
                </p>
              </div>
              <DeliveryStatusChart
                counts={periodStats?.statusCounts ?? EMPTY_STATUS_COUNTS}
                loading={isLoading}
              />
            </section>
          </div>

          <div className="grid gap-3 lg:grid-cols-3 lg:items-stretch">
            <RankingCard
              title="Top branches"
              subtitle={showBranchFees ? `${periodLabel} · net delivery fee` : periodLabel}
              empty="No completed jobs in this period"
              onViewAll={superAdmin ? () => onViewAllJobs(appliedFilters) : undefined}
            >
              {isLoading ? (
                <div className="space-y-2 p-4">
                  <DashSkel className="h-8 w-full" />
                  <DashSkel className="h-8 w-full" />
                </div>
              ) : branchRows.length === 0 ? null : (
                <ul>
                  {branchRows.map((row) => (
                    <li
                      key={row.storeId}
                      className="flex items-center justify-between gap-3 border-b border-navy-border px-4 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">
                          {formatBranchName(row.storeName)}
                        </p>
                        <p className="text-[11px] text-muted">
                          {row.completedJobs} jobs · {row.distinctOrders} orders ·{' '}
                          {formatDistance(row.totalDistanceKm)}
                        </p>
                      </div>
                      {'netForDelivery' in row && typeof row.netForDelivery === 'number' ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                          {formatMoney(row.netForDelivery)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                          {row.completedJobs}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </RankingCard>

            <RankingCard
              title="Top riders"
              subtitle={periodLabel}
              empty="No completed jobs in this period"
              onViewAll={() => onViewAllAnalytics(appliedFilters)}
            >
              {isLoading ? (
                <div className="space-y-2 p-4">
                  <DashSkel className="h-8 w-full" />
                  <DashSkel className="h-8 w-full" />
                </div>
              ) : (periodStats?.topRiders.length ?? 0) === 0 ? null : (
                <ul>
                  {(periodStats?.topRiders ?? []).map((row) => (
                    <li key={row.riderId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 border-b border-navy-border px-4 py-2.5 text-left last:border-b-0 hover:bg-brand-subtle/40"
                        onClick={() => setSelectedRiderId(row.riderId)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <RiderAvatar name={row.riderName} seed={row.riderId} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-fg">{row.riderName}</span>
                            <span className="block text-[11px] text-muted">
                              {row.distinctOrders} orders · {formatDistance(row.totalDistanceKm)}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-fg">
                          {row.completedJobs}
                          <ChevronRight size={14} className="text-muted" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </RankingCard>

            <RankingCard title="Needs attention" subtitle="Right now" empty="Nothing waiting" filled>
              <ul>
                <AttentionRow
                  icon={AlertTriangle}
                  label="Open complaints"
                  value={attention?.openComplaints ?? 0}
                  onClick={onOpenComplaints}
                />
                <AttentionRow
                  icon={Truck}
                  label="Vehicle failures"
                  value={attention?.vehicleFailures ?? 0}
                  onClick={onOpenFailures}
                />
                <AttentionRow
                  icon={Truck}
                  label="Awaiting vehicle fix"
                  value={attention?.openVehicleBreakdowns ?? 0}
                  onClick={onOpenFailures}
                />
                <AttentionRow
                  icon={Package}
                  label="Jobs in progress"
                  value={live?.jobsInProgress ?? 0}
                  onClick={() => onViewAllJobs(appliedFilters)}
                />
                {superAdmin ? (
                  <AttentionRow
                    icon={Building2}
                    label="Branch requests"
                    value={attention?.pendingBranchRequests ?? 0}
                    onClick={onOpenRequests}
                  />
                ) : null}
              </ul>
            </RankingCard>
          </div>

          <section className="card overflow-hidden">
            <div className={`${cardHeaderClass} flex items-start justify-between gap-3`}>
              <div>
                <h2 className="text-sm font-semibold text-fg">Active jobs</h2>
                <p className="mt-0.5 text-xs text-muted">Assigned, queued, and in-progress jobs.</p>
              </div>
              {(live?.activeJobs.length ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => onViewAllJobs(appliedFilters)}
                  className="btn-outline px-3 py-1.5 text-xs"
                >
                  View all
                </button>
              ) : null}
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading jobs…</span>
              </div>
            ) : (live?.activeJobs.length ?? 0) === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">No active jobs right now.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-navy-border bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-muted dark:bg-navy-light/50">
                      <th className="px-4 py-2.5">Ride ID</th>
                      <th className="px-4 py-2.5">Rider</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Orders</th>
                      <th className="px-4 py-2.5 text-right">Distance</th>
                      <th className="px-4 py-2.5">Scheduled</th>
                      <th className="px-4 py-2.5">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(live?.activeJobs ?? []).map((job) => (
                      <tr
                        key={job.id}
                        tabIndex={0}
                        role="button"
                        className="cursor-pointer border-b border-navy-border last:border-b-0 hover:bg-brand-subtle/40"
                        onClick={() => setDrawerJob({ jobId: job.id, storeId: job.storeId })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setDrawerJob({ jobId: job.id, storeId: job.storeId });
                          }
                        }}
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {displayRideId(job.rideCode, job.id)}
                        </td>
                        <td className="px-4 py-3">{job.riderName ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${adminBadgeClass(
                              JOB_STATUS_BADGE[job.status] ?? 'neutral',
                            )}`}
                          >
                            {DELIVERY_JOB_STATUS_LABEL[job.status] ?? job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{job.orderCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatDistance(job.totalDistanceKm)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {job.scheduledAt ? formatDateTime(job.scheduledAt) : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {job.startedAt ? formatDateTime(job.startedAt) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {drawerJob ? (
        <AdminDeliveryJobDrawer
          jobId={drawerJob.jobId}
          storeId={drawerJob.storeId}
          open={!!drawerJob}
          onClose={() => setDrawerJob(null)}
        />
      ) : null}

      {selectedRiderId ? (
        <AdminRiderKpiDetailModal
          riderId={selectedRiderId}
          filters={{
            storeId: appliedFilters.storeId || undefined,
            dateFrom: appliedFilters.dateFrom || undefined,
            dateTo: appliedFilters.dateTo || undefined,
          }}
          open={!!selectedRiderId}
          onClose={() => setSelectedRiderId(null)}
        />
      ) : null}
    </div>
  );
}

function PeriodStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] text-muted">
        <Icon size={12} />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

function RankingCard({
  title,
  subtitle,
  empty,
  onViewAll,
  filled = true,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  onViewAll?: () => void;
  filled?: boolean;
  children: ReactNode;
}) {
  const showEmpty = !filled || children == null;
  return (
    <section className="card flex min-h-[260px] flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-navy-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
        </div>
        {onViewAll ? (
          <button type="button" onClick={onViewAll} className="text-xs font-medium text-brand hover:underline">
            View all
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {showEmpty ? <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p> : children}
      </div>
    </section>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 border-b border-navy-border px-4 py-3 text-left last:border-b-0 hover:bg-brand-subtle/40"
      >
        <span className="flex items-center gap-2 text-sm text-fg">
          <Icon size={15} className="text-muted" />
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums text-fg">{value}</span>
      </button>
    </li>
  );
}
