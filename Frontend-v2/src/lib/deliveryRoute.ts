export type DeliveryRouteStop = {
  orderId?: string;
  orderNumber: string;
  customerName: string;
  addressLine?: string;
  city?: string;
  district?: string;
  lat: number;
  lng: number;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffAt?: string | null;
  plannedLat?: number | null;
  plannedLng?: number | null;
  itemCount?: number;
  imageUrl?: string | null;
  extraItemCount?: number;
  sequence: number;
  distanceFromPreviousKm?: number;
  etaMinutesFromPrevious?: number;
  /** Order status for this stop (e.g. READY, OUT_FOR_DELIVERY, DELIVERED) — used to
   *  color the map pin green once the stop has been successfully delivered. */
  status?: string;
};

export type DeliveryRouteStore = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  addressLine: string;
  city: string;
};

export type DeliveryRoutePayload = {
  title?: string;
  store: DeliveryRouteStore;
  /** Actual outlet when [store] is a vehicle-failure pickup override. */
  branch?: DeliveryRouteStore;
  pickup?: { lat: number; lng: number; label: string };
  stops: DeliveryRouteStop[];
  path: { lat: number; lng: number }[];
  summary: {
    stopCount: number;
    totalDistanceKm: number;
    estimatedMinutes: number;
    generatedAt?: string;
  };
};

/** Label for the route start pin — breakdown spot vs outlet branch. */
export function routeStartPrimaryDetail(store: DeliveryRouteStore): string {
  return store.id === 'pickup' ? store.name : 'Pickup branch';
}

export function formatRouteAddress(parts: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const normalized = part.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result.join(', ');
}

export function formatStopAddress(stop: {
  addressLine?: string;
  city?: string;
  district?: string;
}): string {
  return formatRouteAddress([stop.addressLine, stop.district, stop.city]);
}

/** e.g. "Delivery Run #2 - Pitakotte" → "Delivery Run 2 - Pitakotte" */
export function formatDeliveryJobTitle(title: string): string {
  return title.replace(/#/g, '');
}

const DROPOFF_DIVERGE_METERS = 40;

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Map pin for a stop — actual OTP GPS after delivery, otherwise the checkout address. */
export function stopMapPosition(stop: DeliveryRouteStop): { lat: number; lng: number } {
  if (stop.status === 'DELIVERED' && stop.dropoffLat != null && stop.dropoffLng != null) {
    return { lat: stop.dropoffLat, lng: stop.dropoffLng };
  }
  return { lat: stop.lat, lng: stop.lng };
}

/** Checkout address pin when it is far from the rider's OTP GPS. */
export function stopPlannedGhostPosition(stop: DeliveryRouteStop): { lat: number; lng: number } | null {
  if (stop.status !== 'DELIVERED' || stop.dropoffLat == null || stop.dropoffLng == null) return null;
  const planned = {
    lat: stop.plannedLat ?? stop.lat,
    lng: stop.plannedLng ?? stop.lng,
  };
  const actual = { lat: stop.dropoffLat, lng: stop.dropoffLng };
  if (haversineMeters(planned, actual) < DROPOFF_DIVERGE_METERS) return null;
  return planned;
}
