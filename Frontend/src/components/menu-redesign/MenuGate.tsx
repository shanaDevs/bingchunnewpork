'use client';

import { useEffect } from 'react';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { useCartHydrated } from '@/hooks/useCartHydrated';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { useCartStore } from '@/store/cartStore';
import { MenuHero } from '@/components/menu-redesign/MenuHero';
import { MenuListing } from '@/components/menu-redesign/MenuListing';

export function MenuGate() {
  const cartHydrated = useCartHydrated();
  const setupComplete = useCartStore((s) => hasCompletedOrderSetup(s));

  useEffect(() => {
    if (!cartHydrated) return;
    const state = useCartStore.getState();
    if (hasCompletedOrderSetup(state)) return;
    openOrderModal({ required: true });
  }, [cartHydrated]);

  return (
    <>
      <MenuHero ready={setupComplete} />
      {setupComplete && cartHydrated ? <MenuListing /> : null}
    </>
  );
}
