import { describe, expect, it } from 'vitest';
import { showsFreeProductSummaryLine } from './promoFreeProduct';
import type { AppliedPromoReward } from '@/store/promoStore';

const loyaltyGiftReward: AppliedPromoReward = {
  code: 'LOYALTY-OFFER2',
  discount: 0,
  freeDelivery: false,
  giftLabel: 'Free Vanilla Ice Cream',
  giftProduct: {
    id: 'ice-cream-1',
    name: 'Vanilla Ice Cream',
    basePrice: 200,
    imageUrl: null,
  },
  label: 'Free Vanilla Ice Cream',
  promotionKind: 'LOYALTY_OFFER_2_GIFT',
  discountType: 'FIXED',
  discountValue: 0,
  locked: true,
  hideCode: true,
  source: 'auto',
};

describe('showsFreeProductSummaryLine', () => {
  it('shows summary for loyalty gift with zero cart discount', () => {
    expect(showsFreeProductSummaryLine(loyaltyGiftReward, [])).toBe(true);
  });
});
