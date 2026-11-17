'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, LocateFixed, MapPin, MapPinned, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/components/home-redesign/lib/cn';
import { ORDER_FLOW_FOCUS_RING } from '@/components/order/orderFlowUi';
import type { AddressSelection } from './AddressMapPicker';

interface PlaceSuggestion {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export async function reverseGeocodeAddress(lat: number, lng: number): Promise<AddressSelection> {
  try {
    const res = await api.get<{ address: string; lat: number; lng: number }>(
      `/stores/address/reverse?lat=${lat}&lng=${lng}`,
    );
    return {
      address: res.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
    };
  } catch {
    return { address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
  }
}

interface Props {
  currentAddress?: string;
  locating?: boolean;
  busy?: boolean;
  onSelectLocation: (selection: AddressSelection) => void;
  onUseCurrentLocation: () => void;
  onOpenMap: () => void;
}

/**
 * Location step after Pickup/Delivery: search, use current location, or open the map.
 * Matches the "Choose Location" layout (search + two actions only).
 */
export function DeliveryLocationChooser({
  currentAddress,
  locating = false,
  busy = false,
  onSelectLocation,
  onUseCurrentLocation,
  onOpenMap,
}: Props) {
  const [searchQuery, setSearchQuery] = useState(currentAddress ?? '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resolving, setResolving] = useState(false);
  const userTypedRef = useRef(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 400);

  useEffect(() => {
    if (!currentAddress || userTypedRef.current) return;
    setSearchQuery(currentAddress);
  }, [currentAddress]);

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
    if (debouncedSearch.length < 2 || !userTypedRef.current) {
      setSuggestions([]);
      return;
    }

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

  async function selectSuggestion(place: PlaceSuggestion) {
    userTypedRef.current = false;
    setShowSuggestions(false);
    setSearchQuery(place.description);

    if (place.lat && place.lng) {
      onSelectLocation({ address: place.description, lat: place.lat, lng: place.lng });
      return;
    }

    setResolving(true);
    try {
      const res = await api.get<{ address: string; lat: number; lng: number }>(
        `/stores/address/geocode?address=${encodeURIComponent(place.description)}`,
      );
      onSelectLocation({ address: res.address || place.description, lat: res.lat, lng: res.lng });
    } catch {
      toast.error('Could not find that address. Try another search, or set it on the map.');
    } finally {
      setResolving(false);
    }
  }

  const blocked = busy || locating || resolving;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div ref={searchWrapRef} className="relative shrink-0 px-5 pt-3 sm:px-8">
        <label className="relative block">
          <span className="sr-only">Search location</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            disabled={blocked}
            onChange={(e) => {
              userTypedRef.current = true;
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search location"
            autoComplete="off"
            className="w-full rounded-full bg-slate-100 py-3.5 pr-11 pl-12 text-base text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-600 focus:outline-none disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden"
          />
          {(searching || resolving) && (
            <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-brand-500" aria-hidden />
          )}
          {searchQuery && !searching && !resolving && (
            <button
              type="button"
              onClick={() => {
                userTypedRef.current = true;
                setSearchQuery('');
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              aria-label="Clear search"
              className={cn(
                'absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700',
                ORDER_FLOW_FOCUS_RING,
              )}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>

        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute inset-x-5 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-white py-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-100 sm:inset-x-8">
            {suggestions.map((place) => (
              <li key={place.placeId}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => void selectSuggestion(place)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
                  <span className="line-clamp-2">{place.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
        <li>
          <button
            type="button"
            disabled={blocked}
            onClick={onUseCurrentLocation}
            className={cn(
              'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 disabled:opacity-60 sm:px-8',
              ORDER_FLOW_FOCUS_RING,
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-800">
              {locating ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Your current location</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {locating ? 'Detecting where you are…' : 'Automatically use GPS to set your location'}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-slate-300" aria-hidden />
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={blocked}
            onClick={onOpenMap}
            className={cn(
              'flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 disabled:opacity-60 sm:px-8',
              ORDER_FLOW_FOCUS_RING,
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-800">
              <MapPinned className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Set on map</span>
              <span className="mt-0.5 block text-sm text-slate-500">Drop a pin to choose your location</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-slate-300" aria-hidden />
          </button>
        </li>
      </ul>
    </div>
  );
}
