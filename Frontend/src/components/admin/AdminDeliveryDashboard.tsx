'use client';

import { adminAuthHeaders } from '@/lib/adminSession';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gauge,
  Loader2,
  Lock,
  MapPin,
  Package,
  Timer,
  Truck,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { adminBadgeClass, DELIVERY_JOB_STATUS_LABEL, type AdminBadgeVariant } from '@/lib/adminBadges';
import { formatDateTime, formatDurationMinutes } from '@/lib/datetime';
import AdminDeliveryJobDrawer from '@/components/admin/AdminDeliveryJobDrawer';
import AdminRiderKpiDetailModal from '@/components/admin/AdminRiderKpiDetailModal';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import type { AnalyticsFilters } from '@/components/admin/AdminDriverOpsPanel';
import { RiderAvatar } from '@/components/admin/deliveryAnalyticsUi';
import { displayRideId } from '@/lib/deliveryDisplay';

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

type MetricTone = 'blue' | 'green' | 'orange' | 'neutral';

const KPI_ICON_TONE: Record<MetricTone, string> = {
  blue: 'bg-brand/10 text-brand dark:bg-brand/15 dark:text-brand-light',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  neutral: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const KPI_VALUE_TONE: Record<MetricTone, string> = {
  blue: 'text-brand dark:text-brand-light',
  green: 'text-emerald-600 dark:text-emerald-400',
  orange: 'text-orange-600 dark:text-orange-400',
  neutral: 'text-slate-700 dark:text-slate-300',
};

type DashboardResponse = {
  filters: {
    storeId: string | null;
    driverId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
  };
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
  };
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

function formatMinutesValue(value: number | null | undefined): ReactNode {
  if (value == null) return '—';
  return (
    <>
      {value.toFixed(1)}
      <span className="ml-0.5 text-sm font-normal text-muted">min</span>
    </>
  );
}

function DashboardKpiCard({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: MetricTone;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${KPI_ICON_TONE[tone]}`}
      >
        <Icon size={16} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className={`mt-0.5 text-xl font-semibold tabular-nums leading-tight ${KPI_VALUE_TONE[tone]}`}>
          {value}
        </p>
      </div>
    </>
  );

  const className =
    'card flex h-full w-full items-start gap-3 p-4 text-left shadow-sm transition-colors hover:bg-brand-subtle/20';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

function PeriodSummaryMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: MetricTone;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${KPI_ICON_TONE[tone]}`}
      >
        <Icon size={14} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium leading-tight text-muted">{label}</p>
        <p className={`mt-0.5 text-base font-semibold tabular-nums leading-snug ${KPI_VALUE_TONE[tone]}`}>
          {value ?? '—'}
        </p>
      </div>
    </>
  );

  const className =
    'flex w-full items-start gap-2.5 rounded-lg text-left transition-colors hover:bg-brand-subtle/20';

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

type Props = {
  appliedFilters: AnalyticsFilters;
  pendingFilters: AnalyticsFilters;
  onPendingFiltersChange: (filters: AnalyticsFilters) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  superAdmin: boolean;
  branchStoreId?: string;
  stores: { id: string; name: string }[];
  filterDrivers: { id: string; name: string; store?: { name: string } | null }[];
  queryEnabled: boolean;
  onNavigateToDrivers: () => void;
  onViewAllJobs: (filters: AnalyticsFilters) => void;
  onViewAllAnalytics: (filters: AnalyticsFilters) => void;
};

export default function AdminDeliveryDashboard({
  appliedFilters,
  pendingFilters,
  onPendingFiltersChange,
  onApplyFilters,
  onResetFilters,
  superAdmin,
  branchStoreId,
  stores,
  filterDrivers,
  queryEnabled,
  onNavigateToDrivers,
  onViewAllJobs,
  onViewAllAnalytics,
}: Props) {
  const [drawerJob, setDrawerJob] = useState<{ jobId: string; storeId: string } | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);

  const dashboardQuery = buildDashboardQuery(appliedFilters);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-delivery-dashboard', dashboardQuery],
    queryFn: async () =>
      (await adminFetch(`/admin/delivery-dashboard${dashboardQuery}`)).data as DashboardResponse,
    enabled: queryEnabled,
  });

  const filterFieldClass =
    'bg-navy-light border border-navy-border rounded-lg px-3 text-sm text-fg min-w-0 h-9 w-full';
  const filterLabelClass = 'block text-xs font-medium text-muted mb-1';

  const filterBar = (
    <section className="card overflow-hidden shadow-sm">
      <div className="border-b border-navy-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Filters</h2>
        <p className="mt-0.5 text-xs text-muted">
          Apply filters to live status and period summary metrics.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:flex-wrap lg:items-end">
        {superAdmin && (
          <div className="min-w-[140px] flex-1 lg:max-w-[180px]">
            <label className={filterLabelClass}>Branch</label>
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
              formatName={(name) => name.replace('Bing Chun - ', '')}
              placeholder="All branches"
              className={filterFieldClass}
            />
          </div>
        )}
        {!superAdmin && branchStoreId && (
          <div className="min-w-[140px] flex-1 lg:max-w-[180px]">
            <label className={filterLabelClass}>Branch</label>
            <div
              className={`${filterFieldClass} flex items-center gap-2 bg-navy-light/70 text-fg`}
              aria-readonly="true"
            >
              <Building2 size={15} className="shrink-0 text-muted" aria-hidden />
              <span className="truncate">Your branch</span>
              <Lock size={13} className="ml-auto shrink-0 text-muted/70" aria-hidden />
            </div>
          </div>
        )}
        <div className="min-w-[140px] flex-1 lg:max-w-[180px]">
          <label htmlFor="dashboard-rider" className={filterLabelClass}>
            Rider
          </label>
          <select
            id="dashboard-rider"
            value={pendingFilters.driverId ?? ''}
            onChange={(e) =>
              onPendingFiltersChange({ ...pendingFilters, driverId: e.target.value })
            }
            className={filterFieldClass}
          >
            <option value="">All riders</option>
            {filterDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.store?.name ? `${d.name} · ${d.store.name.replace('Bing Chun - ', '')}` : d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[130px] flex-1 lg:max-w-[150px]">
          <label htmlFor="dashboard-date-from" className={filterLabelClass}>
            Date from
          </label>
          <input
            id="dashboard-date-from"
            type="date"
            value={pendingFilters.dateFrom ?? ''}
            onChange={(e) =>
              onPendingFiltersChange({ ...pendingFilters, dateFrom: e.target.value })
            }
            className={filterFieldClass}
          />
        </div>
        <div className="min-w-[130px] flex-1 lg:max-w-[150px]">
          <label htmlFor="dashboard-date-to" className={filterLabelClass}>
            Date to
          </label>
          <input
            id="dashboard-date-to"
            type="date"
            value={pendingFilters.dateTo ?? ''}
            onChange={(e) =>
              onPendingFiltersChange({ ...pendingFilters, dateTo: e.target.value })
            }
            className={filterFieldClass}
          />
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={onApplyFilters}
            className="btn-primary inline-flex h-9 items-center px-4 text-sm"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onResetFilters}
            className="btn-outline inline-flex h-9 items-center px-4 text-sm"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );

  const dashboardShell = (content: ReactNode) => (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Gauge size={18} className="text-brand" aria-hidden />
          Delivery operations
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Live rider status and period delivery metrics for the selected filters.
        </p>
      </header>
      {filterBar}
      {content}
    </div>
  );

  if (isLoading) {
    return dashboardShell(
      <div className="flex items-center justify-center gap-2 py-10 text-muted">
        <Loader2 size={18} className="animate-spin" aria-hidden />
        <span className="text-sm">Loading dashboard…</span>
      </div>,
    );
  }

  if (isError) {
    return dashboardShell(
      <div className="py-10 text-center text-sm text-red-400">
        {(error as Error).message || 'Failed to load dashboard.'}
      </div>,
    );
  }

  const live = data?.live;
  const period = data?.period;

  const cardHeaderClass = 'border-b border-navy-border px-4 py-3.5 sm:px-5';
  const tableHeadClass =
    'border-b border-navy-border bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-muted dark:bg-navy-light/50';
  const tableHeadCellClass = 'whitespace-nowrap px-4 py-2.5 sm:px-5';
  const tableBodyCellClass = 'px-4 py-3 sm:px-5';

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Gauge size={18} className="text-brand" aria-hidden />
          Delivery operations
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Live rider status and period delivery metrics for the selected filters.
        </p>
      </header>

      {filterBar}

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <DashboardKpiCard
          icon={Wifi}
          label="Riders online"
          value={live?.riderStatus.online ?? 0}
          tone="green"
          onClick={onNavigateToDrivers}
        />
        <DashboardKpiCard
          icon={Truck}
          label="Riders on delivery"
          value={live?.riderStatus.onDelivery ?? 0}
          tone="blue"
          onClick={onNavigateToDrivers}
        />
        <DashboardKpiCard
          icon={Users}
          label="Riders off duty"
          value={live?.riderStatus.offDuty ?? 0}
          tone="neutral"
          onClick={onNavigateToDrivers}
        />
        <DashboardKpiCard
          icon={Gauge}
          label="Jobs in progress"
          value={live?.jobsInProgress ?? 0}
          tone="orange"
          onClick={() => onViewAllJobs(appliedFilters)}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
        <section className="card flex flex-col overflow-hidden shadow-sm lg:col-span-7">
          <div className={`${cardHeaderClass} flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`}>
            <div>
              <h2 className="text-sm font-semibold text-fg">Active jobs</h2>
              <p className="mt-0.5 text-xs text-muted">
                Assigned, queued, and in-progress jobs. Click a row for job details.
              </p>
            </div>
            {(live?.activeJobs.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => onViewAllJobs(appliedFilters)}
                className="btn-outline shrink-0 px-3 py-1.5 text-xs sm:text-sm"
              >
                View all
              </button>
            )}
          </div>
          {(live?.activeJobs.length ?? 0) === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center text-muted">
              <Truck size={24} className="mb-2 opacity-40" aria-hidden />
              <p className="text-sm">No active jobs right now.</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className={tableHeadClass}>
                    <th className={tableHeadCellClass}>Ride ID</th>
                    <th className={tableHeadCellClass}>Rider</th>
                    <th className={tableHeadCellClass}>Status</th>
                    <th className={`${tableHeadCellClass} text-right`}>Orders</th>
                    <th className={`${tableHeadCellClass} text-right`}>Distance</th>
                    <th className={tableHeadCellClass}>Scheduled</th>
                    <th className={tableHeadCellClass}>Started</th>
                    <th className="w-8 px-2 py-2.5" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {(live?.activeJobs ?? []).map((job) => (
                    <tr
                      key={job.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`View job ${displayRideId(job.rideCode, job.id)}`}
                      className="group cursor-pointer border-b border-navy-border transition-colors last:border-b-0 hover:bg-brand-subtle/40 focus-visible:bg-brand-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
                      onClick={() => setDrawerJob({ jobId: job.id, storeId: job.storeId })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDrawerJob({ jobId: job.id, storeId: job.storeId });
                        }
                      }}
                    >
                      <td className={`${tableBodyCellClass} font-mono text-xs text-fg`}>
                        {displayRideId(job.rideCode, job.id)}
                      </td>
                      <td className={`${tableBodyCellClass} text-fg`}>{job.riderName ?? '—'}</td>
                      <td className={tableBodyCellClass}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${adminBadgeClass(
                            JOB_STATUS_BADGE[job.status] ?? 'neutral',
                          )}`}
                        >
                          {DELIVERY_JOB_STATUS_LABEL[job.status] ?? job.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`${tableBodyCellClass} text-right tabular-nums text-fg`}>
                        {job.orderCount}
                      </td>
                      <td className={`${tableBodyCellClass} whitespace-nowrap text-right tabular-nums text-fg`}>
                        {formatDistance(job.totalDistanceKm)}
                      </td>
                      <td className={`${tableBodyCellClass} whitespace-nowrap text-fg`}>
                        {job.scheduledAt ? formatDateTime(job.scheduledAt) : '—'}
                      </td>
                      <td className={`${tableBodyCellClass} whitespace-nowrap text-fg`}>
                        {job.startedAt ? formatDateTime(job.startedAt) : '—'}
                      </td>
                      <td className="px-2 py-3 text-muted transition-colors group-hover:text-brand">
                        <ChevronRight size={16} aria-hidden />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card flex flex-col overflow-hidden shadow-sm lg:col-span-5">
          <div className={cardHeaderClass}>
            <h2 className="text-sm font-semibold text-fg">Period summary</h2>
            <p className="mt-0.5 text-xs text-muted">
              Metrics for the selected branch, rider, and date range.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-1 sm:grid-cols-2">
            <div className="space-y-3.5 px-4 py-4 sm:border-r sm:border-navy-border sm:px-5">
              <PeriodSummaryMetric
                icon={CheckCircle2}
                label="Completed jobs"
                value={period?.completedJobs ?? 0}
                tone="green"
                onClick={() => onViewAllJobs(appliedFilters)}
              />
              <PeriodSummaryMetric
                icon={Package}
                label="Orders"
                value={period?.distinctOrders ?? 0}
                tone="blue"
                onClick={() => onViewAllJobs(appliedFilters)}
              />
              <PeriodSummaryMetric
                icon={CalendarDays}
                label="Attendance days"
                value={period?.attendanceDays ?? 0}
                tone="neutral"
                onClick={() => onViewAllAnalytics(appliedFilters)}
              />
              <PeriodSummaryMetric
                icon={Wifi}
                label="Online time"
                value={formatMinutesValue(period?.onlineTimeMinutes)}
                tone="green"
                onClick={() => onViewAllAnalytics(appliedFilters)}
              />
            </div>
            <div className="space-y-3.5 px-4 py-4 sm:px-5">
              <PeriodSummaryMetric
                icon={MapPin}
                label="Total distance"
                value={
                  <>
                    {period?.totalDistanceKm?.toFixed(1) ?? '0.0'}
                    <span className="ml-0.5 text-sm font-normal text-muted">km</span>
                  </>
                }
                tone="blue"
                onClick={() => onViewAllJobs(appliedFilters)}
              />
              <PeriodSummaryMetric
                icon={Timer}
                label="Avg time per order"
                value={formatMinutesValue(period?.averageTimePerOrderMinutes)}
                tone="neutral"
                onClick={() => onViewAllAnalytics(appliedFilters)}
              />
              <PeriodSummaryMetric
                icon={Clock}
                label="Avg station time"
                value={formatMinutesValue(period?.averageStationTimeMinutes)}
                tone="neutral"
                onClick={() => onViewAllAnalytics(appliedFilters)}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden shadow-sm">
        <div className={`${cardHeaderClass} flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`}>
          <div>
            <h2 className="text-sm font-semibold text-fg">Top riders</h2>
            <p className="mt-0.5 text-xs text-muted">
              Top performers for the selected period. Click a row for rider KPI details.
            </p>
          </div>
          {(period?.topRiders.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => onViewAllAnalytics(appliedFilters)}
              className="btn-outline shrink-0 px-3 py-1.5 text-xs sm:text-sm"
            >
              View all
            </button>
          )}
        </div>
        {(period?.topRiders.length ?? 0) === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted sm:px-5">
            No top riders for the selected period.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadClass}>
                <th className={tableHeadCellClass}>Rider</th>
                <th className={`${tableHeadCellClass} text-right`}>Completed jobs</th>
                <th className={`${tableHeadCellClass} text-right`}>Orders</th>
                <th className={`${tableHeadCellClass} text-right`}>Distance</th>
                <th className={`${tableHeadCellClass} text-right`}>Online time</th>
                <th className="w-8 px-2 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {(period?.topRiders ?? []).map((row) => (
                <tr
                  key={row.riderId}
                  tabIndex={0}
                  role="button"
                  aria-label={`View KPI details for ${row.riderName}`}
                  className="group cursor-pointer border-b border-navy-border transition-colors last:border-b-0 hover:bg-brand-subtle/40 focus-visible:bg-brand-subtle/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
                  onClick={() => setSelectedRiderId(row.riderId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRiderId(row.riderId);
                    }
                  }}
                >
                  <td className={tableBodyCellClass}>
                    <div className="flex items-center gap-2.5">
                      <RiderAvatar name={row.riderName} seed={row.riderId} size="sm" />
                      <span className="font-medium text-fg">{row.riderName}</span>
                    </div>
                  </td>
                  <td className={`${tableBodyCellClass} text-right tabular-nums text-fg`}>
                    {row.completedJobs}
                  </td>
                  <td className={`${tableBodyCellClass} text-right tabular-nums text-fg`}>
                    {row.distinctOrders}
                  </td>
                  <td className={`${tableBodyCellClass} whitespace-nowrap text-right tabular-nums text-fg`}>
                    {formatDistance(row.totalDistanceKm)}
                  </td>
                  <td className={`${tableBodyCellClass} whitespace-nowrap text-right tabular-nums text-fg`}>
                    {formatDurationMinutes(row.onlineTimeMinutes)}
                  </td>
                  <td className="px-2 py-3 text-muted transition-colors group-hover:text-brand">
                    <ChevronRight size={16} aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {drawerJob && (
        <AdminDeliveryJobDrawer
          jobId={drawerJob.jobId}
          storeId={drawerJob.storeId}
          open={!!drawerJob}
          onClose={() => setDrawerJob(null)}
        />
      )}

      {selectedRiderId && (
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
      )}
    </div>
  );
}
