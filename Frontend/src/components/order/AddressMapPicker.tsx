'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, Loader2, Search, Crosshair, AlertCircle, X, LocateFixed, LocateOff } from 'lucide-react';
import { api } from '@/lib/api';
import { getCurrentPosition, DEFAULT_LOCATION } from '@/lib/geolocation';
import toast from 'react-hot-toast';
import type { BranchMarker } from './DeliveryMap';

const DeliveryMap = dynamic(() => import('./DeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] rounded-xl border border-navy-border bg-navy-light flex items-center justify-center text-muted text-sm">
      Loading map...
    </div>
  ),
});

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
}

interface PlaceSuggestion {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

interface AddressMapPickerProps {
  value: AddressSelection | null;
  onChange: (selection: AddressSelection) => void;
  autoDetectOnMount?: boolean;
  variant?: 'default' | 'prominent';
  onLocationResolved?: () => void;
  branchMarkers?: BranchMarker[];
  selectedBranchId?: string | null;
  onBranchSelect?: (branchId: string) => void;
  showRoute?: boolean;
  /** delivery: outlet → customer. pickup: customer → outlet. */
  routeAnimation?: 'delivery' | 'pickup';
  /**
   * 'stacked' — search above the map (default).
   * 'split' — two columns on desktop: search + children on the left, map on the right.
   * 'mapOverlay' — full-bleed map with floating search on top and children as a bottom sheet.
   * 'panel' — the redesigned order popup: search, status and children on the left, the redesign-look map on
   *   the right (on phones, the search on top and the map filling the rest, with `mapOverlay` laid over it).
   */
  layout?: 'stacked' | 'split' | 'mapOverlay' | 'panel';
  /** Extra content (e.g. branch selection) rendered under the search box in split and panel layouts. */
  children?: ReactNode;
  /** Optional header above the search field in mapOverlay layout (title, badge, etc.). */
  overlayHeader?: ReactNode;
  /** Panel layout: content laid over the map (e.g. the phone branch cards along its bottom edge). */
  mapOverlay?: ReactNode;
  /**
   * Panel layout: search stacked above a map that fills the rest of the popup, instead of a side column
   * and a fixed map height.
   */
  mapFocus?: boolean;
  /** Panel layout: hide the search, status line, and current-location control. The map stays. */
  hideSearch?: boolean;
}

/** Where the current address came from, for the panel layout's status line. */
type AddressSource = 'location' | 'search' | 'pin';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function AddressMapPicker({
  value,
  onChange,
  autoDetectOnMount = false,
  variant = 'default',
  onLocationResolved,
  branchMarkers,
  selectedBranchId = null,
  onBranchSelect,
  showRoute = true,
  routeAnimation = 'delivery',
  layout = 'stacked',
  children,
  overlayHeader,
  mapOverlay: mapOverlayContent,
  mapFocus = false,
  hideSearch = false,
}: AddressMapPickerProps) {
  const [source, setSource] = useState<AddressSource | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState(value?.address ?? '');
  const [lat, setLat] = useState(value?.lat ?? DEFAULT_LOCATION.lat);
  const [lng, setLng] = useState(value?.lng ?? DEFAULT_LOCATION.lng);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(value?.address ?? '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const autoDetectStarted = useRef(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  // Only user typing should open the autocomplete — not addresses filled in
  // programmatically (pin placement, reverse geocode, current location).
  const userTypedRef = useRef(false);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 500);

  useEffect(() => {
    if (!value) return;
    userTypedRef.current = false;
    setResolvedAddress(value.address);
    setLat(value.lat);
    setLng(value.lng);
    setSearchQuery(value.address);
  }, [value?.address, value?.lat, value?.lng]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSuggestions([]);
      return;
    }
    if (!userTypedRef.current) return;

    let cancelled = false;
    setSearching(true);
    void api
      .get<PlaceSuggestion[]>(`/stores/address/autocomplete?q=${encodeURIComponent(debouncedSearch)}`)
      .then((results) => {
        if (!cancelled) {
          setSuggestions(results);
          setShowSuggestions(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const resolveCoords = useCallback(
    async (newLat: number, newLng: number) => {
      userTypedRef.current = false;
      setShowSuggestions(false);
      setSuggestions([]);
      setLat(newLat);
      setLng(newLng);
      setResolving(true);
      try {
        const res = await api.get<{ address: string; lat: number; lng: number }>(
          `/stores/address/reverse?lat=${newLat}&lng=${newLng}`,
        );
        const nextAddress = res.address || `${newLat.toFixed(4)}, ${newLng.toFixed(4)}`;
        setResolvedAddress(nextAddress);
        setSearchQuery(nextAddress);
        onChange({ address: nextAddress, lat: newLat, lng: newLng });
        onLocationResolved?.();
      } catch {
        const nextAddress = `${newLat.toFixed(4)}, ${newLng.toFixed(4)}`;
        setResolvedAddress(nextAddress);
        setSearchQuery(nextAddress);
        onChange({ address: nextAddress, lat: newLat, lng: newLng });
        onLocationResolved?.();
      } finally {
        setResolving(false);
      }
    },
    [onChange, onLocationResolved],
  );

  async function detectCurrentLocation(showErrors = true) {
    setLocating(true);
    setLocationError(null);
    try {
      let coords: { lat: number; lng: number };
      try {
        coords = await getCurrentPosition();
        setSource('location');
      } catch (err: unknown) {
        coords = DEFAULT_LOCATION;
        setSource(null);
        const msg =
          err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED
            ? 'Location access was denied. Please allow location access in your browser or search for your address.'
            : 'Could not detect your exact location. Drag the pin on the map or search your address below.';
        setLocationError(msg);
      }
      await resolveCoords(coords.lat, coords.lng);
    } catch {
      const msg = 'Could not update location. Search for your address or move the pin.';
      setLocationError(msg);
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    if (!autoDetectOnMount || autoDetectStarted.current || value?.address) return;
    autoDetectStarted.current = true;
    void detectCurrentLocation(false);
  }, [autoDetectOnMount, value?.address]);

  function handleMapMove(newLat: number, newLng: number) {
    setSource('pin');
    setLocationError(null);
    void resolveCoords(newLat, newLng);
  }

  async function selectSuggestion(place: PlaceSuggestion) {
    setSource('search');
    setLocationError(null);
    userTypedRef.current = false;
    setShowSuggestions(false);
    setSearchQuery(place.description);

    if (place.lat && place.lng) {
      await resolveCoords(place.lat, place.lng);
      return;
    }

    setResolving(true);
    try {
      const res = await api.get<{ address: string; lat: number; lng: number }>(
        `/stores/address/geocode?address=${encodeURIComponent(place.description)}`,
      );
      setResolvedAddress(res.address);
      setSearchQuery(res.address);
      setLat(res.lat);
      setLng(res.lng);
      onChange({ address: res.address, lat: res.lat, lng: res.lng });
      onLocationResolved?.();
    } catch {
      toast.error('Could not find that address. Try another search or move the pin on the map.');
    } finally {
      setResolving(false);
    }
  }

  const busy = locating || resolving;
  const prominent = variant === 'prominent';
  const split = layout === 'split';
  const mapOverlay = layout === 'mapOverlay';
  const mapHeight = mapOverlay
    ? 'h-full min-h-0'
    : split
      ? 'h-[min(78vw,420px)] sm:h-[400px] lg:h-full lg:min-h-[480px]'
      : prominent
        ? 'h-[min(72vw,380px)] sm:h-[360px]'
        : 'h-[220px]';

  const searchBlock = (
    <div ref={searchWrapRef} className="relative">
      {!mapOverlay && (
        <p className="text-xs text-muted font-medium mb-2">Search your delivery location</p>
      )}
      <div className={mapOverlay ? undefined : 'flex gap-2'}>
        <div
          className={`input-icon-wrap flex-1 relative ${
            mapOverlay ? 'input-icon-wrap--both' : ''
          }`}
        >
          <Search size={16} className="input-icon" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              userTypedRef.current = true;
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search area, street, or landmark..."
            className="input-field w-full"
            autoComplete="off"
            aria-label="Search your delivery location"
          />
          {mapOverlay ? (
            <button
              type="button"
              onClick={() => void detectCurrentLocation(true)}
              disabled={busy}
              title="Use my current location"
              aria-label="Use my current location to fill in the address"
              className="input-action text-brand hover:text-brand-dark disabled:opacity-50"
            >
              {locating || searching ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Crosshair size={18} strokeWidth={2} />
              )}
            </button>
          ) : (
            searching && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand" />
            )
          )}
        </div>
        {split && !mapOverlay && (
          <button
            type="button"
            onClick={() => void detectCurrentLocation(true)}
            disabled={busy}
            title="Use my current location"
            aria-label="Use my current location to fill in the address"
            className="shrink-0 w-11 self-stretch rounded-xl border border-navy-border bg-white text-fg hover:border-brand hover:bg-brand-subtle transition-colors flex items-center justify-center disabled:opacity-50"
          >
            {locating ? <Loader2 size={16} className="animate-spin text-brand" /> : <Crosshair size={18} strokeWidth={2} />}
          </button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="address-suggestions absolute z-40 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-navy-border bg-navy-card shadow-xl">
          {suggestions.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() => void selectSuggestion(place)}
                className="w-full text-left px-3 py-2.5 text-sm text-fg hover:bg-brand-subtle transition-colors flex items-start gap-2"
              >
                <MapPin size={14} className="text-brand shrink-0 mt-0.5" aria-hidden />
                <span className="line-clamp-2">{place.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const hintBlock = (
    <p className="text-sm text-muted">
      {prominent || split
        ? 'Search above or drop the pin on the map. We deliver from your nearest branch.'
        : 'Search for your address or drag the pin on the map.'}
    </p>
  );

  const locationErrorBlock = locationError ? (
    <div className="flex items-start gap-2.5 text-xs sm:text-sm text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
      <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-red-400">Location Access Error</p>
        <p className="mt-0.5 text-xs text-muted dark:text-red-200/90 leading-relaxed">{locationError}</p>
      </div>
      <button
        type="button"
        onClick={() => setLocationError(null)}
        className="text-muted hover:text-fg p-0.5 shrink-0"
        aria-label="Dismiss error"
      >
        <X size={14} />
      </button>
    </div>
  ) : null;

  const busyBlock = busy ? (
    <div className="flex items-center gap-2 text-sm text-brand p-3 rounded-xl bg-brand-subtle border border-brand/30">
      <Loader2 size={16} className="animate-spin shrink-0" />
      {locating ? 'Finding your location...' : 'Updating pin location...'}
    </div>
  ) : null;

  const mapBlock = (
    <div
      className={`relative overflow-hidden ${
        mapOverlay
          ? 'h-full min-h-0 border-0 rounded-none'
          : `rounded-xl border border-navy-border ${split ? 'h-full' : ''}`
      }`}
    >
      <DeliveryMap
        lat={lat}
        lng={lng}
        onLocationChange={handleMapMove}
        branchMarkers={branchMarkers}
        selectedBranchId={selectedBranchId}
        onBranchSelect={onBranchSelect}
        showRoute={showRoute}
        routeAnimation={routeAnimation}
        className={`${mapHeight}${mapOverlay ? ' delivery-map-wrap--bleed' : ''}`}
      />
      {!mapOverlay && (
        <div
          className="pointer-events-none absolute top-3 left-3 right-3 flex items-start gap-2.5 rounded-[14px] bg-white border border-black/5 px-3.5 py-3 text-xs text-slate-900 shadow-[0_4px_12px_rgba(0,0,0,0.08)] z-[2]"
          aria-live="polite"
        >
          <MapPin size={20} className="text-brand shrink-0 mt-0.5" aria-hidden />
          <span className="line-clamp-2 font-semibold text-[13px] leading-snug text-slate-900">
            {resolvedAddress || 'Move the pin to select your address'}
          </span>
        </div>
      )}
      {!mapOverlay && (
        <button
          type="button"
          onClick={() => void detectCurrentLocation(true)}
          disabled={busy}
          title="Use my current location"
          aria-label="Use my current location"
          className="absolute bottom-3 right-3 z-[3] w-12 h-12 rounded-full bg-white border border-navy-border shadow-lg text-brand hover:border-brand hover:bg-brand-subtle transition-colors flex items-center justify-center disabled:opacity-50"
        >
          {locating ? <Loader2 size={18} className="animate-spin" /> : <Crosshair size={20} strokeWidth={2} />}
        </button>
      )}
    </div>
  );

  const locateButton = (
    <button
      type="button"
      onClick={() => void detectCurrentLocation(true)}
      disabled={busy}
      className="flex items-center justify-center gap-2 w-full text-sm text-brand hover:text-brand-light transition-colors disabled:opacity-50 py-2"
    >
      {locating ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
      {locating ? 'Finding location...' : 'Use my current location'}
    </button>
  );

  const addressSuggestionsOpen = showSuggestions && suggestions.length > 0;

  if (layout === 'panel') {
    const FieldIcon = source === 'location' ? LocateFixed : MapPin;
    const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
    return (
      // mapFocus: search on top and the map filling every leftover pixel of the popup. Otherwise, phones stack
      // the same way and from md the search and children sit beside a fixed-height map.
      <div
        className={
          mapFocus
            ? 'flex min-h-0 flex-1 flex-col gap-3'
            : 'flex min-h-0 flex-col gap-4 max-md:flex-1 md:mt-1 md:grid md:h-123 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:grid-rows-[minmax(0,1fr)] md:gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]'
        }
      >
        {!hideSearch && <div className={mapFocus ? 'flex shrink-0 flex-col' : 'flex min-h-0 flex-col max-md:shrink-0'}>
          <div ref={searchWrapRef} className="relative shrink-0">
            <label className="relative block">
              <span className="sr-only">Your delivery location</span>
              <FieldIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-brand-500" aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  userTypedRef.current = true;
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={(e) => {
                  // A filled-in location is selected, so typing replaces it.
                  if (source === 'location' || source === 'pin') e.currentTarget.select();
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Search your street, area or landmark"
                autoComplete="off"
                className="w-full rounded-full bg-brand-50/70 py-3 pr-11 pl-12 text-base text-slate-900 ring-1 ring-brand-100 ring-inset transition-shadow placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {(searching || resolving) && (
                <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-brand-500" aria-hidden />
              )}
            </label>
            {addressSuggestionsOpen && (
              <ul className="absolute inset-x-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-[1rem] bg-white py-1.5 shadow-xl shadow-brand-950/15 ring-1 ring-brand-100">
                {suggestions.map((place) => (
                  <li key={place.placeId}>
                    <button
                      type="button"
                      onClick={() => void selectSuggestion(place)}
                      className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-brand-50"
                    >
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
                      <span className="line-clamp-2">{place.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* One line under the search on where the address came from (prototype: LocationStatus). */}
          <p role="status" className="mt-2 flex shrink-0 items-start gap-1.5 text-xs leading-5 text-slate-500">
            {locating ? (
              <>
                <LocateFixed className="mt-0.75 size-3.5 shrink-0 text-brand-500 motion-safe:animate-pulse" aria-hidden />
                <span>Finding your location…</span>
              </>
            ) : resolving ? (
              <>
                <MapPin className="mt-0.75 size-3.5 shrink-0 text-brand-500 motion-safe:animate-pulse" aria-hidden />
                <span>Updating the pin location…</span>
              </>
            ) : locationError ? (
              <>
                <LocateOff className="mt-0.75 size-3.5 shrink-0" aria-hidden />
                <span>
                  {locationError}{' '}
                  <button
                    type="button"
                    onClick={() => void detectCurrentLocation(true)}
                    className={`rounded font-semibold text-brand-600 underline underline-offset-2 ${focusRing}`}
                  >
                    Try again
                  </button>
                </span>
              </>
            ) : source === 'location' ? (
              <>
                <LocateFixed className="mt-0.75 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  <span className="font-semibold text-emerald-700">Using your current location</span>. Search or move the pin
                  to deliver somewhere else.
                </span>
              </>
            ) : source === 'pin' ? (
              <>
                <MapPin className="mt-0.75 size-3.5 shrink-0 text-brand-600" aria-hidden />
                <span>
                  <span className="font-semibold text-brand-800">Delivering to the pin</span>. Drag it or tap the map to adjust.
                </span>
              </>
            ) : (
              <>
                <MapPin className="mt-0.75 size-3.5 shrink-0 text-brand-500" aria-hidden />
                <span>Search above, or drag the pin on the map to where we should deliver.</span>
              </>
            )}
          </p>
          {source !== 'location' && !locating && (
            <button
              type="button"
              onClick={() => void detectCurrentLocation(true)}
              disabled={busy}
              className={`mt-1 inline-flex shrink-0 items-center gap-1.5 self-start rounded text-xs font-semibold text-brand-600 underline-offset-2 hover:underline disabled:opacity-50 ${focusRing}`}
            >
              <LocateFixed className="size-3.5" aria-hidden />
              Use my current location
            </button>
          )}

          {children}
        </div>}

        {/* Upright phones: at least a usable map, even under a tall message. */}
        <div
          className={
            mapFocus
              ? 'relative flex min-h-0 min-w-0 flex-1 flex-col'
              : 'relative grid min-h-0 grid-rows-[minmax(0,1fr)] max-md:min-h-48 max-md:flex-1'
          }
        >
          <DeliveryMap
            lat={lat}
            lng={lng}
            onLocationChange={handleMapMove}
            branchMarkers={branchMarkers}
            selectedBranchId={selectedBranchId}
            onBranchSelect={onBranchSelect}
            showRoute={showRoute}
            routeAnimation={routeAnimation}
            look="redesign"
            customerPin="deliver"
            customerPinLabel="Deliver here"
            className={mapFocus ? 'min-h-0 flex-1' : 'h-full min-h-0'}
          />
          {mapOverlayContent}
        </div>
      </div>
    );
  }

  if (mapOverlay) {
    return (
      <div className="address-map-overlay">
        <div className="address-map-overlay__map">{mapBlock}</div>
        <div
          className={`address-map-overlay__top${
            addressSuggestionsOpen ? ' address-map-overlay__top--dropdown-open' : ''
          }`}
        >
          <div className="address-map-overlay__panel">
            {overlayHeader}
            {searchBlock}
          </div>
          {locationErrorBlock}
          {busyBlock}
        </div>
        {children && <div className="address-map-overlay__bottom">{children}</div>}
      </div>
    );
  }

  if (split) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:items-stretch">
        <div className="min-w-0 space-y-3">
          {searchBlock}
          {locationErrorBlock}
          {busyBlock}
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">{mapBlock}</div>

        {children && <div className="min-w-0 lg:col-start-1 lg:row-start-2">{children}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {searchBlock}
      {locationErrorBlock}
      {hintBlock}
      {busyBlock}
      {mapBlock}
      {locateButton}
      {children}
    </div>
  );
}
