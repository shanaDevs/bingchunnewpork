'use client';

import { Fragment, useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Popup, Polyline, ZoomControl, useMap } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DELIVERY_RIDER_MARKER_GLYPH } from '@/components/delivery/DeliveryBikeMarkerIcon';
import type { JobListOrderStop } from '@/components/admin/DeliveryJobTableTimeline';
import {
  deriveBranchStartState,
  deriveReturnState,
  deriveStepStates,
  type WizardStepState,
} from '@/lib/deliveryStopProgress';

const COLOMBO: [number, number] = [6.9271, 79.8612];

const storeIcon = L.divIcon({
  className: 'delivery-map-branch-marker',
  html: '<div class="delivery-map-branch-marker__dot"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const STORE_GLYPH =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

export type LivePathPoint = {
  lat: number;
  lng: number;
  recordedAt?: string;
  heading?: number | null;
};

export type LiveStoreMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  addressLine?: string;
};

export type LiveNextStop = {
  kind: 'branch' | 'stop' | 'return';
  sequence?: number | null;
  label: string;
  lat: number;
  lng: number;
};

export type LiveLastDropoff = {
  kind: 'dropoff';
  sequence?: number | null;
  label: string;
  lat: number;
  lng: number;
  orderNumber?: string;
  actual?: boolean;
};

export type LiveDriverCurrentJob = {
  id: string;
  status: string;
  pickedUp?: boolean;
  orders: JobListOrderStop[];
  nextStop?: LiveNextStop | null;
  lastDropoff?: LiveLastDropoff | null;
};

export type LiveDriverMarker = {
  jobId: string;
  driverId?: string;
  driverName: string;
  storeName?: string;
  dutyStatus?: string | null;
  currentJob?: LiveDriverCurrentJob | null;
  lat: number;
  lng: number;
  heading?: number | null;
  updatedAt?: string;
  path?: LivePathPoint[];
  locationApproximate?: boolean;
};

export type LiveDestinationMarker = {
  lat: number;
  lng: number;
  label?: string;
};

const DUTY_STATUS_LABEL: Record<string, string> = {
  ONLINE: 'Online',
  ON_DELIVERY: 'On delivery',
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function riderStatusCaption(driver: LiveDriverMarker): string {
  if (driver.dutyStatus && DUTY_STATUS_LABEL[driver.dutyStatus]) {
    return DUTY_STATUS_LABEL[driver.dutyStatus];
  }
  if (driver.dutyStatus) return driver.dutyStatus.replace(/_/g, ' ');
  return 'Available';
}

function nextStopCaption(driver: LiveDriverMarker): string | null {
  const next = driver.currentJob?.nextStop;
  if (!next) return null;
  if (next.kind === 'stop') return `Next · ${next.label}`;
  if (next.kind === 'return') return 'Next · Return';
  return 'Next · Pickup';
}

function lastDropoffCaption(driver: LiveDriverMarker): string | null {
  const drop = driver.currentJob?.lastDropoff;
  if (!drop) return null;
  return `Dropped · ${drop.label}`;
}

function nodeClass(state: string, upcoming: boolean) {
  if (state === 'completed' || state === 'active') return 'is-done';
  if (state === 'failed') return 'is-failed';
  if (upcoming) return 'is-next';
  return '';
}

function statusBoxHtml(driver: LiveDriverMarker) {
  const name = escapeHtml(driver.driverName);
  const next = nextStopCaption(driver);
  const orders = driver.currentJob?.orders ?? [];
  let rail = '';
  if (driver.currentJob && orders.length > 0) {
    const job = driver.currentJob;
    const stopStates = deriveStepStates(
      orders.map((order) => ({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        sequence: order.sequence,
        status: order.status,
        deliveryState: order.deliveryState,
        failureOutcome: order.failureOutcome ?? null,
      })),
      job.status,
    );
    const branchState = deriveBranchStartState(Boolean(job.pickedUp), job.status);
    const returnState = deriveReturnState(job.status);
    const upcomingKind = job.nextStop?.kind ?? null;
    const nodes: { kind: 'branch' | 'stop' | 'return'; state: string; label: string }[] = [
      { kind: 'branch', state: branchState, label: 'Branch' },
      ...orders.map((order, index) => ({
        kind: 'stop' as const,
        state: (stopStates[index] ?? 'pending') as WizardStepState,
        label: `#${order.sequence}`,
      })),
      { kind: 'return', state: returnState, label: 'Return' },
    ];
    rail = `<div class="live-rider-status-box__rail">${nodes
      .map((node, index) => {
        const upcoming =
          (node.kind === 'stop' &&
            upcomingKind === 'stop' &&
            node.label === job.nextStop?.label) ||
          (node.kind !== 'stop' && upcomingKind === node.kind);
        const inner =
          node.kind === 'stop' ? escapeHtml(node.label.replace('#', '')) : STORE_GLYPH;
        const connector =
          index === 0
            ? ''
            : `<span class="live-rider-status-box__line${node.state === 'completed' || node.state === 'active' ? ' is-done' : ''}"></span>`;
        return `${connector}<span class="live-rider-status-box__node"><span class="live-rider-status-box__dot ${nodeClass(node.state, upcoming)}">${inner}</span><span class="live-rider-status-box__cap">${escapeHtml(node.label)}</span></span>`;
      })
      .join('')}</div>`;
  }
  const dropped = lastDropoffCaption(driver);
  const subtitle = next
    ? `<p class="live-rider-status-box__next">${escapeHtml(next)}</p>`
    : dropped
      ? `<p class="live-rider-status-box__next">${escapeHtml(dropped)}</p>`
      : `<p class="live-rider-status-box__status">${escapeHtml(riderStatusCaption(driver))}</p>`;
  return `<div class="live-rider-status-box"><p class="live-rider-status-box__name">${name}</p>${rail}${subtitle}</div>`;
}

function statusBoxDivIcon(driver: LiveDriverMarker) {
  return L.divIcon({
    className: 'live-rider-status-marker',
    html: statusBoxHtml(driver),
    iconSize: [188, 86],
    iconAnchor: [94, 114],
  });
}

function lastDropoffDivIcon(stop: LiveLastDropoff, selected: boolean) {
  const label = escapeHtml(stop.label);
  return L.divIcon({
    className: `live-rider-next-marker live-rider-dropoff-marker${selected ? ' live-rider-next-marker--selected' : ''}`,
    html: `<div class="live-rider-next-marker__pin live-rider-dropoff-marker__pin">✓</div><span class="live-rider-next-marker__label">${label}</span>`,
    iconSize: [44, 52],
    iconAnchor: [22, 14],
  });
}

function nextStopDivIcon(stop: LiveNextStop, selected: boolean) {
  const label = escapeHtml(stop.label);
  const inner =
    stop.kind === 'stop'
      ? `<span class="live-rider-next-marker__num">${label.replace('#', '')}</span>`
      : STORE_GLYPH;
  return L.divIcon({
    className: `live-rider-next-marker${selected ? ' live-rider-next-marker--selected' : ''}`,
    html: `<div class="live-rider-next-marker__pin">${inner}</div><span class="live-rider-next-marker__label">${label}</span>`,
    iconSize: [44, 52],
    iconAnchor: [22, 14],
  });
}

const destinationIcon = L.divIcon({
  className: 'live-delivery-map-marker live-delivery-map-marker--dropoff',
  html: '<div class="live-delivery-map-marker__dropoff"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function driverDivIcon(selected: boolean, heading?: number | null) {
  const rotation =
    heading == null || Number.isNaN(Number(heading))
      ? ''
      : ` style="transform:rotate(${Number(heading) - 90}deg)"`;
  return L.divIcon({
    className: `live-delivery-map-marker live-delivery-map-marker--driver${selected ? ' live-delivery-map-marker--selected' : ''}`,
    html: `<div class="live-delivery-map-marker__driver${selected ? ' live-delivery-map-marker__driver--selected' : ''}"><span class="live-delivery-map-marker__driver-rot"${rotation}>${DELIVERY_RIDER_MARKER_GLYPH}</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function farEnough(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  return Math.abs(from.lat - to.lat) > 8e-5 || Math.abs(from.lng - to.lng) > 8e-5;
}

function FitBounds({
  points,
  mode,
}: {
  points: [number, number][];
  mode: 'continuous' | 'once';
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length === 0) return;
    if (mode === 'once' && fitted.current) return;
    fitted.current = true;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [88, 72] });
  }, [points, map, mode]);
  return null;
}

function FocusDriver({
  position,
  nonce,
}: {
  position: [number, number] | null;
  nonce: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!position || nonce === 0) return;
    map.flyTo(position, Math.max(map.getZoom(), 14), { duration: 0.55 });
  }, [position, nonce, map]);
  return null;
}

function MapResizeTrigger({ trigger }: { trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* ignore */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map, trigger]);
  return null;
}

interface Props {
  stores: LiveStoreMarker[];
  drivers: LiveDriverMarker[];
  destination?: LiveDestinationMarker | null;
  selectedDriverId?: string | null;
  selectedDriverIds?: string[];
  onDriverSelect?: (driverId: string) => void;
  className?: string;
  fitBoundsMode?: 'continuous' | 'once';
  zoomPosition?: 'topleft' | 'topright';
  focusPosition?: [number, number] | null;
  focusNonce?: number;
  resizeNonce?: number;
}

export default function AdminLiveDriversMap({
  stores,
  drivers,
  destination,
  selectedDriverId,
  selectedDriverIds,
  onDriverSelect,
  className = '',
  fitBoundsMode = 'continuous',
  zoomPosition = 'topleft',
  focusPosition = null,
  focusNonce = 0,
  resizeNonce = 0,
}: Props) {
  const points = useMemo<[number, number][]>(
    () => [
      ...stores.map((s) => [s.lat, s.lng] as [number, number]),
      ...drivers.map((d) => [d.lat, d.lng] as [number, number]),
      ...drivers
        .map((d) => d.currentJob?.nextStop)
        .filter((stop): stop is LiveNextStop => Boolean(stop))
        .map((stop) => [stop.lat, stop.lng] as [number, number]),
      ...drivers
        .map((d) => d.currentJob?.lastDropoff)
        .filter((stop): stop is LiveLastDropoff => Boolean(stop))
        .map((stop) => [stop.lat, stop.lng] as [number, number]),
      ...(destination ? [[destination.lat, destination.lng] as [number, number]] : []),
    ],
    [stores, drivers, destination],
  );
  const center = points[0] ?? COLOMBO;

  return (
    <div className={`delivery-map-wrap h-full w-full ${className}`}>
      <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl={false} className="h-full w-full">
        <AppMapTiles />
        <ZoomControl position={zoomPosition} />
        <FitBounds points={points} mode={fitBoundsMode} />
        <FocusDriver position={focusPosition} nonce={focusNonce} />
        <MapResizeTrigger trigger={resizeNonce} />
        {stores.map((store) => (
          <Marker key={store.id} position={[store.lat, store.lng]} icon={storeIcon}>
            <Popup>
              <strong>{store.name}</strong>
              {store.addressLine && <div>{store.addressLine}</div>}
            </Popup>
          </Marker>
        ))}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>
              <strong>{destination.label ?? 'Drop-off'}</strong>
            </Popup>
          </Marker>
        )}
        {drivers.map((driver) => {
          const driverId = driver.driverId ?? driver.jobId;
          const selected = Boolean(
            (selectedDriverIds && selectedDriverIds.includes(driverId)) ||
              (selectedDriverId && driverId === selectedDriverId),
          );
          const nextStop = driver.currentJob?.nextStop ?? null;
          const lastDropoff = driver.currentJob?.lastDropoff ?? null;
          const showNext =
            nextStop != null && farEnough({ lat: driver.lat, lng: driver.lng }, nextStop);
          const showDropoff =
            lastDropoff != null && farEnough({ lat: driver.lat, lng: driver.lng }, lastDropoff);
          return (
            <Fragment key={driverId}>
              {showDropoff && lastDropoff ? (
                <Marker
                  position={[lastDropoff.lat, lastDropoff.lng]}
                  icon={lastDropoffDivIcon(lastDropoff, selected)}
                  zIndexOffset={selected ? 480 : 180}
                  interactive={false}
                />
              ) : null}
              {showNext && nextStop ? (
                <>
                  <Polyline
                    positions={[
                      [driver.lat, driver.lng],
                      [nextStop.lat, nextStop.lng],
                    ]}
                    pathOptions={{
                      color: selected ? '#f59e0b' : '#2563eb',
                      opacity: selected ? 0.95 : 0.8,
                      weight: selected ? 4 : 3,
                      dashArray: '8 8',
                      lineCap: 'round',
                      className: 'live-driver-next',
                      interactive: false,
                    }}
                  />
                  <Marker
                    position={[nextStop.lat, nextStop.lng]}
                    icon={nextStopDivIcon(nextStop, selected)}
                    zIndexOffset={selected ? 500 : 200}
                    interactive={false}
                  />
                </>
              ) : null}
              <Marker
                position={[driver.lat, driver.lng]}
                icon={statusBoxDivIcon(driver)}
                zIndexOffset={selected ? 850 : 450}
                interactive={false}
              />
              <Marker
                key={`${driverId}-bike`}
                position={[driver.lat, driver.lng]}
                icon={driverDivIcon(selected, driver.heading)}
                zIndexOffset={selected ? 900 : 500}
                eventHandlers={
                  onDriverSelect
                    ? {
                        click: () => onDriverSelect(driverId),
                      }
                    : undefined
                }
              >
                <Popup>
                  <strong>{driver.driverName}</strong>
                  {driver.storeName && <div>{driver.storeName}</div>}
                  {nextStop ? <div>Next: {nextStop.label}</div> : null}
                  {lastDropoff ? <div>Dropped: {lastDropoff.label}</div> : null}
                  {driver.locationApproximate ? (
                    <div className="text-xs text-amber-600">No GPS yet — shown near branch</div>
                  ) : driver.updatedAt ? (
                    <div className="text-xs opacity-70">
                      Updated {new Date(driver.updatedAt).toLocaleTimeString()}
                    </div>
                  ) : null}
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
