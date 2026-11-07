'use client';

import { useEffect, useState } from 'react';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import L from 'leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { getSocket } from '@/lib/socketClient';
import { DELIVERY_RIDER_MARKER_GLYPH } from '@/components/delivery/DeliveryBikeMarkerIcon';
import { fetchRoadPath } from '@/lib/roadRouting';

const COLOMBO: [number, number] = [6.9271, 79.8612];

const storeIcon = L.divIcon({
  className: 'live-delivery-map-marker live-delivery-map-marker--store',
  html: '<div class="live-delivery-map-marker__dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const destinationIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const driverIcon = L.divIcon({
  className: 'live-delivery-map-marker live-delivery-map-marker--driver',
  html: `<div class="live-delivery-map-marker__driver">${DELIVERY_RIDER_MARKER_GLYPH}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export interface DriverLocationPayload {
  orderId?: string;
  orderNumber?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt?: string;
}

export interface EtaUpdatePayload {
  orderId?: string;
  orderNumber?: string;
  estimatedMinutes?: number;
  etaAt?: string;
}

function FitBounds({ points, fullscreen }: { points: [number, number][]; fullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: fullscreen ? [72, 72] : [56, 56] });
  }, [points, map, fullscreen]);
  return null;
}

function MapResizeTrigger({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [fullscreen, map]);
  return null;
}

function RoadRoute({
  from,
  to,
  color = '#2563eb',
  weight = 4,
  opacity = 0.85,
  dashArray,
}: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
}) {
  const [route, setRoute] = useState<[number, number][]>([]);

  useEffect(() => {
    const fallback: [number, number][] = [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ];
    setRoute(fallback);

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const path = await fetchRoadPath([from, to], controller.signal);
        if (cancelled) return;
        setRoute(path.length >= 2 ? path : fallback);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setRoute(fallback);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from.lat, from.lng, to.lat, to.lng]);

  if (route.length < 2) return null;

  return (
    <Polyline
      positions={route}
      pathOptions={{ color, weight, opacity, dashArray }}
    />
  );
}

interface MapContentProps {
  store: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; addressLine?: string };
  driver: { lat: number; lng: number } | null;
  /** Before pickup: route rider → outlet. After: rider → customer. */
  phase?: 'TO_OUTLET' | 'TO_CUSTOMER' | null;
  fullscreen: boolean;
}

function MapContent({ store, destination, driver, phase, fullscreen }: MapContentProps) {
  const headingToOutlet = phase === 'TO_OUTLET';
  const points: [number, number][] = headingToOutlet
    ? [
        [store.lat, store.lng],
        ...(driver ? ([[driver.lat, driver.lng]] as [number, number][]) : []),
      ]
    : [
        [store.lat, store.lng],
        [destination.lat, destination.lng],
        ...(driver ? ([[driver.lat, driver.lng]] as [number, number][]) : []),
      ];
  const center = points[0] ?? COLOMBO;
  const activeTo = headingToOutlet ? store : destination;
  const routeFrom = driver ?? (headingToOutlet ? null : store);

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom={fullscreen}
      className="h-full w-full"
      style={{ minHeight: fullscreen ? '100%' : 260, background: '#0d1124' }}
    >
      <AppMapTiles />
      <MapResizeTrigger fullscreen={fullscreen} />
      <FitBounds points={points} fullscreen={fullscreen} />
      {!headingToOutlet && (
        <RoadRoute
          from={store}
          to={destination}
          color="#64748b"
          weight={3}
          opacity={driver ? 0.35 : 0.7}
          dashArray={driver ? '6 8' : undefined}
        />
      )}
      {routeFrom && <RoadRoute from={routeFrom} to={activeTo} />}
      <Marker position={[store.lat, store.lng]} icon={storeIcon} title={store.name} />
      <Marker
        position={[destination.lat, destination.lng]}
        icon={destinationIcon}
        title={destination.addressLine ?? 'Delivery address'}
      />
      {driver && (
        <Marker
          position={[driver.lat, driver.lng]}
          icon={driverIcon}
          title={headingToOutlet ? 'Rider heading to store' : 'Your driver'}
        />
      )}
    </MapContainer>
  );
}

interface Props {
  orderId: string;
  trackToken?: string;
  orderNumber?: string;
  store: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; addressLine?: string };
  deliveryPhase?: 'TO_OUTLET' | 'TO_CUSTOMER' | null;
  initialDriver?: { lat: number; lng: number } | null;
  className?: string;
  onDriverLocation?: (payload: DriverLocationPayload) => void;
  onEtaUpdate?: (payload: EtaUpdatePayload) => void;
}

/** Live driver-tracking map for the customer order page — store + delivery address + realtime driver marker. */
export default function LiveDeliveryMap({
  orderId,
  trackToken,
  orderNumber,
  store,
  destination,
  deliveryPhase = null,
  initialDriver = null,
  className = '',
  onDriverLocation,
  onEtaUpdate,
}: Props) {
  const [driver, setDriver] = useState<{ lat: number; lng: number } | null>(initialDriver);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!initialDriver) return;
    setDriver({
      lat: initialDriver.lat,
      lng: initialDriver.lng,
    });
  }, [initialDriver?.lat, initialDriver?.lng]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit(
      'trackOrder',
      trackToken ? { identifier: orderId, trackToken } : orderId,
    );

    const matchesOrder = (payload: { orderId?: string; orderNumber?: string }) =>
      (!payload.orderId && !payload.orderNumber) ||
      payload.orderId === orderId ||
      payload.orderNumber === orderId ||
      (orderNumber ? payload.orderNumber === orderNumber : false);

    const locationHandler = (payload: DriverLocationPayload) => {
      if (!matchesOrder(payload)) return;
      setDriver({ lat: payload.lat, lng: payload.lng });
      onDriverLocation?.(payload);
    };

    const etaHandler = (payload: EtaUpdatePayload) => {
      if (!matchesOrder(payload)) return;
      onEtaUpdate?.(payload);
    };

    socket.on('driverLocation', locationHandler);
    socket.on('etaUpdate', etaHandler);
    return () => {
      socket.off('driverLocation', locationHandler);
      socket.off('etaUpdate', etaHandler);
    };
  }, [orderId, trackToken, orderNumber, onDriverLocation, onEtaUpdate]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  const waitingHint = deliveryPhase === 'TO_OUTLET'
    ? 'Waiting for rider location on the way to the store…'
    : 'Waiting for your driver\u2019s live location\u2026';

  const mapContent = (
    <MapContent
      store={store}
      destination={destination}
      driver={driver}
      phase={deliveryPhase}
      fullscreen={fullscreen}
    />
  );

  if (fullscreen) {
    return (
      <div className="live-delivery-map-fullscreen" role="dialog" aria-label="Live delivery map">
        <div className="live-delivery-map-fullscreen__header">
          <p className="text-sm font-medium text-fg">
            {deliveryPhase === 'TO_OUTLET' ? 'Rider to store' : 'Live driver location'}
          </p>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="live-delivery-map__fullscreen-btn"
            aria-label="Exit fullscreen map"
          >
            <Minimize2 size={18} />
          </button>
        </div>
        <div className="live-delivery-map-fullscreen__body">{mapContent}</div>
        {!driver && (
          <p className="live-delivery-map-fullscreen__waiting text-xs text-muted text-center">
            {waitingHint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`delivery-map-wrap live-delivery-map overflow-hidden rounded-xl border border-navy-border ${className}`}
    >
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="live-delivery-map__fullscreen-btn live-delivery-map__fullscreen-btn--expand"
        aria-label="Open map fullscreen"
      >
        <Maximize2 size={16} />
      </button>
      {mapContent}
      {!driver && (
        <div className="live-delivery-map__waiting py-2 text-center text-xs text-muted">
          {waitingHint}
        </div>
      )}
    </div>
  );
}
