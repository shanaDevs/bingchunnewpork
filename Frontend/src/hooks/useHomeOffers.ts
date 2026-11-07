'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PromoCode } from '@/types';
import { mapPromosToHomeOffers } from '@/components/home/homeOffers';
import { useCartStore, type OrderMode } from '@/store/cartStore';

/** The branch whose offers to show: the cart's single fulfillment branch, else the chosen order branch. */
export function selectFulfillmentOrActiveStoreId(s: {
  orderMode: OrderMode | null;
  deliveryInfo: { storeId?: string } | null;
  takeawayInfo: { storeId?: string } | null;
  items: Array<{ fulfillmentStore?: { id?: string } | null }>;
}): string | null {
  const fulfillmentIds = [
    ...new Set(
      s.items.map((i) => i.fulfillmentStore?.id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (fulfillmentIds.length === 1) return fulfillmentIds[0];
  if (s.orderMode === 'DELIVERY') return s.deliveryInfo?.storeId ?? null;
  if (s.orderMode === 'TAKEAWAY') return s.takeawayInfo?.storeId ?? null;
  return s.deliveryInfo?.storeId ?? s.takeawayInfo?.storeId ?? null;
}

export function useHomeOffers() {
  const storeId = useCartStore((s) => selectFulfillmentOrActiveStoreId(s));

  const { data: promos = [], isPending, isFetching } = useQuery<PromoCode[]>({
    queryKey: ['promos', storeId ?? 'all'],
    queryFn: () =>
      api.get(`/promos${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`),
  });

  const offers = useMemo(() => {
    const homePromos = [...promos]
      .filter((promo) => promo.showOnHome !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return mapPromosToHomeOffers(homePromos);
  }, [promos]);

  return {
    offers,
    isPending,
    isFetching,
  };
}
