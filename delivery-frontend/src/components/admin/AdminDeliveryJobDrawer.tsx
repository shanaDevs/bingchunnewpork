'use client';

import { adminApiFetch } from '@/lib/adminApi';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { io, type Socket } from 'socket.io-client';
import { Loader2, LocateFixed, MapPin, RefreshCw, Route } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { getApiBaseUrl, getSocketUrl } from '@/lib/apiBase';
import { adminBadgeClass, DELIVERY_JOB_STATUS_LABEL } from '@/lib/adminBadges';
import { BRANCH_RETURN_RADIUS_M } from '@/lib/deliveryConstants';
import type { DeliveryRoutePayload } from '@/lib/deliveryRoute';
import { formatDate, formatTime } from '@/lib/datetime';
import AdminDeliveryLocationModal, {
  type DeliveryLocationStop,
} from '@/components/admin/AdminDeliveryLocationModal';
import CustomerStopsWizard from '@/components/admin/CustomerStopsWizard';
import { useAdminJobLiveRoute } from '@/hooks/useAdminJobLiveRoute';
import DeliveryRouteTimeline, {
  deliveryRouteTimelineHeadingExtra,
} from '@/components/admin/DeliveryRouteTimeline';
import {
  jobSupportsActualRouteReplay,
  jobUsesLiveRouteTracking,
} from '@/lib/deliveryStopProgress';
import { displayRideId } from '@/lib/deliveryDisplay';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { canAdminCancelDeliveryJob } from '@/lib/adminDeliveryQueries';
import AdminCancelDeliveryJobModal from '@/components/admin/AdminCancelDeliveryJobModal';
import type { DeliveryJobListItem } from '@/components/admin/AdminDeliveryJobsTable';

const AdminDeliveryRouteMap = dynamic(() => import('@/components/admin/AdminDeliveryRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center bg-slate-50 text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

type JobOrderItem = {
  productName: string;
  quantity: number;
  totalPrice?: number;
  imageUrl?: string | null;
};

type DeliveryStopOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  district?: string;
  lat?: number | null;
  lng?: number | null;
  total?: number | null;
  paymentMethod?: string;
  paymentStatus?: string;
  items: JobOrderItem[];
  deliveryState: 'Delivered' | 'Failed' | 'Pending';
  terminalEventAt?: string | null;
  cancelReason?: string | null;
  failureOutcome?: string | null;
  failureNote?: string | null;
};

export type AdminDeliveryJobDetail = {
  id: string;
  rideCode?: string | null;
  title: string;
  status: string;
  returningToBranch: boolean;
  scheduledAt: string;
  assignedAt?: string | null;
  startedAt?: string | null;
  returnStartedAt?: string | null;
  completedAt?: string | null;
  totalDistanceKm?: number | null;
  store: {
    id: string;
    name: string;
    addressLine: string;
    city: string;
    lat: number;
    lng: number;
  };
  driver?: { id: string; name: string; phone?: string | null } | null;
  reassignedRiders?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    jobId: string;
    rideCode?: string | null;
    status: string;
  }>;
  orderCount: number;
  deliveredCount: number;
  pickedUp: boolean;
  orders: DeliveryStopOrder[];
  vehicleFailure?: { lat: number; lng: number; orderId?: string } | null;
  /** Set when this job's pickup point is NOT the outlet — e.g. a vehicle-failure
   *  redelivery, where the rider must collect parcels from the stranded rider's
   *  breakdown spot instead of the branch. */
  pickup?: { lat: number; lng: number; label: string } | null;
};

type JobRouteResponse = DeliveryRoutePayload & {
  jobId: string;
  title?: string;
  status?: string;
};

type ActualRouteOverlay = {
  path: Array<{ lat: number; lng: number }>;
};

