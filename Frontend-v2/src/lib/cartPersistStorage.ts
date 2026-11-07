import type { StateStorage } from 'zustand/middleware';

const CART_STORAGE_BASE = 'bc-cart';

let activeUserId: string | null = null;

export function setCartStorageUser(userId: string | null) {
  activeUserId = userId;
}

export function getCartStorageUser(): string | null {
  return activeUserId;
}

function storageKey(base: string): string {
  return activeUserId ? `${base}-user-${activeUserId}` : `${base}-guest`;
}

export const cartPersistStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(storageKey(name));
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey(name), value);
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(storageKey(name));
  },
};

export function clearGuestCartStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${CART_STORAGE_BASE}-guest`);
}

type CartPersistContext = {
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null;
  deliveryInfo: unknown;
  takeawayInfo: unknown;
  scheduledAt: string | null;
  reservationUuid?: string | null;
  reservationExpiresAt?: string | null;
};

/** Synchronously clear cart items + reservation in localStorage (survives payment redirect). */
export function persistClearedCartItems(keep: CartPersistContext) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    storageKey(CART_STORAGE_BASE),
    JSON.stringify({
      state: {
        items: [],
        orderMode: keep.orderMode,
        deliveryInfo: keep.deliveryInfo,
        takeawayInfo: keep.takeawayInfo,
        scheduledAt: keep.scheduledAt,
        reservationUuid: keep.reservationUuid ?? null,
        reservationExpiresAt: keep.reservationExpiresAt ?? null,
      },
      version: 0,
    }),
  );
}

/** @deprecated use persistClearedCartItems — kept for any external callers */
export function persistEmptyCart() {
  persistClearedCartItems({
    orderMode: null,
    deliveryInfo: null,
    takeawayInfo: null,
    scheduledAt: null,
  });
  clearGuestCartStorage();
}
