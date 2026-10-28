import { describe, expect, it } from 'vitest';
import { shouldSyncRewardDiscountWithSubtotal } from './usePromoSubtotalDiscount';

describe('shouldSyncRewardDiscountWithSubtotal', () => {
  it('skips BOGO — discount comes from cart evaluation, not discountValue', () => {
    expect(
      shouldSyncRewardDiscountWithSubtotal({
        freeDelivery: false,
        promotionKind: 'BOGO',
        discountType: 'FIXED',
      }),
    ).toBe(false);
  });

  it('syncs percentage promos', () => {
    expect(
      shouldSyncRewardDiscountWithSubtotal({
        freeDelivery: false,
        promotionKind: 'PERCENTAGE_DISCOUNT',
        discountType: 'PERCENTAGE',
      }),
    ).toBe(true);
  });
});