const JOB_STATUS_BADGE: Record<string, 'blue' | 'yellow' | 'orange' | 'green' | 'red' | 'purple' | 'neutral'> = {
  SCHEDULED: 'blue',
  ASSIGNED: 'yellow',
  QUEUED: 'purple',
  IN_PROGRESS: 'orange',
  RETURNING: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
  VEHICLE_FAILURE: 'red',
};

type Props = {
  jobId: string;
  storeId: string;
  open: boolean;
  onClose: () => void;
  hqCanCancelJobs?: boolean;
  onViewRoute?: (opts: {
    jobId: string;
    storeId: string;
    initialStatus?: string;
    focusDriver?: boolean;
    forceReplay?: boolean;
  }) => void;
  onJobClosed?: () => void;
  forceReplay?: boolean;
  displayStatus?: string | null;
};

function RiderContact({ name, phone }: { name?: string | null; phone?: string | null }) {
  return (
    <>
      {name ?? 'Unassigned'}
      {phone?.trim() ? (
        <a href={`tel:${phone.trim()}`} className="mt-1 block text-sm font-medium text-brand hover:underline">
          {phone.trim()}
        </a>
      ) : null}
    </>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

function SummaryTimestampItem({ label, at }: { label: string; at?: string | null }) {
  const parts = formatTimelineParts(at);
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-fg">{parts.date}</dd>
      <dd className="text-[11px] tabular-nums text-muted">{parts.time}</dd>
    </div>
  );
}

function formatAmount(amount?: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDistance(km?: number | null): string {
  if (km == null) return '—';
  return `${km.toFixed(1)} km`;
}

function formatTimelineParts(value?: string | null): { date: string; time: string } {
  if (!value) return { date: '—', time: '—' };
  return {
    date: formatDate(value, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: formatTime(value),
  };
}

function SectionHeading({
  title,
  description,
  extra,
}: {
  title: string;
  description?: string;
  extra?: string | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {extra ? (
        <p className="text-xs font-medium text-brand" aria-live="polite">
          {extra}
        </p>
      ) : null}
    </div>
  );
}

async function fetchJobDetail(jobId: string, storeId: string): Promise<AdminDeliveryJobDetail> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<AdminDeliveryJobDetail>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}${qs}`,
  );
}

async function fetchJobRoute(jobId: string, storeId: string): Promise<JobRouteResponse> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<JobRouteResponse>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}/route${qs}`,
  );
}

async function fetchActualRoute(jobId: string, storeId: string): Promise<ActualRouteOverlay> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return adminApiFetch<ActualRouteOverlay>(
    `/admin/delivery-jobs/${encodeURIComponent(jobId)}/actual-route${qs}`,
  );
}

function jobDetailToListItem(job: AdminDeliveryJobDetail): DeliveryJobListItem {
  return {
    id: job.id,
    rideCode: job.rideCode,
    title: job.title,
    status: job.status,
    orderCount: job.orderCount,
    scheduledAt: job.scheduledAt,
    storeId: job.store.id,
    storeName: job.store.name,
    driver: job.driver ?? null,
  };
}

