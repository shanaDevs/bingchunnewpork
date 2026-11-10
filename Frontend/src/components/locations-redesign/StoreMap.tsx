"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { attachAppMapBasemap } from "@/components/maps/AppMapTiles";
import { sortByDistance, type FinderStore, type LatLng } from "./stores";

/** Sri Lanka with a margin: the map can't be panned or zoomed out far past it. */
const ISLAND_BOUNDS: Leaflet.LatLngBoundsLiteral = [
  [5.6, 79.3],
  [10.1, 82.2],
];
const isOnIsland = ({ lat, lng }: LatLng) =>
  lat >= ISLAND_BOUNDS[0][0] && lat <= ISLAND_BOUNDS[1][0] && lng >= ISLAND_BOUNDS[0][1] && lng <= ISLAND_BOUNDS[1][1];
/** Close enough to read the streets, wide enough to still show the neighbouring stores. */
const SELECTED_ZOOM = 13;
/** Fitting a few close stores shouldn't zoom in further than this. */
const MAX_FIT_ZOOM = 14;
/** With the customer located, the view takes in this many of their nearest stores. */
const NEAREST_IN_VIEW = 3;
/** Pins are drawn small below this zoom (about a district across), so close ones overlap less. */
const COMPACT_BELOW_ZOOM = 10;

/** Map pin outline in a 30 × 42 viewBox (-15 -40 30 42): tip at (0, 0), round head centred at (0, -24), radius 13. */
const PIN_PATH = "M0 0 C-3 -7 -13 -13 -13 -24 A13 13 0 1 1 13 -24 C13 -13 3 -7 0 0 Z";

/**
 * "You are here": a mango-yellow pin with a person in its head, so it stands apart from the blue mascot store
 * pins, with a soft pulse where the tip touches the map (still when reduced motion is on). `z-0!` undoes
 * Leaflet's z-index on map SVGs, so the pin stays above the pulse.
 */
const USER_PIN_HTML = `<span class="relative block size-full">
  <span class="absolute bottom-0 left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-sun-400/60 motion-safe:animate-ping"></span>
  <span class="absolute bottom-0 left-1/2 h-1.5 w-3.5 -translate-x-1/2 translate-y-1/2 rounded-[50%] bg-brand-950/30"></span>
  <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)]">
    <path d="${PIN_PATH}" stroke-width="2.5" class="fill-sun-400 stroke-white" />
    <circle cy="-24" r="9.5" class="fill-white" />
    <circle cy="-27.2" r="3.3" class="fill-brand-700" />
    <path d="M-5.6 -18.2a5.6 5.2 0 0 1 11.2 0z" class="fill-brand-700" />
  </svg>
</span>`;
const USER_PIN_SIZE: [number, number] = [36, 50];

// Leaflet's own stylesheet isn't in a cascade layer, so `!` is needed to restyle its credit box.
const ATTRIBUTION_CLASS =
  "[&_.leaflet-control-attribution]:rounded-tl-md! [&_.leaflet-control-attribution]:bg-white/60! [&_.leaflet-control-attribution]:px-1.5! [&_.leaflet-control-attribution]:text-[0.5625rem]! [&_.leaflet-control-attribution]:leading-4! [&_.leaflet-control-attribution]:text-slate-500! [&_.leaflet-control-attribution_a]:text-slate-500!";

type PinState = "selected" | "selectable" | "disabled";

/** The waving mascot, framed on its face and raised drink (the whole body is too small at pin size). */
const MASCOT_SRC = "/images/mascot-hover.png";

/** Selected: a mango-yellow outline; otherwise white. */
const PIN_RING: Record<PinState, string> = {
  selected: "stroke-sun-400",
  selectable: "stroke-white",
  disabled: "stroke-white",
};

/**
 * Brand map pin with the mascot in its round head, as Leaflet marker HTML. Stores outside the current search are
 * faded and greyscale. Leaflet's stylesheet lifts map SVGs to z-index 200 and sets marker images to width: auto;
 * the `!` classes undo both, so the photo sits on the pin at its intended size.
 */
function pinHtml(state: PinState) {
  return `<span class="relative block size-full drop-shadow-[0_3px_4px_rgb(15_33_71/0.3)] ${state === "disabled" ? "opacity-55 grayscale" : ""}">
    <svg viewBox="-15 -40 30 42" class="absolute inset-0 z-0! size-full overflow-visible">
      <path d="${PIN_PATH}" stroke-width="2.5" class="fill-brand-600 ${PIN_RING[state]}" />
    </svg>
    <img src="${MASCOT_SRC}" alt="" draggable="false" class="absolute top-[11.9%] left-[13.3%] z-1 h-[52.4%] w-[73.3%]! rounded-full bg-brand-50 object-cover object-[50%_8%]" />
  </span>`;
}

/** Larger than a plain pin, so the mascot reads. */
const PIN_SIZE: Record<PinState, [number, number]> = {
  selected: [52, 73],
  selectable: [40, 56],
  disabled: [30, 42],
};

