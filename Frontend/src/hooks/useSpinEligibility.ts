'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { fetchSpinEligibility, isSpinUiHidden, SPIN_ELIGIBILITY_QUERY_KEY } from '@/lib/spinEligibility';
import { SPIN_LIVE_QUERY } from '@/lib/spinOffers';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';

/**
 * The server's answer to "may this visitor spin now?", with the admin's display settings. Shared (one cache entry)
 * with the pop-up, so it updates the moment a spin is used, and kept fresh (SPIN_LIVE_QUERY) so the admin's changes
 * show without a reload. Not fetched on pages the wheel never opens on.
 */
export function useSpinEligibility() {
  const pathname = usePathname();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  const hidden = isSpinUiHidden(pathname);

  const { data } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && !hidden,
    ...SPIN_LIVE_QUERY,
  });

  return { eligibility: authHydrated && !hidden ? data : undefined, isAuthenticated };
}
