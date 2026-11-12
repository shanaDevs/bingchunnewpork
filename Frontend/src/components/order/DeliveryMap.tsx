'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppMapTiles from '@/components/maps/AppMapTiles';
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

/*
 * Redesign look (the order popup): the prototype's map pins (BranchMap / the Locations page's StoreMap).
 * Opt-in through `look="redesign"`, so the order tracking page keeps the classic markers.
 */

/** Map pin outline in a 30 × 42 viewBox (-15 -40 30 42): tip at (0, 0), round head centred at (0, -24), radius 13. */
const PIN_PATH = 'M0 0 C-3 -7 -13 -13 -13 -24 A13 13 0 1 1 13 -24 C13 -13 3 -7 0 0 Z';

/** Brand pin with the mascot in its round head; selected gets a mango-yellow outline. */
function redesignBranchPinHtml(selected: boolean) {
  return `<span class="relative block size-full drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)]">
    <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible">
      <path d="${PIN_PATH}" stroke-width="2.5" class="fill-brand-600 ${selected ? 'stroke-sun-400' : 'stroke-white'}" />
    </svg>
    <img src="/images/mascot-hover.png" alt="" draggable="false" class="absolute top-[11.9%] left-[13.3%] z-1 h-[52.4%] w-[73.3%]! rounded-full bg-brand-50 object-cover object-[50%_8%]" />
  </span>`;
}

const redesignBranchIcon = L.divIcon({ html: redesignBranchPinHtml(false), className: '', iconSize: [40, 56], iconAnchor: [20, 56] });
const redesignSelectedBranchIcon = L.divIcon({ html: redesignBranchPinHtml(true), className: '', iconSize: [52, 73], iconAnchor: [26, 73] });

/** "Deliver here": a navy pin with a white house in its head; the customer can drag it. */
const redesignDeliverIcon = L.divIcon({
  html: `<span class="relative block size-full cursor-grab active:cursor-grabbing" title="Drag to set your delivery location">
    <span class="absolute bottom-0 left-1/2 h-1.5 w-4 -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-brand-950/30"></span>
    <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible drop-shadow-[0_4px_6px_rgb(15_33_71/0.35)]">
      <path d="${PIN_PATH}" stroke-width="2.5" class="fill-brand-950 stroke-white" />
      <path d="M-6.5 -22.5 L0 -29 L6.5 -22.5 V-17.5 H-6.5 Z" class="fill-white" />
      <rect x="-1.8" y="-21.5" width="3.6" height="4" class="fill-brand-950" />
    </svg>
  </span>`,
  className: '',
  iconSize: [42, 58],
  iconAnchor: [21, 58],
});

/** "You are here": a mango-yellow pin with a person in its head and a soft pulse at its tip. */
const redesignYouIcon = L.divIcon({
  html: `<span class="relative block size-full cursor-grab active:cursor-grabbing" title="Drag to search from another spot">
    <span class="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-sun-400/60 motion-safe:animate-ping"></span>
    <span class="absolute bottom-0 left-1/2 h-1.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-brand-950/30"></span>
    <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)]">
      <path d="${PIN_PATH}" stroke-width="2.5" class="fill-sun-400 stroke-white" />
      <circle cy="-24" r="9.5" class="fill-white" />
      <circle cy="-27.2" r="3.3" class="fill-brand-700" />
      <path d="M-5.6 -18.2a5.6 5.2 0 0 1 11.2 0z" class="fill-brand-700" />
    </svg>
  </span>`,
  className: '',
  iconSize: [36, 50],
  iconAnchor: [18, 50],
});

// Leaflet's own stylesheet isn't in a cascade layer, so it beats Tailwind's utilities; `!` wins it back.
// text-snow, not text-white: the app's light theme turns .text-white dark.
const redesignLabelClass = (dark: boolean) =>
  `rounded-full! border-0! px-3! py-1! text-xs! font-semibold! whitespace-nowrap! shadow-[0_4px_8px_rgb(15_33_71/0.18)]! before:hidden! ${
    dark ? 'bg-brand-700! text-snow!' : 'bg-white! text-brand-800!'
  }`;

