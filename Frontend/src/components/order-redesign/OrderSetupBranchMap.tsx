'use client';

import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import { sortByDistance, type MapLocation } from '@/components/order-redesign/orderSetupGeo';

export type MapBranch = {
  id: string;
  name: string;
  location: MapLocation;
};

export const ISLAND_BOUNDS: Leaflet.LatLngBoundsLiteral = [
  [5.6, 79.3],
  [10.1, 82.2],
];

export const isOnIsland = ({ lat, lng }: MapLocation) =>
  lat >= ISLAND_BOUNDS[0][0] &&
  lat <= ISLAND_BOUNDS[1][0] &&
  lng >= ISLAND_BOUNDS[0][1] &&
  lng <= ISLAND_BOUNDS[1][1];

const SELECTED_ZOOM = 13;
const MAX_FIT_ZOOM = 14;
const NEAREST_IN_VIEW = 3;
const COMPACT_BELOW_ZOOM = 10;
const PIN_PATH = 'M0 0 C-3 -7 -13 -13 -13 -24 A13 13 0 1 1 13 -24 C13 -13 3 -7 0 0 Z';

export const USER_PIN_HTML = `<span class="relative block size-full">
  <span class="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-sun-400/60 motion-safe:animate-ping"></span>
  <span class="absolute bottom-0 left-1/2 h-1.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-brand-950/30"></span>
  <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)]">
    <path d="${PIN_PATH}" stroke-width="2.5" class="fill-sun-400 stroke-white" />
    <circle cy="-24" r="9.5" class="fill-white" />
    <circle cy="-27.2" r="3.3" class="fill-brand-700" />
    <path d="M-5.6 -18.2a5.6 5.2 0 0 1 11.2 0z" class="fill-brand-700" />
  </svg>
</span>`;
export const USER_PIN_SIZE: [number, number] = [36, 50];

const DELIVERY_PIN_HTML = `<span class="relative block size-full cursor-grab active:cursor-grabbing">
  <span class="absolute bottom-0 left-1/2 h-1.5 w-4 -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-brand-950/30"></span>
  <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible drop-shadow-[0_4px_6px_rgb(15_33_71/0.35)]">
    <path d="${PIN_PATH}" stroke-width="2.5" class="fill-brand-950 stroke-white" />
    <path d="M-6.5 -22.5 L0 -29 L6.5 -22.5 V-17.5 H-6.5 Z" class="fill-white" />
    <rect x="-1.8" y="-21.5" width="3.6" height="4" class="fill-brand-950" />
  </svg>
</span>`;
const DELIVERY_PIN_SIZE: [number, number] = [42, 58];
const RANGE_STYLE: Leaflet.CircleMarkerOptions = {
  color: '#1f62d6',
  weight: 1.5,
  dashArray: '6 6',
  fillColor: '#1f62d6',
  fillOpacity: 0.05,
  interactive: false,
};

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const ATTRIBUTION_CLASS =
  '[&_.leaflet-control-attribution]:rounded-tl-md! [&_.leaflet-control-attribution]:bg-white/60! [&_.leaflet-control-attribution]:px-1.5! [&_.leaflet-control-attribution]:text-[0.5625rem]! [&_.leaflet-control-attribution]:leading-4! [&_.leaflet-control-attribution]:text-slate-500! [&_.leaflet-control-attribution_a]:text-slate-500!';

export type PinState = 'selected' | 'selectable' | 'disabled';

const MASCOT_SRC = '/images/mascot-hover.png';

const PIN_RING: Record<PinState, string> = {
  selected: 'stroke-sun-400',
  selectable: 'stroke-white',
  disabled: 'stroke-white',
};

export function pinHtml(state: PinState) {
  return `<span class="relative block size-full drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)] ${state === 'disabled' ? 'opacity-55 grayscale' : ''}">
    <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible">
      <path d="${PIN_PATH}" stroke-width="2.5" class="fill-brand-600 ${PIN_RING[state]}" />
    </svg>
    <img src="${MASCOT_SRC}" alt="" draggable="false" class="absolute top-[11.9%] left-[13.3%] z-1 h-[52.4%] w-[73.3%]! rounded-full bg-brand-50 object-cover object-[50%_8%]" />
  </span>`;
}

