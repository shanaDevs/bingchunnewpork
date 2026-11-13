import { useCartStore } from '@/store/cartStore';

export const BRANCH_OPERATING_EVENT = 'branch:operating';

export type BranchOperatingPayload = {
  storeId: string;
  branchClosedAt?: string | null;
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
};

type FulfillmentOperating = {
  storeId: string;
  openTime: string;
  closeTime: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
  branchClosedAt?: string | null;
};

export function sameBranchClosedAt(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? null) === (b ?? null);
}

function sameOptionalText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

function closedAtIso(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  return typeof value === 'string' ? value : value.toISOString();
}

/** Patch operating fields for the matching store. Fees, address, and cart lines stay untouched. */
export function patchFulfillmentOperating<T extends FulfillmentOperating>(
  info: T | null,
  patch: BranchOperatingPayload,
): T | null {
  if (!info || info.storeId !== patch.storeId) return info;

  const next: T = { ...info };
  let changed = false;

  if (patch.branchClosedAt !== undefined && !sameBranchClosedAt(info.branchClosedAt, patch.branchClosedAt)) {
    next.branchClosedAt = patch.branchClosedAt;
    changed = true;
  }
  if (patch.openTime !== undefined && info.openTime !== patch.openTime) {
    next.openTime = patch.openTime;
    changed = true;
  }
  if (patch.closeTime !== undefined && info.closeTime !== patch.closeTime) {
    next.closeTime = patch.closeTime;
    changed = true;
  }
  if (
    patch.onlineOrderStartTime !== undefined &&
    !sameOptionalText(info.onlineOrderStartTime, patch.onlineOrderStartTime)
  ) {
    next.onlineOrderStartTime = patch.onlineOrderStartTime;
    changed = true;
  }
  if (
    patch.onlineOrderStopTime !== undefined &&
    !sameOptionalText(info.onlineOrderStopTime, patch.onlineOrderStopTime)
  ) {
    next.onlineOrderStopTime = patch.onlineOrderStopTime;
    changed = true;
  }
  if (
    patch.pickupCutoffMinutes !== undefined &&
    info.pickupCutoffMinutes !== patch.pickupCutoffMinutes
  ) {
    next.pickupCutoffMinutes = patch.pickupCutoffMinutes;
    changed = true;
  }

  return changed ? next : info;
}

export function patchFulfillmentBranchClosedAt<T extends FulfillmentOperating>(
  info: T | null,
  storeId: string,
  branchClosedAt: string | null,
): T | null {
  return patchFulfillmentOperating(info, { storeId, branchClosedAt });
}

export function operatingPatchFromStore(store: {
  id: string;
  branchClosedAt?: string | Date | null;
  openTime?: string;
  closeTime?: string;
  onlineOrderStartTime?: string | null;
  onlineOrderStopTime?: string | null;
  pickupCutoffMinutes?: number;
}): BranchOperatingPayload {
  return {
    storeId: store.id,
    branchClosedAt: closedAtIso(store.branchClosedAt),
    openTime: store.openTime,
    closeTime: store.closeTime,
    onlineOrderStartTime: store.onlineOrderStartTime ?? null,
    onlineOrderStopTime: store.onlineOrderStopTime ?? null,
    pickupCutoffMinutes: store.pickupCutoffMinutes,
  };
}

export function applyBranchOperatingToCart(patch: BranchOperatingPayload): boolean {
  if (!patch.storeId) return false;
  const state = useCartStore.getState();
  const deliveryInfo = patchFulfillmentOperating(state.deliveryInfo, patch);
  const takeawayInfo = patchFulfillmentOperating(state.takeawayInfo, patch);
  if (deliveryInfo === state.deliveryInfo && takeawayInfo === state.takeawayInfo) return false;
  useCartStore.setState({ deliveryInfo, takeawayInfo });
  return true;
}
