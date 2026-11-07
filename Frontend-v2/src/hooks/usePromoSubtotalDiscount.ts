'use client';

import { useEffect } from 'react';
import { isFreeProductPromoKind } from '@/lib/promotionAutoApply';
import { rewardDiscountForSubtotal } from '@/lib/promoSubtotalDiscount';
import { usePromoStore } from '@/store/promoStore';

/** Percentage promos only — BOGO/BXGY discounts come from cart evaluation, not discountValue. */
export function shouldSyncRewardDiscountWithSubtotal(reward: {
  freeDelivery: boolean;
  promotionKind?: string | null;
  discountType?: string | null;
}): boolean {
  if (reward.freeDelivery) return false;
  if (isFreeProductPromoKind(reward.promotionKind)) return false;
  return (reward.discountType || '').toUpperCase() === 'PERCENTAGE';
}

/** Keep an applied percentage offer in sync with the current item subtotal. */
export function usePromoSubtotalDiscount(subtotal: number) {
  const reward = usePromoStore((s) => s.reward);
  const setReward = usePromoStore((s) => s.setReward);

  useEffect(() => {
    if (!reward || !shouldSyncRewardDiscountWithSubtotal(reward)) return;
    const next = rewardDiscountForSubtotal(reward, subtotal);
    if (next === reward.discount) return;
    setReward({ ...reward, discount: next });
  }, [reward, subtotal, setReward]);
}
