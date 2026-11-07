import { describe, expect, it } from 'vitest';
import {
  pickAutoApplyCandidate,
  pickFreeProductAutoApply,
  pickLoyaltyCampaignAutoApply,
  type EligiblePromoOffer,
} from './promotionAutoApply';

function offer(partial: Partial<EligiblePromoOffer> & Pick<EligiblePromoOffer, 'code'>): EligiblePromoOffer {
  return {
    title: partial.code,
    description: null,
    discount: 50,
    freeDelivery: false,
    autoApply: true,
    hideCode: true,
    label: partial.code,
    ...partial,
  };
}

describe('pickAutoApplyCandidate', () => {
  it('returns null while auto-apply is paused after a clear', () => {
    const picked = pickAutoApplyCandidate([offer({ code: 'SAVE50' })], {
      dismissedCodes: [],
      isAuthenticated: true,
      paused: true,
    });
    expect(picked).toBeNull();
  });

  it('still auto-applies B1G1 when other auto-apply is paused', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'SAVE20', promotionKind: 'PERCENTAGE_DISCOUNT', discount: 180 }),
        offer({ code: 'TESTOFFER', promotionKind: 'BOGO', discount: 0, cartBoost: { productId: 'p1', addQty: 1 } }),
      ],
      { dismissedCodes: ['SAVE20'], isAuthenticated: true, paused: true },
    );
    expect(picked?.code).toBe('TESTOFFER');
  });

  it('does not re-apply a dismissed B1G1 offer', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'SAVE20', promotionKind: 'PERCENTAGE_DISCOUNT', discount: 180 }),
        offer({ code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 }),
      ],
      { dismissedCodes: ['TESTOFFER'], isAuthenticated: true, paused: true },
    );
    expect(picked).toBeNull();
  });

  it('skips codes the shopper dismissed so the carousel can show them again', () => {
    const picked = pickAutoApplyCandidate(
      [offer({ code: 'SAVE50' }), offer({ code: 'FREEDELIVERY' })],
      { dismissedCodes: ['SAVE50'], isAuthenticated: true },
    );
    expect(picked?.code).toBe('FREEDELIVERY');
  });

  it('does not pick a dismissed-only list, allowing the carousel to stay visible', () => {
    const picked = pickAutoApplyCandidate([offer({ code: 'SAVE50' })], {
      dismissedCodes: ['save50'],
      isAuthenticated: true,
    });
    expect(picked).toBeNull();
  });

  it('prefers BOGO over percentage and free delivery offers', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'FREEDEL', freeDelivery: true, promotionKind: 'FREE_DELIVERY' }),
        offer({ code: 'SAVE20', promotionKind: 'PERCENTAGE_DISCOUNT', discount: 500 }),
        offer({ code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 }),
      ],
      { dismissedCodes: [], isAuthenticated: true },
    );
    expect(picked?.code).toBe('TESTOFFER');
  });

  it('prefers the first-order offer even when other auto-apply deals exist', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'WEEKEND', promotionKind: 'WEEKEND' }),
        offer({ code: 'LOYALTY-OFFER1', promotionKind: 'LOYALTY_OFFER_1' }),
      ],
      { dismissedCodes: [], isAuthenticated: true },
    );
    expect(picked?.code).toBe('LOYALTY-OFFER1');
  });

  it('prefers the second loyalty offer even when other auto-apply deals exist', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'WEEKEND', promotionKind: 'WEEKEND' }),
        offer({ code: 'LOYALTY-OFFER2', promotionKind: 'LOYALTY_OFFER_2_GIFT' }),
      ],
      { dismissedCodes: [], isAuthenticated: true },
    );
    expect(picked?.code).toBe('LOYALTY-OFFER2');
  });

  it('still auto-applies first-order after a different offer was dismissed', () => {
    const picked = pickAutoApplyCandidate(
      [
        offer({ code: 'WEEKEND', promotionKind: 'WEEKEND' }),
        offer({ code: 'LOYALTY-OFFER1', promotionKind: 'LOYALTY_OFFER_1' }),
      ],
      { dismissedCodes: ['WEEKEND'], isAuthenticated: true, paused: true },
    );
    expect(picked?.code).toBe('LOYALTY-OFFER1');
  });

  it('does not auto-apply a dismissed loyalty offer', () => {
    const picked = pickLoyaltyCampaignAutoApply(
      [offer({ code: 'LOYALTY-OFFER2', promotionKind: 'LOYALTY_OFFER_2' })],
      { dismissedCodes: ['LOYALTY-OFFER2'], isAuthenticated: true },
    );
    expect(picked).toBeNull();
  });

  it('does not auto-apply loyalty offers for guests', () => {
    const picked = pickLoyaltyCampaignAutoApply(
      [offer({ code: 'LOYALTY-OFFER2', promotionKind: 'LOYALTY_OFFER_2_GIFT' })],
      { dismissedCodes: [], isAuthenticated: false },
    );
    expect(picked).toBeNull();
  });
});

describe('pickFreeProductAutoApply', () => {
  it('picks an eligible B1G1 offer when it has not been dismissed', () => {
    const picked = pickFreeProductAutoApply(
      [offer({ code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 })],
      { dismissedCodes: [], isAuthenticated: true },
    );
    expect(picked?.code).toBe('TESTOFFER');
  });

  it('does not pick a B1G1 offer the shopper turned off', () => {
    const picked = pickFreeProductAutoApply(
      [offer({ code: 'TESTOFFER', promotionKind: 'BOGO', discount: 450 })],
      { dismissedCodes: ['testoffer'], isAuthenticated: true },
    );
    expect(picked).toBeNull();
  });
});
