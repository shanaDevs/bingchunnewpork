"use client";

import { useQuery } from "@tanstack/react-query";
import { useCartHydrated } from "@/hooks/useCartHydrated";
import { selectFulfillmentOrActiveStoreId } from "@/hooks/useHomeOffers";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import type { DailySpecial, Product, PromoCode } from "@/types";

/**
 * Overview menu/offers. Prefer focus refetch over aggressive polling — the full product catalog
 * is heavy, and admins rarely change it mid-session.
 */
const live = {
  staleTime: 5 * 60_000,
  refetchInterval: 5 * 60_000,
  refetchOnWindowFocus: true as const,
};

/** The menu for the customer's branch (all products until they pick one), with each product's stock there. */
export function useLiveMenu() {
  const cartHydrated = useCartHydrated();
  const storeId = useCartStore(selectFulfillmentOrActiveStoreId);
  return useQuery<Product[]>({
    queryKey: ["account-live-menu", storeId ?? "all"],
    queryFn: () => api.get(`/menu/products?sort=popular${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ""}`),
    enabled: cartHydrated,
    ...live,
  });
}

/** The admin's Daily Special running now (GET /menu/specials/today), or null; shares the menu page's cache. */
export function useTodaySpecial() {
  return useQuery<DailySpecial | null>({
    queryKey: ["menu-special-today"],
    queryFn: () => api.get("/menu/specials/today"),
    ...live,
  });
}

/**
 * The admin's live offers for the customer's branch (GET /promos leaves out inactive, not-yet-started and expired
 * ones), with the same key and request as the Offers page, so the two share one cache.
 */
export function useLivePromos() {
  const cartHydrated = useCartHydrated();
  const storeId = useCartStore(selectFulfillmentOrActiveStoreId);
  return useQuery<PromoCode[]>({
    queryKey: ["promos", storeId ?? "all"],
    queryFn: () => api.get(`/promos${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`),
    enabled: cartHydrated,
    ...live,
  });
}
