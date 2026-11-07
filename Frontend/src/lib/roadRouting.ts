import { getApiBaseUrl } from '@/lib/apiBase';

export type LatLngPoint = { lat: number; lng: number };

const OSRM_BASE = 'https://router.project-osrm.org';

async function fetchGoogleRoadPath(
  waypoints: LatLngPoint[],
  signal?: AbortSignal,
): Promise<[number, number][] | null> {
  const origin = waypoints[0];
  const dest = waypoints[waypoints.length - 1];
  const via = waypoints.slice(1, -1);
  const params = new URLSearchParams({
    originLat: String(origin.lat),
    originLng: String(origin.lng),
    destLat: String(dest.lat),
    destLng: String(dest.lng),
  });
  if (via.length > 0) {
    params.set('waypoints', via.map((point) => `${point.lat},${point.lng}`).join('|'));
  }

  const res = await fetch(`${getApiBaseUrl()}/stores/address/directions?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const body = await res.json() as {
    data?: { points?: LatLngPoint[] };
    points?: LatLngPoint[];
  };
  const points = body.data?.points ?? body.points ?? [];
  if (points.length < 2) return null;
  return points.map((point) => [point.lat, point.lng] as [number, number]);
}

/** Driving path for the customer map. Uses Google Directions when configured, then OSRM. */
export async function fetchRoadPath(
  waypoints: LatLngPoint[],
  signal?: AbortSignal,
): Promise<[number, number][]> {
  if (waypoints.length < 2) {
    return waypoints.map((p) => [p.lat, p.lng] as [number, number]);
  }

  const fallback: [number, number][] = waypoints.map((p) => [p.lat, p.lng]);

  try {
    const googlePath = await fetchGoogleRoadPath(waypoints, signal);
    if (googlePath) return googlePath;
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  try {
    const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    if (data.code !== 'Ok' || !data.routes?.length) return fallback;

    const coordinates = data.routes[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return fallback;

    // GeoJSON is [lng, lat] → Leaflet wants [lat, lng]
    return coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return fallback;
  }
}

/** Point at fraction t along a polyline (lat/lng degrees, approximate). */
export function pointAlongPath(points: [number, number][], t: number): [number, number] | null {
  if (points.length === 0) return null;
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    segs.push(d);
    total += d;
  }
  if (total <= 0) return points[0];

  let target = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const r = segs[i] === 0 ? 0 : target / segs[i];
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * r,
        points[i][1] + (points[i + 1][1] - points[i][1]) * r,
      ];
    }
    target -= segs[i];
  }
  return points[points.length - 1];
}

/** Prefix of path through fraction t. */
export function prefixAlongPath(points: [number, number][], t: number): [number, number][] {
  if (points.length === 0) return [];
  if (t <= 0) return [points[0]];
  if (t >= 1) return [...points];

  const end = pointAlongPath(points, t);
  if (!end) return [points[0]];

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (total <= 0) return [points[0]];

  let target = total * t;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= seg) {
      out.push(end);
      break;
    }
    target -= seg;
    out.push(points[i]);
  }
  return out;
}
