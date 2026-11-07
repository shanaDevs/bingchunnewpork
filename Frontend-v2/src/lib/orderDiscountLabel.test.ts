import { describe, expect, it } from 'vitest';
import { deriveCleanDiscountPercent } from '@/lib/deriveCleanDiscountPercent';
import { formatJourneyPromoLabel } from '@/lib/journeyPromoLabel';
import { formatOrderDiscountSuffix } from '@/lib/orderDiscountLabel';

describe('deriveCleanDiscountPercent', () => {
  it('returns the applied percentage when discount matches floored subtotal math', () => {
    expect(deriveCleanDiscountPercent(12_500, 5_000)).toBe(40);
    expect(deriveCleanDiscountPercent(12_500, 1_250)).toBe(10);
    expect(deriveCleanDiscountPercent(1_550, 310)).toBe(20);
  });

  it('returns null for fixed-amount discounts that are not a clean floored percent', () => {
    expect(deriveCleanDiscountPercent(12_500, 501)).toBeNull();
  });
});

describe('formatJourneyPromoLabel', () => {
  it('prefers applied discount over catalog discountValue', () => {
    expect(
      formatJourneyPromoLabel('LOYALTY-OFFER1', {
        discountType: 'PERCENTAGE',
        discountValue: 40,
        subtotal: 1_550,
        discount: 310,
      }),
    ).toBe('1st order - welcome discount (20%)');
  });
});

describe('formatOrderDiscountSuffix', () => {
  it('shows journey welcome label with applied percent for LOYALTY-OFFER1', () => {
    expect(
      formatOrderDiscountSuffix({
        promoCode: 'LOYALTY-OFFER1',
        subtotal: 1_550,
        discount: 310,
      }),
    ).toBe('1st order - welcome discount (20%)');
  });

  it('prefers applied discount over promo catalog naming for generic codes', () => {
    expect(
      formatOrderDiscountSuffix({
        promoCode: 'WELCOME10',
        subtotal: 12_500,
        discount: 5_000,
      }),
    ).toBe('40%');
  });

  it('shows journey label without percent when discount is not a clean floored percent', () => {
    expect(
      formatOrderDiscountSuffix({
        promoCode: 'LOYALTY-OFFER1',
        subtotal: 12_500,
        discount: 501,
      }),
    ).toBe('1st order - welcome discount');
  });
});
