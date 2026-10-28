/** Prefer importing from `@bingchun/delivery-domain` for new code. */
import { prisma } from './prisma';
import { haversineKm } from '../utils/geo';
import { mapsAdapter } from '../integrations/mapsAdapter';
import {
  fetchActiveStoreBranchCloseState,
  fetchBranchClosedAtByStoreIds,
  fetchOrderingHoursMap,
} from './storeOrderingSchema';
import { branchManuallyClosedMessage, isBranchManuallyClosed } from './storeOrderingHours';

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
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  distanceKm: number;
  fee: number;
  suggested: boolean;
  /** Branch admin closed the outlet — show in list but not orderable. */
  branchClosed: boolean;
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
    onlineOrderStartTime?: string | null;
    onlineOrderStopTime?: string | null;
    pickupCutoffMinutes?: number;
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

function toBranchOption(
  store: {
    id: string;
    name: string;
    addressLine: string;
    lat: number;
    lng: number;
    openTime: string;
    closeTime: string;
    onlineOrderStartTime?: string | null;
    onlineOrderStopTime?: string | null;
    pickupCutoffMinutes?: number | null;
  },
  distanceKm: number,
  suggested: boolean,
  branchClosed: boolean,
): DeliveryBranchOption {
  return {
    id: store.id,
    name: store.name,
    addressLine: store.addressLine,
    lat: store.lat,
    lng: store.lng,
    openTime: store.openTime,
    closeTime: store.closeTime,
    onlineOrderStartTime: store.onlineOrderStartTime,
    onlineOrderStopTime: store.onlineOrderStopTime,
    pickupCutoffMinutes: store.pickupCutoffMinutes ?? undefined,
    distanceKm: roundKm(distanceKm),
    fee: computeDeliveryFee(distanceKm),
    suggested,
    branchClosed,
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
  const storeIds = stores.map((s) => s.id);
  const orderingByStore = await fetchOrderingHoursMap(storeIds);
  const branchClosedAtByStore = await fetchBranchClosedAtByStoreIds(storeIds);
  const storesWithHours = stores.map((store) => ({
    ...store,
    ...(orderingByStore.get(store.id) ?? {}),
    branchClosedAt: branchClosedAtByStore.get(store.id) ?? null,
  }));

  if (!storesWithHours.length) {
    return {
      eligible: false,
      deliverable: false,
      reason: 'out-of-range',
      message: 'Sorry, no delivery branches are available right now. Please try Takeaway.',
    };
  }

  const ranked = storesWithHours
    .map((store) => ({
      store,
      distanceKm: haversineKm(userLat, userLng, store.lat, store.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];
  const withinRange = ranked.filter((r) => r.distanceKm <= DELIVERY_MAX_KM);
  const displayBranches = withinRange.slice(0, 2);
  const displayIds = new Set(displayBranches.map((s) => s.store.id));
  const openWithinRange = withinRange.filter((r) => !isBranchManuallyClosed(r.store));

  const allBranchOptions = ranked.map(({ store, distanceKm }) =>
    toBranchOption(
      store,
      distanceKm,
      displayIds.has(store.id),
      isBranchManuallyClosed(store),
    ),
  );

  if (!withinRange.length) {
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

  if (!openWithinRange.length) {
    return {
      eligible: false,
      deliverable: false,
      reason: 'branch-cannot-serve',
      message: branchManuallyClosedMessage(),
      nearestBranch: {
        id: nearest.store.id,
        name: nearest.store.name,
        distanceKm: roundKm(nearest.distanceKm),
      },
      suggestedBranches: allBranchOptions,
      distanceKm: roundKm(withinRange[0]?.distanceKm ?? nearest.distanceKm),
    };
  }

  let selected = openWithinRange[0];

  if (storeId) {
    const closedRequested = await fetchActiveStoreBranchCloseState(storeId);
    if (closedRequested && isBranchManuallyClosed(closedRequested)) {
      return {
        eligible: false,
        deliverable: false,
        reason: 'branch-cannot-serve',
        message: branchManuallyClosedMessage(),
        suggestedBranches: allBranchOptions,
      };
    }

    const match = openWithinRange.find((s) => s.store.id === storeId);
    if (!match) {
      const requested = ranked.find((r) => r.store.id === storeId);
      const dist = requested?.distanceKm ?? nearest.distanceKm;
      if (requested && isBranchManuallyClosed(requested.store)) {
        return {
          eligible: false,
          deliverable: false,
          reason: 'branch-cannot-serve',
          message: branchManuallyClosedMessage(),
          suggestedBranches: allBranchOptions,
          distanceKm: roundKm(dist),
        };
      }
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

  const eta = await mapsAdapter.getDistance(
    { lat: selected.store.lat, lng: selected.store.lng },
    { lat: userLat, lng: userLng },
  );

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
      onlineOrderStartTime: selected.store.onlineOrderStartTime,
      onlineOrderStopTime: selected.store.onlineOrderStopTime,
      pickupCutoffMinutes: selected.store.pickupCutoffMinutes,
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
    estimatedMinutes: eta.durationMinutes + 15,
    suggestedBranches: allBranchOptions,
  };
}
