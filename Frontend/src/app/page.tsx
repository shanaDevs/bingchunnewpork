'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import ProductDrawer from '@/components/menu/ProductDrawer';
import { openOrderModal, ORDER_PROMPT_SKIP_KEY } from '@/components/order/SiteOrderPrompt';
import { homeFontVariables } from '@/components/home-redesign/fonts';
import { SiteFooter } from '@/components/home-redesign/layout/SiteFooter';
import { SiteHeader } from '@/components/home-redesign/layout/SiteHeader';
import {
  AppPromoSection,
  BrandStatementSection,
  HeroSection,
  OffersSection,
  SignatureDrinksSection,
} from '@/components/home-redesign/sections';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { api } from '@/lib/api';
import type { Product } from '@/types';
import { isProductInStock, sortProductsByStock } from '@/lib/productAvailability';

// Long enough for the hero entrance to finish before the order setup prompt appears.
const ORDER_MODAL_DELAY_MS = 3500;

export default function HomePage() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const cartHydrated = useCartHydrated();
  const activeStoreId = useCartStore(selectActiveStoreId);

  useEffect(() => {
    if (!cartHydrated) return;
    const state = useCartStore.getState();
    if (hasCompletedOrderSetup(state)) return;
    if (sessionStorage.getItem(ORDER_PROMPT_SKIP_KEY)) return;
    const timer = window.setTimeout(() => openOrderModal({ allowSkip: true }), ORDER_MODAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [cartHydrated]);

  const { data: popularProductsRaw = [] } = useQuery<Product[]>({
    queryKey: ['products', 'popular', activeStoreId],
    queryFn: () => {
      const params = new URLSearchParams({ tag: 'Popular' });
      if (activeStoreId) params.append('storeId', activeStoreId);
      return api.get(`/menu/products?${params.toString()}`);
    },
    enabled: cartHydrated,
  });

  const popularProducts = useMemo(
    () => sortProductsByStock(popularProductsRaw),
    [popularProductsRaw],
  );

  const handleProductSelect = useCallback((product: Product) => {
    if (!isProductInStock(product)) return;
    const cartState = useCartStore.getState();
    if (!hasCompletedOrderSetup(cartState)) {
      openOrderModal();
      return;
    }
    setSelectedProduct(product);
  }, []);

  const closeDrawer = useCallback(() => setSelectedProduct(null), []);

  return (
    <div className={`home-redesign ${homeFontVariables} relative flex min-h-dvh flex-col antialiased`}>
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <BrandStatementSection />
        <SignatureDrinksSection products={popularProducts} onOrder={handleProductSelect} />
        <OffersSection />
        <AppPromoSection />
      </main>
      <SiteFooter />

      <AnimatePresence>
        {selectedProduct && (
          <ProductDrawer product={selectedProduct} onClose={closeDrawer} />
        )}
      </AnimatePresence>
    </div>
  );
}
