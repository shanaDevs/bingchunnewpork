import type { LatLng } from './routeOptimizer';
import { assertOsrmBaseUrlAllowed } from './osrmAllowlist';

const OSRM_BASE = process.env.OSRM_URL ?? 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS ?? 8_000);
const OSRM_OVERVIEW = process.env.OSRM_OVERVIEW ?? 'simplified';

export interface RoadRouteResult {
  path: LatLng[];
  distanceKm: number;
  durationMinutes: number;
}

interface OsrmRouteResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }>;
}

async function requestOsrmRoute(waypoints: LatLng[]): Promise<RoadRouteResult> {
  if (waypoints.length < 2) {
    return { path: [...waypoints], distanceKm: 0, durationMinutes: 0 };
  }

  assertOsrmBaseUrlAllowed(OSRM_BASE);

  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=${OSRM_OVERVIEW}&geometries=geojson`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = (await res.json()) as OsrmRouteResponse;
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      throw new Error(data.message ?? 'OSRM routing failed');
    }

    const route = data.routes[0];
    const path = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    return {
      path,
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Road-snapped path; falls back to per-leg routing, then straight segments. */
export async function fetchRoadPath(waypoints: LatLng[]): Promise<LatLng[]> {
  if (waypoints.length < 2) return [...waypoints];

  try {
    return (await requestOsrmRoute(waypoints)).path;
  } catch {
    const path: LatLng[] = [waypoints[0]];

    for (let i = 1; i < waypoints.length; i++) {
      const leg = [waypoints[i - 1], waypoints[i]];
      try {
        const road = await requestOsrmRoute(leg);
        path.push(...road.path.slice(1));
      } catch {
        path.push(waypoints[i]);
      }
    }

    return path;
  }
}

export async function fetchRoadRoute(waypoints: LatLng[]): Promise<RoadRouteResult> {
  if (waypoints.length < 2) {
    return { path: [...waypoints], distanceKm: 0, durationMinutes: 0 };
  }

  try {
    return await requestOsrmRoute(waypoints);
  } catch {
    const path = await fetchRoadPath(waypoints);
    let distanceKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
      try {
        const leg = await requestOsrmRoute([waypoints[i - 1], waypoints[i]]);
        distanceKm += leg.distanceKm;
      } catch {
        // keep accumulated distance from successful legs only
      }
    }

    return {
      path,
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.max(1, Math.round((distanceKm / 25) * 60)),
    };
  }
}

export function buildRouteWaypoints(store: LatLng, stops: LatLng[]): LatLng[] {
  if (stops.length === 0) return [store];
  return [store, ...stops, store];
}

const OSRM_MATCH_CHUNK = 100;
const OSRM_MATCH_OVERLAP = 1;

interface OsrmMatchResponse {
  code: string;
  message?: string;
  matchings?: Array<{
    geometry?: { coordinates?: [number, number][] };
  }>;
}

function coordsToLatLng(coords: [number, number][] | undefined): LatLng[] {
  if (!coords?.length) return [];
  return coords
    .map(([lng, lat]) => ({ lat, lng }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function appendPath(target: LatLng[], part: LatLng[]): void {
  if (part.length === 0) return;
  if (target.length === 0) {
    target.push(...part);
    return;
  }
  const last = target[target.length - 1];
  const first = part[0];
  const skipFirst = last.lat === first.lat && last.lng === first.lng;
  target.push(...(skipFirst ? part.slice(1) : part));
}

async function requestOsrmMatch(waypoints: LatLng[]): Promise<LatLng[]> {
  if (waypoints.length < 2) return [...waypoints];

  assertOsrmBaseUrlAllowed(OSRM_BASE);

  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM_BASE}/match/v1/driving/${coords}?overview=full&geometries=geojson&tidy=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = (await res.json()) as OsrmMatchResponse;
    if (data.code !== 'Ok' || !data.matchings?.length) {
      throw new Error(data.message ?? 'OSRM match failed');
    }

    const path: LatLng[] = [];
    for (const matching of data.matchings) {
      appendPath(path, coordsToLatLng(matching.geometry?.coordinates));
    }
    if (path.length < 2) throw new Error('OSRM match returned empty geometry');
    return path;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Snap a GPS trace onto roads via OSRM map matching.
 * On HTTP / timeout / non-Ok: return the original points (never a shortest-path rewrite).
 */
export async function mapMatchGpsPath(points: LatLng[]): Promise<LatLng[]> {
  const raw = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180,
  );
  if (raw.length < 2) return [...raw];

  try {
    const matched: LatLng[] = [];
    const step = OSRM_MATCH_CHUNK - OSRM_MATCH_OVERLAP;
    for (let start = 0; start < raw.length; start += step) {
      const chunk = raw.slice(start, Math.min(raw.length, start + OSRM_MATCH_CHUNK));
      if (chunk.length < 2) break;
      appendPath(matched, await requestOsrmMatch(chunk));
      if (start + OSRM_MATCH_CHUNK >= raw.length) break;
    }
    return matched.length >= 2 ? matched : [...raw];
  } catch {
    return [...raw];
  }
}
