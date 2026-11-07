'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';

interface PlaceSuggestion {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

export interface StoreAddressSelection {
  addressLine: string;
  city: string;
  district: string;
  lat: string;
  lng: string;
}

interface StoreAddressSearchFieldProps {
  value: string;
  onResolved: (selection: StoreAddressSelection) => void;
  disabled?: boolean;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

async function fetchJson<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return (data.data ?? data) as T;
}

export default function StoreAddressSearchField({
  value,
  onResolved,
  disabled = false,
}: StoreAddressSearchFieldProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const userTypedRef = useRef(false);
  const debouncedQuery = useDebouncedValue(query.trim(), 400);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    if (!userTypedRef.current) return;

    let cancelled = false;
    setSearching(true);
    void fetchJson<PlaceSuggestion[]>(
      `/stores/address/autocomplete?q=${encodeURIComponent(debouncedQuery)}`,
    )
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
  }, [debouncedQuery]);

  async function resolvePlace(place: PlaceSuggestion) {
    userTypedRef.current = false;
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery(place.description);
    setResolving(true);

    try {
      const details = await fetchJson<{
        address: string;
        lat: number;
        lng: number;
        addressLine: string;
        city: string;
        district: string;
      }>(`/stores/address/geocode?address=${encodeURIComponent(place.description)}`);

      onResolved({
        addressLine: details.addressLine || details.address.split(',')[0]?.trim() || details.address,
        city: details.city,
        district: details.district,
        lat: String(details.lat),
        lng: String(details.lng),
      });
    } catch {
      toast.error('Could not resolve that address. Try another suggestion.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative sm:col-span-2">
      <label className="text-xs text-muted block mb-1">Search address</label>
      <div className="input-icon-wrap">
        <Search size={14} className="input-icon" aria-hidden />
        <input
          className="input-field w-full"
          type="search"
          value={query}
          onChange={(event) => {
            userTypedRef.current = true;
            setQuery(event.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search street, area, or landmark in Sri Lanka..."
          autoComplete="off"
          disabled={disabled || resolving}
          aria-label="Search store address"
        />
        {(searching || resolving) && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand"
            aria-hidden
          />
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Select an address to auto-fill location details and coordinates.
      </p>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="address-suggestions absolute z-40 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-navy-border bg-navy-card shadow-xl">
          {suggestions.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() => void resolvePlace(place)}
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
}
