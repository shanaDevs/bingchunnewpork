'use client';

import { adminFetch } from '@/lib/adminApi';
import { connectAdminSocketWithRooms } from '@/lib/adminSocket';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Gauge,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Truck,
  Users,
} from 'lucide-react';
import { getAdminSession, isAllBranchView, isBranchScoped, isCashier } from '@/lib/adminAuth';
import {
  buildDeliveryJobsQuery,
  DELIVERY_TAB_QUERY_KEYS,
  effectiveScheduleDates,
  isActiveDeliveryJob,
} from '@/lib/adminDeliveryQueries';
import { formatBranchName } from '@/lib/deliveryDisplay';
import { todayDateString } from '@/lib/datetime';
import AdminDeliveryJobsTable, {
  type DeliveryJobListItem,
  type JobFilters,
} from '@/components/admin/AdminDeliveryJobsTable';
import AdminDeliveryJobDrawer from '@/components/admin/AdminDeliveryJobDrawer';
import AdminDriversPanel from '@/components/admin/AdminDriversPanel';
import AdminDeliveryRouteView from '@/components/admin/AdminDeliveryRouteView';
import AdminDriverOpsPanel, { type AnalyticsFilters } from '@/components/admin/AdminDriverOpsPanel';
import AdminDeliveryDashboard from '@/components/admin/AdminDeliveryDashboard';
import { orderDateRange } from '@/components/admin/DashboardPeriodFilter';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { useDriverManagementAccess } from '@/hooks/useDriverManagementAccess';

type DeliveryTab =
  | 'dashboard'
  | 'jobs'
  | 'drivers'
  | 'complaints'
  | 'failures'
  | 'requests'
  | 'analytics';

type JobRef = {
  jobId: string;
  storeId: string;
  forceReplay?: boolean;
  displayStatus?: string | null;
};
type RoutePanelState = JobRef & {
  mode: 'planned' | 'actual';
  initialStatus?: string;
  focusDriver?: boolean;
};

function defaultFilters(sessionStoreId?: string, forCashier = false): JobFilters {
  const today = forCashier ? todayDateString() : '';
  return {
    storeId: sessionStoreId ?? '',
    driverId: '',
    dateFrom: today,
    dateTo: today,
  };
}

function defaultPeriodFilters(sessionStoreId?: string): AnalyticsFilters {
  return {
    storeId: sessionStoreId ?? '',
    driverId: '',
    dateFrom: '',
    dateTo: '',
  };
}

function defaultDashboardFilters(sessionStoreId?: string): AnalyticsFilters {
  const range = orderDateRange('month');
  return {
    storeId: sessionStoreId ?? '',
    driverId: '',
    dateFrom: range.startDate ?? '',
    dateTo: range.endDate ?? '',
  };
}

const DELIVERY_TABS: DeliveryTab[] = [
  'dashboard',
  'jobs',
  'drivers',
  'complaints',
  'failures',
  'requests',
  'analytics',
];

const ANALYTICS_PAGE_SIZE = 20;

function AdminDeliveryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState<ReturnType<typeof getAdminSession>>(null);
  const [storeId, setStoreId] = useState('');
  const [pendingFilters, setPendingFilters] = useState<JobFilters>(defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<JobFilters>(defaultFilters());
  const [pendingAnalyticsFilters, setPendingAnalyticsFilters] = useState<AnalyticsFilters>(
    defaultPeriodFilters(),
  );
  const [appliedAnalyticsFilters, setAppliedAnalyticsFilters] = useState<AnalyticsFilters>(
    defaultPeriodFilters(),
  );
  const [pendingDashboardFilters, setPendingDashboardFilters] = useState<AnalyticsFilters>(
    defaultDashboardFilters(),
  );
  const [appliedDashboardFilters, setAppliedDashboardFilters] = useState<AnalyticsFilters>(
    defaultDashboardFilters(),
  );
  const [analyticsRiderPage, setAnalyticsRiderPage] = useState(1);
  const [routePanel, setRoutePanel] = useState<RoutePanelState | null>(null);
  const [drawerJob, setDrawerJob] = useState<JobRef | null>(null);
  const [tabRefreshing, setTabRefreshing] = useState(false);
  const [jobsSubTab, setJobsSubTab] = useState<'active' | 'completed' | 'incomplete'>('active');
  const cashierMode = isCashier(admin);
  const allBranchView = isAllBranchView(admin);
  const { canCreateDrivers, canUpdateDrivers } = useDriverManagementAccess();
  const branchStoreId = allBranchView ? undefined : storeId || undefined;
  const tabParam = searchParams.get('tab');
  const tab: DeliveryTab = cashierMode
    ? 'jobs'
    : tabParam && DELIVERY_TABS.includes(tabParam as DeliveryTab)
      ? (tabParam as DeliveryTab)
      : 'dashboard';

  useEffect(() => {
    const session = getAdminSession();
    setAdmin(session);
    if (session && !isAllBranchView(session) && session.storeId) {
      setStoreId(session.storeId);
      const cashier = isCashier(session);
      const defaults = defaultFilters(session.storeId, cashier);
      setPendingFilters(defaults);
      setAppliedFilters(defaults);
      const periodDefaults = defaultPeriodFilters(session.storeId);
      setPendingAnalyticsFilters(periodDefaults);
      setAppliedAnalyticsFilters(periodDefaults);
      const dashboardDefaults = defaultDashboardFilters(session.storeId);
      setPendingDashboardFilters(dashboardDefaults);
      setAppliedDashboardFilters(dashboardDefaults);
    }
  }, []);

  useEffect(() => {
    if (cashierMode && tabParam === 'drivers') {
      router.replace('/admin/delivery');
    }
  }, [cashierMode, tabParam, router]);

  const effectiveStoreId = allBranchView
    ? appliedFilters.storeId || undefined
    : branchStoreId;

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: async () => (await adminFetch('/stores')).data as { id: string; name: string }[],
    enabled: allBranchView,
  });

  const riderFilterStoreId = allBranchView
    ? (tab === 'analytics'
        ? pendingAnalyticsFilters.storeId || undefined
        : tab === 'dashboard'
          ? pendingDashboardFilters.storeId || undefined
          : pendingFilters.storeId || undefined)
    : branchStoreId;

  const effectiveAnalyticsStoreId = allBranchView
    ? appliedAnalyticsFilters.storeId || undefined
    : branchStoreId;

  const { data: filterDrivers = [] } = useQuery({
    queryKey: ['admin-delivery-filter-drivers', riderFilterStoreId, allBranchView],
    queryFn: async () => {
      if (!allBranchView && branchStoreId) {
        return (await adminFetch(`/admin/branches/${encodeURIComponent(branchStoreId)}/driver-pool`)).data as {
          id: string;
          name: string;
          store?: { name: string } | null;
        }[];
      }
      const qs = riderFilterStoreId ? `?storeId=${encodeURIComponent(riderFilterStoreId)}` : '';
      return (await adminFetch(`/admin/drivers${qs}`)).data as {
        id: string;
        name: string;
        store?: { name: string } | null;
      }[];
    },
    enabled: (tab === 'jobs' || tab === 'analytics' || tab === 'dashboard') && (allBranchView || !!branchStoreId),
  });

  const { data: branchRequests = [] } = useQuery({
    queryKey: ['admin-driver-branch-requests'],
    queryFn: async () =>
      (await adminFetch('/admin/driver-branch-requests')).data as Array<{ status: string }>,
    enabled: allBranchView && !cashierMode,
  });
  const pendingBranchRequestCount = branchRequests.filter((row) => row.status === 'PENDING').length;

  const { from: scheduleDateFrom, to: scheduleDateTo } = effectiveScheduleDates(
    cashierMode,
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
  );

  const activeJobsQuery = buildDeliveryJobsQuery({
    storeId: effectiveStoreId,
    driverId: appliedFilters.driverId || undefined,
    scheduledAtFrom: scheduleDateFrom || undefined,
    scheduledAtTo: scheduleDateTo || undefined,
  });

  const completedJobsQuery = buildDeliveryJobsQuery({
    storeId: effectiveStoreId,
    status: 'COMPLETED',
    driverId: appliedFilters.driverId || undefined,
    dateFrom: scheduleDateFrom || undefined,
    dateTo: scheduleDateTo || undefined,
  });

  const jobsQueryEnabled = tab === 'jobs' && (allBranchView || !!branchStoreId);
  const incompleteJobsQuery = buildDeliveryJobsQuery({
    storeId: effectiveStoreId,
    status: 'INCOMPLETE',
    driverId: appliedFilters.driverId || undefined,
    scheduledAtFrom: scheduleDateFrom || undefined,
    scheduledAtTo: scheduleDateTo || undefined,
  });

  const {
    data: activeJobs = [],
    isLoading: activeLoading,
    refetch: refetchActive,
    isFetching: activeFetching,
  } = useQuery({
    queryKey: ['admin-delivery-jobs-active', activeJobsQuery],
    queryFn: async () => (await adminFetch(`/admin/delivery-jobs${activeJobsQuery}`)).data as DeliveryJobListItem[],
    enabled: jobsQueryEnabled,
    refetchInterval: tab === 'jobs' ? 20_000 : false,
    refetchIntervalInBackground: false,
  });

  const {
    data: completedJobs = [],
    isLoading: completedLoading,
    refetch: refetchCompleted,
    isFetching: completedFetching,
  } = useQuery({
    queryKey: ['admin-delivery-jobs-completed', completedJobsQuery],
    queryFn: async () =>
      (await adminFetch(`/admin/delivery-jobs${completedJobsQuery}`)).data as DeliveryJobListItem[],
    enabled: jobsQueryEnabled,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  const {
    data: incompleteJobs = [],
    isLoading: incompleteLoading,
    refetch: refetchIncomplete,
    isFetching: incompleteFetching,
  } = useQuery({
    queryKey: ['admin-delivery-jobs-incomplete', incompleteJobsQuery],
    queryFn: async () =>
      (await adminFetch(`/admin/delivery-jobs${incompleteJobsQuery}`)).data as DeliveryJobListItem[],
    enabled: jobsQueryEnabled,
    refetchInterval: tab === 'jobs' ? 20_000 : false,
    refetchIntervalInBackground: false,
  });

  const jobStoreIds = useMemo(() => {
    const ids = new Set<string>();
    if (branchStoreId) ids.add(branchStoreId);
    if (effectiveStoreId) ids.add(effectiveStoreId);
    for (const job of activeJobs) {
      if (job.storeId) ids.add(job.storeId);
    }
    return [...ids];
  }, [activeJobs, branchStoreId, effectiveStoreId]);

  useEffect(() => {
    if (tab !== 'jobs' || !admin || !jobsQueryEnabled) return;

    let cancelled = false;
    let socket: Socket | null = null;

    const rooms =
      jobStoreIds.length > 0
        ? jobStoreIds.map((storeIdToJoin) => ({ adminId: admin.id, storeId: storeIdToJoin }))
        : [{ adminId: admin.id, storeId: admin.storeId }];

    void connectAdminSocketWithRooms(rooms, (created) => {
      if (cancelled) {
        created.disconnect();
        return;
      }
      socket = created;
      created.on('deliveryJobUpdated', () => {
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-active'] });
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-completed'] });
        queryClient.invalidateQueries({ queryKey: ['admin-delivery-jobs-incomplete'] });
      });
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [tab, admin, jobsQueryEnabled, jobStoreIds, queryClient]);

  const filteredActiveJobs = useMemo(
    // Past-due held jobs already carry a displayStatus (Abandoned/Partially
    // Completed) and show in the Incomplete tab instead — don't double-list them.
    () => activeJobs.filter(isActiveDeliveryJob),
    [activeJobs],
  );

  const branchScoped = isBranchScoped(admin);
  const jobsRefreshing = activeFetching || completedFetching || incompleteFetching;

  const refreshCurrentTab = useCallback(async () => {
    setTabRefreshing(true);
    try {
      const queryKeys = DELIVERY_TAB_QUERY_KEYS[tab];
      if (queryKeys) {
        await Promise.all(
          queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] })),
        );
      } else {
        await Promise.all([refetchActive(), refetchCompleted(), refetchIncomplete()]);
      }
    } finally {
      setTabRefreshing(false);
    }
  }, [tab, queryClient, refetchActive, refetchCompleted, refetchIncomplete]);

  const isRefreshing = tabRefreshing || (tab === 'jobs' && jobsRefreshing);

  if (admin === null) {
    return <div className="p-8 text-center text-muted">Loading delivery…</div>;
  }

  if (!branchStoreId && !allBranchView) {
    return <div className="card p-8 text-center text-muted">Branch account is not linked to a store.</div>;
  }

  function setTab(next: DeliveryTab) {
    setRoutePanel(null);
    setDrawerJob(null);
    if (next === 'dashboard') {
      router.replace('/admin/delivery');
    } else {
      router.replace(`/admin/delivery?tab=${next}`);
    }
  }

  function applyFilters() {
    setAppliedFilters({ ...pendingFilters });
  }

  function resetFilters() {
    const defaults = defaultFilters(allBranchView ? undefined : storeId, cashierMode);
    setPendingFilters(defaults);
    setAppliedFilters(defaults);
  }

  function applyAnalyticsFilters() {
    setAppliedAnalyticsFilters({ ...pendingAnalyticsFilters });
    setAnalyticsRiderPage(1);
  }

  function resetAnalyticsFilters() {
    const defaults = defaultPeriodFilters(allBranchView ? undefined : storeId);
    setPendingAnalyticsFilters(defaults);
    setAppliedAnalyticsFilters(defaults);
    setAnalyticsRiderPage(1);
  }

  function applyDashboardFilters() {
    setAppliedDashboardFilters({ ...pendingDashboardFilters });
  }

  function resetDashboardFilters() {
    const defaults = defaultDashboardFilters(allBranchView ? undefined : storeId);
    setPendingDashboardFilters(defaults);
    setAppliedDashboardFilters(defaults);
  }

  function dashboardFiltersToJobFilters(filters: AnalyticsFilters): JobFilters {
    return {
      storeId: filters.storeId ?? '',
      driverId: filters.driverId ?? '',
      dateFrom: filters.dateFrom ?? '',
      dateTo: filters.dateTo ?? '',
    };
  }

  function handleViewAllJobsFromDashboard(filters: AnalyticsFilters) {
    const next = dashboardFiltersToJobFilters(filters);
    setPendingFilters(next);
    setAppliedFilters(next);
    setTab('jobs');
  }

  function handleViewAllAnalyticsFromDashboard(filters: AnalyticsFilters) {
    setPendingAnalyticsFilters(filters);
    setAppliedAnalyticsFilters(filters);
    setAnalyticsRiderPage(1);
    setTab('analytics');
  }

  function openRoute(
    view: JobRef & { initialStatus?: string; focusDriver?: boolean },
    mode: RoutePanelState['mode'],
  ) {
    setRoutePanel({ ...view, mode });
  }

  function handleRowClick(job: DeliveryJobListItem) {
    setDrawerJob({
      jobId: job.id,
      storeId: job.storeId ?? (effectiveStoreId ?? storeId),
      forceReplay: jobsSubTab === 'incomplete' || Boolean(job.displayStatus),
      displayStatus: job.displayStatus,
    });
  }

  const filterBar = (
    <div className="card mb-6 overflow-hidden">
      <div className="border-b border-navy-border px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Filters</h2>
        <p className="text-muted text-xs mt-0.5">
          {cashierMode
            ? "Showing today's delivery schedules."
            : 'Apply filters to both active and completed delivery schedules.'}
        </p>
      </div>
      <div className="px-4 py-4 sm:px-5 flex flex-wrap gap-3 items-end">
        {allBranchView && (
          <div>
            <label className="block text-xs text-muted mb-1">Branch</label>
            <SearchableBranchSelect
              stores={stores}
              value={pendingFilters.storeId || undefined}
              onChange={(nextStoreId) =>
                setPendingFilters((current) => ({
                  ...current,
                  storeId: nextStoreId,
                  driverId: '',
                }))
              }
              formatName={formatBranchName}
              placeholder="All branches"
              className="min-w-[160px] h-[38px]"
            />
          </div>
        )}
        {!allBranchView && branchStoreId && (
          <div>
            <label className="block text-xs text-muted mb-1">Branch</label>
            <div className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm min-w-[160px] h-[38px] flex items-center opacity-80">
              Your branch
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-muted mb-1">Rider</label>
          <select
            value={pendingFilters.driverId}
            onChange={(e) => setPendingFilters((current) => ({ ...current, driverId: e.target.value }))}
            className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm min-w-[160px] h-[38px]"
          >
            <option value="">All riders</option>
            {filterDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.store?.name ? `${d.name} · ${formatBranchName(d.store.name)}` : d.name}
              </option>
            ))}
          </select>
        </div>
        {!cashierMode && (
          <>
            <div>
              <label className="block text-xs text-muted mb-1">Date from</label>
              <input
                type="date"
                value={pendingFilters.dateFrom}
                onChange={(e) => setPendingFilters((current) => ({ ...current, dateFrom: e.target.value }))}
                className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm h-[38px]"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Date to</label>
              <input
                type="date"
                value={pendingFilters.dateTo}
                onChange={(e) => setPendingFilters((current) => ({ ...current, dateTo: e.target.value }))}
                className="bg-navy-light border border-navy-border rounded-lg px-3 py-2 text-white text-sm h-[38px]"
              />
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="text-sm text-white bg-brand border border-brand rounded-lg px-4 py-2 hover:bg-brand/90 transition-colors h-[38px] flex items-center"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-white bg-navy-light border border-navy-border rounded-lg px-4 py-2 hover:bg-navy transition-colors h-[38px] flex items-center"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );

  const analyticsFilterFieldClass =
    'bg-navy-light border border-navy-border rounded-lg px-3.5 text-sm text-fg min-w-[160px] h-11 w-full';
  const analyticsFilterLabelClass = 'block text-xs font-medium text-muted mb-1.5';

  const analyticsFilterBar = (
    <section className="card overflow-hidden shadow-sm">
      <div className="border-b border-navy-border px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-fg">Filters</h2>
        <p className="mt-1 text-sm text-muted">
          Apply filters to analytics summary and rider KPI rows.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:flex lg:flex-wrap lg:items-end">
        {allBranchView && (
          <div className="min-w-[160px] flex-1 lg:max-w-[220px]">
            <label className={analyticsFilterLabelClass}>Branch</label>
            <SearchableBranchSelect
              stores={stores}
              value={pendingAnalyticsFilters.storeId || undefined}
              onChange={(nextStoreId) =>
                setPendingAnalyticsFilters((current) => ({
                  ...current,
                  storeId: nextStoreId,
                  driverId: '',
                }))
              }
              formatName={formatBranchName}
              placeholder="All branches"
              className={`${analyticsFilterFieldClass} min-w-0`}
            />
          </div>
        )}
        {!allBranchView && branchStoreId && (
          <div className="min-w-[160px] flex-1 lg:max-w-[220px]">
            <label className={analyticsFilterLabelClass}>Branch</label>
            <div
              className={`${analyticsFilterFieldClass} flex items-center gap-2 bg-navy-light/70 text-fg`}
              aria-readonly="true"
            >
              <Building2 size={16} className="shrink-0 text-muted" aria-hidden />
              <span className="truncate">Your branch</span>
              <Lock size={14} className="ml-auto shrink-0 text-muted/70" aria-hidden />
            </div>
          </div>
        )}
        <div className="min-w-[160px] flex-1 lg:max-w-[220px]">
          <label htmlFor="analytics-rider" className={analyticsFilterLabelClass}>
            Rider
          </label>
          <select
            id="analytics-rider"
            value={pendingAnalyticsFilters.driverId ?? ''}
            onChange={(e) =>
              setPendingAnalyticsFilters((current) => ({ ...current, driverId: e.target.value }))
            }
            className={analyticsFilterFieldClass}
          >
            <option value="">All riders</option>
            {filterDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.store?.name ? `${d.name} · ${formatBranchName(d.store.name)}` : d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1 lg:max-w-[180px]">
          <label htmlFor="analytics-date-from" className={analyticsFilterLabelClass}>
            Date from
          </label>
          <input
            id="analytics-date-from"
            type="date"
            value={pendingAnalyticsFilters.dateFrom ?? ''}
            onChange={(e) =>
              setPendingAnalyticsFilters((current) => ({ ...current, dateFrom: e.target.value }))
            }
            className={analyticsFilterFieldClass}
          />
        </div>
        <div className="min-w-[160px] flex-1 lg:max-w-[180px]">
          <label htmlFor="analytics-date-to" className={analyticsFilterLabelClass}>
            Date to
          </label>
          <input
            id="analytics-date-to"
            type="date"
            value={pendingAnalyticsFilters.dateTo ?? ''}
            onChange={(e) =>
              setPendingAnalyticsFilters((current) => ({ ...current, dateTo: e.target.value }))
            }
            className={analyticsFilterFieldClass}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 lg:ml-auto lg:pb-0">
          <button
            type="button"
            onClick={applyAnalyticsFilters}
            className="btn-primary inline-flex h-11 items-center px-5 text-sm"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={resetAnalyticsFilters}
            className="btn-outline inline-flex h-11 items-center px-5 text-sm"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Truck size={20} className="text-brand" />
            Delivery
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {tab === 'dashboard' ? (
              'Live fleet, period performance, and partner earnings'
            ) : tab === 'jobs' ? (
              <>
                Scheduled delivery runs · classify new orders on the{' '}
                <Link href="/admin/orders" className="text-brand hover:underline">
                  Orders
                </Link>{' '}
                page
              </>
            ) : allBranchView ? (
              'View branch driver pools and rider performance'
            ) : (
              'Branch driver pool with duty and system status'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {branchScoped && !routePanel ? (
            <button
              type="button"
              onClick={() => void refreshCurrentTab()}
              disabled={isRefreshing}
              className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          ) : null}
        </div>
      </div>

      {!cashierMode && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
              tab === 'dashboard' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Gauge size={14} /> Dashboard
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('jobs')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
              tab === 'jobs' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Truck size={14} /> Delivery Jobs
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('drivers')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
              tab === 'drivers' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users size={14} /> Drivers
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('complaints')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
              tab === 'complaints' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            Complaints
          </button>
          <button
            type="button"
            onClick={() => setTab('failures')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'failures' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            Failures
          </button>
          {allBranchView && (
            <button
              type="button"
              onClick={() => setTab('requests')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                tab === 'requests' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
              }`}
            >
              Branch requests{pendingBranchRequestCount > 0 ? ` (${pendingBranchRequestCount})` : ''}
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('analytics')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
              tab === 'analytics' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
            }`}
          >
            Analytics
          </button>
        </div>
      )}

      {tab === 'dashboard' ? (
        <AdminDeliveryDashboard
          appliedFilters={appliedDashboardFilters}
          pendingFilters={pendingDashboardFilters}
          onPendingFiltersChange={setPendingDashboardFilters}
          onApplyFilters={applyDashboardFilters}
          onResetFilters={resetDashboardFilters}
          superAdmin={allBranchView}
          branchStoreId={branchStoreId}
          stores={stores}
          filterDrivers={filterDrivers}
          queryEnabled={allBranchView || !!branchStoreId}
          onNavigateToDrivers={() => setTab('drivers')}
          onViewAllJobs={handleViewAllJobsFromDashboard}
          onViewAllAnalytics={handleViewAllAnalyticsFromDashboard}
        />
      ) : tab === 'drivers' ? (
        <AdminDriversPanel
          storeId={branchStoreId ?? ''}
          showAllBranches={allBranchView}
          stores={stores}
          canRegisterDrivers={canCreateDrivers || canUpdateDrivers}
        />
      ) : tab === 'complaints' ? (
        <AdminDriverOpsPanel storeId={branchStoreId} mode="complaints" />
      ) : tab === 'failures' ? (
        <AdminDriverOpsPanel storeId={branchStoreId} mode="failures" />
      ) : tab === 'requests' ? (
        <AdminDriverOpsPanel mode="requests" canReviewRequests={allBranchView} />
      ) : tab === 'analytics' ? (
        <div className="mx-auto w-full max-w-[1600px] space-y-7 sm:space-y-8">
          <header className="pb-1">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-fg">
              <BarChart3 size={20} className="text-brand" aria-hidden />
              Rider performance
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Review branch delivery activity and rider KPIs for the selected period.
            </p>
          </header>
          {analyticsFilterBar}
          <AdminDriverOpsPanel
            mode="analytics"
            analyticsFilters={{
              storeId: effectiveAnalyticsStoreId,
              driverId: appliedAnalyticsFilters.driverId || undefined,
              dateFrom: appliedAnalyticsFilters.dateFrom || undefined,
              dateTo: appliedAnalyticsFilters.dateTo || undefined,
            }}
            analyticsPage={analyticsRiderPage}
            analyticsPageSize={ANALYTICS_PAGE_SIZE}
            onAnalyticsPageChange={setAnalyticsRiderPage}
          />
        </div>
      ) : routePanel?.mode === 'planned' || routePanel?.mode === 'actual' ? (
        <AdminDeliveryRouteView
          jobId={routePanel.jobId}
          storeId={routePanel.storeId}
          initialStatus={routePanel.initialStatus}
          displayStatus={routePanel.displayStatus}
          forceReplay={routePanel.forceReplay || routePanel.mode === 'actual'}
          focusDriver={routePanel.focusDriver}
          initialPathLayers={
            routePanel.mode === 'actual' ? { planned: false, actual: true } : { planned: true, actual: true }
          }
          onFocusDriverHandled={() =>
            setRoutePanel((current) =>
              current ? { ...current, focusDriver: false } : current,
            )
          }
          onBack={() => setRoutePanel(null)}
        />
      ) : (
        <>
          {filterBar}

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setJobsSubTab('active')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                jobsSubTab === 'active' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Truck size={14} /> Active ({filteredActiveJobs.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setJobsSubTab('completed')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                jobsSubTab === 'completed' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Complete ({completedJobs.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setJobsSubTab('incomplete')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${
                jobsSubTab === 'incomplete' ? 'bg-brand text-white' : 'bg-navy-light text-muted'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle size={14} /> Incomplete ({incompleteJobs.length})
              </span>
            </button>
          </div>

          {jobsSubTab === 'active' && (
            <section className="card overflow-hidden">
              <div className="border-b border-navy-border px-4 py-4 sm:px-5">
                <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                  <Truck size={18} className="text-brand" />
                  Active schedules
                </h2>
                <p className="text-muted text-xs mt-1">
                  Today&apos;s unclaimed jobs and runs currently in progress. Click a row to open full job details.
                </p>
              </div>
              {activeLoading ? (
                <div className="p-8 text-center text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading schedules…
                </div>
              ) : filteredActiveJobs.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  <MapPin size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No active delivery schedules.</p>
                  <Link href="/admin/orders" className="text-brand text-sm hover:underline mt-2 inline-block">
                    Classify orders on Orders page →
                  </Link>
                </div>
              ) : (
                <AdminDeliveryJobsTable
                  jobs={filteredActiveJobs}
                  storeId={effectiveStoreId ?? storeId}
                  variant="active"
                  emptyMessage="No active delivery schedules."
                  onViewRoute={(view) => openRoute(view, 'planned')}
                  onRowClick={handleRowClick}
                />
              )}
            </section>
          )}

          {jobsSubTab === 'completed' && (
            <section className="card overflow-hidden">
              <div className="border-b border-navy-border px-4 py-4 sm:px-5">
                <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-green-400" />
                  Completed schedules
                </h2>
                <p className="text-muted text-xs mt-1">
                  Past delivery runs · click a row to review full job details.
                </p>
              </div>
              {completedLoading ? (
                <div className="p-8 text-center text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading completed schedules…
                </div>
              ) : (
                <AdminDeliveryJobsTable
                  jobs={completedJobs}
                  storeId={effectiveStoreId ?? storeId}
                  variant="completed"
                  emptyMessage="No completed delivery schedules yet."
                  onViewRoute={(view) => openRoute(view, 'planned')}
                  onViewActualRoute={(view) => openRoute(view, 'actual')}
                  onRowClick={handleRowClick}
                />
              )}
            </section>
          )}

          {jobsSubTab === 'incomplete' && (
            <section className="card overflow-hidden">
              <div className="border-b border-navy-border px-4 py-4 sm:px-5">
                <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-400" />
                  Incomplete schedules
                </h2>
                <p className="text-muted text-xs mt-1">
                  Past-day jobs nobody picked up (Missed), claimed but never started (Abandoned),
                  claimed but not finished (Partially Completed), or Cancelled.
                </p>
              </div>
              {incompleteLoading ? (
                <div className="p-8 text-center text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading incomplete schedules…
                </div>
              ) : (
                <AdminDeliveryJobsTable
                  jobs={incompleteJobs}
                  storeId={effectiveStoreId ?? storeId}
                  variant="incomplete"
                  emptyMessage="No incomplete delivery schedules."
                  onViewRoute={(view) => openRoute(view, 'planned')}
                  onViewActualRoute={(view) => openRoute(view, 'actual')}
                  onRowClick={handleRowClick}
                />
              )}
            </section>
          )}

          {drawerJob && (
            <AdminDeliveryJobDrawer
              jobId={drawerJob.jobId}
              storeId={drawerJob.storeId}
              open={!!drawerJob}
              forceReplay={drawerJob.forceReplay}
              displayStatus={drawerJob.displayStatus}
              onClose={() => setDrawerJob(null)}
              onViewRoute={(opts) => {
                setDrawerJob(null);
                setRoutePanel({ ...opts, mode: 'planned' });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function AdminDeliveryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading delivery…</div>}>
      <AdminDeliveryContent />
    </Suspense>
  );
}