export const PIN_SIZE: Record<PinState, [number, number]> = {
  selected: [52, 73],
  selectable: [40, 56],
  disabled: [30, 42],
};

const labelClass = (selected: boolean) =>
  cn(
    'rounded-full! border-0! px-3! py-1! text-xs! font-semibold! whitespace-nowrap! shadow-[0_4px_8px_rgb(15_33_71/0.18)]! before:hidden!',
    selected ? 'bg-brand-700! text-white!' : 'bg-white! text-brand-800!',
  );

type OrderSetupBranchMapProps = {
  branches: MapBranch[];
  selectableIds: Set<string>;
  selectedId: string | null;
  highlightedId: string | null;
  focusedId?: string | null;
  insetBottom?: number;
  userLocation?: MapLocation | null;
  deliveryPin?: MapLocation | null;
  deliveryPinLabel?: string;
  deliveryRadiusKm?: number;
  onMoveDeliveryPin?: (location: MapLocation) => void;
  compactWhenZoomedOut?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  className?: string;
};

/** Design BranchMap — mascot pins on OSM tiles (branch picker step). */
export function OrderSetupBranchMap({
  branches,
  selectableIds,
  selectedId,
  highlightedId,
  focusedId = null,
  insetBottom = 0,
  userLocation = null,
  deliveryPin = null,
  deliveryPinLabel,
  deliveryRadiusKm,
  onMoveDeliveryPin,
  compactWhenZoomedOut = false,
  onSelect,
  onHover,
  className,
}: OrderSetupBranchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.Marker>());
  const userMarkerRef = useRef<Leaflet.Marker | null>(null);
  const deliveryMarkerRef = useRef<Leaflet.Marker | null>(null);
  const rangeRef = useRef<Leaflet.Circle | null>(null);
  const movedRef = useRef(false);
  const appliedRef = useRef(new Map<string, string>());
  const viewRef = useRef<{
    selectableKey: string;
    selectedId: string | null;
    userKey: string;
    insetBottom: number;
  } | null>(null);
  const pendingFitRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [zoomedOut, setZoomedOut] = useState(true);
  const here = userLocation && isOnIsland(userLocation) ? userLocation : null;
  const pin = deliveryPin && isOnIsland(deliveryPin) ? deliveryPin : null;
  const anchor = pin ?? here;
  const userKey = anchor ? `${anchor.lat},${anchor.lng}` : '';

  const latest = useRef({ selectableIds, onSelect, onHover, onMoveDeliveryPin });
  useEffect(() => {
    latest.current = { selectableIds, onSelect, onHover, onMoveDeliveryPin };
  });

  const movePin = (location: MapLocation) => {
    const move = latest.current.onMoveDeliveryPin;
    if (!move || !isOnIsland(location)) return;
    movedRef.current = true;
    move({ lat: location.lat, lng: location.lng });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    const markers = markersRef.current;
    const applied = appliedRef.current;

    import('leaflet').then((L) => {
      if (cancelled) return;
      leafletRef.current = L;
      map = L.map(container, {
        keyboard: false,
        zoomControl: false,
        maxBounds: ISLAND_BOUNDS,
        maxBoundsViscosity: 1,
        minZoom: 7,
        zoomSnap: 0.5,
      }).fitBounds(ISLAND_BOUNDS);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, className: 'saturate-50' }).addTo(map);
      map.attributionControl.setPrefix(false);
      map.on('click', (event: Leaflet.LeafletMouseEvent) => movePin(event.latlng));
      map.on('zoomend', (event: Leaflet.LeafletEvent) => {
        setZoomedOut((event.target as Leaflet.Map).getZoom() < COMPACT_BELOW_ZOOM);
        pendingFitRef.current?.();
        pendingFitRef.current = null;
      });

      for (const branch of branches) {
        const marker = L.marker(branch.location, { keyboard: false })
          .on('click', () => latest.current.selectableIds.has(branch.id) && latest.current.onSelect(branch.id))
          .on('mouseover', () => latest.current.selectableIds.has(branch.id) && latest.current.onHover(branch.id))
          .on('mouseout', () => latest.current.onHover(null))
          .addTo(map);
        markers.set(branch.id, marker);
      }

      container.querySelectorAll('a').forEach((link) => link.setAttribute('tabindex', '-1'));
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (map) {
        (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
        map.stop();
        map.remove();
      }
      markers.clear();
      applied.clear();
      userMarkerRef.current = null;
      deliveryMarkerRef.current = null;
      rangeRef.current = null;
      viewRef.current = null;
      pendingFitRef.current = null;
      mapRef.current = null;
      setReady(false);
    };
  }, [branches]);

  useEffect(() => {
    const L = leafletRef.current;
    if (!ready || !L) return;
    const applied = appliedRef.current;
    for (const branch of branches) {
      const marker = markersRef.current.get(branch.id);
      if (!marker) continue;
      const selected = branch.id === selectedId;
      const state: PinState = selected
        ? 'selected'
        : selectableIds.has(branch.id)
          ? 'selectable'
          : 'disabled';
      const labelled = selected || branch.id === highlightedId;
      const compact = compactWhenZoomedOut && zoomedOut && state === 'selectable';
      const look = `${state}|${labelled}|${compact}`;
      if (applied.get(branch.id) === look) continue;
      applied.set(branch.id, look);

      const [width, height] = compact ? PIN_SIZE.disabled : PIN_SIZE[state];
      marker.setIcon(
        L.divIcon({
          html: pinHtml(state),
          className: state === 'disabled' ? 'cursor-default!' : '',
          iconSize: [width, height],
          iconAnchor: [width / 2, height],
        }),
      );
      marker.setZIndexOffset(selected ? 1000 : state === 'selectable' ? 500 : 0);

      marker.unbindTooltip();
      if (labelled) {
        marker.bindTooltip(branch.name, {
          permanent: true,
          direction: 'top',
          offset: [0, -height - 2],
          className: labelClass(selected),
        });
      }
    }
  }, [ready, branches, selectableIds, selectedId, highlightedId, compactWhenZoomedOut, zoomedOut]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    if (!here) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(here);
      return;
    }
    userMarkerRef.current = L.marker(here, {
      icon: L.divIcon({
        html: USER_PIN_HTML,
        className: '',
        iconSize: USER_PIN_SIZE,
        iconAnchor: [USER_PIN_SIZE[0] / 2, USER_PIN_SIZE[1]],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 700,
    }).addTo(map);
  }, [ready, here]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;
    if (!pin) {
      deliveryMarkerRef.current?.remove();
      rangeRef.current?.remove();
      deliveryMarkerRef.current = null;
      rangeRef.current = null;
      return;
    }
    if (deliveryRadiusKm) {
      if (rangeRef.current) rangeRef.current.setLatLng(pin).setRadius(deliveryRadiusKm * 1000);
      else rangeRef.current = L.circle(pin, { ...RANGE_STYLE, radius: deliveryRadiusKm * 1000 }).addTo(map);
    }
    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.setLatLng(pin);
    } else {
      const created = L.marker(pin, {
        icon: L.divIcon({
          html: DELIVERY_PIN_HTML,
          className: '',
          iconSize: DELIVERY_PIN_SIZE,
          iconAnchor: [DELIVERY_PIN_SIZE[0] / 2, DELIVERY_PIN_SIZE[1]],
        }),
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 1500,
      })
        .on('dragend', () => movePin(created.getLatLng()))
        .addTo(map);
      deliveryMarkerRef.current = created;
    }
    const marker = deliveryMarkerRef.current;
    marker.unbindTooltip();
    if (deliveryPinLabel) {
      marker.bindTooltip(deliveryPinLabel, {
        permanent: true,
        direction: 'top',
        offset: [0, -DELIVERY_PIN_SIZE[1] - 2],
        className: labelClass(true),
      });
    }
  }, [ready, pin?.lat, pin?.lng, deliveryRadiusKm, deliveryPinLabel]);

  const centreOn = (map: Leaflet.Map, location: MapLocation, zoom: number, animate: boolean) => {
    const point = map.project(location, zoom).add([0, insetBottom / 2]);
    map.setView(map.unproject(point, zoom), zoom, { animate });
  };

  const selectableKey = [...selectableIds].sort().join(',');
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;

    const fitPadding = {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, 48 + insetBottom],
    } satisfies Leaflet.FitBoundsOptions;
    const applyView = (animate: boolean, focusSelected: boolean) => {
      const selected = branches.find((branch) => branch.id === selectedId);
      const pickable = branches.filter((branch) => selectableIds.has(branch.id));
      if (selected && focusSelected) {
        centreOn(map, selected.location, Math.max(map.getZoom(), SELECTED_ZOOM), animate);
      } else if (anchor && pickable.length > 0) {
        const nearest = sortByDistance(pickable, anchor).slice(0, NEAREST_IN_VIEW);
        map.fitBounds(L.latLngBounds([anchor, ...nearest.map((branch) => branch.location)]), {
          ...fitPadding,
          maxZoom: MAX_FIT_ZOOM,
          animate,
        });
      } else if (pin) {
        centreOn(map, pin, 10, animate);
      } else if (pickable.length > 0) {
        map.fitBounds(L.latLngBounds(pickable.map((branch) => branch.location)), {
          ...fitPadding,
          maxZoom: MAX_FIT_ZOOM,
          animate,
        });
      } else {
        map.fitBounds(ISLAND_BOUNDS, { animate });
      }
    };

    const fitView = (animate: boolean) => {
      const focusSelected = viewRef.current === null || viewRef.current.selectedId !== selectedId;
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) {
        pendingFitRef.current = () => applyView(true, focusSelected);
      } else {
        applyView(animate, focusSelected);
      }
    };

    const previous = viewRef.current;
    if (previous && movedRef.current) {
      movedRef.current = false;
      viewRef.current = { selectableKey, selectedId, userKey, insetBottom };
    } else if (
      !previous ||
      previous.selectableKey !== selectableKey ||
      previous.selectedId !== selectedId ||
      previous.userKey !== userKey ||
      previous.insetBottom !== insetBottom
    ) {
      fitView(previous !== null);
      viewRef.current = { selectableKey, selectedId, userKey, insetBottom };
    }

    let wasHidden = map.getSize().x === 0;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const hidden = map.getSize().x === 0;
      if (wasHidden && !hidden) {
        viewRef.current = null;
        fitView(false);
        viewRef.current = { selectableKey, selectedId, userKey, insetBottom };
      }
      wasHidden = hidden;
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [ready, branches, selectableIds, selectableKey, selectedId, anchor, pin, userKey, insetBottom]);

  useEffect(() => {
    const map = mapRef.current;
    const branch = branches.find(({ id }) => id === focusedId);
    if (!ready || !map || !branch) return;
    const pan = () => centreOn(map, branch.location, map.getZoom(), true);
    if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) pendingFitRef.current = pan;
    else pan();
  }, [ready, branches, focusedId]);

  return (
    <div aria-hidden="true" className={cn('relative isolate min-h-0 overflow-hidden bg-brand-50', className)}>
      <div
        ref={containerRef}
        style={{ '--map-inset': `${insetBottom}px` } as CSSProperties}
        className={cn(
          'absolute inset-0 bg-brand-50! [font:inherit]! [&_.leaflet-bottom]:bottom-(--map-inset)!',
          ATTRIBUTION_CLASS,
        )}
      />
    </div>
  );
}
