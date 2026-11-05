"use client";

import { useAuthHydrated } from "@/hooks/useAuthHydrated";
import { useCartHydrated } from "@/hooks/useCartHydrated";
import { hasCompletedOrderSetup } from "@/lib/orderSetup";
import { useAuthStore } from "@/store/authStore";
import { selectActiveStoreName, useCartStore } from "@/store/cartStore";

const shortStoreName = (name: string) => name.replace(/^Bing Chun\s*[-–—]\s*/i, "").trim() || name;

/**
 * Live values for the home header's account, cart and store controls.
 * Until the persisted stores hydrate, it reports the logged-out, empty-cart, no-store state, so the
 * server render and the first client render match.
 */
export function useHeaderState() {
  const cartHydrated = useCartHydrated();
  const authHydrated = useAuthHydrated();
  const itemCount = useCartStore((s) => s.itemCount());
  const orderMode = useCartStore((s) => s.orderMode);
  const deliveryInfo = useCartStore((s) => s.deliveryInfo);
  const takeawayInfo = useCartStore((s) => s.takeawayInfo);
  const storeName = useCartStore(selectActiveStoreName);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const hasSetup = cartHydrated && hasCompletedOrderSetup({ orderMode, deliveryInfo, takeawayInfo });

  return {
    accountHref: authHydrated && isAuthenticated ? "/account" : "/account/login",
    cartCount: cartHydrated ? itemCount : 0,
    storeKicker: !hasSetup ? "Order from" : orderMode === "DELIVERY" ? "Delivering from" : "Pickup from",
    storeLabel: hasSetup && storeName ? shortStoreName(storeName) : "Choose a store",
  };
}
