'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import AppMapTiles from '@/components/maps/AppMapTiles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toMapLatLng } from '@/lib/storeCoordinates';
import { fetchRoadPath, pointAlongPath, prefixAlongPath } from '@/lib/roadRouting';

const COLOMBO: [number, number] = [6.9271, 79.8612];

const VEHICLE_MARKER_SVG = `<svg class="delivery-map-vehicle-marker__icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;

const vehicleIcon = L.divIcon({
  className: 'delivery-map-vehicle-marker',
  html: `<div class="delivery-map-vehicle-marker__bubble">${VEHICLE_MARKER_SVG}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const customerIcon = L.divIcon({
  className: 'delivery-map-customer-marker',
  html: `<div class="delivery-map-customer-marker__pin" title="Drag to set your location">
    <span class="delivery-map-customer-marker__you-label">You · drag pin</span>
    <span class="delivery-map-customer-marker__avatar">
      <img src="/brand/customer-avatar.png" alt="" width="40" height="40" />
    </span>
    <span class="delivery-map-customer-marker__tip" aria-hidden="true"></span>
  </div>`,
  iconSize: [120, 88],
  iconAnchor: [60, 88],
});

const branchIcon = L.divIcon({
  className: 'delivery-map-branch-marker',
  html: `<div class="delivery-map-branch-marker__logo" title="Outlet">
    <img src="/brand/mascot-hover.png" alt="" width="28" height="28" />
    <span class="delivery-map-branch-marker__tip" aria-hidden="true"></span>
  </div>`,
  iconSize: [36, 46],
  iconAnchor: [18, 46],
});

const selectedBranchIcon = L.divIcon({
  className: 'delivery-map-branch-marker delivery-map-branch-marker--selected',
  html: `<div class="delivery-map-branch-marker__selected">
    <span class="delivery-map-branch-marker__outlet-label">Outlet</span>
    <span class="delivery-map-branch-marker__logo delivery-map-branch-marker__logo--lg">
      <img src="/brand/mascot-hover.png" alt="" width="36" height="36" />
      <span class="delivery-map-branch-marker__tip" aria-hidden="true"></span>
    </span>
  </div>`,
  iconSize: [110, 86],
  iconAnchor: [55, 86],
});

export type RouteAnimationMode = 'delivery' | 'pickup';

function MapResizeObserver() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const target = container.parentElement ?? container;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(target);
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 80);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [map]);

  return null;
}

function MapViewport({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48], paddingBottomRight: [48, 180], maxZoom: 15, animate: true });
  }, [map, points]);

  return null;
}

function MapInteractions({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      position={[lat, lng]}
      icon={customerIcon}
      draggable
      zIndexOffset={600}
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onMove(pos.lat, pos.lng);
        },
      }}
    />
  );
}

function RouteLayer({
  customer,
  branch,
  animationMode,
}: {
  customer: { lat: number; lng: number } | null;
  branch: { lat: number; lng: number } | null;
  animationMode: RouteAnimationMode;
}) {
  const [route, setRoute] = useState<[number, number][]>([]);
  const [travelT, setTravelT] = useState(0);

  const routeStart = animationMode === 'pickup' ? customer : branch;
  const routeEnd = animationMode === 'pickup' ? branch : customer;

  useEffect(() => {
    if (!routeStart || !routeEnd) {
      setRoute([]);
      setTravelT(0);
      return;
    }

    const fallback: [number, number][] = [
      [routeStart.lat, routeStart.lng],
      [routeEnd.lat, routeEnd.lng],
    ];
    setRoute(fallback);
    setTravelT(0);

    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const path = await fetchRoadPath([routeStart, routeEnd], controller.signal);
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
  }, [routeStart?.lat, routeStart?.lng, routeEnd?.lat, routeEnd?.lng, animationMode]);

  useEffect(() => {
    if (route.length < 2) {
      setTravelT(0);
      return;
    }

    let raf = 0;
    const travelMs = 4800;
    const pauseMs = 700;
    const cycleMs = travelMs + pauseMs;
    const started = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - started) % cycleMs;
      if (elapsed < travelMs) {
        const raw = elapsed / travelMs;
        const eased = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
        setTravelT(eased);
      } else {
        setTravelT(0);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route]);

  if (route.length < 2) return null;

  const vehiclePos = pointAlongPath(route, travelT);
  const traveled = prefixAlongPath(route, travelT);

  return (
    <>
      <Polyline positions={route} pathOptions={{ color: '#307ef2', weight: 5, opacity: 0.22 }} />
      {traveled.length >= 2 && (
        <Polyline positions={traveled} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.95 }} />
      )}
      {vehiclePos && travelT > 0.01 && (
        <Marker position={vehiclePos} icon={vehicleIcon} zIndexOffset={500} interactive={false} />
      )}
    </>
  );
}

