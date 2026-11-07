'use client';

import { adminApiFetch } from '@/lib/adminApi';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Route,
} from 'lucide-react';
import type { DeliveryRoutePayload, DeliveryRouteStop } from '@/lib/deliveryRoute';
import {
  formatRouteAddress,
  formatStopAddress,
  formatDeliveryJobTitle,
  routeStartPrimaryDetail,
} from '@/lib/deliveryRoute';
import { BRANCH_STOP_EMOJI, customerInitial, stopSecondaryDetail } from '@/lib/deliveryRouteMarkers';
import { BRANCH_RETURN_RADIUS_M } from '@/lib/deliveryConstants';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { useAdminJobLiveRoute } from '@/hooks/useAdminJobLiveRoute';
import { useAdminJobStatus } from '@/hooks/useAdminJobStatus';
import { adminBadgeClass, DELIVERY_JOB_STATUS_BADGE, DELIVERY_JOB_STATUS_LABEL } from '@/lib/adminBadges';
import { jobSupportsActualRouteReplay } from '@/lib/deliveryStopProgress';

const AdminDeliveryRouteMap = dynamic(() => import('@/components/admin/AdminDeliveryRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-navy-light text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

type JobRouteResponse = DeliveryRoutePayload & {
  jobId: string;
  title?: string;
  status?: string;
  vehicleFailure?: { lat: number; lng: number; orderId?: string } | null;
};

type PathOverlayResponse = {
  path: Array<{ lat: number; lng: number }>;
  driverPosition?: { lat: number; lng: number; updatedAt?: string } | null;
  actualDistanceKm?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  source?: 'stored' | 'gps_fallback' | 'live';
};

const LIVE_JOB_STATUSES = new Set(['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING']);

async function fetchJobRoute(jobId: string, storeId: string): Promise<JobRouteResponse> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<JobRouteResponse>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}/route${qs}`,
  );
}

async function fetchActualRoute(jobId: string, storeId: string): Promise<PathOverlayResponse> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<PathOverlayResponse>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}/actual-route${qs}`,
  );
}

function stopKey(orderId?: string, orderNumber?: string) {
  return orderId ?? orderNumber ?? '';
}

function StopOrderThumb({
  imageUrl,
  fallbackLabel,
  extraItemCount = 0,
  isStore,
}: {
  imageUrl?: string | null;
  fallbackLabel: string;
  extraItemCount?: number;
  isStore?: boolean;
}) {
  const resolved = resolveProductImageUrl(imageUrl);

  return (
    <div
      className={`route-stop-popover__thumb${isStore ? '' : ' route-stop-popover__thumb--image'}`}
    >
      {isStore ? (
        <span className="route-stop-popover__branch-emoji" aria-hidden>
          {BRANCH_STOP_EMOJI}
        </span>
      ) : resolved ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolved} alt="" className="route-stop-popover__img" />
      ) : (
        <span className="route-stop-popover__initial">{fallbackLabel}</span>
      )}
      {!isStore && extraItemCount > 0 && (
        <span className="route-stop-popover__more">+{extraItemCount}</span>
      )}
    </div>
  );
}

function RouteStopItem({
  label,
  title,
  primaryDetail,
  secondaryDetail,
  imageUrl,
  fallbackLabel,
  extraItemCount,
  isStore,
  selected,
  isLast,
  onClick,
}: {
  label: string;
  title: string;
  primaryDetail?: string;
  secondaryDetail?: string;
  imageUrl?: string | null;
  fallbackLabel: string;
  extraItemCount?: number;
  isStore?: boolean;
  selected?: boolean;
  isLast?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="route-stop-item">
      <div className="route-stop-item__track" aria-hidden>
        <span
          className={`route-stop-item__dot${selected ? ' route-stop-item__dot--selected' : ''}`}
        >
          {label}
        </span>
        {!isLast && <span className="route-stop-item__line" />}
      </div>

      <button
        type="button"
        onClick={onClick}
        className={`route-stop-popover${selected ? ' route-stop-popover--selected' : ''}`}
        aria-pressed={selected}
      >
        <StopOrderThumb
          imageUrl={imageUrl}
          fallbackLabel={fallbackLabel}
          extraItemCount={extraItemCount}
          isStore={isStore}
        />
        <div className="route-stop-popover__body">
          <p className="route-stop-popover__title">{title}</p>
          {(primaryDetail || secondaryDetail) && (
            <p className="route-stop-popover__detail">
              {primaryDetail && (
                <span className="route-stop-popover__detail-primary">{primaryDetail}</span>
              )}
              {secondaryDetail && (
                <span className="route-stop-popover__detail-secondary">{secondaryDetail}</span>
              )}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

function StopCard({
  stop,
  selected,
  isLast,
  onClick,
}: {
  stop: DeliveryRouteStop;
  selected?: boolean;
  isLast?: boolean;
  onClick?: () => void;
}) {
  const address = formatStopAddress(stop);

  return (
    <RouteStopItem
      label={String(stop.sequence)}
      title={stop.customerName}
      primaryDetail={stop.orderNumber}
      secondaryDetail={stopSecondaryDetail(stop) || (address ? ` · ${address}` : undefined)}
      imageUrl={stop.imageUrl}
      fallbackLabel={customerInitial(stop.customerName)}
      extraItemCount={stop.extraItemCount ?? 0}
      selected={selected}
      isLast={isLast}
      onClick={onClick}
    />
  );
}

function LiveTrackingStatus({
  socketConnected,
  findDriverReady,
  loading,
}: {
  socketConnected: boolean;
  findDriverReady: boolean;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        <Loader2 size={10} className="animate-spin" />
        Syncing
      </span>
    );
  }
  if (!findDriverReady) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Waiting for GPS
      </span>
    );
  }
  if (socketConnected) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      Polling
    </span>
  );
}

