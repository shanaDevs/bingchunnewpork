/** Prefer importing from `@bingchun/delivery-domain` for new code. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStop extends LatLng {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  district: string;
  status: string;
  total: number;
  itemCount: number;
  paymentStatus?: string;
  paymentMethod?: string;
  imageUrl?: string | null;
  extraItemCount?: number;
  sequence: number;
  distanceFromPreviousKm: number;
  etaMinutesFromPrevious: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffAt?: Date | string | null;
  plannedLat?: number | null;
  plannedLng?: number | null;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function etaMinutes(distanceKm: number): number {
  return Math.max(3, Math.round((distanceKm / 25) * 60) + 2);
}

/** Initial bearing from origin to point in degrees (0 = North, 90 = East). */
export function bearingDeg(origin: LatLng, point: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(origin.lat);
  const phi2 = toRad(point.lat);
  const dLng = toRad(point.lng - origin.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type OptimizeDeliveryStopsOptions = {
  /** When true, append a synthetic return leg from the last stop back to origin. */
  includeReturnToOrigin?: boolean;
};

/** Greedy nearest-neighbour stop ordering from store origin. */
export function optimizeDeliveryStops(
  origin: LatLng,
  stops: Omit<RouteStop, 'sequence' | 'distanceFromPreviousKm' | 'etaMinutesFromPrevious'>[],
  options: OptimizeDeliveryStopsOptions = {},
): RouteStop[] {
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  let current = origin;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const [next] = remaining.splice(bestIdx, 1);
    ordered.push({
      ...next,
      sequence: ordered.length + 1,
      distanceFromPreviousKm: Math.round(bestDist * 100) / 100,
      etaMinutesFromPrevious: etaMinutes(bestDist),
    });
    current = { lat: next.lat, lng: next.lng };
  }

  if (options.includeReturnToOrigin && ordered.length > 0) {
    const returnDist = haversineKm(current, origin);
    ordered.push({
      orderId: '__return__',
      orderNumber: 'RETURN',
      customerName: 'Return to branch',
      customerPhone: '',
      addressLine: '',
      city: '',
      district: '',
      status: 'RETURN',
      total: 0,
      itemCount: 0,
      lat: origin.lat,
      lng: origin.lng,
      sequence: ordered.length + 1,
      distanceFromPreviousKm: Math.round(returnDist * 100) / 100,
      etaMinutesFromPrevious: etaMinutes(returnDist),
    });
  }

  return ordered;
}

export function totalRouteDistanceKm(stops: RouteStop[]): number {
  return Math.round(stops.reduce((sum, s) => sum + s.distanceFromPreviousKm, 0) * 100) / 100;
}

export function totalRouteEtaMinutes(stops: RouteStop[]): number {
  return stops.reduce((sum, s) => sum + s.etaMinutesFromPrevious, 0);
}

/** Customer stops only (excludes synthetic return leg). */
export function customerRouteStops(stops: RouteStop[]): RouteStop[] {
  return stops.filter((s) => s.orderId !== '__return__');
}
