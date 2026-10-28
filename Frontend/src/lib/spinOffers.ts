import { api } from '@/lib/api';
import type { SpinOffer } from '@/lib/spinStorage';

export type PublicSpinOffersResponse = {
  enabled: boolean;
  offers: SpinOffer[];
};

export const SPIN_OFFERS_QUERY_KEY = ['spin-offers'] as const;

export async function fetchSpinOffers(storeId?: string | null): Promise<PublicSpinOffersResponse> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  return api.get<PublicSpinOffersResponse>(`/spin/offers${qs}`);
}
