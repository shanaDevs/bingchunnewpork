export type DeliveryRouteStop = {
  orderId?: string;
  orderNumber: string;
  customerName: string;
  addressLine?: string;
  city?: string;
  district?: string;
  lat: number;
  lng: number;
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
