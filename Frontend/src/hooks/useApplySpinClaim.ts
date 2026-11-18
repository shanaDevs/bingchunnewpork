'use client';

import { useEffect } from 'react';
import { rewardFromSpinClaim } from '@/lib/spinClaim';
import { usePromoStore } from '@/store/promoStore';
import { useSpinStore } from '@/store/spinStore';

/** Hydrate a won spin prize into the cup / checkout promo slot. */
export function useApplySpinClaim(
  orderTotal: number,
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null,
) {
  const { claim, hydrate } = useSpinStore();
  const reward = usePromoStore((s) => s.reward);
  const setReward = usePromoStore((s) => s.setReward);
  const clearReward = usePromoStore((s) => s.clearReward);
  const skipAutoApply = usePromoStore((s) => s.skipAutoApply);
  const dismissedCodes = usePromoStore((s) => s.dismissedCodes);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!claim?.claimCode) return;

    // Free delivery has no value on pickup — don't apply (and clear if already on the cup).
    if (orderMode === 'TAKEAWAY' && claim.offer.offerType === 'FREE_DELIVERY') {
      if (reward?.source === 'spin' && reward.code.toUpperCase() === claim.claimCode.toUpperCase()) {
        clearReward();
      }
      return;
    }

    const next = rewardFromSpinClaim(claim, orderTotal, orderMode);
    const spinCode = next.code.toUpperCase();
    if (skipAutoApply || dismissedCodes.includes(spinCode)) return;
    if (reward?.locked && reward.source !== 'spin') return;

    const sameSpin =
      reward?.source === 'spin' && reward.code.toUpperCase() === spinCode;

    if (sameSpin) {
      if (
        reward.discount !== next.discount ||
        reward.freeDelivery !== next.freeDelivery ||
        reward.giftLabel !== next.giftLabel ||
        reward.giftProduct?.id !== next.giftProduct?.id ||
        reward.giftProduct?.imageUrl !== next.giftProduct?.imageUrl
      ) {
        setReward(next);
      }
      return;
    }

    if (reward && reward.source !== 'spin') return;
    setReward(next);
  }, [claim, orderTotal, orderMode, reward, setReward, clearReward, skipAutoApply, dismissedCodes]);
}
