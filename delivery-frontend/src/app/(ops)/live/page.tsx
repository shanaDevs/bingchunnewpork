'use client';

import { adminFetch } from '@/lib/adminApi';
import { connectAdminSocketWithRooms } from '@/lib/adminSocket';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { getAdminSession, isAllBranchView } from '@/lib/adminAuth';
import { adminBadgeClass, type AdminBadgeVariant } from '@/lib/adminBadges';
import { formatDeliveryJobTitle } from '@/lib/deliveryRoute';
import { buildPageList } from '@/lib/pagination';
import type { LiveDriverMarker, LivePathPoint, LiveStoreMarker } from '@/components/admin/AdminLiveDriversMap';

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

type StoreOption = { id: string; name: string; addressLine: string; lat: number; lng: number };

type LivePathRecord = LivePathPoint & { recordedAt?: string };

type LiveDriverActiveJob = { id: string; status: string; title: string };

type LiveDriverRow = {
  driverId: string;
  name: string;
  dutyStatus: string;
  vehicleNumber?: string | null;
  storeId?: string | null;
  storeName: string | null;
  lat: number | null;
  lng: number | null;
  heading?: number | null;
  updatedAt: string | null;
  jobId: string | null;
  activeJobs?: LiveDriverActiveJob[];
  recentPath?: LivePathRecord[];
};

const DUTY_STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online',
  ON_DELIVERY: 'On delivery',
};

function dutyStatusBadge(status: string): AdminBadgeVariant {
  if (status === 'ON_DELIVERY') return 'blue';
  if (status === 'ONLINE') return 'green';
  return 'neutral';
}

function riderCurrentJobTitle(driver: LiveDriverRow): string | null {
  const jobs = driver.activeJobs ?? [];
  const current = jobs.find((j) => j.status === 'IN_PROGRESS') ?? jobs[0];
  return current ? formatDeliveryJobTitle(current.title) : null;
}

function riderHasLocation(driver: LiveDriverRow, positions: Record<string, DriverPing>): boolean {
  const socketPos =
    positions[driver.driverId] ?? (driver.jobId ? positions[driver.jobId] : undefined);
  const lat = socketPos?.lat ?? driver.lat;
  const lng = socketPos?.lng ?? driver.lng;
  return lat != null && lng != null;
}

