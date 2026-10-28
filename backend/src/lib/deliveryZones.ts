import { prisma } from './prisma';
import { haversineKm } from '../utils/geo';
import type { DeliveryZoneLike } from './deliveryStoreResolver';

export async function getGlobalDeliveryZones(): Promise<DeliveryZoneLike[]> {
  const zones = await prisma.deliveryZone.findMany({
    where: { isActive: true, isGlobal: true },
    orderBy: { radiusKm: 'asc' },
  });
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    radiusKm: z.radiusKm,
    fee: z.fee,
    minOrder: z.minOrder,
  }));
}

function pickZone(distKm: number, zones: DeliveryZoneLike[]): DeliveryZoneLike | null {
  const eligible = zones.filter((z) => distKm <= z.radiusKm);
  if (!eligible.length) return null;
  return eligible.sort((a, b) => a.radiusKm - b.radiusKm)[0];
}

/** Resolve delivery fee from global zone table using distance to nearest store. */
export async function resolveGlobalDeliveryZone(
  userLat: number,
  userLng: number,
): Promise<{ zone: DeliveryZoneLike; distanceKm: number; storeId: string; storeName: string } | null> {
  const globalZones = await getGlobalDeliveryZones();
  if (!globalZones.length) return null;

  const stores = await prisma.store.findMany({ where: { isActive: true, deliveryEnabled: true } });
  if (!stores.length) return null;

  let nearest = stores[0];
  let nearestDist = haversineKm(userLat, userLng, nearest.lat, nearest.lng);
  for (const store of stores.slice(1)) {
    const d = haversineKm(userLat, userLng, store.lat, store.lng);
    if (d < nearestDist) {
      nearest = store;
      nearestDist = d;
    }
  }

  const zone = pickZone(nearestDist, globalZones);
  if (!zone) return null;

  return {
    zone,
    distanceKm: nearestDist,
    storeId: nearest.id,
    storeName: nearest.name,
  };
}
