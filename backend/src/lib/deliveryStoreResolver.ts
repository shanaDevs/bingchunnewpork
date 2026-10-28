import { haversineKm } from '../utils/geo';
import { findStoreMatchingAddress } from './storeMatching';

export interface DeliveryZoneLike {
  id: string;
  name: string;
  radiusKm: number;
  fee: number;
  minOrder: number;
}

export interface StoreWithZonesLike {
  id: string;
  name: string;
  addressLine: string;
  lat: number;
  lng: number;
  deliveryZones: DeliveryZoneLike[];
}

export interface ResolvedDeliveryStore<T extends StoreWithZonesLike> {
  store: T;
  zone: DeliveryZoneLike;
  distanceKm: number;
}

function pickZone(distKm: number, zones: DeliveryZoneLike[]): DeliveryZoneLike | null {
  const eligible = zones.filter((z) => distKm <= z.radiusKm);
  if (!eligible.length) return null;
  return eligible.sort((a, b) => a.radiusKm - b.radiusKm)[0];
}

/** Pick fulfilling branch: address area match first, then nearest eligible store. */
export function resolveDeliveryStore<T extends StoreWithZonesLike>(
  userLat: number,
  userLng: number,
  address: string | undefined,
  stores: T[]
): ResolvedDeliveryStore<T> | null {
  const candidates: ResolvedDeliveryStore<T>[] = [];

  for (const store of stores) {
    const distanceKm = haversineKm(userLat, userLng, store.lat, store.lng);
    const zone = pickZone(distanceKm, store.deliveryZones);
    if (zone) {
      candidates.push({ store, zone, distanceKm });
    }
  }

  if (!candidates.length) return null;

  const addressMatch = findStoreMatchingAddress(address, candidates.map((c) => c.store));
  if (addressMatch) {
    const matched = candidates.find((c) => c.store.id === addressMatch.id);
    if (matched) return matched;
  }

  return candidates.sort((a, b) => a.distanceKm - b.distanceKm)[0];
}
