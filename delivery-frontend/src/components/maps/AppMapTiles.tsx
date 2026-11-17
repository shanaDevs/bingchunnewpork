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

type ServerTiles = {
  provider: 'google' | 'osm' | string;
  url: string;
  attribution: string;
};

let keyRequest: Promise<string> | null = null;
let mapsRequest: Promise<void> | null = null;
let mapsKey = '';
let tilesRequest: Promise<ServerTiles | null> | null = null;

function parseTilesBody(body: unknown): ServerTiles | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as { data?: ServerTiles; provider?: string; url?: string; attribution?: string };
  const data = (root.data ?? root) as ServerTiles;
  const provider = String(data.provider ?? '').trim();
  const url = String(data.url ?? '').trim();
  const attribution = String(data.attribution ?? '').trim();
  if (provider === 'google' && url) {
    return { provider, url, attribution: attribution || '&copy; Google' };
  }
  return null;
}

/** Same path as customer mobile: backend Map Tiles session (no Maps JS API in browser). */
function readServerMapTiles(): Promise<ServerTiles | null> {
  if (!tilesRequest) {
    tilesRequest = fetch(`${getApiBaseUrl()}/stores/address/tiles`)
      .then(async (res) => {
        if (!res.ok) return null;
        const body = await res.json();
        return parseTilesBody(body);
      })
      .catch(() => null)
      .then((value) => {
        if (!value) tilesRequest = null;
        return value;
      });
  }
  return tilesRequest;
}

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

/** Loads the Maps JavaScript API + Leaflet.GoogleMutant when server tiles are unavailable. */
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const host = window as unknown as { google?: { maps?: MapsNamespace } };
  if (host.google?.maps?.Map && mapsKey === key) return Promise.resolve();
  if (mapsRequest && mapsKey === key) return mapsRequest;
  mapsKey = key;

  mapsRequest = (async () => {
    if (!host.google) host.google = {};
    const maps: MapsNamespace = host.google.maps || (host.google.maps = {});
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

function addGoogleTileLayer(map: L.Map, tiles: ServerTiles): L.Layer {
  return L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 21 }).addTo(map);
}

async function loadGoogleMutantLayer(map: L.Map): Promise<L.Layer | null> {
  const key = await readGoogleMapsKey();
  if (!key) return null;
  await loadGoogleMaps(key);
  await loadGoogleMutant();
  const googleMutant = (L as typeof L & {
    gridLayer: { googleMutant: (options: { type: string; maxZoom: number }) => L.GridLayer };
  }).gridLayer.googleMutant;
  return googleMutant({ type: 'roadmap', maxZoom: 21 }).addTo(map);
}

/** Basemap for every Leaflet map. Prefer Maps JS API, then server tiles, then OSM. */
export default function AppMapTiles() {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    let layer: L.Layer | null = null;

    const useOsm = (reason?: string) => {
      if (cancelled || layer) return;
      if (reason) {
        console.warn('[maps] Using OpenStreetMap basemap fallback:', reason);
      }
      layer = L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
    };

    void (async () => {
      try {
        // Prefer GoogleMutant so HTTP-referrer keys still show Google maps.
        const mutantLayer = await loadGoogleMutantLayer(map);
        if (cancelled) return;
        if (mutantLayer) {
          layer = mutantLayer;
          return;
        }

        const serverTiles = await readServerMapTiles();
        if (cancelled) return;
        if (serverTiles) {
          layer = addGoogleTileLayer(map, serverTiles);
          return;
        }

        useOsm('no browser key and server tiles unavailable');
      } catch (err) {
        console.error('Google map basemap failed', err);
        useOsm(err instanceof Error ? err.message : 'google basemap error');
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map]);

  return null;
}
