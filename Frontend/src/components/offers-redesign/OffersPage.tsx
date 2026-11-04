"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { homeFontVariables } from "@/components/home-redesign/fonts";
import { SiteFooter } from "@/components/home-redesign/layout/SiteFooter";
import { SiteHeader } from "@/components/home-redesign/layout/SiteHeader";
import { useCartHydrated } from "@/hooks/useCartHydrated";
import { selectFulfillmentOrActiveStoreId } from "@/hooks/useHomeOffers";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import type { PromoCode } from "@/types";
import { DealsExplorer } from "./DealsExplorer";
import { FeelingLucky } from "./FeelingLucky";
import { HowToSave } from "./HowToSave";
import { OffersHero, OffersTicker } from "./OffersHero";
import { OffersReveal, useRemeasureOnResize } from "./OffersReveal";
import { toPromotions } from "./promotion";
import "./offers.css";

/** How often the page checks for offer changes made in the admin panel while it's open. */
const REFRESH_MS = 60_000;

/**
 * The live offers for the customer's branch (all branches until they pick one), straight from the admin's
 * promotions: GET /promos already leaves out inactive, deleted, not-yet-started and expired ones and keeps the
 * admin's order. Shares its cache with the home page's offers. Refetched on every return to the tab and every
 * minute, so the admin's changes show without a reload.
 */
function useOffersPagePromos() {
  const cartHydrated = useCartHydrated();
  const storeId = useCartStore(selectFulfillmentOrActiveStoreId);
  return useQuery<PromoCode[]>({
    queryKey: ["promos", storeId ?? "all"],
    queryFn: () => api.get(`/promos${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`),
    // Wait for the saved cart, so the first request is already for the customer's branch.
    enabled: cartHydrated,
    staleTime: 30_000,
    // Every return to the tab checks again, however recent the last check.
    refetchOnWindowFocus: "always",
    refetchInterval: REFRESH_MS,
  });
}

/**
 * The Offers page (/promotions), in the redesign's look with its own header and footer like the home page (the
 * app shell steps aside for it): the hero and its ticker ribbons, Discover Your Deals (the admin's live offers,
 * filterable), the Feeling Lucky banner for Spin & Win (while the admin has the wheel on) and How to Save.
 */
export default function OffersPage() {
  const { data, status, refetch } = useOffersPagePromos();
  const promotions = useMemo(() => toPromotions(data ?? []), [data]);
  useRemeasureOnResize();

  return (
    <div className={`home-redesign ${homeFontVariables} relative flex min-h-dvh flex-col antialiased`}>
      <SiteHeader />
      <main className="flex-1">
        <OffersHero dealCount={status === "success" ? promotions.length : null} />
        <OffersTicker />
        <OffersReveal>
          <DealsExplorer promotions={promotions} status={status} onRetry={() => void refetch()} />
        </OffersReveal>
        {/* Outside the others' reveal: it arrives later, with the wheel's settings, and brings its own. */}
        <FeelingLucky />
        <OffersReveal>
          <HowToSave />
        </OffersReveal>
      </main>
      <SiteFooter />
    </div>
  );
}
