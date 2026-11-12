import { prisma } from '@bingchun/db';
import { haversineKm } from './geo';

/** Max straight-line distance from customer to branch for delivery (km). */
export const DELIVERY_MAX_KM = 10;

export const DELIVERY_MIN_ORDER = 500;

/** Virtual zone id returned to the frontend for distance-based pricing. */
export const DISTANCE_ZONE_ID = 'distance-based-delivery';

export function computeDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 1) return 150;
  return Math.round(150 + (distanceKm - 1) * 100);
}

export interface DeliveryBranchOption {
  id: string;
  name: string;
  addressLine: string;
  lat: number;
  lng: number;
  openTime: string;
  closeTime: string;
  distanceKm: number;
  fee: number;
  suggested: boolean;
}

export interface DeliveryValidationResult {
  eligible: boolean;
  deliverable: boolean;
  reason?: 'out-of-range' | 'branch-cannot-serve';
  message?: string;
  store?: {
    id: string;
    name: string;
    address: string;
    openTime: string;
    closeTime: string;
    lat: number;
    lng: number;
  };
  zone?: { id: string; name: string; fee: number; minOrder: number };
  distanceKm?: number;
  estimatedMinutes?: number;
  suggestedBranches?: DeliveryBranchOption[];
  nearestBranch?: { id: string; name: string; distanceKm: number };
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

function estimateDurationMinutes(distanceKm: number): number {
  return Math.round((distanceKm / 25) * 60) + 5;
}

function toBranchOption(
  store: {
    id: string;
    name: string;
    addressLine: string;
    lat: number;
    lng: number;
    openTime: string;
    closeTime: string;
  },
  distanceKm: number,
  suggested: boolean,
): DeliveryBranchOption {
  return {
    id: store.id,
    name: store.name,
    addressLine: store.addressLine,
    lat: store.lat,
    lng: store.lng,
    openTime: store.openTime,
    closeTime: store.closeTime,
    distanceKm: roundKm(distanceKm),
    fee: computeDeliveryFee(distanceKm),
    suggested,
  };
}

export async function resolveDeliveryValidation(
  userLat: number,
  userLng: number,
  storeId?: string,
): Promise<DeliveryValidationResult> {
  const stores = await prisma.store.findMany({
    where: { isActive: true, deliveryEnabled: true },
  });

  if (!stores.length) {
    return {
      eligible: false,
      deliverable: false,
      reason: 'out-of-range',
      message: 'Sorry, no delivery branches are available right now. Please try Takeaway.',
    };
  }

  const ranked = stores
    .map((store: (typeof stores)[number]) => ({
      store,
      distanceKm: haversineKm(userLat, userLng, store.lat, store.lng),
    }))
    .sort((a: { distanceKm: number }, b: { distanceKm: number }) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];
  const withinRange = ranked.filter((r: { distanceKm: number }) => r.distanceKm <= DELIVERY_MAX_KM);
  const suggested = withinRange.slice(0, 2);
  const suggestedIds = new Set(suggested.map((s: { store: { id: string } }) => s.store.id));

  const allBranchOptions = ranked.map(({ store, distanceKm }: { store: (typeof stores)[number]; distanceKm: number }) =>
    toBranchOption(store, distanceKm, suggestedIds.has(store.id)),
  );

  if (!suggested.length) {
    return {
      eligible: false,
      deliverable: false,
      reason: 'out-of-range',
      message: `Sorry, delivery is not available to this address. The nearest branch is ${nearest.store.name.replace('Bing Chun - ', '')} (${roundKm(nearest.distanceKm)} km away). Please try Takeaway.`,
      nearestBranch: {
        id: nearest.store.id,
        name: nearest.store.name,
        distanceKm: roundKm(nearest.distanceKm),
      },
      suggestedBranches: allBranchOptions,
      distanceKm: roundKm(nearest.distanceKm),
    };
  }

  let selected = suggested[0];

  if (storeId) {
    const match = suggested.find((s: { store: { id: string } }) => s.store.id === storeId);
    if (!match) {
      const requested = ranked.find((r: { store: { id: string } }) => r.store.id === storeId);
      const dist = requested?.distanceKm ?? nearest.distanceKm;
      return {
        eligible: false,
        deliverable: false,
        reason: 'branch-cannot-serve',
        message: requested
          ? `${requested.store.name.replace('Bing Chun - ', '')} is ${roundKm(dist)} km away and cannot deliver to your location. Please choose one of the suggested branches.`
          : 'Selected branch cannot deliver to your location. Please choose a suggested branch.',
        nearestBranch: {
          id: nearest.store.id,
          name: nearest.store.name,
          distanceKm: roundKm(nearest.distanceKm),
        },
        suggestedBranches: allBranchOptions,
        distanceKm: roundKm(dist),
      };
    }
    selected = match;
  }

  const fee = computeDeliveryFee(selected.distanceKm);

  return {
    eligible: true,
    deliverable: true,
    store: {
      id: selected.store.id,
      name: selected.store.name,
      address: selected.store.addressLine,
      openTime: selected.store.openTime,
      closeTime: selected.store.closeTime,
      lat: selected.store.lat,
      lng: selected.store.lng,
    },
    zone: {
      id: DISTANCE_ZONE_ID,
      name: 'Distance-based delivery',
      fee,
      minOrder: DELIVERY_MIN_ORDER,
    },
    distanceKm: roundKm(selected.distanceKm),
    estimatedMinutes: estimateDurationMinutes(selected.distanceKm) + 15,
    suggestedBranches: allBranchOptions,
  };
}
