'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import type { Socket } from 'socket.io-client';
import { Loader2, MapPin, Search, Truck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { getAdminSession } from '@/lib/adminAuth';
import { connectAdminSocketWithRooms } from '@/lib/adminSocket';
import { adminBadgeClass } from '@/lib/adminBadges';
import type { LiveDriverMarker, LiveStoreMarker } from '@/components/admin/AdminLiveDriversMap';

const AdminLiveDriversMap = dynamic(() => import('@/components/admin/AdminLiveDriversMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[240px] items-center justify-center bg-navy-light text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

export type FailureReassignmentStatus =
  | 'needs_assignment'
  | 'ringing'
  | 'assigned'
  | 'done'
  | 'not_reassignable';

export type AdminForwardOrder = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  status: string;
  isFailedStop: boolean;
};

export type AdminDeliveryFailure = {
  id: string;
  orderId: string;
  jobId: string;
  driverId: string;
  attemptNo: number;
  outcome: string;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  customerName?: string;
  canAssign?: boolean;
  reassignmentStatus?: FailureReassignmentStatus;
  forwardOrders?: AdminForwardOrder[];
  activeRedeliveryJob?: {
    id: string;
    status: string;
    driver: { id: string; name: string } | null;
  } | null;
  driver?: { id: string; name: string } | null;
  job?: { id: string; rideCode?: string | null; store?: { id: string; name: string } | null } | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    storeId?: string;
    deliveryAddressLine?: string | null;
    deliveryCity?: string | null;
    deliveryDistrict?: string | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    guestName?: string | null;
    guestPhone?: string | null;
    user?: { name?: string | null; phone?: string | null } | null;
    store?: {
      id: string;
      name: string;
      lat: number;
      lng: number;
      addressLine?: string | null;
    } | null;
  } | null;
};

type LiveDriverRow = {
  driverId: string;
  name: string;
  dutyStatus: string;
  storeName: string | null;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
  jobId: string | null;
};

type PoolDriverRow = {
  id: string;
  name: string;
  isActive: boolean;
  dutyStatus: string;
  store?: { name?: string | null } | null;
};

type DriverLocationEvent = {
  jobId?: string;
  driverId?: string;
  lat: number;
  lng: number;
  updatedAt?: string;
};

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

async function adminFetch(endpoint: string, options?: RequestInit) {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAddress(order: AdminDeliveryFailure['order']): string {
  if (!order) return '—';
  return [order.deliveryAddressLine, order.deliveryDistrict, order.deliveryCity].filter(Boolean).join(', ') || '—';
}

export function forwardOrdersFromFailure(failure: AdminDeliveryFailure | null): AdminForwardOrder[] {
  if (!failure) return [];
  if (failure.forwardOrders && failure.forwardOrders.length > 0) {
    return [...failure.forwardOrders].sort((a, b) => a.sequence - b.sequence);
  }
  return [
    {
      orderId: failure.orderId,
      orderNumber: failure.order?.orderNumber ?? failure.orderId,
      sequence: 1,
      status: failure.order?.status ?? '',
      isFailedStop: true,
    },
  ];
}

export function assignRideLabel(orderCount: number, riderCount = 1): string {
  if (riderCount > 1) {
    return `Ring ${riderCount} riders for ${orderCount} ${orderCount === 1 ? 'order' : 'orders'}`;
  }
  return 'Ring rider';
}

export function filterRankedDriversBySearch<
  T extends { name: string; storeName?: string | null },
>(drivers: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return drivers;
  return drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      (d.storeName?.toLowerCase().includes(q) ?? false),
  );
}

function buildAssignments(
  orderAssignments: Record<string, string>,
): Array<{ driverId: string; orderIds: string[] }> {
  const byDriver = new Map<string, string[]>();
  for (const [orderId, driverId] of Object.entries(orderAssignments)) {
    const existing = byDriver.get(driverId) ?? [];
    byDriver.set(driverId, [...existing, orderId]);
  }
  return [...byDriver.entries()].map(([driverId, orderIds]) => ({ driverId, orderIds }));
}

function dutyLabel(status: string): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'ON_DELIVERY') return 'On delivery';
  if (status === 'OFF_DUTY') return 'Off duty';
  return status.replace(/_/g, ' ').toLowerCase();
}

