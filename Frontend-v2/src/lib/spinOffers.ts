import { api } from '@/lib/api';
import type { SpinOffer } from '@/lib/spinStorage';

export type PublicSpinOffersResponse = {
  enabled: boolean;
  offers: SpinOffer[];
};

export const SPIN_OFFERS_QUERY_KEY = ['spin-offers'] as const;

/** How often an open page asks again for the admin's spin prizes and rules, while the tab is in view. */
export const SPIN_REFRESH_MS = 30_000;

/**
 * Refresh options for every spin query (prizes and eligibility), so the admin's changes reach open pages without a
 * reload: at once when the customer comes back to the tab, and every SPIN_REFRESH_MS while they're on it (not in
 * background tabs). A wheel that is spinning or showing its result keeps its slices (SpinWheelModal).
 */
export const SPIN_LIVE_QUERY = {
  staleTime: 15_000,
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchInterval: SPIN_REFRESH_MS,
} as const;

export async function fetchSpinOffers(storeId?: string | null): Promise<PublicSpinOffersResponse> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return api.get<PublicSpinOffersResponse>(`/spin/offers${qs}`);
}
