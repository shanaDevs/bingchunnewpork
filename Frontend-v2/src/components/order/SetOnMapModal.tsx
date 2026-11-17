'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, LocateFixed } from 'lucide-react';
import { getCurrentPosition, DEFAULT_LOCATION } from '@/lib/geolocation';
import { cn } from '@/components/home-redesign/lib/cn';
import { homeFontVariables } from '@/components/home-redesign/fonts';
import type { AddressSelection } from './AddressMapPicker';
import { reverseGeocodeAddress } from './DeliveryLocationChooser';

const DeliveryMap = dynamic(() => import('./DeliveryMap'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center bg-slate-100 text-sm text-slate-500">Loading map…</div>,
});

interface Props {
  open: boolean;
  initial?: AddressSelection | null;
  confirming?: boolean;
  onConfirm: (selection: AddressSelection) => void;
  onClose: () => void;
}

/**
 * Full-screen map for picking a delivery pin. Confirming calls `onConfirm` with the reverse-geocoded address.
 */
export function SetOnMapModal({ open, initial, confirming = false, onConfirm, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [lat, setLat] = useState(initial?.lat ?? DEFAULT_LOCATION.lat);
  const [lng, setLng] = useState(initial?.lng ?? DEFAULT_LOCATION.lng);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolveAt = useCallback(async (nextLat: number, nextLng: number) => {
    setLat(nextLat);
    setLng(nextLng);
    setResolving(true);
    try {
      const result = await reverseGeocodeAddress(nextLat, nextLng);
      setAddress(result.address);
      setLat(result.lat);
      setLng(result.lng);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const seed = initialRef.current;
    const startLat = seed?.lat;
    const startLng = seed?.lng;
    const startAddress = seed?.address;

    async function start() {
      if (startLat != null && startLng != null) {
        setLat(startLat);
        setLng(startLng);
        setAddress(startAddress ?? '');
        return;
      }
      setLocating(true);
      try {
        const coords = await getCurrentPosition();
        if (!cancelled) await resolveAt(coords.lat, coords.lng);
      } catch {
        if (!cancelled) {
          setLat(DEFAULT_LOCATION.lat);
          setLng(DEFAULT_LOCATION.lng);
          await resolveAt(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng);
        }
      } finally {
        if (!cancelled) setLocating(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [open, resolveAt]);

  async function locateMe() {
    setLocating(true);
    try {
      const coords = await getCurrentPosition();
      await resolveAt(coords.lat, coords.lng);
    } finally {
      setLocating(false);
    }
  }

  if (!open || !mounted) return null;

  const busy = resolving || locating || confirming;
  const canConfirm = Boolean(address) && !busy;

  return createPortal(
    <div
      className={cn(
        homeFontVariables,
        'home-redesign set-on-map-modal fixed inset-0 z-[10050] bg-white text-slate-900',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-on-map-heading"
    >
      <span id="set-on-map-heading" className="sr-only">
        Set delivery location on map
      </span>

      {/* isolate keeps Leaflet pane z-index inside the map so overlay controls stay visible */}
      <div className="absolute inset-0 isolate overflow-hidden">
        <DeliveryMap
          lat={lat}
          lng={lng}
          onLocationChange={(nextLat, nextLng) => {
            void resolveAt(nextLat, nextLng);
          }}
          showRoute={false}
          customerPin="you"
          className="h-full min-h-0 w-full delivery-map-wrap--bleed rounded-none"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-4 top-4 z-30 sm:inset-x-6 sm:top-6">
        <div className="pointer-events-auto rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          {resolving || locating ? (
            <span className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {locating ? 'Finding your location…' : 'Fetching address…'}
            </span>
          ) : (
            <span className="line-clamp-2">{address || 'Move the pin to choose a location'}</span>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white text-slate-900 shadow-lg ring-1 ring-black/5"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void locateMe()}
            disabled={busy}
            aria-label="Use current location"
            className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white text-slate-900 shadow-lg ring-1 ring-black/5 disabled:opacity-50"
          >
            {locating ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
          </button>
        </div>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm({ address, lat, lng })}
          className="pointer-events-auto flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-base font-semibold text-snow shadow-lg shadow-brand-600/30 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
        >
          {confirming ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          Confirm My Location
        </button>
      </div>
    </div>,
    document.body,
  );
}
