import { describe, expect, it } from 'vitest';
import { applyLoyaltyCartDiscount, overlayNcjCampaignShares } from '../../src/lib/orderPromoApply';
import type { LoyaltyCartDiscount } from '../../src/lib/loyaltyCampaign';
import type { AppliedPromoSnapshot } from '../../src/lib/promotionUsage';

const giftOffer: LoyaltyCartDiscount = {
  offerKey: 'OFFER_2',
  code: 'LOYALTY-OFFER2',
  discount: 0,
  discountType: 'FIXED',
  discountValue: 0,
  giftCost: 200,
  label: 'Free Vanilla Ice Cream',
  description: 'Free gift',
  promotionKind: 'LOYALTY_OFFER_2_GIFT',
  ownership: 'SHARED',
  contributionSource: 'JASON',
  branchSharePct: 40,
  platformSharePct: 60,
  branchShareSplits: null,
  autoApply: true,
  hideCode: true,
  giftLabel: 'Free Vanilla Ice Cream',
  giftProduct: { id: 'gift-1', name: 'Vanilla Ice Cream', basePrice: 200, imageUrl: null },
  giftProductId: 'gift-1',
};

const platformPromo: AppliedPromoSnapshot = {
  id: 'spin-promo-1',
  code: 'SPIN123',
  ownership: 'PLATFORM',
  contributionSource: null,
  branchSharePct: 0,
  platformSharePct: 100,
  promotionKind: 'PERCENTAGE_DISCOUNT',
  discountType: 'PERCENTAGE',
  discountValue: 10,
};

describe('applyLoyaltyCartDiscount', () => {
  it('snapshots gift cost, product, and shared ownership splits', () => {
    const applied = applyLoyaltyCartDiscount(giftOffer, 'store-1');

    expect(applied.discount).toBe(0);
    expect(applied.giftProductId).toBe('gift-1');
    expect(applied.giftNote).toBe('Free Vanilla Ice Cream');
    expect(applied.giftCostForUsage).toBe(200);
    expect(applied.appliedPromo).toEqual(
      expect.objectContaining({
        id: 'loyalty-offer_2',
        code: 'LOYALTY-OFFER2',
        ownership: 'SHARED',
        contributionSource: 'JASON',
        branchSharePct: 40,
        platformSharePct: 60,
      }),
    );
  });

  it('ignores zero gift cost', () => {
    const applied = applyLoyaltyCartDiscount({ ...giftOffer, giftCost: 0 }, 'store-1');
    expect(applied.giftCostForUsage).toBeUndefined();
  });
});

describe('overlayNcjCampaignShares', () => {
  it('returns the original promo when offer 3 is disabled', () => {
    expect(
      overlayNcjCampaignShares(
        platformPromo,
        {
          offer3Enabled: false,
          ownership: 'SHARED',
          contributionSource: 'JASON',
          branchSharePct: 30,
          platformSharePct: 70,
          branchShareSplits: null,
        },
        'store-1',
      ),
    ).toEqual(platformPromo);
  });

  it('overlays shared NCJ campaign ownership onto a spin promo', () => {
    expect(
      overlayNcjCampaignShares(
        platformPromo,
        {
          offer3Enabled: true,
          ownership: 'SHARED',
          contributionSource: 'JASON',
          branchSharePct: 30,
          platformSharePct: 70,
          branchShareSplits: null,
        },
        'store-1',
      ),
    ).toEqual(
      expect.objectContaining({
        id: 'spin-promo-1',
        ownership: 'SHARED',
        contributionSource: 'JASON',
        branchSharePct: 30,
        platformSharePct: 70,
      }),
    );
  });
});
