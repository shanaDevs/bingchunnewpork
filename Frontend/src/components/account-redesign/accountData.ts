"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthHydrated } from "@/hooks/useAuthHydrated";
import { api } from "@/lib/api";
import type { LoyaltySummary } from "@/lib/loyalty";
import { rememberOrderTrackToken } from "@/lib/orderTrackSession";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import type { Address, Order, OrderStatus, User } from "@/types";

/**
 * The account pages' data from the backend, with the same query keys as the rest of the app, so a change made
 * elsewhere (an order placed, an address saved) shows here too.
 */

/** Orders still under way. Takeaway ones end at READY (collected at the counter), so READY counts as under way. */
export const ACTIVE_STATUSES: OrderStatus[] = ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

const useSignedIn = () => {
  const hydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return hydrated && isAuthenticated;
};

/** The signed-in customer's profile (GET /auth/me), kept in step with authStore's copy (the header and checkout read that one). */
export function useMe() {
  const signedIn = useSignedIn();
  const updateUser = useAuthStore((s) => s.updateUser);
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<User>("/auth/me", true),
    enabled: signedIn,
  });
  useEffect(() => {
    if (query.data) updateUser(query.data);
  }, [query.data, updateUser]);
  return query;
}

/** Branch ids may be UUIDs or legacy slugs (`store-bing-chun---moratuwa`); skip empty / junk values. */
function loyaltyStoreQuery(storeId: string | null | undefined): string {
  const id = storeId?.trim();
  if (!id || id === "undefined" || id === "null") return "";
  return `?storeId=${encodeURIComponent(id)}`;
}

/** Points, membership levels, journey and history (GET /loyalty/summary), for the branch the cart is ordering from, as on the old rewards page. */
export function useLoyaltySummary() {
  const signedIn = useSignedIn();
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  return useQuery<LoyaltySummary>({
    queryKey: ["loyalty-summary", storeId ?? ""],
    queryFn: () => api.get(`/loyalty/summary${loyaltyStoreQuery(storeId)}`, true),
    enabled: signedIn,
    staleTime: 30_000,
    retry: 1,
  });
}

/** The customer's latest orders (GET /orders/my), newest first; checked again every 30 seconds while one is under way. */
export function useMyOrders() {
  const signedIn = useSignedIn();
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery<Order[]>({
    queryKey: ["my-orders", userId],
    queryFn: async () => {
      const result = await api.get<Order[]>("/orders/my?limit=50", true);
      const orders = Array.isArray(result) ? result : [];
      for (const order of orders) {
        if (order.orderNumber && order.trackToken) {
          rememberOrderTrackToken(order.orderNumber, order.trackToken);
        }
      }
      return orders;
    },
    enabled: signedIn,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.some((order) => ACTIVE_STATUSES.includes(order.status)) ? 30_000 : false),
  });
}

/** The customer's saved delivery addresses (GET /addresses). */
export function useAddresses() {
  const signedIn = useSignedIn();
  return useQuery<Address[]>({
    queryKey: ["addresses"],
    queryFn: async () => {
      const result = await api.get<Address[]>("/addresses", true);
      return Array.isArray(result) ? result : [];
    },
    enabled: signedIn,
  });
}
