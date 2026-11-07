"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import ProductDrawer from "@/components/menu/ProductDrawer";
import { openOrderModal } from "@/components/order/SiteOrderPrompt";
import { hasCompletedOrderSetup } from "@/lib/orderSetup";
import { isProductInStock } from "@/lib/productAvailability";
import { useCartStore } from "@/store/cartStore";
import type { Product } from "@/types";

/**
 * Ordering a live product from the account, as the menu does (MenuClient's handleProductSelect): until the customer
 * has chosen delivery or pickup, the order setup opens first; then the menu's own drawer (sizes, toppings, Add to
 * bag). `open` does nothing for a product the branch can't sell. Render `drawer` once: it goes to the end of the
 * page (a portal), so the account's animated, clipped cards can't trap the full-screen drawer inside them.
 */
export function useProductDrawer() {
  const [product, setProduct] = useState<Product | null>(null);

  const open = useCallback((next: Product) => {
    if (!isProductInStock(next)) return;
    if (!hasCompletedOrderSetup(useCartStore.getState())) {
      openOrderModal();
      return;
    }
    setProduct(next);
  }, []);

  const drawer = product ? createPortal(<ProductDrawer product={product} onClose={() => setProduct(null)} />, document.body) : null;
  return { open, drawer };
}
