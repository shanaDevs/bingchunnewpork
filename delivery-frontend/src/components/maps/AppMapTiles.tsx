'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { getApiBaseUrl } from '@/lib/apiBase';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

type MapsNamespace = {
  Map?: unknown;
  importLibrary?: (name: string) => Promise<unknown>;
  __ib__?: () => void;
};

let keyRequest: Promise<string> | null = null;
let mapsRequest: Promise<void> | null = null;
let mapsKey = '';

function readGoogleMapsKey(): Promise<string> {
  if (!keyRequest) {
    keyRequest = fetch(`${getApiBaseUrl()}/settings/app`)
      .then(async (res) => {
        if (!res.ok) return '';
        const body = await res.json() as { data?: { googleMapsApiKey?: string }; googleMapsApiKey?: string };
        return String(body.data?.googleMapsApiKey ?? body.googleMapsApiKey ?? '').trim();
      })
      .catch(() => '')
      .then((value) => {
        if (!value) keyRequest = null;
        return value;
      });
  }
  return keyRequest;
}

function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as Window & { google?: { maps?: MapsNamespace } };
  if (w.google?.maps?.Map && mapsKey === key) return Promise.resolve();
  if (mapsRequest && mapsKey === key) return mapsRequest;
  mapsKey = key;

  mapsRequest = (async () => {
    w.google = w.google || {};
    const maps: MapsNamespace = w.google.maps || (w.google.maps = {});
    if (!maps.importLibrary) {
      const requested = new Set<string>();
      let pending: Promise<void> | null = null;
      const loadScript = () => pending || (pending = new Promise<void>((resolve, reject) => {
        const params = new URLSearchParams({
          key,
          v: 'weekly',
          libraries: [...requested].join(','),
          callback: 'google.maps.__ib__',
        });
        maps.__ib__ = () => resolve();
        const script = document.createElement('script');
        script.dataset.bcGoogleMaps = '1';
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.onerror = () => reject(new Error('Google Maps failed to load'));
        document.head.appendChild(script);
      }));
      maps.importLibrary = (name: string) => {
        requested.add(name);
        return loadScript().then(() => maps.importLibrary!(name));
      };
    }
    if (!maps.Map) await maps.importLibrary('maps');
  })().catch((err) => {
    mapsRequest = null;
    throw err;
  });

  return mapsRequest;
}

function loadGoogleMutant(): Promise<void> {
  const w = window as Window & { L?: typeof L };
  w.L = L;
  const grid = (L as typeof L & { gridLayer?: { googleMutant?: unknown } }).gridLayer;
  if (typeof grid?.googleMutant === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-bc-google-mutant="1"]');
    const finish = () => {
      const ready = (L as typeof L & { gridLayer?: { googleMutant?: unknown } }).gridLayer?.googleMutant;
      if (typeof ready === 'function') resolve();
      else reject(new Error('Google map layer did not register'));
    };
    if (existing) {
      if (existing.dataset.loaded === '1') finish();
      else existing.addEventListener('load', finish, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.bcGoogleMutant = '1';
    script.src = '/vendor/Leaflet.GoogleMutant.js';
    script.onload = () => {
      script.dataset.loaded = '1';
      finish();
    };
    script.onerror = () => reject(new Error('Google map layer failed to load'));
    document.body.appendChild(script);
  });
}

/** Basemap for every Leaflet map. Uses the Google Maps key from app settings or the server env. */
export default function AppMapTiles() {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    let layer: L.Layer | null = null;

    const useOsm = () => {
      if (cancelled || layer) return;
      layer = L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
    };

    void (async () => {
      try {
        const key = await readGoogleMapsKey();
        if (cancelled) return;
        if (!key) {
          useOsm();
          return;
        }
        await loadGoogleMaps(key);
        if (cancelled) return;
        await loadGoogleMutant();
        if (cancelled) return;
        const googleMutant = (L as typeof L & {
          gridLayer: { googleMutant: (options: { type: string; maxZoom: number }) => L.GridLayer };
        }).gridLayer.googleMutant;
        layer = googleMutant({ type: 'roadmap', maxZoom: 21 }).addTo(map);
      } catch {
        useOsm();
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
