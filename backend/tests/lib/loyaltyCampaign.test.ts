import { describe, expect, it } from 'vitest';
import {
  evaluateLoyaltyOffers,
  offer1DiscountForChannel,
  PDF_DEFAULT_CAMPAIGN,
  rollSpinPrizeWin,
  type CustomerOrderStats,
  type ResolvedLoyaltyCampaign,
} from '../../src/lib/loyaltyCampaign';

function makeCampaign(overrides: Partial<ResolvedLoyaltyCampaign> = {}): ResolvedLoyaltyCampaign {
  return {
    id: 'camp-1',
    storeId: null,
    ...PDF_DEFAULT_CAMPAIGN,
    startsAt: null,
    expiresAt: null,
    source: 'PLATFORM',
    hasBranchOverride: false,
    ...overrides,
  } as ResolvedLoyaltyCampaign;
}

const emptyStats: CustomerOrderStats = {
  validOrderCount: 0,
  validOrderSubtotals: [],
  firstOrderAt: null,
  placedOrderCount: 0,
  firstPlacedOrderAt: null,
  offer1Claimed: false,
  offer2Claimed: false,
};

function statsAfterFirstPlacedOrder(
  firstPlacedOrderAt: Date,
  overrides: Partial<CustomerOrderStats> = {},
): CustomerOrderStats {
  return {
    validOrderCount: 0,
    validOrderSubtotals: [],
    firstOrderAt: null,
    placedOrderCount: 1,
    firstPlacedOrderAt,
    offer1Claimed: true,
    offer2Claimed: false,
    ...overrides,
  };
}

const giftProduct = {
  id: 'ice-cream-1',
  name: 'Vanilla Ice Cream',
  basePrice: 200,
  imageUrl: null,
};

describe('offer1DiscountForChannel', () => {
  it('uses web discount for WEB channel', () => {
    expect(offer1DiscountForChannel(makeCampaign(), 'WEB')).toBe(20);
  });

  it('uses app discount for APP channel', () => {
    expect(offer1DiscountForChannel(makeCampaign(), 'APP')).toBe(30);
  });
});

describe('rollSpinPrizeWin', () => {
  it('returns true when random is below configured chance', () => {
    expect(rollSpinPrizeWin(1, 10, 0.05)).toBe(true);
  });

  it('returns false when random is above configured chance', () => {
    expect(rollSpinPrizeWin(1, 10, 0.5)).toBe(false);
  });
});

