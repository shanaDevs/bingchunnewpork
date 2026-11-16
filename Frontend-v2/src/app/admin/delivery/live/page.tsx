'use client';

import { adminFetch } from '@/lib/adminApi';
import { connectAdminSocketWithRooms } from '@/lib/adminSocket';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildDeliveryJobsQuery,
  effectiveScheduleDates,
  isActiveDeliveryJob,
} from '@/lib/adminDeliveryQueries';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { getAdminSession, isAllBranchView, isCashier } from '@/lib/adminAuth';
import { adminBadgeClass, DELIVERY_JOB_STATUS_BADGE, DELIVERY_JOB_STATUS_LABEL } from '@/lib/adminBadges';
import { formatDeliveryJobTitle } from '@/lib/deliveryRoute';
import { buildPageList } from '@/lib/pagination';
import type {
  LiveDriverCurrentJob,
  LiveDriverMarker,
  LivePathPoint,
  LiveStoreMarker,
} from '@/components/admin/AdminLiveDriversMap';

const AdminLiveDriversMap = dynamic(() => import('@/components/admin/AdminLiveDriversMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center bg-navy-light text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

const LIVE_PATH_LIMIT = 10;
const RUNS_PAGE_SIZE = 8;
const RUNS_COLLAPSED_KEY = 'bc_live_drivers_runs_collapsed';

type LiveJob = {
  id: string;
  title: string;
  status: string;
  orderCount: number;
  deliveredCount?: number;
  displayStatus?: string | null;
  storeId?: string;
  storeName?: string;
  driver?: { id?: string; name: string } | null;
};

type StoreOption = { id: string; name: string; addressLine: string; lat: number; lng: number };

type LivePathRecord = LivePathPoint & { recordedAt?: string };

type LiveDriverRow = {
  driverId: string;
  name: string;
  dutyStatus: string;
  storeName: string | null;
  lat: number | null;
  lng: number | null;
  heading?: number | null;
  updatedAt: string | null;
  jobId: string | null;
  currentJob?: LiveDriverCurrentJob | null;
  recentPath?: LivePathRecord[];
};

type DriverPing = {
  lat: number;
  lng: number;
  heading?: number | null;
  updatedAt?: string;
};

/** Realtime location payload from the Delivery Service's `/delivery` socket fan-out (docs/27). */
type DriverLocationEvent = {
  jobId?: string;
  driverId?: string;
  storeId?: string;
  orderId?: string;
  lat: number;
  lng: number;
  heading?: number | null;
  updatedAt?: string;
  recordedAt?: string;
};

function isoTime(value?: string | Date | null) {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}

function appendTrailPoint(
  prev: Record<string, LivePathRecord[]>,
  key: string,
  point: LivePathRecord,
): Record<string, LivePathRecord[]> {
  const path = prev[key] ?? [];
  const last = path[path.length - 1];
  if (last && Math.abs(last.lat - point.lat) < 1e-7 && Math.abs(last.lng - point.lng) < 1e-7) {
    return prev;
  }
  return { ...prev, [key]: [...path, point].slice(-LIVE_PATH_LIMIT) };
}

function mergeApiTrail(apiPath: LivePathRecord[], local: LivePathRecord[]): LivePathRecord[] {
  if (apiPath.length === 0) return local.slice(-LIVE_PATH_LIMIT);
  const lastApiAt = apiPath[apiPath.length - 1]?.recordedAt;
  const extras = lastApiAt ? local.filter((point) => point.recordedAt && point.recordedAt > lastApiAt) : [];
  return [...apiPath, ...extras].slice(-LIVE_PATH_LIMIT);
}

export default function AdminLiveDeliveryPage() {
  const [admin, setAdmin] = useState<ReturnType<typeof getAdminSession>>(null);
  const [driverPositions, setDriverPositions] = useState<Record<string, DriverPing>>({});
  const [driverTrails, setDriverTrails] = useState<Record<string, LivePathRecord[]>>({});
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [runsCollapsed, setRunsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return sessionStorage.getItem(RUNS_COLLAPSED_KEY) !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    setAdmin(getAdminSession());
  }, []);

  const allBranchView = isAllBranchView(admin);
  const cashierMode = isCashier(admin);
  const branchStoreId = allBranchView ? undefined : admin?.storeId || undefined;

  const { from: scheduleDateFrom, to: scheduleDateTo } = effectiveScheduleDates(
    cashierMode,
    '',
    '',
  );

  const jobsQuery = useMemo(
    () =>
      buildDeliveryJobsQuery({
        storeId: branchStoreId,
        scheduledAtFrom: scheduleDateFrom || undefined,
        scheduledAtTo: scheduleDateTo || undefined,
      }),
    [branchStoreId, scheduleDateFrom, scheduleDateTo],
  );

  const {
    data: jobs = [],
    isLoading,
    isFetching,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ['admin-live-delivery-jobs', jobsQuery],
    queryFn: async () => (await adminFetch(`/admin/delivery-jobs${jobsQuery}`)).data as LiveJob[],
    enabled: admin !== null,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const liveQuery = branchStoreId ? `?storeId=${branchStoreId}` : '';
  const { data: liveDrivers = [], refetch: refetchLive } = useQuery({
    queryKey: ['admin-live-drivers', branchStoreId],
    queryFn: async () => (await adminFetch(`/admin/live-drivers${liveQuery}`)).data as LiveDriverRow[],
    enabled: admin !== null,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-live-delivery-stores'],
    queryFn: async () => (await adminFetch('/stores')).data as StoreOption[],
    enabled: admin !== null,
  });

  useEffect(() => {
    if (liveDrivers.length === 0) return;

    setDriverPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const driver of liveDrivers) {
        if (driver.lat == null || driver.lng == null) continue;
        const ping: DriverPing = {
          lat: driver.lat,
          lng: driver.lng,
          heading: driver.heading ?? null,
          updatedAt: isoTime(driver.updatedAt),
        };
        const apply = (key: string) => {
          const existing = next[key];
          if (!existing || (ping.updatedAt && (!existing.updatedAt || ping.updatedAt >= existing.updatedAt))) {
            next[key] = existing ? { ...existing, ...ping } : ping;
            if (existing !== next[key]) changed = true;
          }
        };
        apply(driver.driverId);
        if (driver.jobId) apply(driver.jobId);
      }
      return changed ? next : prev;
    });

    setDriverTrails((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const driver of liveDrivers) {
        const apiPath = (driver.recentPath ?? []).map((point) => ({
          lat: point.lat,
          lng: point.lng,
          heading: point.heading ?? null,
          recordedAt: isoTime(point.recordedAt),
        }));
        const merged = mergeApiTrail(apiPath, prev[driver.driverId] ?? []);
        if (merged.length === 0) continue;
        const current = prev[driver.driverId];
        if (
          !current ||
          current.length !== merged.length ||
          current[current.length - 1]?.recordedAt !== merged[merged.length - 1]?.recordedAt ||
          current[current.length - 1]?.lat !== merged[merged.length - 1]?.lat
        ) {
          next[driver.driverId] = merged;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [liveDrivers]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    let socket: Socket | null = null;

    void connectAdminSocketWithRooms(
      [{ adminId: admin.id, storeId: branchStoreId }],
      (created) => {
        if (cancelled) {
          created.disconnect();
          return;
        }
        socket = created;
        created.on('driverLocation', (payload: DriverLocationEvent) => {
          if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return;
          const recordedAt = payload.recordedAt ?? payload.updatedAt;
          const ping: DriverPing = {
            lat: payload.lat,
            lng: payload.lng,
            heading: payload.heading ?? null,
            updatedAt: recordedAt,
          };
          const keys = [payload.driverId, payload.jobId].filter(Boolean) as string[];
          if (keys.length === 0) return;

          setDriverPositions((prev) => {
            const next = { ...prev };
            for (const key of keys) next[key] = ping;
            return next;
          });

          if (payload.driverId) {
            setDriverTrails((prev) =>
              appendTrailPoint(prev, payload.driverId!, {
                lat: payload.lat,
                lng: payload.lng,
                heading: payload.heading ?? null,
                recordedAt,
              }),
            );
          }
        });
      },
    );

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [admin, branchStoreId]);

  const activeJobs = useMemo(() => jobs.filter(isActiveDeliveryJob), [jobs]);

  const totalRunPages = Math.max(1, Math.ceil(activeJobs.length / RUNS_PAGE_SIZE));
  const safeRunsPage = Math.min(runsPage, totalRunPages);

  useEffect(() => {
    if (runsPage > totalRunPages) setRunsPage(totalRunPages);
  }, [runsPage, totalRunPages]);

  const pagedJobs = useMemo(() => {
    const start = (safeRunsPage - 1) * RUNS_PAGE_SIZE;
    return activeJobs.slice(start, start + RUNS_PAGE_SIZE);
  }, [activeJobs, safeRunsPage]);

  const runPageList = useMemo(
    () => buildPageList(safeRunsPage, totalRunPages),
    [safeRunsPage, totalRunPages],
  );

  const storeMarkers: LiveStoreMarker[] = useMemo(() => {
    const activeStoreIds = new Set(activeJobs.map((j) => j.storeId).filter(Boolean));
    return stores
      .filter((s) => activeStoreIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, addressLine: s.addressLine }));
  }, [stores, activeJobs]);

  const liveDriverById = useMemo(() => {
    const map = new Map<string, LiveDriverRow>();
    for (const driver of liveDrivers) map.set(driver.driverId, driver);
    return map;
  }, [liveDrivers]);

  const driverMarkers: LiveDriverMarker[] = useMemo(() => {
    const markers: LiveDriverMarker[] = [];
    const seen = new Set<string>();
    for (const job of activeJobs) {
      const driverId = job.driver?.id;
      const liveRow = driverId ? liveDriverById.get(driverId) : undefined;
      const socketPos = driverPositions[job.id] ?? (driverId ? driverPositions[driverId] : undefined);
      const lat = socketPos?.lat ?? liveRow?.lat ?? null;
      const lng = socketPos?.lng ?? liveRow?.lng ?? null;
      if (lat == null || lng == null) continue;
      const key = driverId ?? job.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const trail = driverId ? driverTrails[driverId] : undefined;
      const lastTrail = trail?.[trail.length - 1];
      markers.push({
        jobId: job.id,
        driverId,
        driverName: job.driver?.name ?? liveRow?.name ?? 'Driver',
        storeName: job.storeName,
        dutyStatus: liveRow?.dutyStatus,
        currentJob: liveRow?.currentJob ?? null,
        lat,
        lng,
        heading: socketPos?.heading ?? liveRow?.heading ?? lastTrail?.heading ?? null,
        updatedAt: socketPos?.updatedAt ?? liveRow?.updatedAt ?? undefined,
        path: trail,
      });
    }
    return markers;
  }, [activeJobs, driverPositions, driverTrails, liveDriverById]);

  const selectedMarker = useMemo(
    () => driverMarkers.find((marker) => (marker.driverId ?? marker.jobId) === selectedDriverId) ?? null,
    [driverMarkers, selectedDriverId],
  );

  const selectDriver = useCallback((driverId: string) => {
    setSelectedDriverId(driverId);
    setFocusNonce((value) => value + 1);
  }, []);

  const toggleRunsCollapsed = useCallback(() => {
    setRunsCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(RUNS_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const rangeStart = activeJobs.length === 0 ? 0 : (safeRunsPage - 1) * RUNS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safeRunsPage * RUNS_PAGE_SIZE, activeJobs.length);

  if (admin === null) {
    return <div className="p-8 text-center text-muted">Loading live drivers…</div>;
  }

  return (
    <div className="live-drivers-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/delivery" className="text-muted text-xs hover:text-brand inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> Back to Delivery
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck size={22} className="text-brand" />
            Live Drivers
          </h1>
          <p className="text-muted text-sm mt-0.5">
            Same active schedules as the Delivery page{isFetching ? ' · refreshing…' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refetchJobs();
            void refetchLive();
          }}
          className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="live-drivers-page__stage card overflow-hidden">
        <AdminLiveDriversMap
          stores={storeMarkers}
          drivers={driverMarkers}
          selectedDriverId={selectedDriverId}
          onDriverSelect={selectDriver}
          fitBoundsMode="once"
          zoomPosition="topright"
          focusPosition={selectedMarker ? [selectedMarker.lat, selectedMarker.lng] : null}
          focusNonce={focusNonce}
          className="h-full min-h-[520px]"
        />

        {runsCollapsed ? (
          <div className="live-drivers-overlay live-drivers-overlay--collapsed">
            <button type="button" className="live-drivers-overlay__chip" onClick={toggleRunsCollapsed}>
              <PanelLeftOpen size={14} />
              Active ({activeJobs.length})
            </button>
          </div>
        ) : (
          <div className="live-drivers-overlay card">
            <div className="live-drivers-overlay__header">
              <h2 className="text-sm font-bold text-fg">Active ({activeJobs.length})</h2>
              <button
                type="button"
                className="live-drivers-overlay__collapse"
                onClick={toggleRunsCollapsed}
                aria-label="Collapse active orders"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div className="live-drivers-overlay__list">
              {isLoading ? (
                <div className="p-6 text-center text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              ) : activeJobs.length === 0 ? (
                <div className="p-6 text-center text-muted text-sm">
                  <MapPin size={28} className="mx-auto mb-2 opacity-40" />
                  No active delivery orders right now.
                </div>
              ) : (
                pagedJobs.map((job) => {
                  const driverKey = job.driver?.id ?? job.id;
                  const hasLivePosition = Boolean(
                    driverPositions[job.id] ?? (job.driver?.id ? driverPositions[job.driver.id] : undefined),
                  );
                  const selected = selectedDriverId === driverKey;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      className={`live-drivers-overlay__run${selected ? ' live-drivers-overlay__run--selected' : ''}`}
                      onClick={() => selectDriver(driverKey)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-fg truncate">{formatDeliveryJobTitle(job.title)}</p>
                        <span
                          className={`shrink-0 h-2 w-2 rounded-full ${hasLivePosition ? 'bg-green-400' : 'bg-navy-border'}`}
                          title={hasLivePosition ? 'Live location available' : 'No live location yet'}
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className={adminBadgeClass(
                            DELIVERY_JOB_STATUS_BADGE[job.status] ?? 'neutral',
                          )}
                        >
                          {DELIVERY_JOB_STATUS_LABEL[job.status] ?? job.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-muted truncate">{job.storeName ?? 'Unknown branch'}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs">
                        <span className="text-muted">{job.driver?.name ?? 'Unassigned driver'}</span>
                        <span className="text-brand-light">
                          {job.deliveredCount ?? 0}/{job.orderCount} delivered
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {activeJobs.length > 0 && (
              <div className="live-drivers-overlay__pager">
                <p className="text-[11px] text-muted text-center">
                  Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
                  <span className="text-fg font-semibold tabular-nums">{activeJobs.length}</span> active
                </p>
                {totalRunPages > 1 && (
                  <nav className="live-drivers-overlay__pager-nav" aria-label="Active orders pages">
                    <button
                      type="button"
                      className="live-drivers-overlay__pager-btn"
                      onClick={() => setRunsPage(Math.max(1, safeRunsPage - 1))}
                      disabled={safeRunsPage <= 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {runPageList.map((item, index) =>
                      item === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="text-muted text-xs px-1">
                          …
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          className={`live-drivers-overlay__pager-page${item === safeRunsPage ? ' live-drivers-overlay__pager-page--active' : ''}`}
                          onClick={() => setRunsPage(item)}
                          aria-label={`Page ${item}`}
                          aria-current={item === safeRunsPage ? 'page' : undefined}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      className="live-drivers-overlay__pager-btn"
                      onClick={() => setRunsPage(Math.min(totalRunPages, safeRunsPage + 1))}
                      disabled={safeRunsPage >= totalRunPages}
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </nav>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
