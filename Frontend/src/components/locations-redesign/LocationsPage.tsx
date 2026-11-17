"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, List, LocateFixed, LocateOff, Map, MapPin, Navigation, Phone, RotateCw, Search, ShoppingBag, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import toast from "react-hot-toast";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { BottomNav } from "@/components/home-redesign/layout/BottomNav";
import { SiteFooter } from "@/components/home-redesign/layout/SiteFooter";
import { SiteHeader } from "@/components/home-redesign/layout/SiteHeader";
import { cn } from "@/components/home-redesign/lib/cn";
import { gsap, useGSAP } from "@/components/home-redesign/lib/gsap";
import { heroBackdropImage } from "@/components/home-redesign/sections/hero/hero.config";
import { Container } from "@/components/home-redesign/ui/Container";
import { useClientHydrated } from "@/hooks/useClientHydrated";
import { api } from "@/lib/api";
import { branchManuallyClosedMessage, isBranchManuallyClosed } from "@/lib/storeOrderingHours";
import { useCartStore } from "@/store/cartStore";
import type { Store } from "@/types";
import {
  callHref,
  directionsHref,
  distanceKm,
  formatDistance,
  formatHours,
  searchStores,
  sharedHours,
  sortByDistance,
  storeAddress,
  storeStatus,
  toFinderStores,
  type FinderStore,
  type LatLng,
  type StoreStatus,
} from "./stores";
import { usePlaceSearch, type Place } from "./usePlaceSearch";
import { useUserLocation } from "./useUserLocation";

const StoreMap = dynamic(
  () => import("./StoreMap").then((m) => m.StoreMap),
  {
    ssr: false,
    loading: () => (
      <div
        aria-busy="true"
        aria-label="Loading map"
        className="h-full min-h-[18rem] w-full rounded-[1.25rem] bg-brand-50 animate-pulse ring-1 ring-brand-100"
      />
    ),
  },
);

/** For a typed place that no store matches, the stores within this distance of it are listed (nearest first). */
const PLACE_RADIUS_KM = 30;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

