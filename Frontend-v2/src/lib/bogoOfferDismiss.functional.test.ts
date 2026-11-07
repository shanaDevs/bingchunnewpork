import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pickAutoApplyCandidate,
  pickFreeProductAutoApply,
  pickLoyaltyCampaignAutoApply,
  type EligiblePromoOffer,
} from './promotionAutoApply';
import { rewardFromEligibleOffer, usePromoStore } from '@/store/promoStore';

function offer(partial: Partial<EligiblePromoOffer> & Pick<EligiblePromoOffer, 'code'>): EligiblePromoOffer {
  return {
    title: partial.code,
    description: null,
    discount: 450,
    freeDelivery: false,
    autoApply: true,
    hideCode: true,
    label: partial.code,
    promotionKind: 'BOGO',
    giftProduct: { id: 'milk-tea', name: 'Milk Tea', basePrice: 450, imageUrl: null },
    ...partial,
  };
}

/** Same candidate order as PromoOffersPanel auto-apply effect. */
function pickPanelCandidate(
  pool: EligiblePromoOffer[],
  opts: { dismissedCodes: string[]; isAuthenticated: boolean; skipAutoApply: boolean },
) {
  return (
    pickLoyaltyCampaignAutoApply(pool, opts) ??
    pickFreeProductAutoApply(pool, opts) ??
    (opts.skipAutoApply
      ? null
      : pickAutoApplyCandidate(pool, opts))
  );
}

describe('B1G1 cart dismiss functional flow', () => {
  const bogo = offer({ code: 'TESTOFFER' });

  beforeEach(() => {
    usePromoStore.setState({
      reward: null,
      skipAutoApply: false,
      dismissedCodes: [],
      parkedRewards: [],
    });
  });

  afterEach(() => {
    usePromoStore.setState({
      reward: null,
      skipAutoApply: false,
      dismissedCodes: [],
      parkedRewards: [],
    });
  });

  it('auto-applies B1G1, then keeps it off after the shopper toggles the offer', () => {
    const applied = rewardFromEligibleOffer(bogo, 'auto');
    usePromoStore.getState().setReward(applied);
    expect(usePromoStore.getState().reward?.code).toBe('TESTOFFER');
    expect(usePromoStore.getState().reward?.locked).toBe(true);

    usePromoStore.getState().dismissReward();
    const { reward, skipAutoApply, dismissedCodes, parkedRewards } = usePromoStore.getState();

    expect(reward).toBeNull();
    expect(skipAutoApply).toBe(true);
    expect(dismissedCodes).toContain('TESTOFFER');
    expect(parkedRewards.some((item) => item.code.toUpperCase() === 'TESTOFFER')).toBe(true);

    const reapply = pickPanelCandidate([bogo], {
      dismissedCodes,
      isAuthenticated: true,
      skipAutoApply,
    });
    expect(reapply).toBeNull();
  });

  it('still auto-applies B1G1 after a quiet clear that does not dismiss the code', () => {
    const applied = rewardFromEligibleOffer(bogo, 'auto');
    usePromoStore.getState().setReward(applied);
    usePromoStore.getState().clearReward();

    const { reward, skipAutoApply, dismissedCodes } = usePromoStore.getState();
    expect(reward).toBeNull();
    expect(skipAutoApply).toBe(false);
    expect(dismissedCodes).not.toContain('TESTOFFER');

    const reapply = pickPanelCandidate([bogo], {
      dismissedCodes,
      isAuthenticated: true,
      skipAutoApply,
    });
    expect(reapply?.code).toBe('TESTOFFER');
  });

  it('does not cart-boost a dismissed B1G1 while the qualifying product stays in the cup', () => {
    usePromoStore.getState().setReward(rewardFromEligibleOffer(bogo, 'auto'));
    usePromoStore.getState().dismissReward();

    const boostOffer = pickFreeProductAutoApply([bogo], {
      dismissedCodes: usePromoStore.getState().dismissedCodes,
      isAuthenticated: true,
    });
    expect(boostOffer).toBeNull();
  });
});