// Leaflet's own stylesheet isn't in a cascade layer, so it beats Tailwind's utilities; `!` wins it back.
// text-snow, not text-white: the app's light theme turns .text-white dark.
const labelClass = (selected: boolean) =>
  cn(
    "rounded-full! border-0! px-3! py-1! text-xs! font-semibold! whitespace-nowrap! shadow-[0_4px_8px_rgb(15_33_71/0.18)]! before:hidden!",
    selected ? "bg-brand-700! text-snow!" : "bg-white! text-brand-800!",
  );

type StoreMapProps = {
  /** Every store; those without a map position get no pin. */
  stores: FinderStore[];
  /** Stores in the current search; the rest are greyed out. */
  selectableIds: Set<string>;
  selectedId: string | null;
  /** Store being hovered in the list, labelled on the map. */
  highlightedId: string | null;
  /** The customer's position, when known: a "you are here" pin, and the view takes in their nearest stores. */
  userLocation?: LatLng | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  className?: string;
};

/**
 * Store map on Google tiles (Leaflet), with a mascot pin at each store's position. It follows the list:
 * it fits the stores in the current search and moves to the selected one. With the customer's position it shows
 * a "you are here" pin and fits them together with their nearest stores. It mirrors the store list (the
 * accessible control), so it is hidden from assistive tech and kept out of the tab order; its pins are pointer-only.
 */
