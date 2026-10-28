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