export interface BranchMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface DeliveryMapProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  className?: string;
  branchMarkers?: BranchMarker[];
  selectedBranchId?: string | null;
  onBranchSelect?: (branchId: string) => void;
  /** When true, draw road path and animate vehicle between customer and branch. */
  showRoute?: boolean;
  /** delivery: outlet → customer. pickup: customer → outlet. */
  routeAnimation?: RouteAnimationMode;
}

export default function DeliveryMap({
  lat,
  lng,
  onLocationChange,
  className = '',
  branchMarkers = [],
  selectedBranchId = null,
  onBranchSelect,
  showRoute = true,
  routeAnimation = 'delivery',
}: DeliveryMapProps) {
  const pin = useMemo(() => toMapLatLng(lat, lng), [lat, lng]);

  const branches = useMemo(
    () =>
      branchMarkers
        .map((branch) => {
          const point = toMapLatLng(branch.lat, branch.lng);
          if (!point) return null;
          return { ...branch, lat: point.lat, lng: point.lng };
        })
        .filter((branch): branch is BranchMarker => branch != null),
    [branchMarkers],
  );

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  const viewportPoints = useMemo(() => {
    const points: [number, number][] = [];
    if (pin) points.push([pin.lat, pin.lng]);
    if (selectedBranch) {
      points.push([selectedBranch.lat, selectedBranch.lng]);
    } else {
      for (const branch of branches) {
        points.push([branch.lat, branch.lng]);
      }
    }
    return points;
  }, [pin, branches, selectedBranch]);

  const safePin = pin ?? { lat: COLOMBO[0], lng: COLOMBO[1] };
  const showAnimatedRoute = showRoute && pin && selectedBranch;
  const bleed = className.includes('delivery-map-wrap--bleed');

  return (
    <div
      className={`delivery-map-wrap overflow-hidden ${
        bleed ? 'rounded-none border-0' : 'rounded-xl border border-navy-border'
      } ${className}`}
    >
      <MapContainer
        center={COLOMBO}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ minHeight: bleed ? '100%' : 220, height: '100%', background: '#0d1124' }}
      >
        <AppMapTiles />
        <MapResizeObserver />
        <MapViewport points={viewportPoints} />
        {showAnimatedRoute && (
          <RouteLayer
            customer={pin}
            branch={selectedBranch}
            animationMode={routeAnimation}
          />
        )}
        {branches.map((branch) => {
          const selected = branch.id === selectedBranchId;
          return (
            <Marker
              key={branch.id}
              position={[branch.lat, branch.lng]}
              icon={selected ? selectedBranchIcon : branchIcon}
              title={branch.name}
              zIndexOffset={selected ? 400 : 200}
              eventHandlers={{
                click: () => onBranchSelect?.(branch.id),
              }}
            >
              <Popup>{branch.name.replace(/^Bing Chun - /, '')}</Popup>
            </Marker>
          );
        })}
        <MapInteractions lat={safePin.lat} lng={safePin.lng} onMove={onLocationChange} />
      </MapContainer>
    </div>
  );
}
