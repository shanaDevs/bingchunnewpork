import { prisma } from './prisma';
import { haversineKm } from '../utils/geo';

/** Same pin within this radius is treated as one saved address (no duplicate). */
export const ADDRESS_DEDUP_RADIUS_M = 20;

export function addressDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000;
}

type AddressRow = {
  id: string;
  userId: string;
  label: string;
  addressLine: string;
  city: string;
  district: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  createdAt: Date;
};

export async function findNearbyUserAddress(opts: {
  userId: string;
  lat: number;
  lng: number;
  radiusM?: number;
  excludeId?: string;
}): Promise<AddressRow | null> {
  const addresses = await prisma.address.findMany({
    where: {
      userId: opts.userId,
      lat: { not: null },
      lng: { not: null },
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
  });

  const radius = opts.radiusM ?? ADDRESS_DEDUP_RADIUS_M;
  let best: AddressRow | null = null;
  let bestDist = Infinity;

  for (const address of addresses) {
    if (address.lat == null || address.lng == null) continue;
    const distance = addressDistanceMeters(opts.lat, opts.lng, address.lat, address.lng);
    if (distance <= radius && distance < bestDist) {
      best = address;
      bestDist = distance;
    }
  }

  return best;
}

/** Prefer the oldest address as default when none is marked. */
export async function ensureUserHasDefaultAddress(userId: string): Promise<AddressRow | null> {
  const existingDefault = await prisma.address.findFirst({
    where: { userId, isDefault: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existingDefault) return existingDefault;

  const first = await prisma.address.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  if (!first) return null;

  return prisma.address.update({
    where: { id: first.id },
    data: { isDefault: true },
  });
}

export async function clearOtherDefaultAddresses(userId: string, keepId?: string): Promise<void> {
  await prisma.address.updateMany({
    where: {
      userId,
      isDefault: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: { isDefault: false },
  });
}

/**
 * Create a saved address, or reuse one already within ADDRESS_DEDUP_RADIUS_M.
 * First address for a user is always marked default.
 */
export async function upsertUserDeliveryAddress(opts: {
  userId: string;
  label?: string;
  addressLine: string;
  city: string;
  district: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
}): Promise<{ address: AddressRow; created: boolean }> {
  const { userId } = opts;
  const lat = opts.lat ?? null;
  const lng = opts.lng ?? null;

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearby = await findNearbyUserAddress({ userId, lat, lng });
    if (nearby) {
      const makeDefault = Boolean(opts.isDefault);
      if (makeDefault && !nearby.isDefault) {
        await clearOtherDefaultAddresses(userId, nearby.id);
        const updated = await prisma.address.update({
          where: { id: nearby.id },
          data: { isDefault: true },
        });
        return { address: updated, created: false };
      }
      return { address: nearby, created: false };
    }
  }

  const count = await prisma.address.count({ where: { userId } });
  if (count >= 5) {
    throw Object.assign(new Error('Maximum 5 saved addresses allowed'), { statusCode: 400 });
  }

  const makeDefault = Boolean(opts.isDefault) || count === 0;
  if (makeDefault) {
    await clearOtherDefaultAddresses(userId);
  }

  const address = await prisma.address.create({
    data: {
      userId,
      label: opts.label?.trim() || 'Home',
      addressLine: opts.addressLine,
      city: opts.city,
      district: opts.district,
      lat,
      lng,
      isDefault: makeDefault,
    },
  });

  return { address, created: true };
}