describe('evaluateLoyaltyOffers', () => {
  it('applies Offer 1 (20% web) for new customer', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: emptyStats,
      subtotal: 2000,
      userId: 'user-1',
      channel: 'WEB',
    });
    expect(result.cartDiscount?.offerKey).toBe('OFFER_1');
    expect(result.cartDiscount?.discount).toBe(400);
    expect(result.cartDiscount?.code).toBe('LOYALTY-OFFER1');
  });

  it('applies Offer 1 (30% app) for new customer on app', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: emptyStats,
      subtotal: 2000,
      userId: 'user-1',
      channel: 'APP',
    });
    expect(result.cartDiscount?.offerKey).toBe('OFFER_1');
    expect(result.cartDiscount?.discount).toBe(600);
  });

  it('applies Offer 2 gift on exactly the 2nd order within window', () => {
    const firstPlacedOrderAt = new Date('2026-08-10T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt, {
        validOrderCount: 1,
        validOrderSubtotals: [1200],
        firstOrderAt: firstPlacedOrderAt,
      }),
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-15T12:00:00Z'),
    });
    expect(result.cartDiscount?.offerKey).toBe('OFFER_2');
    expect(result.cartDiscount?.discount).toBe(0);
    expect(result.cartDiscount?.giftCost).toBe(200);
    expect(result.cartDiscount?.giftProduct?.id).toBe('ice-cream-1');
    expect(result.cartDiscount?.giftLabel).toBe('Free Vanilla Ice Cream');
  });

  it('applies Offer 2 gift when first order is placed but not yet paid', () => {
    const firstPlacedOrderAt = new Date('2026-08-10T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt),
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-12T12:00:00Z'),
    });
    expect(result.cartDiscount?.offerKey).toBe('OFFER_2');
    expect(result.cartDiscount?.giftProduct?.id).toBe('ice-cream-1');
  });

  it('does not set giftCost for Offer 2 percentage discounts', () => {
    const firstPlacedOrderAt = new Date('2026-08-10T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign({ offer2RewardType: 'DISCOUNT' }),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt, {
        validOrderCount: 1,
        validOrderSubtotals: [1200],
        firstOrderAt: firstPlacedOrderAt,
      }),
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-15T12:00:00Z'),
    });
    expect(result.cartDiscount?.offerKey).toBe('OFFER_2');
    expect(result.cartDiscount?.discount).toBe(75);
    expect(result.cartDiscount?.giftCost).toBeUndefined();
  });

  it('does not apply Offer 2 on the 3rd order', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: {
        validOrderCount: 2,
        validOrderSubtotals: [1200, 1500],
        firstOrderAt: new Date('2026-08-10T12:00:00Z'),
        placedOrderCount: 2,
        firstPlacedOrderAt: new Date('2026-08-10T12:00:00Z'),
        offer1Claimed: true,
        offer2Claimed: true,
      },
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-15T12:00:00Z'),
    });
    expect(result.cartDiscount).toBeNull();
  });

  it('does not apply Offer 2 after window expires', () => {
    const firstPlacedOrderAt = new Date('2026-08-01T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt, {
        validOrderCount: 1,
        validOrderSubtotals: [1200],
        firstOrderAt: firstPlacedOrderAt,
      }),
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-15T12:00:00Z'),
    });
    expect(result.cartDiscount).toBeNull();
  });

  it('does not re-apply Offer 2 when it was already claimed on an unpaid 2nd order', () => {
    const firstPlacedOrderAt = new Date('2026-08-10T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt, {
        validOrderCount: 1,
        validOrderSubtotals: [1200],
        firstOrderAt: firstPlacedOrderAt,
        offer2Claimed: true,
      }),
      subtotal: 1500,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-12T12:00:00Z'),
    });
    expect(result.cartDiscount).toBeNull();
  });

  it('does not apply Offer 2 when subtotal below minimum', () => {
    const firstPlacedOrderAt = new Date('2026-08-10T12:00:00Z');
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign({ offer2MinSubtotal: 1000 }),
      stats: statsAfterFirstPlacedOrder(firstPlacedOrderAt, {
        validOrderCount: 1,
        validOrderSubtotals: [1200],
        firstOrderAt: firstPlacedOrderAt,
      }),
      subtotal: 800,
      userId: 'user-1',
      giftProduct,
      now: new Date('2026-08-12T12:00:00Z'),
    });
    expect(result.cartDiscount).toBeNull();
  });

  it('unlocks spin after 3rd order meets minimum amount', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: {
        validOrderCount: 3,
        validOrderSubtotals: [800, 900, 1200],
        firstOrderAt: new Date('2026-08-01T12:00:00Z'),
        placedOrderCount: 3,
        firstPlacedOrderAt: new Date('2026-08-01T12:00:00Z'),
        offer1Claimed: false,
        offer2Claimed: false,
      },
      subtotal: 500,
      userId: 'user-1',
    });
    expect(result.spin.unlocked).toBe(true);
    expect(result.spin.minOrderAmount).toBe(1000);
  });

  it('does not unlock spin when 3rd order is below minimum', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: {
        validOrderCount: 3,
        validOrderSubtotals: [800, 900, 500],
        firstOrderAt: new Date('2026-08-01T12:00:00Z'),
        placedOrderCount: 3,
        firstPlacedOrderAt: new Date('2026-08-01T12:00:00Z'),
        offer1Claimed: false,
        offer2Claimed: false,
      },
      subtotal: 500,
      userId: 'user-1',
    });
    expect(result.spin.unlocked).toBe(false);
  });

  it('unlocks spin when a later order meets the minimum after enough orders', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: {
        validOrderCount: 4,
        validOrderSubtotals: [800, 900, 500, 1500],
        firstOrderAt: new Date('2026-08-01T12:00:00Z'),
        placedOrderCount: 4,
        firstPlacedOrderAt: new Date('2026-08-01T12:00:00Z'),
        offer1Claimed: false,
        offer2Claimed: false,
      },
      subtotal: 500,
      userId: 'user-1',
    });
    expect(result.spin.unlocked).toBe(true);
  });

  it('does not unlock spin before required order count', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: {
        validOrderCount: 2,
        validOrderSubtotals: [2000, 2000],
        firstOrderAt: new Date('2026-08-01T12:00:00Z'),
        placedOrderCount: 2,
        firstPlacedOrderAt: new Date('2026-08-01T12:00:00Z'),
        offer1Claimed: false,
        offer2Claimed: false,
      },
      subtotal: 500,
      userId: 'user-1',
    });
    expect(result.spin.unlocked).toBe(false);
    expect(result.spin.ordersNeeded).toBe(1);
  });

  it('uses branch override discount values', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign({
        source: 'BRANCH_OVERRIDE',
        offer1WebDiscountValue: 15,
        offer1AppDiscountValue: 25,
        storeId: 'store-1',
      }),
      stats: emptyStats,
      subtotal: 1000,
      userId: 'user-1',
      channel: 'WEB',
    });
    expect(result.cartDiscount?.discount).toBe(150);
  });

  it('returns no cart discount for guests', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign(),
      stats: emptyStats,
      subtotal: 2000,
      userId: undefined,
    });
    expect(result.cartDiscount).toBeNull();
  });

  it('exposes configured win chance on spin progress', () => {
    const result = evaluateLoyaltyOffers({
      campaign: makeCampaign({
        offer3WinChanceNumerator: 1,
        offer3WinChanceDenominator: 10,
      }),
      stats: emptyStats,
      subtotal: 500,
      userId: 'user-1',
    });
    expect(result.spin.winChanceNumerator).toBe(1);
    expect(result.spin.winChanceDenominator).toBe(10);
  });
});
