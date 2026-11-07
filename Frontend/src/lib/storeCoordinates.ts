/** Normalize API/DB coordinates for maps (handles string decimals from MySQL). */
export function normalizeCoordinate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidMapCoordinate(lat: unknown, lng: unknown): boolean {
  const la = normalizeCoordinate(lat);
  const ln = normalizeCoordinate(lng);
  if (la == null || ln == null) return false;
  return la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}

/** Sri Lanka stores sometimes have lat/lng swapped in the DB — correct for maps and distance. */
export function fixSwappedSriLankaCoordinates(lat: number, lng: number): { lat: number; lng: number } {
  const inSlLat = (n: number) => n >= 5.5 && n <= 10.0;
  const inSlLng = (n: number) => n >= 79.5 && n <= 82.0;
  if (inSlLng(lat) && inSlLat(lng)) return { lat: lng, lng: lat };
  return { lat, lng };
}

export function toMapLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (!isValidMapCoordinate(lat, lng)) return null;
  return fixSwappedSriLankaCoordinates(normalizeCoordinate(lat)!, normalizeCoordinate(lng)!);
}