function dutyBadgeVariant(status: string): 'green' | 'orange' | 'neutral' {
  if (status === 'ONLINE') return 'green';
  if (status === 'ON_DELIVERY') return 'orange';
  return 'neutral';
}

function dutySortRank(status: string): number {
  if (status === 'ONLINE') return 0;
  if (status === 'ON_DELIVERY') return 1;
  if (status === 'OFF_DUTY') return 2;
  return 3;
}

type Props = {
  failure: AdminDeliveryFailure | null;
  storeId?: string;
  outcomeLabel: string;
  onClose: () => void;
  onAssigned: () => void;
};

export default function AdminReassignFailedOrderModal({
  failure,
  storeId,
  outcomeLabel,
  onClose,
  onAssigned,
}: Props) {
  const portalReady = useIsClient();
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [orderAssignments, setOrderAssignments] = useState<Record<string, string>>({});
  const [driverPositions, setDriverPositions] = useState<
    Record<string, { lat: number; lng: number; updatedAt?: string }>
  >({});
  const [riderSearchQuery, setRiderSearchQuery] = useState('');

  const isVehicleFailure = failure?.outcome === 'VEHICLE_FAILURE';
  const breakdownLat = failure?.lat ?? null;
  const breakdownLng = failure?.lng ?? null;
  // For a vehicle failure the new rider must first reach the stranded driver to take
  // over the parcel, so rank by distance to the breakdown spot rather than the address.
  const dropLat = isVehicleFailure && breakdownLat != null ? breakdownLat : failure?.order?.deliveryLat ?? null;
  const dropLng = isVehicleFailure && breakdownLng != null ? breakdownLng : failure?.order?.deliveryLng ?? null;
  const branchId = storeId || failure?.order?.storeId;
  const storeQuery = branchId ? `?storeId=${encodeURIComponent(branchId)}` : '';
  const forward = useMemo(() => forwardOrdersFromFailure(failure), [failure]);

  useEffect(() => {
    if (!failure) {
      setSelectedDriverIds([]);
      setOrderAssignments({});
      setRiderSearchQuery('');
      return;
    }
    setSelectedDriverIds([]);
    setRiderSearchQuery('');
    const defaults: Record<string, string> = {};
    for (const stop of forward) {
      defaults[stop.orderId] = '';
    }
    setOrderAssignments(defaults);
  }, [failure?.id, forward]);

  useEffect(() => {
    if (selectedDriverIds.length === 0) {
      setOrderAssignments((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) next[key] = '';
        return next;
      });
      return;
    }
    const defaultDriverId = selectedDriverIds[0];
    setOrderAssignments((prev) => {
      const next = { ...prev };
      for (const stop of forward) {
        if (!selectedDriverIds.includes(next[stop.orderId])) {
          next[stop.orderId] = defaultDriverId;
        }
      }
      return next;
    });
  }, [selectedDriverIds, forward]);

  const toggleDriverSelection = (driverId: string) => {
    setSelectedDriverIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId],
    );
  };

  const poolQuery = useQuery({
    queryKey: ['admin-delivery-drivers', branchId, 'reassign'],
    queryFn: async () => (await adminFetch(`/admin/drivers${storeQuery}`)).data as PoolDriverRow[],
    enabled: Boolean(failure),
  });

  const liveDriversQuery = useQuery({
    queryKey: ['admin-live-drivers', branchId, 'reassign'],
    queryFn: async () => (await adminFetch(`/admin/live-drivers${storeQuery}`)).data as LiveDriverRow[],
    enabled: Boolean(failure),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!failure) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [failure, onClose]);

  useEffect(() => {
    if (!failure) return;
    const admin = getAdminSession();
    if (!admin) return;
    let cancelled = false;
    let socket: Socket | null = null;
    void connectAdminSocketWithRooms([{ adminId: admin.id, storeId: branchId }], (created) => {
      if (cancelled) {
        created.disconnect();
        return;
      }
      socket = created;
      created.on('driverLocation', (payload: DriverLocationEvent) => {
        const key = payload.driverId ?? payload.jobId;
        if (!key || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return;
        setDriverPositions((prev) => ({
          ...prev,
          [key]: { lat: payload.lat, lng: payload.lng, updatedAt: payload.updatedAt },
        }));
      });
    });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [failure, branchId]);

  const rankedDrivers = useMemo(() => {
    const pool = (poolQuery.data ?? []).filter((d) => d.isActive);
    const liveById = new Map((liveDriversQuery.data ?? []).map((d) => [d.driverId, d]));
    const merged = new Map<
      string,
      {
        driverId: string;
        name: string;
        dutyStatus: string;
        storeName: string | null;
        lat: number | null;
        lng: number | null;
        updatedAt: string | null;
        jobId: string | null;
      }
    >();

    for (const driver of pool) {
      const live = liveById.get(driver.id);
      merged.set(driver.id, {
        driverId: driver.id,
        name: driver.name,
        dutyStatus: live?.dutyStatus ?? driver.dutyStatus,
        storeName: live?.storeName ?? driver.store?.name ?? null,
        lat: live?.lat ?? null,
        lng: live?.lng ?? null,
        updatedAt: live?.updatedAt ?? null,
        jobId: live?.jobId ?? null,
      });
    }
    for (const live of liveDriversQuery.data ?? []) {
      if (merged.has(live.driverId)) continue;
      merged.set(live.driverId, { ...live });
    }

    return [...merged.values()]
      .map((driver) => {
        const livePos = driverPositions[driver.driverId];
        const lat = livePos?.lat ?? driver.lat;
        const lng = livePos?.lng ?? driver.lng;
        const distanceKm =
          lat != null && lng != null && dropLat != null && dropLng != null
            ? haversineKm(lat, lng, dropLat, dropLng)
            : null;
        return {
          ...driver,
          lat,
          lng,
          updatedAt: livePos?.updatedAt ?? driver.updatedAt,
          distanceKm,
          isOriginal: driver.driverId === failure?.driverId,
        };
      })
      .sort((a, b) => {
        if (a.isOriginal !== b.isOriginal) return a.isOriginal ? 1 : -1;
        const dutyDiff = dutySortRank(a.dutyStatus) - dutySortRank(b.dutyStatus);
        if (dutyDiff !== 0) return dutyDiff;
        return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      });
  }, [poolQuery.data, liveDriversQuery.data, driverPositions, dropLat, dropLng, failure?.driverId]);

  const visibleDrivers = useMemo(
    () => filterRankedDriversBySearch(rankedDrivers, riderSearchQuery),
    [rankedDrivers, riderSearchQuery],
  );

  const storeMarkers: LiveStoreMarker[] = useMemo(() => {
    const store = failure?.order?.store;
    if (!store) return [];
    return [
      {
        id: store.id,
        name: store.name,
        lat: store.lat,
        lng: store.lng,
        addressLine: store.addressLine ?? undefined,
      },
    ];
  }, [failure]);

  const driverMarkers: LiveDriverMarker[] = useMemo(
    () =>
      rankedDrivers
        .filter((d): d is typeof d & { lat: number; lng: number } => d.lat != null && d.lng != null)
        .map((d) => ({
          jobId: d.jobId ?? d.driverId,
          driverId: d.driverId,
          driverName: d.name,
          storeName: d.storeName ?? undefined,
          lat: d.lat,
          lng: d.lng,
          updatedAt: d.updatedAt ?? undefined,
        })),
    [rankedDrivers],
  );

  const assignMutation = useMutation({
    mutationFn: async (assignments: Array<{ driverId: string; orderIds: string[] }>) => {
      const qs = branchId ? `?storeId=${encodeURIComponent(branchId)}` : '';
      return adminFetch(`/admin/delivery-failures/${failure!.id}/reassign${qs}`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      });
    },
    onSuccess: (json) => {
      const jobs = (json.data?.jobs ?? []) as Array<{
        driverName?: string;
        orderCount?: number;
      }>;
      if (jobs.length > 1) {
        const summary = jobs
          .map((job) => `${job.driverName ?? 'rider'}`)
          .join(', ');
        toast.success(`Ringing ${summary}`);
      } else if (jobs.length === 1) {
        const name = jobs[0].driverName ?? 'rider';
        toast.success(`Ringing ${name}`);
      } else {
        toast.success('Ringing riders');
      }
      onAssigned();
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not assign rider');
    },
  });

  if (!portalReady) return null;

  const orderNumber = failure?.order?.orderNumber ?? failure?.orderId ?? '—';
  const laterCount = Math.max(0, forward.length - 1);
  const title =
    laterCount > 0 ? `Redelivery #${orderNumber} + ${laterCount} more` : `Redelivery #${orderNumber}`;
  const selectedDrivers = rankedDrivers.filter((d) => selectedDriverIds.includes(d.driverId));
  const assignmentsReady =
    selectedDriverIds.length > 0 &&
    forward.every((stop) => orderAssignments[stop.orderId] && selectedDriverIds.includes(orderAssignments[stop.orderId]));
  const submitAssignments = buildAssignments(orderAssignments);
  const riderSearchTrimmed = riderSearchQuery.trim();
  const ridersCountLabel =
    riderSearchTrimmed && visibleDrivers.length !== rankedDrivers.length
      ? `${visibleDrivers.length} of ${rankedDrivers.length}`
      : String(rankedDrivers.length);

  return createPortal(
    <AnimatePresence>
      {failure && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Ring rider for failed delivery"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed left-1/2 top-1/2 z-[1201] flex w-[min(96vw,64rem)] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Ring rider</p>
                <h2 className="mt-1 text-lg font-bold text-fg">{title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {outcomeLabel}
                  {failure.driver?.name ? ` · original rider ${failure.driver.name}` : ''}
                </p>
                <p className="mt-1 text-sm text-fg">{formatAddress(failure.order)}</p>
                <ul className="mt-3 space-y-2">
                  {forward.map((stop) => (
                    <li key={stop.orderId} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-fg">#{stop.orderNumber}</span>
                        {stop.isFailedStop ? (
                          <span className={adminBadgeClass('orange')}>Failed stop</span>
                        ) : (
                          <span className="text-xs text-muted">Later stop</span>
                        )}
                      </div>
                      {selectedDriverIds.length > 1 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedDrivers.map((driver) => {
                            const active = orderAssignments[stop.orderId] === driver.driverId;
                            return (
                              <button
                                key={driver.driverId}
                                type="button"
                                onClick={() =>
                                  setOrderAssignments((prev) => ({
                                    ...prev,
                                    [stop.orderId]: driver.driverId,
                                  }))
                                }
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                                  active
                                    ? 'bg-brand text-white'
                                    : 'bg-navy-light text-muted hover:text-fg'
                                }`}
                              >
                                {driver.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  {isVehicleFailure
                    ? 'Vehicle failure — the rider is stranded. Send the new rider to their location to take over the parcel; every other undelivered order on the ride moves with it.'
                    : failure.outcome === 'OTHER'
                      ? 'Driver error — this failed order and every other undelivered order on the ride move together.'
                      : laterCount > 0
                        ? 'Customer not available — this failed stop and every other undelivered order on the ride move as one new ride.'
                        : 'Customer not available — this failed order will be assigned as a new ride.'}
                </p>
                {isVehicleFailure && breakdownLat != null && breakdownLng != null ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${breakdownLat},${breakdownLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    <MapPin size={12} />
                    View breakdown location on map
                  </a>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(16rem,20rem)_1fr]">
              <div className="flex min-h-0 flex-col border-b border-navy-border lg:border-b-0 lg:border-r">
                <div className="border-b border-navy-border px-4 py-3 space-y-2">
                  <div>
                    <h3 className="text-sm font-bold text-fg">Riders ({ridersCountLabel})</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      Select one or more riders. With multiple riders, assign each stop below.
                    </p>
                  </div>
                  <div
                    className={`input-icon-wrap w-full${riderSearchQuery ? ' input-icon-wrap--end' : ''}`}
                  >
                    <Search size={14} className="input-icon" aria-hidden />
                    <input
                      type="text"
                      value={riderSearchQuery}
                      onChange={(e) => setRiderSearchQuery(e.target.value)}
                      placeholder="Search by rider name…"
                      aria-label="Search riders"
                      className="input-field text-sm w-full"
                    />
                    {riderSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setRiderSearchQuery('')}
                        className="input-action p-1 text-muted hover:text-fg"
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-navy-border">
                  {poolQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted">
                      <Loader2 size={16} className="animate-spin" /> Loading riders…
                    </div>
                  ) : rankedDrivers.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted">
                      <Truck size={28} className="mx-auto mb-2 opacity-40" />
                      No riders available for this branch.
                    </div>
                  ) : visibleDrivers.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted">No riders match your search.</div>
                  ) : (
                    visibleDrivers.map((driver) => {
                      const selected = selectedDriverIds.includes(driver.driverId);
                      return (
                        <button
                          key={driver.driverId}
                          type="button"
                          onClick={() => toggleDriverSelection(driver.driverId)}
                          className={`w-full px-4 py-3 text-left transition-colors ${
                            selected ? 'bg-brand/15' : 'hover:bg-navy-light/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  selected ? 'border-brand bg-brand text-white' : 'border-navy-border'
                                }`}
                                aria-hidden
                              >
                                {selected ? '✓' : ''}
                              </span>
                              <p className="truncate text-sm font-semibold text-fg">{driver.name}</p>
                            </div>
                            <span className={adminBadgeClass(dutyBadgeVariant(driver.dutyStatus))}>
                              {dutyLabel(driver.dutyStatus)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted">
                            <span>
                              {driver.distanceKm != null
                                ? `${driver.distanceKm.toFixed(1)} km away`
                                : driver.dutyStatus === 'OFF_DUTY'
                                  ? 'Not on duty yet'
                                  : 'No live location'}
                            </span>
                            {driver.isOriginal ? <span className="text-accent">Original rider</span> : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="min-h-[240px] overflow-hidden bg-navy-light">
                <AdminLiveDriversMap
                  stores={storeMarkers}
                  drivers={driverMarkers}
                  destination={
                    dropLat != null && dropLng != null
                      ? {
                          lat: dropLat,
                          lng: dropLng,
                          label: isVehicleFailure ? 'Stranded rider' : `Order #${orderNumber}`,
                        }
                      : null
                  }
                  selectedDriverIds={selectedDriverIds}
                  onDriverSelect={toggleDriverSelection}
                  className="min-h-[280px] h-full"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-navy-border px-5 py-4">
              <p className="text-xs text-muted">
                <MapPin size={12} className="mr-1 inline" />
                The ride starts when they accept it in the driver app.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-outline px-3 py-2 text-sm" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary px-3 py-2 text-sm"
                  disabled={!assignmentsReady || assignMutation.isPending}
                  onClick={() => assignMutation.mutate(submitAssignments)}
                >
                  {assignMutation.isPending
                    ? 'Ringing…'
                    : assignRideLabel(forward.length, submitAssignments.length)}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
