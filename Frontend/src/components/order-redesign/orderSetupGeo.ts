export type MapLocation = { lat: number; lng: number };

export function distanceKm(a: MapLocation, b: MapLocation): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  return `${Math.round(km)} km`;
}

export function sortByDistance<T extends { location: MapLocation }>(
  items: T[],
  from: MapLocation,
): T[] {
  return [...items].sort(
    (a, b) => distanceKm(from, a.location) - distanceKm(from, b.location),
  );
}