const REDESIGN_ATTRIBUTION_CLASS =
  '[&_.leaflet-control-attribution]:rounded-tl-md! [&_.leaflet-control-attribution]:bg-white/60! [&_.leaflet-control-attribution]:px-1.5! [&_.leaflet-control-attribution]:text-[0.5625rem]! [&_.leaflet-control-attribution]:leading-4! [&_.leaflet-control-attribution]:text-slate-500! [&_.leaflet-control-attribution_a]:text-slate-500!';

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
    map.fitBounds(bounds, { padding: [64, 48], maxZoom: 15, animate: true });
  }, [map, points]);

  return null;
}

function MapInteractions({
  lat,
  lng,
  onMove,
  icon = customerIcon,
  label,
  labelClassName,
}: {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
  icon?: L.DivIcon;
  /** A permanent label above the pin (redesign look, e.g. "Deliver here"). */
  label?: string;
  labelClassName?: string;
}) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      draggable
      zIndexOffset={600}
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onMove(pos.lat, pos.lng);
        },
      }}
    >
      {label && (
        <Tooltip permanent direction="top" offset={[0, -60]} className={labelClassName}>
          {label}
        </Tooltip>
      )}
    </Marker>
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
  /** 'redesign': the prototype's pins, labels and lighter tiles (order popup). Default: the classic markers. */
  look?: 'classic' | 'redesign';
  /** Redesign look: the customer's pin is "Deliver here" (house) or "You are here" (person). */
  customerPin?: 'deliver' | 'you';
  /** Redesign look: a permanent label above the customer's pin. */
  customerPinLabel?: string;
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
  look = 'classic',
  customerPin = 'deliver',
  customerPinLabel,
}: DeliveryMapProps) {
  const redesign = look === 'redesign';
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
        redesign
          ? `isolate rounded-[1.5rem] ring-1 ring-brand-100 ring-inset ${REDESIGN_ATTRIBUTION_CLASS}`
          : bleed
            ? 'rounded-none border-0'
            : 'rounded-xl border border-navy-border'
      } ${className}`}
    >
      <MapContainer
        center={COLOMBO}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        style={{ minHeight: bleed || redesign ? '100%' : 220, height: '100%', background: redesign ? '#eef5ff' : '#0d1124' }}
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
          const name = branch.name.replace(/^Bing Chun - /, '');
          return (
            <Marker
              key={branch.id}
              position={[branch.lat, branch.lng]}
              icon={
                redesign
                  ? selected
                    ? redesignSelectedBranchIcon
                    : redesignBranchIcon
                  : selected
                    ? selectedBranchIcon
                    : branchIcon
              }
              title={branch.name}
              zIndexOffset={selected ? 400 : 200}
              eventHandlers={{
                click: () => onBranchSelect?.(branch.id),
              }}
            >
              {redesign ? (
                // The selected branch is named on the map, as in the prototype; the others on hover.
                <Tooltip
                  key={selected ? 'selected' : 'idle'}
                  permanent={selected}
                  direction="top"
                  offset={[0, selected ? -72 : -54]}
                  className={redesignLabelClass(selected)}
                >
                  {name}
                </Tooltip>
              ) : (
                <Popup>{name}</Popup>
              )}
            </Marker>
          );
        })}
        <MapInteractions
          lat={safePin.lat}
          lng={safePin.lng}
          onMove={onLocationChange}
          icon={redesign ? (customerPin === 'you' ? redesignYouIcon : redesignDeliverIcon) : customerIcon}
          label={redesign ? customerPinLabel : undefined}
          labelClassName={redesignLabelClass(true)}
        />
      </MapContainer>
    </div>
  );
}