const mobileQuery = "(width < 48rem)";
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const desktopSnapshot = () => false;
function subscribeToMobile(onChange: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * The admin's stores, from the public GET /stores (active stores only, in name order). Refetched on every return
 * to the tab, so stores the admin adds, edits, closes or removes show without a reload.
 */
function useStores() {
  return useQuery<Store[]>({
    queryKey: ["stores", "locations"],
    queryFn: () => api.get<Store[]>("/stores"),
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
  });
}

/** The current time, updated every `intervalMs`. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The store finder (/stores), in the redesign's look with its own header and footer like the home and offers
 * pages (the app shell steps aside for it). A thin blue strip behind the header, then the white panel: the title,
 * and below it the finder at one screen's height on desktop: the search and "Use my location" above the scrolling
 * store list on the left, and the framed map on the right. Phones switch between Map and List tabs, with a shared
 * search and store selection, leaving the map clear of overlaid cards.
 *
 * Search matches store names, towns, districts and addresses as you type; when nothing matches, the text is looked
 * up as a place (any town in Sri Lanka) and its nearest stores are listed instead. Location is only asked for when
 * "Use my location" is pressed; the list then runs nearest first. Choosing a store (in the list or on the map)
 * opens its card with its hours, directions, its phone number and "Order pickup here".
 */
export default function LocationsPage() {
  const { data, status, refetch } = useStores();
  const stores = useMemo(() => toFinderStores(data ?? []), [data]);

  const scope = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tabsId = useId();
  const isMobile = useSyncExternalStore(subscribeToMobile, mobileSnapshot, desktopSnapshot);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [locateOn, setLocateOn] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const located = useUserLocation(locateOn);
  const here = locateOn ? located.location : null;
  // None before hydration: the server has no clock to go by.
  const hydrated = useClientHydrated();
  const now = useNow(60_000);

  // Typed text first: stores whose name, town, district or address contains it (nearest first once located).
  const matches = searchStores(stores, query, here);
  // Nothing matched: look the text up as a place and list the stores nearest it.
  const placeSearch = usePlaceSearch(query, status === "success" && query.trim() !== "" && matches.length === 0);
  const place = placeSearch.status === "found" ? placeSearch.place : null;
  const byDistanceFromPlace = place ? sortByDistance(stores.filter((store) => store.location), place.location) : [];
  const nearPlace = place
    ? byDistanceFromPlace.filter((store) => store.location && distanceKm(place.location, store.location) <= PLACE_RADIUS_KM)
    : [];
  /** With none in range, the closest store anyway, named in the empty state ("The closest is … 250 km away"). */
  const closestToPlace = place && nearPlace.length === 0 ? (byDistanceFromPlace[0] ?? null) : null;
  const listed = place ? nearPlace : matches;
  /** Where distances are measured from: the place typed, else the customer. */
  const from = place?.location ?? here;
  const selectableIds = new Set(listed.map((store) => store.id));

  // A store chosen earlier only stays open while it is still listed.
  const selected = listed.find((store) => store.id === selectedId) ?? null;

  // Back to the top of the list when the search or filter changes.
  const listKey = listed.map((store) => store.id).join(",");
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [listKey]);

  /** More stores below the list's bottom edge: the edge fades out (instead of slicing a card), until the end is reached. */
  const [moreBelow, setMoreBelow] = useState(false);
  const measureList = () => {
    const list = listRef.current;
    setMoreBelow(list !== null && list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  };
  // Again whenever the list, its height or an opened card changes how much there is to scroll.
  useEffect(() => {
    const list = listRef.current;
    measureList();
    if (!list) return;
    const observer = new ResizeObserver(measureList);
    observer.observe(list);
    for (const item of list.children) observer.observe(item);
    return () => observer.disconnect();
  }, [listKey, selectedId]);

  /**
   * Opens a store's card (from the list or the map) and scrolls the list, not the page, until the whole card
   * shows (its top first, when it is taller than the list).
   */
  const openStore = (id: string) => {
    setSelectedId(id);
    // A map pin opens the same store's details in the phone's List tab.
    if (isMobile) setMobileView("list");
    // After the card has opened, so its full height is measured.
    requestAnimationFrame(() => {
      const list = listRef.current;
      const card = list?.querySelector(`[data-store="${CSS.escape(id)}"]`);
      if (!list || !card) return;
      const bounds = list.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const top = box.top - bounds.top - 4;
      const delta = top < 0 ? top : Math.min(top, Math.max(0, box.bottom - bounds.bottom + 4));
      if (delta === 0) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
    });
  };

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        gsap
          .timeline({ delay: 0.1, defaults: { duration: 0.7, ease: "power3.out" } })
          .from(q('[data-locations="title"]'), { y: 28, autoAlpha: 0 }, 0)
          .from(q('[data-locations="finder"]'), { y: 36, autoAlpha: 0, stagger: 0.12 }, 0.12);
      });
    },
    { scope },
  );

  const districtCount = new Set(stores.map((store) => store.district).filter(Boolean)).size;
  const hours = sharedHours(stores);
  const intro =
    status === "success"
      ? `${stores.length} ${stores.length === 1 ? "store" : "stores"} across ${districtCount} ${districtCount === 1 ? "district" : "districts"}${hours ? `, open daily from ${hours}` : ""}.`
      : status === "error"
        ? "Stores across Sri Lanka."
        : "Finding our stores…";

  const searchEmpty = (
    <StoreSearchEmpty
      searching={placeSearch.status === "searching"}
      query={query}
      place={place}
      closest={closestToPlace}
      onClear={() => setQuery("")}
    />
  );

  return (
    <div className={`home-redesign ${homeFontVariables} relative flex min-h-dvh flex-col bg-white antialiased`}>
      <SiteHeader />
      <main className="flex-1">
        <div ref={scope} className="max-md:grid max-md:h-dvh max-md:min-h-[44rem] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[auto_minmax(0,1fr)]">
          <HeaderBand />

          <section className="relative -mt-8 rounded-t-[2.5rem] bg-white max-md:min-h-0 sm:-mt-10">
            {/* Mobile: the page fills the screen, with a minimum height that leaves a usable map on short screens. */}
            <Container className="pt-6 pb-12 max-md:flex max-md:h-full max-md:min-h-0 max-md:flex-col max-md:pb-[calc(var(--bottom-nav-space)+1rem)] sm:pt-8 lg:pt-10 lg:pb-16">
              <header data-locations="title" className="mb-6 max-md:shrink-0 sm:mb-8">
                <h1 className="font-display-condensed text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] text-brand-950 uppercase">
                  Find a Bing Chun <TitleHighlight>near you</TitleHighlight>
                </h1>
                <p className="mt-2 text-base text-slate-600 sm:text-lg">{intro}</p>
              </header>

              {/* The search row: as wide as the list below it from lg; the full width on tablets and phones. */}
              <div data-locations="finder" className="mb-4 flex items-center gap-3 max-md:shrink-0 md:mb-5 lg:w-md xl:w-120">
                <SearchField value={query} onChange={setQuery} />
                <LocateButton
                  on={locateOn}
                  status={located.status}
                  onToggle={() => {
                    if (!locateOn) setLocateOn(true);
                    else if (located.status === "found") setLocateOn(false);
                    else located.retry();
                  }}
                />
              </div>

              <div role="tablist" aria-label="Store finder view" className="mb-4 grid shrink-0 grid-cols-2 gap-1 rounded-full bg-brand-50 p-1 ring-1 ring-brand-100 ring-inset md:hidden">
                {(["map", "list"] as const).map((view) => {
                  const Icon = view === "map" ? Map : List;
                  return (
                    <button
                      key={view}
                      id={`${tabsId}-${view}-tab`}
                      type="button"
                      role="tab"
                      aria-selected={mobileView === view}
                      aria-controls={`${tabsId}-${view}-panel`}
                      tabIndex={mobileView === view ? 0 : -1}
                      onClick={() => setMobileView(view)}
                      onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const next = event.key === "Home" ? "map" : event.key === "End" ? "list" : view === "map" ? "list" : "map";
                        setMobileView(next);
                        document.getElementById(`${tabsId}-${next}-tab`)?.focus();
                      }}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                        focusRing,
                        mobileView === view ? "bg-brand-600 text-snow shadow-sm" : "text-brand-700 hover:bg-brand-100",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {view === "map" ? "Map" : "List"}
                    </button>
                  );
                })}
              </div>

              {/* From md: the list (no frame of its own) and the framed map side by side, most of a screen tall (within
                  limits), always starting and ending level; only the list scrolls. Tablets give the map the larger share.
                  Phones show one panel at a time, keeping the full map clear of cards. */}
              <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:h-[clamp(30rem,calc(100dvh-20rem),44rem)] md:flex-none md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-5 lg:h-[clamp(35.5rem,calc(100dvh-14.5rem),53.5rem)] lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:gap-8">
                <div data-locations="finder" className="flex min-h-0 flex-col gap-3 max-md:contents">
                  {/* The number of stores listed, for screen readers only (read out as the search changes it). */}
                  <p className="sr-only" aria-live="polite">
                    {status === "success" ? `${listed.length} ${listed.length === 1 ? "store" : "stores"}` : ""}
                  </p>
                  {locateOn && <LocationStatus status={located.status} onRetry={located.retry} />}

                  {place && nearPlace.length > 0 && (
                    <p role="status" className="flex shrink-0 items-start gap-1.5 text-sm text-slate-600">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                      <span>
                        {nearbyPlace(place, nearPlace) ? (
                          <>
                            {storeCount(nearPlace.length, "nearest to")} <strong className="font-semibold text-brand-900">{place.name}</strong>
                          </>
                        ) : (
                          <>
                            No store in <strong className="font-semibold text-brand-900">{place.name}</strong> yet. Here{" "}
                            {nearPlace.length === 1 ? "is the 1 store" : `are the ${nearPlace.length} stores`} within {PLACE_RADIUS_KM} km.
                          </>
                        )}
                      </span>
                    </p>
                  )}

                  <div
                    id={`${tabsId}-list-panel`}
                    role={isMobile ? "tabpanel" : undefined}
                    aria-labelledby={isMobile ? `${tabsId}-list-tab` : undefined}
                    tabIndex={isMobile ? 0 : undefined}
                    className={cn("flex min-h-0 flex-1 flex-col rounded-2xl", focusRing, mobileView === "map" && "max-md:hidden")}
                  >
                    {status === "pending" ? (
                      <StoreListSkeleton />
                    ) : status === "error" ? (
                      <StoresUnavailable onRetry={() => void refetch()} />
                    ) : listed.length > 0 ? (
                      <ul
                        ref={listRef}
                        aria-label="Stores"
                        onScroll={measureList}
                        // The finder's one scrolling area on desktop, with its scrollbar hidden (wheel, touch and keys still scroll it).
                        // The padding leaves room for the cards' rings; the negative margins cancel it, so the cards line up with the search and the map.
                        className={cn(
                          "-mx-1 -my-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                          moreBelow && "mask-[linear-gradient(to_bottom,#000_calc(100%-5rem),transparent)]",
                        )}
                      >
                        {listed.map((store) => (
                          <li key={store.id} data-store={store.id}>
                            <StoreCard
                              store={store}
                              from={from}
                              fromLabel={place?.name}
                              status={hydrated ? storeStatus(store, now) : null}
                              open={store.id === selected?.id}
                              hovered={store.id === hoveredId}
                              onToggle={() => (store.id === selected?.id ? setSelectedId(null) : openStore(store.id))}
                              onHover={setHoveredId}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      searchEmpty
                    )}
                  </div>
                </div>

                {/* A thin white mat inside the frame (a ring on the map itself would sit under its tiles).
                    On phones it fills the space remaining on the screen. */}
                <div
                  id={`${tabsId}-map-panel`}
                  role={isMobile ? "tabpanel" : undefined}
                  aria-labelledby={isMobile ? `${tabsId}-map-tab` : undefined}
                  tabIndex={isMobile ? 0 : undefined}
                  data-locations="finder"
                  className={cn(
                    "relative grid min-h-0 grid-rows-[minmax(0,1fr)] rounded-[1.75rem] border-2 border-brand-200 bg-white p-1.5 shadow-xl shadow-brand-950/8 max-md:flex-1",
                    focusRing,
                    mobileView === "list" && "max-md:hidden",
                  )}
                >
                  <StoreMap
                    stores={stores}
                    selectableIds={selectableIds}
                    selectedId={selected?.id ?? null}
                    highlightedId={hoveredId}
                    // Searching a place: the map frames that place's stores, not the customer.
                    userLocation={place ? null : here}
                    onSelect={openStore}
                    onHover={setHoveredId}
                    className="rounded-[1.25rem]"
                  />
                  {status === "success" && listed.length === 0 && (
                    <div className="absolute inset-2 flex overflow-y-auto rounded-[1.25rem] bg-brand-50/95 md:hidden">{searchEmpty}</div>
                  )}
                </div>
              </div>
            </Container>
          </section>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}

/**
 * A thin brand-blue strip behind the fixed header, in place of a hero: at the top of the page the header's buttons
 * are white and need blue behind them. The white panel that follows (-mt-8 sm:-mt-10, rounded top) overlaps its
 * lower edge.
 */
function HeaderBand() {
  return <div aria-hidden="true" className="pt-22 pb-9 sm:pb-14 lg:pb-10 print:hidden" style={{ backgroundImage: heroBackdropImage }} />;
}

/** A yellow marker swipe behind the title's last words. */
function TitleHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block px-[0.1em] text-brand-700">
      <span aria-hidden="true" className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.4em] -rotate-2 rounded-full bg-sun-300" />
      {children}
    </span>
  );
}

/** A place with a store this close counts as having one of its own. */
const NEARBY_KM = 15;

/** Whether the nearest store is close to the place typed (else the place has none of its own: "No store in Negombo yet"). */
const nearbyPlace = (place: Place, nearest: FinderStore[]) =>
  nearest.length > 0 && nearest[0].location !== null && distanceKm(place.location, nearest[0].location) <= NEARBY_KM;

/** "The store nearest to" / "The 4 stores nearest to". */
const storeCount = (count: number, after: string) => (count === 1 ? `The store ${after}` : `The ${count} stores ${after}`);

type StoreSearchEmptyProps = {
  searching: boolean;
  query: string;
  /** The place the text was found as, when it was (and no store is within PLACE_RADIUS_KM of it). */
  place: Place | null;
  /** The closest store to that place, however far. */
  closest: FinderStore | null;
  onClear: () => void;
};

function StoreSearchEmpty({ searching, query, place, closest, onClear }: StoreSearchEmptyProps) {
  if (searching) {
    return (
      <p role="status" className="flex shrink-0 items-center gap-1.5 text-sm text-slate-500 max-md:m-auto">
        <Search className="size-4 shrink-0 text-brand-500 motion-safe:animate-pulse" aria-hidden="true" />
        Looking for “{query.trim()}”…
      </p>
    );
  }
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-brand-50/60 px-6 py-8 text-center">
      <Image src="/images/mascots/search.png" alt="" width={500} height={500} sizes="112px" className="size-24 sm:size-28" />
      <p className="mt-2 font-semibold text-brand-900">
        {place ? `No Bing Chun within ${PLACE_RADIUS_KM} km of ${place.name} yet` : "No stores found"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-slate-600">
        {place && closest?.location ? (
          <>
            The closest is <strong className="font-semibold text-brand-900">{closest.name}</strong>,{" "}
            {formatDistance(distanceKm(place.location, closest.location))} away.
          </>
        ) : place ? null : (
          <>Nothing matches “{query.trim()}”.</>
        )}{" "}
        <button type="button" onClick={onClear} className={cn("rounded font-semibold text-brand-600 underline underline-offset-2", focusRing)}>
          Show all stores
        </button>
      </p>
    </div>
  );
}

/** Placeholder cards while the stores load. */
function StoreListSkeleton() {
  return (
    <div role="status" aria-label="Loading stores" className="flex flex-col gap-2.5">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-brand-100 ring-inset">
          <span className="size-10 shrink-0 rounded-full bg-brand-50 motion-safe:animate-pulse" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-4 w-1/2 rounded-full bg-brand-50 motion-safe:animate-pulse" />
            <span className="block h-3 w-4/5 rounded-full bg-brand-50 motion-safe:animate-pulse" />
            <span className="block h-3 w-1/3 rounded-full bg-brand-50 motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}

function StoresUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-brand-50/60 px-6 py-8 text-center">
      <p className="font-semibold text-brand-900">We couldn&apos;t load the stores</p>
      <p className="mt-1 max-w-xs text-sm text-slate-600">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-snow transition-colors hover:bg-brand-700",
          focusRing,
        )}
      >
        <RotateCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block w-full min-w-0">
      <span className="sr-only">Search stores</span>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-brand-500" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by town, area or store"
        autoComplete="off"
        className={cn(
          "h-13 w-full rounded-full bg-brand-50/70 pl-12 text-base text-slate-900 ring-1 ring-brand-100 ring-inset transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none [&::-webkit-search-cancel-button]:hidden",
          // Room for the clear button only once there is text to clear, so the placeholder fits.
          value ? "pr-12" : "pr-5",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={cn(
            "absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-brand-700 transition-colors hover:bg-brand-100",
            focusRing,
          )}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

type LocateStatus = ReturnType<typeof useUserLocation>["status"];

/** "Use my location": asks the browser only when pressed; once found, pressed again it turns off (back to the list's order). */
function LocateButton({ on, status, onToggle }: { on: boolean; status: LocateStatus; onToggle: () => void }) {
  const found = on && status === "found";
  const locating = on && status === "locating";
  return (
    <button
      type="button"
      aria-pressed={found}
      onClick={onToggle}
      className={cn(
        // Kept tight, so the search beside it gets the room; on phones a round icon button (its label read out only).
        "inline-flex h-13 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors max-md:w-13 max-md:justify-center max-md:px-0",
        found
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset hover:bg-emerald-100"
          : "bg-white text-brand-700 ring-1 ring-brand-200 ring-inset hover:bg-brand-50",
        focusRing,
      )}
    >
      <LocateFixed className={cn("size-4 max-md:size-5", locating && "motion-safe:animate-pulse")} aria-hidden="true" />
      <span className="max-md:sr-only">{found ? "Nearest first" : locating ? "Finding you…" : "Use my location"}</span>
      {found && <X className="-mr-1 size-3.5 opacity-70 max-md:hidden" aria-hidden="true" />}
    </button>
  );
}

/** One line under the buttons when the location couldn't be used. */
function LocationStatus({ status, onRetry }: { status: LocateStatus; onRetry: () => void }) {
  if (status !== "denied" && status !== "unavailable") return null;
  return (
    <p role="status" className="flex shrink-0 items-start gap-1.5 text-xs leading-5 text-slate-500">
      <LocateOff className="mt-0.75 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {status === "denied" ? (
          "Location is off. Search by town or area, or allow location in your browser."
        ) : (
          <>
            We couldn&apos;t find your location.{" "}
            <button type="button" onClick={onRetry} className={cn("rounded font-semibold text-brand-600 underline underline-offset-2", focusRing)}>
              Try again
            </button>
          </>
        )}
      </span>
    </p>
  );
}

type StoreCardProps = {
  store: FinderStore;
  /** Where distances are measured from, when known (the customer, or a place they typed). */
  from: LatLng | null;
  /** Names `from` in the distance ("12 km from Jaffna"); without it, "12 km away" (from the customer). */
  fromLabel?: string;
  /** Whether the store is open right now; null until known. */
  status: StoreStatus | null;
  /** Chosen: opened up with its details and actions. */
  open: boolean;
  /** Its pin is hovered on the map. */
  hovered: boolean;
  onToggle: () => void;
  onHover: (id: string | null) => void;
};

/**
 * One store: its name, address, distance and whether it's open now. The top of the card is a button that opens it
 * (and moves the map to it); open, it adds the hours, phone number, Order pickup here, Directions and Call.
 */
function StoreCard({ store, from, fromLabel, status, open, hovered, onToggle, onHover }: StoreCardProps) {
  const orderHere = useOrderPickupHere();
  const detailsId = `store-${store.id}`;
  const directions = directionsHref(store);
  const phone = store.phone?.trim();
  const closedToday = isBranchManuallyClosed(store);

  return (
    <article
      onPointerEnter={() => onHover(store.id)}
      onPointerLeave={() => onHover(null)}
      className={cn(
        "rounded-2xl ring-inset transition-[background-color,box-shadow]",
        open ? "bg-brand-50 ring-2 ring-brand-600" : hovered ? "bg-brand-50/60 ring-1 ring-brand-300" : "bg-white ring-1 ring-brand-100 hover:bg-brand-50/60",
      )}
    >
      <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle} className={cn("flex w-full items-start gap-3 rounded-2xl p-4 text-left", focusRing)}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full transition-colors", open ? "bg-brand-600 text-snow" : "bg-brand-50 text-brand-600")}>
          <MapPin className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-900">{store.name}</span>
          <span className={cn("mt-0.5 block text-sm text-slate-600", !open && "truncate")}>{storeAddress(store)}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {status && <OpenBadge status={status} />}
            {from && store.location && <Distance location={store.location} from={from} fromLabel={fromLabel} />}
          </span>
        </span>
      </button>

      {open && (
        // Lined up under the name from lg; tablets' narrower list gives the buttons the full width.
        <div id={detailsId} className="px-4 pb-4 lg:pl-17">
          <ul className="flex flex-col gap-1.5 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="font-numeric">Open daily {formatHours(store)}</span>
            </li>
            {phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="font-numeric">{phone}</span>
              </li>
            )}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => orderHere(store)}
              disabled={closedToday}
              className={cn(
                "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none",
                focusRing,
              )}
            >
              <ShoppingBag className="size-4" aria-hidden="true" />
              {closedToday ? "Closed for online orders today" : "Order pickup here"}
            </button>
            {directions && (
              <ActionLink href={directions} external label={`Directions to ${store.name} (opens Google Maps)`} wide={!phone}>
                <Navigation className="size-4" aria-hidden="true" />
                Directions
              </ActionLink>
            )}
            {phone && (
              <ActionLink href={callHref(phone)} label={`Call ${store.name}`} wide={!directions}>
                <Phone className="size-4" aria-hidden="true" />
                Call
              </ActionLink>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * "Order pickup here": sets pickup from that store, as choosing it in the order pop-up does, and opens the menu.
 * A branch closed for the day from the admin panel can't be chosen (its button is disabled; this is the backstop).
 */
function useOrderPickupHere() {
  const router = useRouter();
  return (store: Store) => {
    if (isBranchManuallyClosed(store)) {
      toast.error(branchManuallyClosedMessage());
      return;
    }
    const cart = useCartStore.getState();
    cart.setOrderMode("TAKEAWAY");
    cart.setTakeawayInfo({
      storeId: store.id,
      storeName: store.name,
      openTime: store.openTime,
      closeTime: store.closeTime,
      onlineOrderStartTime: store.onlineOrderStartTime,
      onlineOrderStopTime: store.onlineOrderStopTime,
      pickupCutoffMinutes: store.pickupCutoffMinutes,
      branchClosedAt: store.branchClosedAt,
    });
    toast.success(`Pickup from ${store.name}`);
    router.push("/menu");
  };
}

/** A Directions or Call link, shown as a labelled pill; `wide` when it is the only one of the two. */
function ActionLink({ href, external = false, label, wide = false, children }: { href: string; external?: boolean; label: string; wide?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-100",
        wide && "col-span-2",
        focusRing,
      )}
    >
      {children}
    </a>
  );
}

/** "800 m away" (from the customer), or "233 km from Jaffna" (from a place typed). */
function Distance({ location, from, fromLabel }: { location: LatLng; from: LatLng; fromLabel?: string }) {
  const distance = formatDistance(distanceKm(from, location));
  return (
    <span className="flex items-center gap-1 font-semibold text-brand-700">
      <Navigation className="size-3.5" aria-hidden="true" />
      {fromLabel ? `${distance} from ${fromLabel}` : `${distance} away`}
    </span>
  );
}

/** "Open now · until 11 PM", "Busy · until 11 PM", "Closed · opens at 9 AM" or "Closed today". */
function OpenBadge({ status }: { status: StoreStatus }) {
  const tone =
    status.kind === "open" && !status.busy
      ? { text: "text-emerald-700", dot: "bg-emerald-500" }
      : status.kind === "open"
        ? { text: "text-amber-700", dot: "bg-amber-500" }
        : status.kind === "closedToday"
          ? { text: "text-red-600", dot: "bg-red-500" }
          : { text: "text-slate-500", dot: "bg-slate-400" };
  const label =
    status.kind === "open"
      ? `${status.busy ? "Busy" : "Open now"} · until ${status.until}`
      : status.kind === "closed"
        ? `Closed · opens at ${status.opensAt}`
        : "Closed today";
  return (
    <span className={cn("flex items-center gap-1.5 font-semibold", tone.text)}>
      <span aria-hidden="true" className={cn("size-2 rounded-full", tone.dot)} />
      {label}
    </span>
  );
}
