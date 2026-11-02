import type { OrderSetupBranchRow } from '@/components/order-redesign/OrderSetupBranchList';
import type { MapBranch } from '@/components/order-redesign/OrderSetupBranchMap';
import { toMapLatLng } from '@/lib/storeCoordinates';
import { isBranchManuallyClosed } from '@/lib/storeOrderingHours';
import type { DeliveryBranchOption, Store as StoreType } from '@/types';

export const TAKEAWAY_MAX_KM = 7;
export const DEFAULT_OPEN_TIME = '09:00';
export const DEFAULT_CLOSE_TIME = '23:00';

export function isDeliveryBranchOrderable(branch: DeliveryBranchOption): boolean {
  return branch.suggested && !branch.branchClosed;
}

export function orderingFieldsFromStore(store: {
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number | null;
  branchClosedAt?: string | null;
}) {
  return {
    openTime: store.openTime ?? DEFAULT_OPEN_TIME,
    closeTime: store.closeTime ?? DEFAULT_CLOSE_TIME,
    onlineOrderStartTime: store.onlineOrderStartTime,
    onlineOrderStopTime: store.onlineOrderStopTime,
    pickupCutoffMinutes: store.pickupCutoffMinutes ?? undefined,
    branchClosedAt: store.branchClosedAt,
  };
}

export function storeMatchesPickupSearch(store: StoreType, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    store.name.toLowerCase().includes(q) ||
    store.city.toLowerCase().includes(q) ||
    store.district.toLowerCase().includes(q) ||
    store.addressLine.toLowerCase().includes(q)
  );
}

export function buildPickupBranchRows(
  pickupStoresList: StoreType[],
  branchSearchQuery: string,
  pickupCoords: { lat: number; lng: number } | null,
): OrderSetupBranchRow[] {
  const rows: OrderSetupBranchRow[] = [];
  pickupStoresList.forEach((store, index) => {
    const point = toMapLatLng(store.lat, store.lng);
    if (!point) return;
    const closed = isBranchManuallyClosed(store);
    rows.push({
      id: store.id,
      name: store.name,
      location: point,
      distanceKm: store.distanceKm ?? undefined,
      disabled: closed,
      disabledReason: closed ? 'Closed' : undefined,
      badge:
        pickupCoords && !branchSearchQuery && index === 0 && store.distanceKm != null
          ? 'Nearest'
          : undefined,
    });
  });
  return rows;
}

export function buildDeliveryBranchRows(
  suggestedDeliveryBranches: DeliveryBranchOption[],
): OrderSetupBranchRow[] {
  return suggestedDeliveryBranches.map((branch, index) => {
    const point = toMapLatLng(branch.lat, branch.lng);
    const location = point ?? { lat: branch.lat, lng: branch.lng };
    const orderable = isDeliveryBranchOrderable(branch);
    return {
      id: branch.id,
      name: branch.name,
      location,
      distanceKm: branch.distanceKm,
      disabled: !orderable,
      disabledReason: branch.branchClosed ? 'Closed' : undefined,
      badge: index === 0 ? 'Nearest' : undefined,
    };
  });
}

export function branchRowsToMapBranches(rows: OrderSetupBranchRow[]): MapBranch[] {
  return rows.map(({ id, name, location }) => ({ id, name, location }));
}

export function selectableBranchIds(rows: OrderSetupBranchRow[]): Set<string> {
  return new Set(rows.filter((b) => !b.disabled).map((b) => b.id));
}

export function branchRowsToLatLngMarkers(rows: OrderSetupBranchRow[]) {
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    lat: b.location.lat,
    lng: b.location.lng,
  }));
}