export function StoreMap({ stores, selectableIds, selectedId, highlightedId, userLocation = null, onSelect, onHover, className }: StoreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.Marker>());
  const userMarkerRef = useRef<Leaflet.Marker | null>(null);
  /** Each pin's last drawn look ("state|labelled|compact"). */
  const appliedRef = useRef(new Map<string, string>());
  /** What the view was last fitted to; null before the first fit. */
  const viewRef = useRef<{ selectableKey: string; selectedId: string | null; userKey: string } | null>(null);
  /** A view change asked for during a zoom animation, applied when it ends (only the latest is kept). */
  const pendingFitRef = useRef<(() => void) | null>(null);
  /**
   * Bumped each time a map is built (a new store list rebuilds it). A counter, not a flag: a rebuild's "not ready"
   * and "ready" can land in one render, and the effects below must still run again for the new map.
   */
  const [mapVersion, setMapVersion] = useState(0);
  const ready = mapVersion > 0;
  /** The map is zoomed out past COMPACT_BELOW_ZOOM. */
  const [zoomedOut, setZoomedOut] = useState(true);
  // Only a position on the island is drawn; elsewhere (e.g. testing from abroad) the map can't show it.
  const here = userLocation && isOnIsland(userLocation) ? userLocation : null;
  const userKey = here ? `${here.lat},${here.lng}` : "";
  const pinned = stores.filter((store): store is FinderStore & { location: LatLng } => store.location !== null);

  // Markers are created once per store list; they read the latest props through this ref.
  const latest = useRef({ selectableIds, onSelect, onHover });
  useEffect(() => {
    latest.current = { selectableIds, onSelect, onHover };
  });

  // Leaflet needs `window`, so it loads in the browser only.
  const storesKey = pinned.map((store) => `${store.id}@${store.location.lat},${store.location.lng}`).join("|");
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    const markers = markersRef.current;
    const applied = appliedRef.current;

    let detachTiles: (() => void) | undefined;

    import("leaflet").then(async (L) => {
      if (cancelled) return;
      leafletRef.current = L;
      map = L.map(container, {
        keyboard: false,
        // No +/- buttons: the map still zooms with the scroll wheel, a pinch or a double-click/tap.
        zoomControl: false,
        maxBounds: ISLAND_BOUNDS,
        maxBoundsViscosity: 1,
        minZoom: 7,
        zoomSnap: 0.5,
      }).fitBounds(ISLAND_BOUNDS);
      detachTiles = await attachAppMapBasemap(map, { cancelled: () => cancelled });
      if (cancelled) {
        detachTiles();
        map.remove();
        return;
      }
      map.attributionControl.setPrefix(false);
      map.on("zoomend", (event: Leaflet.LeafletEvent) => {
        setZoomedOut((event.target as Leaflet.Map).getZoom() < COMPACT_BELOW_ZOOM);
        const fit = pendingFitRef.current;
        pendingFitRef.current = null;
        fit?.();
      });

      for (const store of pinned) {
        const marker = L.marker(store.location, { keyboard: false })
          .on("click", () => latest.current.selectableIds.has(store.id) && latest.current.onSelect(store.id))
          .on("mouseover", () => latest.current.selectableIds.has(store.id) && latest.current.onHover(store.id))
          .on("mouseout", () => latest.current.onHover(null))
          .addTo(map!);
        markers.set(store.id, marker);
      }

      // Keep the attribution link out of the tab order (see the note above).
      container.querySelectorAll("a").forEach((link) => link.setAttribute("tabindex", "-1"));
      mapRef.current = map;
      setMapVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
      detachTiles?.();
      if (map) {
        // A zoom animation ends on a timer that remove() doesn't cancel, and it then throws on the
        // removed map. Leaflet skips that step when it isn't animating, so clear the flag first.
        (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
        map.stop();
        map.remove();
      }
      markers.clear();
      applied.clear();
      userMarkerRef.current = null;
      viewRef.current = null;
      pendingFitRef.current = null;
      mapRef.current = null;
    };
    // Rebuilt only when the stores or their positions change (storesKey), not for a new array of the same stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesKey]);

  // Pin styles and name labels. Only pins whose look changed are redrawn, so hovering stays cheap.
  useEffect(() => {
    const L = leafletRef.current;
    if (!ready || !L) return;
    const applied = appliedRef.current;
    for (const store of pinned) {
      const marker = markersRef.current.get(store.id);
      if (!marker) continue;
      const selected = store.id === selectedId;
      const state: PinState = selected ? "selected" : selectableIds.has(store.id) ? "selectable" : "disabled";
      const labelled = selected || store.id === highlightedId;
      const compact = zoomedOut && state === "selectable";
      const look = `${state}|${labelled}|${compact}`;
      if (applied.get(store.id) === look) continue;
      applied.set(store.id, look);

      const [width, height] = compact ? PIN_SIZE.disabled : PIN_SIZE[state];
      marker.setIcon(
        L.divIcon({
          html: pinHtml(state),
          className: state === "disabled" ? "cursor-default!" : "",
          iconSize: [width, height],
          iconAnchor: [width / 2, height],
        }),
      );
      marker.setZIndexOffset(selected ? 1000 : state === "selectable" ? 500 : 0);

      marker.unbindTooltip();
      if (labelled) {
        marker.bindTooltip(store.name, {
          permanent: true,
          direction: "top",
          offset: [0, -height - 2],
          className: labelClass(selected),
        });
      }
    }
    // pinned follows storesKey, which mapVersion already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVersion, selectableIds, selectedId, highlightedId, zoomedOut]);

  // The "you are here" pin. Not clickable, so it never gets in the way of a store pin.
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
        className: "",
        iconSize: USER_PIN_SIZE,
        iconAnchor: [USER_PIN_SIZE[0] / 2, USER_PIN_SIZE[1]],
      }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 700,
    }).addTo(map);
    // `here` is compared by value (userKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVersion, userKey]);

  // Fit the stores in the search when it changes; move to the selected store when it changes. Once the
  // customer is located, fit them with their nearest stores instead.
  const selectableKey = [...selectableIds].sort().join(",");
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L) return;

    const fitPadding = { paddingTopLeft: [48, 48], paddingBottomRight: [48, 48] } satisfies Leaflet.FitBoundsOptions;
    const applyView = (animate: boolean, focusSelected: boolean) => {
      const selected = pinned.find((store) => store.id === selectedId);
      const pickable = pinned.filter((store) => selectableIds.has(store.id));
      if (selected && focusSelected) {
        map.setView(selected.location, Math.max(map.getZoom(), SELECTED_ZOOM), { animate });
      } else if (here && pickable.length > 0) {
        const nearest = sortByDistance(pickable, here).slice(0, NEAREST_IN_VIEW) as typeof pickable;
        map.fitBounds(L.latLngBounds([here, ...nearest.map((store) => store.location)]), { ...fitPadding, maxZoom: MAX_FIT_ZOOM, animate });
      } else if (pickable.length > 0) {
        map.fitBounds(L.latLngBounds(pickable.map((store) => store.location)), { ...fitPadding, maxZoom: MAX_FIT_ZOOM, animate });
      } else {
        map.fitBounds(ISLAND_BOUNDS, { animate });
      }
    };

    // Leaflet ignores a view change asked for while a zoom is animating (e.g. the previous search's,
    // when the next letter is typed), so hold the latest one until that zoom ends.
    const fitView = (animate: boolean) => {
      const focusSelected = viewRef.current === null || viewRef.current.selectedId !== selectedId;
      if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) {
        pendingFitRef.current = () => applyView(true, focusSelected);
      } else {
        applyView(animate, focusSelected);
      }
    };

    const previous = viewRef.current;
    if (!previous || previous.selectableKey !== selectableKey || previous.selectedId !== selectedId || previous.userKey !== userKey) {
      fitView(previous !== null);
      viewRef.current = { selectableKey, selectedId, userKey };
    }

    // When the map shows again after being hidden (the phones' Map tab), or resizes, re-measure.
    let wasHidden = map.getSize().x === 0;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      const hidden = map.getSize().x === 0;
      if (wasHidden && !hidden) {
        viewRef.current = null;
        fitView(false);
        viewRef.current = { selectableKey, selectedId, userKey };
      }
      wasHidden = hidden;
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
    // pinned follows storesKey (via mapVersion); selectableIds and `here` are compared by their keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVersion, selectableKey, selectedId, userKey]);

  return (
    <div aria-hidden="true" className={cn("relative isolate overflow-hidden bg-brand-50", className)}>
      <div ref={containerRef} className={cn("absolute inset-0 bg-brand-50! [font:inherit]!", ATTRIBUTION_CLASS)} />
    </div>
  );
}
