import { describe, expect, it } from 'vitest';
import {
  buildPromotionUsageRecord,
  contributionSourceForOwnership,
  positiveCost,
  resolveUsageOrderDiscount,
  type AppliedPromoSnapshot,
} from '../../src/lib/promotionUsage';

const sharedGiftPromo: AppliedPromoSnapshot = {
  id: 'loyalty-offer_2',
  code: 'LOYALTY-OFFER2',
  ownership: 'SHARED',
  contributionSource: 'JASON',
  branchSharePct: 40,
  platformSharePct: 60,
  promotionKind: 'LOYALTY_OFFER_2_GIFT',
  discountType: 'FIXED',
  discountValue: 0,
};

const cartItems = [
  {
    productId: 'prod-1',
    productName: 'Milk Tea',
    quantity: 2,
    unitPrice: 500,
    lineTotal: 1000,
  },
];

describe('buildPromotionUsageRecord giftCostOverride', () => {
  it('uses gift cost for wallet totals when order discount is 0', () => {
    const record = buildPromotionUsageRecord({
      orderId: 'order-1',
      storeId: 'store-1',
      userId: 'user-1',
      subtotal: 1000,
      deliveryFee: 150,
      orderDiscount: 0,
      giftCostOverride: 200,
      promo: sharedGiftPromo,
      cartItems,
    });

    expect(record.totalDiscountAmount).toBe(200);
    expect(record.branchShareAmount).toBe(80);
    expect(record.platformShareAmount).toBe(120);
    expect(record.offerDetails).toEqual(
      expect.objectContaining({
        orderDiscount: 0,
        totalDiscount: 200,
      }),
    );
  });

  it('ignores zero or missing gift cost and keeps the order discount', () => {
    const withoutOverride = buildPromotionUsageRecord({
      orderId: 'order-1',
      storeId: 'store-1',
      subtotal: 1000,
      orderDiscount: 150,
      promo: {
        ...sharedGiftPromo,
        id: 'promo-1',
        code: 'SAVE15',
        ownership: 'PLATFORM',
        promotionKind: 'FIXED_DISCOUNT',
        discountValue: 150,
      },
      cartItems,
    });
    const zeroOverride = buildPromotionUsageRecord({
      orderId: 'order-1',
      storeId: 'store-1',
      subtotal: 1000,
      orderDiscount: 150,
      giftCostOverride: 0,
      promo: {
        ...sharedGiftPromo,
        id: 'promo-1',
        code: 'SAVE15',
        ownership: 'PLATFORM',
        promotionKind: 'FIXED_DISCOUNT',
        discountValue: 150,
      },
      cartItems,
    });

    expect(withoutOverride.totalDiscountAmount).toBe(150);
    expect(zeroOverride.totalDiscountAmount).toBe(150);
  });
});

describe('positiveCost', () => {
  it('keeps amounts greater than zero', () => {
    expect(positiveCost(200)).toBe(200);
  });

  it('drops zero, null, and undefined', () => {
    expect(positiveCost(0)).toBeUndefined();
    expect(positiveCost(null)).toBeUndefined();
    expect(positiveCost(undefined)).toBeUndefined();
  });
});

describe('contributionSourceForOwnership', () => {
  it('defaults shared promotions to JASON', () => {
    expect(contributionSourceForOwnership('SHARED', null)).toBe('JASON');
    expect(contributionSourceForOwnership('SHARED', 'PLATFORM')).toBe('PLATFORM');
  });

  it('clears contribution source for non-shared ownership', () => {
    expect(contributionSourceForOwnership('PLATFORM', 'JASON')).toBeNull();
    expect(contributionSourceForOwnership('BRANCH', 'JASON')).toBeNull();
  });
});

describe('resolveUsageOrderDiscount', () => {
  it('prefers a positive gift cost override', () => {
    expect(resolveUsageOrderDiscount(0, 200)).toBe(200);
  });

  it('falls back to the order discount', () => {
    expect(resolveUsageOrderDiscount(150, 0)).toBe(150);
    expect(resolveUsageOrderDiscount(150)).toBe(150);
  });
});