export default function AdminDeliveryJobDrawer({
  jobId,
  storeId,
  open,
  onClose,
  hqCanCancelJobs = false,
  onViewRoute,
  onJobClosed,
  forceReplay = false,
  displayStatus,
}: Props) {
  const [job, setJob] = useState<AdminDeliveryJobDetail | null>(null);
  const [closeRideOpen, setCloseRideOpen] = useState(false);
  const [route, setRoute] = useState<JobRouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [locationModalStop, setLocationModalStop] = useState<DeliveryLocationStop | null>(null);
  const [mapHighlightKey, setMapHighlightKey] = useState<string | null>(null);
  const [mapFitNonce, setMapFitNonce] = useState(0);
  const [actualOverlay, setActualOverlay] = useState<ActualRouteOverlay | null>(null);
  const [actualNotice, setActualNotice] = useState<string | null>(null);

  const resolvedStoreId = job?.store?.id ?? storeId;
  const replayOpts = { forceReplay, displayStatus };
  const isLiveMapJob = Boolean(job && jobUsesLiveRouteTracking(job.status, replayOpts));
  const supportsActualRouteReplay = Boolean(
    job && jobSupportsActualRouteReplay(job.status, replayOpts),
  );
  const liveRoute = useAdminJobLiveRoute({
    jobId,
    storeId: resolvedStoreId,
    driverId: job?.driver?.id,
    enabled: open && isLiveMapJob,
  });

  useEffect(() => {
    if (!open || !supportsActualRouteReplay || !jobId) {
      setActualOverlay(null);
      setActualNotice(null);
      return;
    }

    let cancelled = false;
    fetchActualRoute(jobId, resolvedStoreId)
      .then((data) => {
        if (cancelled) return;
        setActualOverlay(data);
        setActualNotice(data.path.length < 2 ? 'No GPS trace recorded for this job.' : null);
      })
      .catch(() => {
        if (!cancelled) {
          setActualOverlay(null);
          setActualNotice('Unable to load actual route.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, supportsActualRouteReplay, jobId, resolvedStoreId]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setMapFitNonce((n) => n + 1), 250);
    return () => window.clearTimeout(timer);
  }, [open, route?.jobId]);

  useEffect(() => {
    if (!open || !jobId) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;
    let socket: Socket | null = null;
    let boundStoreId: string | null = null;
    const LIVE_STATUSES = new Set(['ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING']);

    let adminId = 'admin';
    try {
      const adminRaw = localStorage.getItem('bc_admin');
      if (adminRaw) {
        const parsed = JSON.parse(adminRaw) as { id?: string };
        if (parsed.id) adminId = parsed.id;
      }
    } catch {
      /* ignore */
    }

    const bindJobSocket = (resolvedStoreId: string) => {
      if (!resolvedStoreId || boundStoreId === resolvedStoreId) return;
      boundStoreId = resolvedStoreId;

      try {
        if (!socket) {
          socket = io(getSocketUrl(), {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            withCredentials: true,
          });

          socket.on('deliveryJobUpdated', (payload: { jobId?: string }) => {
            if (cancelled || payload?.jobId !== jobId) return;
            pollOnce();
          });
        }

        socket.emit('joinAdmin', { adminId, storeId: resolvedStoreId });
      } catch {
        /* socket optional — polling still refreshes the drawer */
      }
    };

    const stopPolling = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const pollOnce = () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      fetchJobDetail(jobId, storeId)
        .then((updatedJob) => {
          if (cancelled) return;
          setJob(updatedJob);
          const resolvedStoreId = updatedJob.store?.id ?? storeId;
          if (resolvedStoreId) bindJobSocket(resolvedStoreId);
          if (LIVE_STATUSES.has(updatedJob.status) || updatedJob.status === 'SCHEDULED') {
            startPolling();
          } else {
            stopPolling();
          }
        })
        .catch(() => {})
        .finally(() => {
          pollInFlight = false;
        });
    };

    const startPolling = () => {
      if (cancelled || intervalId != null) return;
      intervalId = setInterval(pollOnce, 5000);
    };

    setLoading(true);
    setRouteLoading(true);
    setError(null);
    setRouteError(null);
    setJob(null);
    setRoute(null);

    fetchJobDetail(jobId, storeId)
      .then((data) => {
        if (cancelled) return;
        setJob(data);
        const resolvedStoreId = data.store?.id ?? storeId;
        if (resolvedStoreId) bindJobSocket(resolvedStoreId);
        if (LIVE_STATUSES.has(data.status) || data.status === 'SCHEDULED') {
          startPolling();
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load job');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetchJobRoute(jobId, storeId)
      .then((data) => {
        if (!cancelled) setRoute(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setRouteError(e instanceof Error ? e.message : 'Failed to load route');
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
      stopPolling();
      socket?.disconnect();
    };
  }, [open, jobId, storeId]);

  function retryLoad() {
    if (!open) return;
    setLoading(true);
    setRouteLoading(true);
    setError(null);
    setRouteError(null);

    Promise.all([
      fetchJobDetail(jobId, storeId).then(setJob).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load job');
      }),
      fetchJobRoute(jobId, storeId).then(setRoute).catch((e: unknown) => {
        setRouteError(e instanceof Error ? e.message : 'Failed to load route');
      }),
    ]).finally(() => {
      setLoading(false);
      setRouteLoading(false);
    });
  }

  const routeTimelineExtra = job
    ? deliveryRouteTimelineHeadingExtra(job.orders, job.status)
    : null;

  const overlayPath = isLiveMapJob
    ? liveRoute.path
    : supportsActualRouteReplay
      ? (actualOverlay?.path ?? [])
      : [];
  const overlayLabel = isLiveMapJob ? 'Live' : 'Actual';
  const overlayNotice = isLiveMapJob ? liveRoute.notice : actualNotice;
  const showPathOverlay = isLiveMapJob || supportsActualRouteReplay;
  const vehicleFailurePosition =
    liveRoute.vehicleFailure ??
    (job?.vehicleFailure
      ? { lat: job.vehicleFailure.lat, lng: job.vehicleFailure.lng }
      : undefined);

  return (
    <>
      <AdminDeliveryLocationModal stop={locationModalStop} onClose={() => setLocationModalStop(null)} />
      <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]"
          className="flex h-full w-full max-w-[960px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px] lg:max-w-[900px] bg-white dark:bg-popover"
        >
          {/* Sticky header */}
          <div className="sticky top-0 z-10 shrink-0 border-b border-navy-border bg-white px-5 py-5 dark:bg-popover sm:px-6">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <SheetTitle className="text-lg font-semibold text-fg sm:text-xl">Job details</SheetTitle>
                <SheetDescription className="mt-0.5 text-[13px] text-muted">
                  {job ? `Delivery run ${displayRideId(job.rideCode, job.id)}` : 'Loading delivery job…'}
                </SheetDescription>
              </div>
              {job ? (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={adminBadgeClass(JOB_STATUS_BADGE[job.status] ?? 'neutral', 'md')}>
                    {DELIVERY_JOB_STATUS_LABEL[job.status] ?? job.status.replace(/_/g, ' ')}
                  </span>
                  {job.returningToBranch ? (
                    <span className={adminBadgeClass('orange', 'md')}>Returning to Branch</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-6 sm:px-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted">
                <Loader2 size={18} className="animate-spin" />
                Loading job details…
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                <p className="mb-3 text-sm text-red-400">{error}</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : job ? (
              <div className="space-y-6 pb-8">
                {/* Job summary */}
                <section>
                  <SectionHeading title="Job summary" />
                  {hqCanCancelJobs &&
                  canAdminCancelDeliveryJob({
                    status: job.status,
                    driver: job.driver,
                    scheduledAt: job.scheduledAt,
                  }) ? (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setCloseRideOpen(true)}
                        className="inline-flex items-center rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Close ride (mark canceled)
                      </button>
                    </div>
                  ) : null}
                  <dl className="rounded-xl border border-navy-border bg-white p-4 dark:bg-navy-light/10 sm:p-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      {job.status === 'VEHICLE_FAILURE' ? (
                        <>
                          <SummaryItem label="Rider">
                            <RiderContact name={job.driver?.name} phone={job.driver?.phone} />
                          </SummaryItem>
                          <SummaryItem label="Reassigned rider">
                            {(job.reassignedRiders ?? []).length === 0 ? (
                              'Not reassigned'
                            ) : (
                              <ul className="space-y-2">
                                {(job.reassignedRiders ?? []).map((rider) => (
                                  <li key={rider.jobId}>
                                    <RiderContact name={rider.name} phone={rider.phone} />
                                    <p className="text-xs font-normal text-muted">
                                      {DELIVERY_JOB_STATUS_LABEL[rider.status] ??
                                        rider.status.replace(/_/g, ' ')}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </SummaryItem>
                        </>
                      ) : (
                        <SummaryItem label="Assigned rider">
                          <RiderContact name={job.driver?.name} phone={job.driver?.phone} />
                        </SummaryItem>
                      )}
                      <SummaryItem label="Branch">{job.store.name}</SummaryItem>
                      <SummaryItem label="Orders count">
                        <span className="tabular-nums">{job.orderCount}</span>
                      </SummaryItem>
                      <SummaryItem label="Total distance">
                        <span className="tabular-nums">{formatDistance(job.totalDistanceKm)}</span>
                      </SummaryItem>
                    </div>
                    <div className="my-3 border-t border-navy-border/60" aria-hidden />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <SummaryTimestampItem label="Scheduled" at={job.scheduledAt} />
                      <SummaryTimestampItem label="Assigned" at={job.assignedAt} />
                      <SummaryTimestampItem label="Started" at={job.startedAt} />
                      <SummaryTimestampItem label="Completed" at={job.completedAt} />
                    </div>
                    {job.pickup ? (
                      <>
                        <div className="my-3 border-t border-navy-border/60" aria-hidden />
                        <p className="text-xs text-muted">
                          Pickup: {job.pickup.label} — the branch name above doesn&apos;t match where
                          this rider actually collected the parcels.
                        </p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${job.pickup.lat},${job.pickup.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        >
                          <MapPin size={12} />
                          View pickup location on map
                        </a>
                      </>
                    ) : null}
                  </dl>
                </section>

                {/* Timeline */}
                <section>
                  <SectionHeading title="Timeline" extra={routeTimelineExtra} />
                  <DeliveryRouteTimeline
                    jobId={job.id}
                    sheetOpen={open}
                    orders={job.orders}
                    jobStatus={job.status}
                    pickedUp={job.pickedUp}
                    startedAt={job.startedAt}
                    returnStartedAt={job.returnStartedAt}
                    completedAt={job.completedAt}
                    pickupLabel={job.pickup?.label}
                  />
                </section>

                {/* Route map */}
                <section>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">Route map</h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {isLiveMapJob
                          ? 'Planned route with live driver path'
                          : supportsActualRouteReplay
                            ? 'Planned route with recorded GPS path'
                            : 'Branch, delivery stops and return route'}
                      </p>
                      {overlayNotice ? (
                        <p className="mt-1 text-xs text-slate-500">{overlayNotice}</p>
                      ) : null}
                    </div>
                    {route && onViewRoute && (
                      <div className="flex flex-wrap items-center gap-2">
                        {isLiveMapJob && (
                          <button
                            type="button"
                            onClick={() => {
                              setMapHighlightKey('driver');
                              setMapFitNonce((n) => n + 1);
                            }}
                            disabled={!liveRoute.findDriverReady}
                            title={
                              liveRoute.findDriverReady
                                ? 'Center map on driver'
                                : 'No GPS yet — rider must be online with location on.'
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <LocateFixed size={12} />
                            Find driver
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onViewRoute({
                              jobId,
                              storeId: resolvedStoreId,
                              initialStatus: job?.status,
                              focusDriver: isLiveMapJob && liveRoute.findDriverReady,
                              forceReplay,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-navy-border bg-navy-light/40 px-2.5 py-1.5 text-[11px] font-semibold text-brand transition-colors hover:bg-navy-light/60"
                        >
                          <Route size={12} />
                          View full route
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-hidden rounded-xl border border-navy-border">
                    {routeLoading ? (
                      <div className="flex h-[320px] items-center justify-center bg-slate-50 text-sm text-muted dark:bg-navy-light/40">
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Loading route…
                      </div>
                    ) : routeError ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                        {routeError}
                      </div>
                    ) : route ? (
                      <div className="h-[320px] overflow-hidden">
                        <AdminDeliveryRouteMap
                          route={route}
                          branchStore={job.pickup ? job.store : route.branch ?? undefined}
                          showReturnToStore
                          completionRadiusM={BRANCH_RETURN_RADIUS_M}
                          highlightedStopKey={mapHighlightKey}
                          fitNonce={mapFitNonce}
                          actualPath={showPathOverlay ? overlayPath : undefined}
                          driverPosition={isLiveMapJob ? liveRoute.driverPosition : undefined}
                          vehicleFailurePosition={vehicleFailurePosition}
                          pathOverlayLabel={overlayLabel}
                          showLegend={showPathOverlay && overlayPath.length >= 2}
                          initialPathLayers={{ planned: true, actual: true }}
                        />
                      </div>
                    ) : (
                      <p className="p-4 text-sm text-muted">Route unavailable.</p>
                    )}
                  </div>
                </section>

                {/* Customer stops */}
                <section>
                  <SectionHeading title="Customer stops" />
                  <CustomerStopsWizard
                    orders={job.orders}
                    jobStatus={job.status}
                    onViewLocation={(stop) => setLocationModalStop(stop)}
                  />
                </section>

                {/* Packing list */}
                <section>
                  <SectionHeading title="Packing list" />
                  <div className="space-y-4">
                    {job.orders.map((order) => (
                      <div
                        key={order.orderId}
                        className="overflow-hidden rounded-xl border border-navy-border bg-white dark:bg-navy-light/10"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-navy-border bg-slate-50 px-4 py-3 dark:bg-navy-light/30">
                          <p className="text-sm font-semibold text-fg">{order.orderNumber}</p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                            <span>
                              <span className="font-medium text-fg/70">Payment:</span>{' '}
                              {order.paymentMethod ?? '—'}
                            </span>
                            <span>
                              <span className="font-medium text-fg/70">Status:</span>{' '}
                              {order.paymentStatus ?? '—'}
                            </span>
                            <span className="font-semibold tabular-nums text-fg">
                              {formatAmount(order.total)}
                            </span>
                          </div>
                        </div>

                        {order.items.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table className="min-w-0 text-[13px]">
                              <TableHeader>
                                <TableRow className="border-b border-navy-border/60 hover:bg-transparent">
                                  <TableHead className="h-9 bg-slate-50/80 px-4 font-semibold text-muted dark:bg-navy-light/20">
                                    Product
                                  </TableHead>
                                  <TableHead className="h-9 w-20 bg-slate-50/80 px-4 text-right font-semibold text-muted dark:bg-navy-light/20">
                                    Qty
                                  </TableHead>
                                  <TableHead className="h-9 w-28 bg-slate-50/80 px-4 text-right font-semibold text-muted dark:bg-navy-light/20">
                                    Line total
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.items.map((item, idx) => (
                                  <TableRow
                                    key={`${order.orderId}-${idx}`}
                                    className="border-b border-navy-border/40 last:border-0 hover:bg-slate-50/50 dark:hover:bg-navy-light/20"
                                  >
                                    <TableCell className="px-4 py-2.5 text-fg">{item.productName}</TableCell>
                                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                                      {item.quantity}
                                    </TableCell>
                                    <TableCell className="px-4 py-2.5 text-right tabular-nums font-medium text-fg">
                                      {item.totalPrice != null ? formatAmount(item.totalPrice) : '—'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <p className="px-4 py-3 text-sm text-muted">No items</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AdminCancelDeliveryJobModal
        job={closeRideOpen && job ? jobDetailToListItem(job) : null}
        storeId={resolvedStoreId}
        open={closeRideOpen}
        onClose={() => setCloseRideOpen(false)}
        onSuccess={() => {
          onJobClosed?.();
          onClose();
        }}
      />
    </>
  );
}
