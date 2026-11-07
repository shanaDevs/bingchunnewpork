'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { openOrderModal, ORDER_PROMPT_SKIP_KEY } from '@/components/order/SiteOrderPrompt';
import { homeFontVariables } from '@/components/home-redesign/fonts';
import { BottomNav } from '@/components/home-redesign/layout/BottomNav';
import { SiteHeader } from '@/components/home-redesign/layout/SiteHeader';
import {
  BrandStatementSection,
  HeroSection,
} from '@/components/home-redesign/sections';
import { selectActiveStoreId, useCartStore } from '@/store/cartStore';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { api } from '@/lib/api';
import type { Product } from '@/types';
import { isProductInStock, sortProductsByStock } from '@/lib/productAvailability';

const SignatureDrinksSection = dynamic(
  () =>
    import('@/components/home-redesign/sections/signature-drinks/SignatureDrinksSection').then(
      (m) => m.SignatureDrinksSection,
    ),
  {
    loading: () => (
      <div
        aria-hidden
        className="min-h-[28rem] bg-white sm:min-h-[32rem]"
      />
    ),
  },
);

const OffersSection = dynamic(
  () =>
    import('@/components/home-redesign/sections/offers/OffersSection').then((m) => m.OffersSection),
  {
    loading: () => (
      <div
        aria-busy="true"
        aria-label="Loading offers"
        className="min-h-[28rem] bg-white pt-4 pb-24 sm:min-h-[32rem]"
      >
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[18rem] rounded-[1.75rem] bg-slate-100 animate-pulse ring-1 ring-slate-200/80"
            />
          ))}
        </div>
      </div>
    ),
  },
);

const AppPromoSection = dynamic(
  () =>
    import('@/components/home-redesign/sections/app-promo/AppPromoSection').then(
      (m) => m.AppPromoSection,
    ),
  {
    loading: () => <div aria-hidden className="min-h-[36rem] bg-brand-50 sm:min-h-[40rem]" />,
  },
);

const SiteFooter = dynamic(
  () =>
    import('@/components/home-redesign/layout/SiteFooter').then((m) => m.SiteFooter),
  {
    loading: () => <div aria-hidden className="min-h-[16rem] bg-brand-950" />,
  },
);

const ProductDrawer = dynamic(() => import('@/components/menu/ProductDrawer'), {
  ssr: false,
  loading: () => null,
});

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
      <BottomNav />

      <AnimatePresence>
        {selectedProduct && (
          <ProductDrawer product={selectedProduct} onClose={closeDrawer} />
        )}
      </AnimatePresence>
    </div>
  );
}