function branchFallbackPosition(
  storeId: string | null | undefined,
  stores: StoreOption[],
  slot: number,
): [number, number] | null {
  if (!storeId) return null;
  const store = stores.find((s) => s.id === storeId);
  if (!store) return null;
  const angle = (slot % 8) * (Math.PI / 4);
  const radius = 0.0012;
  return [store.lat + radius * Math.sin(angle), store.lng + radius * Math.cos(angle)];
}

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
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [mapResizeNonce, setMapResizeNonce] = useState(0);

  useEffect(() => {
    setAdmin(getAdminSession());
  }, []);

  const allBranchView = isAllBranchView(admin);
  const branchStoreId = allBranchView ? undefined : admin?.storeId || undefined;

  const liveQuery = branchStoreId ? `?storeId=${branchStoreId}` : '';
  const {
    data: liveDrivers = [],
    isLoading,
    isFetching,
    refetch: refetchLive,
  } = useQuery({
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

  const socketStoreRoomIds = useMemo(() => {
    if (branchStoreId) return [branchStoreId];
    const ids = new Set<string>();
    for (const store of stores) ids.add(store.id);
    for (const driver of liveDrivers) {
      if (driver.storeId) ids.add(driver.storeId);
    }
    return [...ids];
  }, [branchStoreId, stores, liveDrivers]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    let socket: Socket | null = null;

    const rooms =
      socketStoreRoomIds.length > 0
        ? socketStoreRoomIds.map((storeId) => ({ adminId: admin.id, storeId }))
        : [{ adminId: admin.id }];

    void connectAdminSocketWithRooms(rooms, (created) => {
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
    });

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [admin, socketStoreRoomIds]);

  const sortedOnlineRiders = useMemo(
    () => [...liveDrivers].sort((a, b) => a.name.localeCompare(b.name)),
    [liveDrivers],
  );

  const totalRunPages = Math.max(1, Math.ceil(sortedOnlineRiders.length / RUNS_PAGE_SIZE));
  const safeRunsPage = Math.min(runsPage, totalRunPages);

  useEffect(() => {
    if (runsPage > totalRunPages) setRunsPage(totalRunPages);
  }, [runsPage, totalRunPages]);

  const pagedRiders = useMemo(() => {
    const start = (safeRunsPage - 1) * RUNS_PAGE_SIZE;
    return sortedOnlineRiders.slice(start, start + RUNS_PAGE_SIZE);
  }, [sortedOnlineRiders, safeRunsPage]);

  const runPageList = useMemo(
    () => buildPageList(safeRunsPage, totalRunPages),
    [safeRunsPage, totalRunPages],
  );

  const storeMarkers: LiveStoreMarker[] = useMemo(() => {
    const storeIds = new Set(
      liveDrivers.map((d) => d.storeId).filter((id): id is string => Boolean(id)),
    );
    return stores
      .filter((s) => storeIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, addressLine: s.addressLine }));
  }, [stores, liveDrivers]);

  const driverMarkers: LiveDriverMarker[] = useMemo(() => {
    const markers: LiveDriverMarker[] = [];
    const branchSlot = new Map<string, number>();
    for (const driver of liveDrivers) {
      const socketPos =
        driverPositions[driver.driverId] ??
        (driver.jobId ? driverPositions[driver.jobId] : undefined);
      let lat = socketPos?.lat ?? driver.lat ?? null;
      let lng = socketPos?.lng ?? driver.lng ?? null;
      let locationApproximate = false;
      if (lat == null || lng == null) {
        const storeKey = driver.storeId ?? '';
        const slot = branchSlot.get(storeKey) ?? 0;
        branchSlot.set(storeKey, slot + 1);
        const fallback = branchFallbackPosition(driver.storeId, stores, slot);
        if (!fallback) continue;
        [lat, lng] = fallback;
        locationApproximate = true;
      }
      const trail = locationApproximate ? undefined : driverTrails[driver.driverId];
      const lastTrail = trail?.[trail.length - 1];
      markers.push({
        jobId: driver.jobId ?? driver.driverId,
        driverId: driver.driverId,
        driverName: driver.name,
        storeName: driver.storeName ?? undefined,
        lat,
        lng,
        heading: socketPos?.heading ?? driver.heading ?? lastTrail?.heading ?? null,
        updatedAt: socketPos?.updatedAt ?? driver.updatedAt ?? undefined,
        path: trail,
        locationApproximate,
      });
    }
    return markers;
  }, [liveDrivers, driverPositions, driverTrails, stores]);

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

  const refreshLive = useCallback(() => {
    void refetchLive();
  }, [refetchLive]);

  const closeMapFullscreen = useCallback(() => {
    setMapFullscreen(false);
    setMapResizeNonce((n) => n + 1);
  }, []);

  const openMapFullscreen = useCallback(() => {
    setMapFullscreen(true);
    setMapResizeNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!mapFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMapFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mapFullscreen, closeMapFullscreen]);

  const rangeStart = sortedOnlineRiders.length === 0 ? 0 : (safeRunsPage - 1) * RUNS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(safeRunsPage * RUNS_PAGE_SIZE, sortedOnlineRiders.length);

  if (admin === null) {
    return <div className="p-8 text-center text-muted">Loading live drivers…</div>;
  }

  const liveDriversMap = (
    <AdminLiveDriversMap
      stores={storeMarkers}
      drivers={driverMarkers}
      selectedDriverId={selectedDriverId}
      onDriverSelect={selectDriver}
      fitBoundsMode="once"
      zoomPosition="topright"
      focusPosition={selectedMarker ? [selectedMarker.lat, selectedMarker.lng] : null}
      focusNonce={focusNonce}
      resizeNonce={mapResizeNonce}
      className={mapFullscreen ? 'h-full min-h-0' : 'h-full min-h-[520px]'}
    />
  );

  const onlineRidersOverlay = runsCollapsed ? (
          <div className="live-drivers-overlay live-drivers-overlay--collapsed">
            <button type="button" className="live-drivers-overlay__chip" onClick={toggleRunsCollapsed}>
              <PanelLeftOpen size={14} />
              Active ({liveDrivers.length})
            </button>
          </div>
        ) : (
          <div className="live-drivers-overlay card">
            <div className="live-drivers-overlay__header">
              <h2 className="text-sm font-bold text-fg">Active ({liveDrivers.length})</h2>
              <button
                type="button"
                className="live-drivers-overlay__collapse"
                onClick={toggleRunsCollapsed}
                aria-label="Collapse active riders"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div className="live-drivers-overlay__list">
              {isLoading ? (
                <div className="p-6 text-center text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              ) : liveDrivers.length === 0 ? (
                <div className="p-6 text-center text-muted text-sm">
                  <MapPin size={28} className="mx-auto mb-2 opacity-40" />
                  No active riders right now.
                </div>
              ) : (
                pagedRiders.map((driver) => {
                  const hasLivePosition = riderHasLocation(driver, driverPositions);
                  const selected = selectedDriverId === driver.driverId;
                  const currentJob = riderCurrentJobTitle(driver);
                  return (
                    <button
                      key={driver.driverId}
                      type="button"
                      className={`live-drivers-overlay__run${selected ? ' live-drivers-overlay__run--selected' : ''}`}
                      onClick={() => selectDriver(driver.driverId)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-fg truncate">{driver.name}</p>
                        <span
                          className={`shrink-0 h-2 w-2 rounded-full ${hasLivePosition ? 'bg-green-400' : 'bg-navy-border'}`}
                          title={hasLivePosition ? 'Live location available' : 'No live location yet'}
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={adminBadgeClass(dutyStatusBadge(driver.dutyStatus))}>
                          {DUTY_STATUS_LABEL[driver.dutyStatus] ?? driver.dutyStatus.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-muted truncate">{driver.storeName ?? 'Unknown branch'}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs">
                        <span className="text-muted truncate">
                          {currentJob ?? (driver.dutyStatus === 'ONLINE' ? 'Available' : 'No active run')}
                        </span>
                        {driver.vehicleNumber ? (
                          <span className="text-brand-light tabular-nums shrink-0">{driver.vehicleNumber}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {liveDrivers.length > 0 && (
              <div className="live-drivers-overlay__pager">
                <p className="text-[11px] text-muted text-center">
                  Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
                  <span className="text-fg font-semibold tabular-nums">{liveDrivers.length}</span> active
                </p>
                {totalRunPages > 1 && (
                  <nav className="live-drivers-overlay__pager-nav" aria-label="Active riders pages">
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
        );

  return (
    <div className="live-drivers-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-muted text-xs hover:text-brand inline-flex items-center gap-1 mb-1">
            <ArrowLeft size={12} /> Back to Delivery
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck size={22} className="text-brand" />
            Live Drivers
          </h1>
          <p className="text-muted text-sm mt-0.5">
            Active riders (online, on delivery, or on a live run){isFetching ? ' · refreshing…' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshLive}
          className="btn-outline px-3 py-2 text-sm flex items-center gap-1.5"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="live-drivers-page__stage card overflow-hidden">
        {!mapFullscreen ? (
          <>
            <div className="relative h-full min-h-[520px] w-full">
              <button
                type="button"
                onClick={openMapFullscreen}
                className="live-delivery-map__fullscreen-btn live-delivery-map__fullscreen-btn--expand"
                aria-label="Open map fullscreen"
              >
                <Maximize2 size={16} />
              </button>
              {liveDriversMap}
            </div>
            {onlineRidersOverlay}
          </>
        ) : (
          <div className="flex h-full min-h-[520px] items-center justify-center bg-navy-light/30 text-xs text-muted">
            Map open in full screen
          </div>
        )}
      </div>

      {mapFullscreen && (
        <div className="live-delivery-map-fullscreen" role="dialog" aria-label="Live drivers map">
          <div className="live-delivery-map-fullscreen__header">
            <p className="min-w-0 truncate text-sm font-medium text-fg">
              Live Drivers · Active ({liveDrivers.length})
              {isFetching ? ' · refreshing…' : ''}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={refreshLive}
                className="btn-outline px-3 py-1.5 text-xs flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                type="button"
                onClick={closeMapFullscreen}
                className="live-delivery-map__fullscreen-btn"
                aria-label="Exit fullscreen map"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          </div>
          <div className="live-delivery-map-fullscreen__body relative">{liveDriversMap}{onlineRidersOverlay}</div>
        </div>
      )}
    </div>
  );
}
