import { describe, expect, it } from 'vitest';
import { compareAutoApplyOffers } from '../../src/lib/promotionAutoApply';

describe('compareAutoApplyOffers', () => {
  it('ranks BOGO above free delivery and percentage discounts', () => {
    const ranked = [
      { code: 'FREEDEL', promotionKind: 'FREE_DELIVERY', freeDelivery: true, discount: 0 },
      { code: 'SAVE20', promotionKind: 'PERCENTAGE_DISCOUNT', discount: 500 },
      { code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 },
    ].sort(compareAutoApplyOffers);

    expect(ranked[0]?.code).toBe('TESTOFFER');
  });

  it('keeps loyalty campaign offers ahead of BOGO', () => {
    const ranked = [
      { code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 },
      { code: 'LOYALTY-OFFER2', promotionKind: 'LOYALTY_OFFER_2_GIFT', discount: 0, loyaltyOffer: true },
    ].sort(compareAutoApplyOffers);

    expect(ranked[0]?.code).toBe('LOYALTY-OFFER2');
  });
});
