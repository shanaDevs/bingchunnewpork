import { describe, expect, it } from 'vitest';
import { rewardDiscountForSubtotal } from './promoSubtotalDiscount';
import type { AppliedPromoReward } from '@/store/promoStore';

const bogoReward: AppliedPromoReward = {
  code: 'TESTOFFER',
  discount: 450,
  freeDelivery: false,
  giftLabel: 'Free Blueberry Bobo Tea',
  giftProduct: {
    id: 'prod-blueberry',
    name: 'Blueberry Bobo Tea',
    basePrice: 450,
  },
  label: 'test offer',
  promotionKind: 'BOGO',
  discountType: 'FIXED',
  discountValue: 1,
  locked: true,
  hideCode: true,
  source: 'auto',
};

describe('rewardDiscountForSubtotal', () => {
  it('uses cart-evaluated discount for BOGO, not FIXED discountValue', () => {
    expect(rewardDiscountForSubtotal(bogoReward, 900)).toBe(450);
  });
});