function preStartMessage(status: string): string | null {
  switch (status) {
    case 'ASSIGNED':
      return 'Driver assigned — live tracking starts when they tap Start run in the app.';
    case 'QUEUED':
      return 'Job queued — waiting for driver to start the run.';
    case 'SCHEDULED':
      return 'Job scheduled — live tracking starts when a driver starts the run.';
    default:
      return null;
  }
}

type Props = {
  jobId: string;
  storeId: string;
  initialStatus?: string;
  focusDriver?: boolean;
  onBack: () => void;
  onFocusDriverHandled?: () => void;
};

export default function AdminDeliveryRouteView({
  jobId,
  storeId,
  initialStatus,
  focusDriver = false,
  onBack,
  onFocusDriverHandled,
}: Props) {
  const [route, setRoute] = useState<JobRouteResponse | null>(null);
  const [actualOverlay, setActualOverlay] = useState<PathOverlayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualLoading, setActualLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualNotice, setActualNotice] = useState<string | null>(null);
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [focusDriverPending, setFocusDriverPending] = useState(focusDriver);

  const effectiveStoreId = storeId || route?.store.id || '';

  const jobStatusSync = useAdminJobStatus({
    jobId,
    storeId: effectiveStoreId,
    initialStatus: initialStatus ?? '',
    enabled: Boolean(jobId),
  });

  const jobStatus = jobStatusSync.status || route?.status || '';
  const isLiveJob = LIVE_JOB_STATUSES.has(jobStatus);
  const supportsActualRouteReplay = jobSupportsActualRouteReplay(jobStatus);
  const preStartBanner = preStartMessage(jobStatus);

  const liveRoute = useAdminJobLiveRoute({
    jobId,
    storeId: effectiveStoreId,
    driverId: jobStatusSync.driverId,
    enabled: isLiveJob,
  });

  useEffect(() => {
    setFocusDriverPending(focusDriver);
  }, [focusDriver, jobId]);

  useEffect(() => {
    if (!focusDriverPending || !liveRoute.findDriverReady) return;
    setSelectedStopKey('driver');
    setFitNonce((n) => n + 1);
    setFocusDriverPending(false);
    onFocusDriverHandled?.();
  }, [focusDriverPending, liveRoute.findDriverReady, onFocusDriverHandled]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRoute(null);
    setActualOverlay(null);
    setActualNotice(null);
    setSelectedStopKey(null);
    setFitNonce(0);
    setMapFullscreen(false);

    fetchJobRoute(jobId, storeId)
      .then((data) => {
        if (!cancelled) {
          setRoute(data);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load route');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, storeId]);

  useEffect(() => {
    const resolvedStoreId = storeId || route?.store?.id;
    if (!resolvedStoreId || !route) return;
    void jobStatusSync.refresh();
  }, [route?.jobId, route?.store?.id, storeId, jobStatusSync.refresh]);

  useEffect(() => {
    if (!route || !supportsActualRouteReplay) return;

    let cancelled = false;
    setActualLoading(true);

    fetchActualRoute(jobId, effectiveStoreId || storeId)
      .then((data) => {
        if (cancelled) return;
        setActualOverlay(data);
        if (data.path.length === 0) {
          setActualNotice('No GPS trace recorded for this job.');
        } else {
          setActualNotice(null);
        }
      })
      .catch(() => {
        if (!cancelled) setActualNotice('Unable to load actual route.');
      })
      .finally(() => {
        if (!cancelled) setActualLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [route, supportsActualRouteReplay, jobId, effectiveStoreId, storeId]);

  const headerTitle = useMemo(
    () => (route?.title ? formatDeliveryJobTitle(route.title) : 'Delivery route'),
    [route?.title],
  );
  const branchStore = route?.branch ?? null;
  const startAddress = useMemo(
    () => (route ? formatRouteAddress([route.store.addressLine, route.store.city]) : ''),
    [route],
  );
  const returnAddress = useMemo(
    () =>
      branchStore
        ? formatRouteAddress([branchStore.addressLine, branchStore.city])
        : startAddress,
    [branchStore, startAddress],
  );
  const startPrimaryDetail = route ? routeStartPrimaryDetail(route.store) : 'Pickup branch';

  const pathOverlayLabel = isLiveJob ? 'Live' : 'Actual';
  const actualPath = isLiveJob ? liveRoute.path : (actualOverlay?.path ?? []);
  const driverPosition = isLiveJob ? liveRoute.driverPosition : undefined;
  const vehicleFailurePosition =
    liveRoute.vehicleFailure ??
    (route?.vehicleFailure
      ? { lat: route.vehicleFailure.lat, lng: route.vehicleFailure.lng }
      : undefined);
  const overlayNotice = isLiveJob ? liveRoute.notice : actualNotice;
  const overlayLoading = isLiveJob ? liveRoute.loading : actualLoading;
  const showPathOverlay = isLiveJob || supportsActualRouteReplay;

  const comparisonSummary = useMemo(() => {
    if (!showPathOverlay) return null;
    const overlay = isLiveJob ? null : actualOverlay;
    const estKm = overlay?.estimatedDistanceKm ?? route?.summary.totalDistanceKm ?? null;
    const estMin = overlay?.estimatedMinutes ?? route?.summary.estimatedMinutes ?? null;
    const actKm = isLiveJob
      ? liveRoute.actualDistanceKm
      : (overlay?.actualDistanceKm ?? null);
    const actMin = overlay?.actualMinutes ?? null;
    if (estKm == null && estMin == null && actKm == null && actMin == null) return null;
    return { estKm, estMin, actKm, actMin };
  }, [showPathOverlay, isLiveJob, actualOverlay, liveRoute.actualDistanceKm, route]);

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
  }, [mapFullscreen]);

  function toggleStop(key: string) {
    setSelectedStopKey((current) => (current === key ? null : key));
  }

  function openMapFullscreen() {
    setMapFullscreen(true);
    setFitNonce((n) => n + 1);
  }

  function closeMapFullscreen() {
    setMapFullscreen(false);
    setFitNonce((n) => n + 1);
  }

  function viewFullRoute() {
    setSelectedStopKey(null);
    setMapFullscreen(true);
    setFitNonce((n) => n + 1);
  }

  function findDriver() {
    if (!liveRoute.findDriverReady) return;
    setSelectedStopKey('driver');
    setFitNonce((n) => n + 1);
  }

  const routeMap =
    route != null ? (
      <AdminDeliveryRouteMap
        route={route}
        branchStore={branchStore ?? undefined}
        highlightedStopKey={selectedStopKey}
        fitNonce={fitNonce}
        onStopSelect={toggleStop}
        actualPath={actualPath}
        driverPosition={driverPosition}
        vehicleFailurePosition={vehicleFailurePosition}
        pathOverlayLabel={pathOverlayLabel}
        showLegend={showPathOverlay && actualPath.length >= 2}
        showReturnToStore
        completionRadiusM={BRANCH_RETURN_RADIUS_M}
        fullscreen={mapFullscreen}
      />
    ) : null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-navy-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"
            >
              <ArrowLeft size={14} />
              Back to delivery
            </button>
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-fg">
              <Route size={20} className="text-brand" />
              {headerTitle}
              {jobStatus && (
                <span className={adminBadgeClass(DELIVERY_JOB_STATUS_BADGE[jobStatus] ?? 'neutral')}>
                  {DELIVERY_JOB_STATUS_LABEL[jobStatus] ?? jobStatus.replace(/_/g, ' ')}
                </span>
              )}
            </h2>
            {route && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} />
                  {route.store.name}
                </span>
                <span>
                  {route.summary.stopCount} stop{route.summary.stopCount === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock size={13} />~{route.summary.estimatedMinutes} min
                </span>
                <span className="tabular-nums">{route.summary.totalDistanceKm.toFixed(1)} km planned</span>
                {comparisonSummary && (
                  <span className="tabular-nums">
                    Actual {comparisonSummary.actKm != null ? `${comparisonSummary.actKm} km` : '—'} /{' '}
                    {comparisonSummary.actMin != null ? `${comparisonSummary.actMin} min` : '—'}
                  </span>
                )}
                {isLiveJob && (
                  <LiveTrackingStatus
                    socketConnected={liveRoute.socketConnected}
                    findDriverReady={liveRoute.findDriverReady}
                    loading={overlayLoading}
                  />
                )}
              </div>
            )}
            {jobStatusSync.error && (
              <p className="mt-2 text-xs text-amber-600">{jobStatusSync.error}</p>
            )}
            {preStartBanner && (
              <p className="mt-2 text-xs text-amber-600">{preStartBanner}</p>
            )}
            {isLiveJob && !liveRoute.findDriverReady && !overlayLoading && !overlayNotice && (
              <p className="mt-2 text-xs text-amber-600">
                No GPS yet — rider must be online with location on.
              </p>
            )}
            {overlayNotice && (
              <p className="mt-2 text-xs text-slate-500">{overlayNotice}</p>
            )}
          </div>

          {route && (
            <div className="flex flex-wrap items-center gap-2">
              {isLiveJob && (
                <button
                  type="button"
                  onClick={findDriver}
                  disabled={!liveRoute.findDriverReady}
                  title={
                    liveRoute.findDriverReady
                      ? 'Center map on driver'
                      : 'No GPS yet — rider must be online with location on.'
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LocateFixed size={14} />
                  Find driver
                </button>
              )}
              <button
                type="button"
                onClick={viewFullRoute}
                className="rounded-xl border border-navy-border bg-navy-light/40 px-4 py-2.5 text-xs font-semibold text-brand transition-colors hover:bg-navy-light/70"
              >
                Show full route
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[520px] items-center justify-center p-8 text-muted">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Loading delivery route…
        </div>
      ) : error ? (
        <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center text-red-400 sm:m-5">
          {error}
        </div>
      ) : route ? (
        <div className="route-view-split">
          <aside className="route-view-split__panel">
            <div className="route-view-split__list">
              <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Stops & orders
              </p>

              <div className="route-stop-timeline">
                <RouteStopItem
                  label="A"
                  title={route.store.name}
                  primaryDetail={startPrimaryDetail}
                  secondaryDetail={startAddress ? ` · ${startAddress}` : undefined}
                  fallbackLabel="A"
                  isStore
                  selected={selectedStopKey === 'store'}
                  onClick={() => toggleStop('store')}
                />

                {route.stops.map((stop) => {
                  const key = stopKey(stop.orderId, stop.orderNumber);
                  return (
                    <StopCard
                      key={key}
                      stop={stop}
                      selected={selectedStopKey === key}
                      onClick={() => toggleStop(key)}
                    />
                  );
                })}

                <RouteStopItem
                  label="B"
                  title={branchStore?.name ?? route.store.name}
                  primaryDetail="Return to Branch"
                  secondaryDetail={returnAddress ? ` · ${returnAddress}` : undefined}
                  fallbackLabel="B"
                  isStore
                  selected={selectedStopKey === 'store-return'}
                  isLast
                  onClick={() => toggleStop('store-return')}
                />
              </div>
            </div>
          </aside>

          <div className="route-view-split__map">
            {!mapFullscreen ? (
              <div className="delivery-map-wrap relative h-full w-full">
                <button
                  type="button"
                  onClick={openMapFullscreen}
                  className="live-delivery-map__fullscreen-btn live-delivery-map__fullscreen-btn--expand"
                  aria-label="Open map fullscreen"
                >
                  <Maximize2 size={16} />
                </button>
                {routeMap}
              </div>
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center bg-navy-light/30 text-xs text-muted">
                Map open in full screen
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-muted">Route unavailable.</div>
      )}

      {mapFullscreen && route && routeMap && (
        <div className="live-delivery-map-fullscreen" role="dialog" aria-label="Delivery route map">
          <div className="live-delivery-map-fullscreen__header">
            <p className="min-w-0 truncate text-sm font-medium text-fg">{headerTitle}</p>
            <div className="flex shrink-0 items-center gap-2">
              {isLiveJob && (
                <button
                  type="button"
                  onClick={findDriver}
                  disabled={!liveRoute.findDriverReady}
                  title={
                    liveRoute.findDriverReady
                      ? 'Center map on driver'
                      : 'No GPS yet — rider must be online with location on.'
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LocateFixed size={14} />
                  Find driver
                </button>
              )}
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
          <div className="live-delivery-map-fullscreen__body">{routeMap}</div>
        </div>
      )}
    </div>
  );
}
