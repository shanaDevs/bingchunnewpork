import { describe, expect, it } from 'vitest';
import {
  evaluatePromoAgainstCart,
  resolvePromoGiftDisplay,
} from '../../src/lib/promotionCartEligibility';

describe('evaluatePromoAgainstCart BOGO', () => {
  const blueberry = {
    productId: 'prod-blueberry',
    productName: 'Blueberry Bobo Tea',
    quantity: 1,
    unitPrice: 450,
    lineTotal: 450,
  };

  it('asks for a cart boost when only the paid unit is in the cup', () => {
    const result = evaluatePromoAgainstCart({
      promotionKind: 'BOGO',
      promotionRules: {
        buyQty: 1,
        getQty: 1,
        selectedProducts: [{ id: 'prod-blueberry', name: 'Blueberry Bobo Tea' }],
      },
      discountType: 'FIXED',
      discountValue: 1,
      orderTotal: 450,
      cartItems: [blueberry],
    });

    expect(result.eligible).toBe(true);
    expect(result.discount).toBe(0);
    expect(result.cartBoost).toEqual({ productId: 'prod-blueberry', addQty: 1 });
  });

  it('returns the free-unit discount once both drinks are in the cup', () => {
    const result = evaluatePromoAgainstCart({
      promotionKind: 'BOGO',
      promotionRules: {
        buyQty: 1,
        getQty: 1,
        selectedProducts: [{ id: 'prod-blueberry', name: 'Blueberry Bobo Tea' }],
      },
      discountType: 'FIXED',
      discountValue: 1,
      orderTotal: 900,
      cartItems: [{ ...blueberry, quantity: 2, lineTotal: 900 }],
    });

    expect(result.eligible).toBe(true);
    expect(result.discount).toBe(450);
    expect(result.cartBoost).toBeUndefined();
  });

  it('exposes the free product for BOGO display', () => {
    const gift = resolvePromoGiftDisplay('BOGO', {
      buyQty: 1,
      getQty: 1,
      selectedProducts: [{ id: 'prod-blueberry', name: 'Blueberry Bobo Tea', basePrice: 450 }],
    });
    expect(gift.giftProduct?.id).toBe('prod-blueberry');
    expect(gift.giftLabel).toBe('Free Blueberry Bobo Tea');
  });
});
