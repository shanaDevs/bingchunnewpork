'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLOMBO: [number, number] = [6.9271, 79.8612];

export type ActualRoutePayload = {
  jobId: string;
  rideCode?: string | null;
  title: string;
  status: string;
  store: { id: string; name: string; lat: number; lng: number; addressLine?: string; city?: string };
  estimatedDistanceKm?: number | null;
  estimatedMinutes?: number | null;
  actualDistanceKm?: number | null;
  actualMinutes?: number | null;
  path: Array<{ lat: number; lng: number }>;
  stops: Array<{ orderNumber: string; lat: number; lng: number }>;
};

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function runWhenMapReady(map: L.Map, action: () => void) {
  const run = () => {
    try {
      if (!map.getContainer().isConnected) return;
      map.invalidateSize({ animate: false });
      action();
    } catch {
      /* map may be mid-unmount */
    }
  };

  if ((map as L.Map & { _loaded?: boolean })._loaded) {
    requestAnimationFrame(run);
    return;
  }
  map.whenReady(() => requestAnimationFrame(run));
}

function MapResizeTrigger() {
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
  }, [map]);
  return null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const signature = useMemo(() => points.map((p) => p.join(',')).join('|'), [points]);

  useEffect(() => {
    if (points.length === 0) return;
    runWhenMapReady(map, () => {
      if (points.length === 1) {
        map.setView(points[0], 15);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    });
  }, [map, points, signature]);

  return null;
}

function storeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'route-map-pin-wrapper',
    html: `<div style="background:#0f172a;color:#fff;border-radius:999px;padding:6px 10px;font:600 11px/1 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.25)">Branch</div>`,
    iconSize: [64, 28],
    iconAnchor: [32, 14],
  });
}

type Props = {
  route: ActualRoutePayload;
  className?: string;
};

export default function AdminActualRouteMap({ route, className = '' }: Props) {
  const path = route.path ?? [];
  const stops = route.stops ?? [];

  const pathPoints: [number, number][] = path
    .filter((p) => isValidLatLng(p.lat, p.lng))
    .map((p) => [p.lat, p.lng] as [number, number]);

  const boundsPoints: [number, number][] = [];
  if (isValidLatLng(route.store.lat, route.store.lng)) {
    boundsPoints.push([route.store.lat, route.store.lng]);
  }
  for (const s of stops) {
    if (isValidLatLng(s.lat, s.lng)) boundsPoints.push([s.lat, s.lng]);
  }
  boundsPoints.push(...pathPoints);

  const center = boundsPoints[0] ?? COLOMBO;
  const showStoreMarker = isValidLatLng(route.store.lat, route.store.lng);

  return (
    <div className={`delivery-map-wrap h-full w-full ${className}`}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapResizeTrigger />
        <FitBounds points={boundsPoints} />
        {pathPoints.length >= 2 && (
          <>
            <Polyline
              positions={pathPoints}
              pathOptions={{
                color: '#166534',
                weight: 9,
                opacity: 0.28,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
            <Polyline
              positions={pathPoints}
              pathOptions={{
                color: '#16a34a',
                weight: 6,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </>
        )}
        {showStoreMarker ? (
          <Marker position={[route.store.lat, route.store.lng]} icon={storeIcon()} />
        ) : null}
        {stops.map((stop, idx) =>
          isValidLatLng(stop.lat, stop.lng) ? (
            <CircleMarker
              key={`${stop.orderNumber}-${idx}`}
              center={[stop.lat, stop.lng]}
              radius={8}
              pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9 }}
            />
          ) : null,
        )}
      </MapContainer>
    </div>
  );
}
