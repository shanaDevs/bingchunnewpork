/** Prefer importing from `@bingchun/delivery-domain` for new code. */
/** Max distance between selected branch and an alternate branch (km) */
export const NEARBY_BRANCH_RADIUS_KM = 7;

/** Sri Lanka stores sometimes have lat/lng swapped in the DB — correct for distance and API responses. */
export function fixSwappedSriLankaCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const inSlLat = (n: number) => n >= 5.5 && n <= 10.0;
  const inSlLng = (n: number) => n >= 79.5 && n <= 82.0;
  if (inSlLng(lat) && inSlLat(lng)) return { lat: lng, lng: lat };
  return { lat, lng };
}

export function normalizeStoreCoordinates<T extends { lat: number; lng: number }>(store: T): T {
  const fixed = fixSwappedSriLankaCoordinates(store.lat, store.lng);
  return { ...store, lat: fixed.lat, lng: fixed.lng };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
