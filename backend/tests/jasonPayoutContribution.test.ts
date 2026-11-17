import { describe, expect, it } from 'vitest';
import {
  jasonNegativeNetPlatformCreditCents,
  jasonPayoutDeductionCentsFromBreakdown,
} from '../src/lib/jasonPayoutContribution';

describe('jasonPayoutContribution', () => {
  it('returns absolute net platform amount when platform commission is negative', () => {
    const breakdown = {
      cycleStage: 'SECOND',
      commissionFee: 28_425,
      platformOwnedPromoDiscountTotal: 19_500,
      platformPaybackTotal: 418_20,
      platformDiscountPaybackEnabled: true,
      sharedPromoJasonContributionAmount: 0,
    };
    expect(jasonNegativeNetPlatformCreditCents(breakdown)).toBe(13_395);
    expect(jasonPayoutDeductionCentsFromBreakdown(breakdown)).toBe(13_395);
  });

  it('adds shared promo Jason and negative net platform credits', () => {
    const breakdown = {
      cycleStage: 'SECOND',
      commissionFee: 199_908,
      platformOwnedPromoDiscountTotal: 266_000,
      platformPaybackTotal: 266_000,
      platformDiscountPaybackEnabled: true,
      sharedPromoJasonContributionAmount: 6_600,
    };
    expect(jasonNegativeNetPlatformCreditCents(breakdown)).toBe(66_092);
    expect(jasonPayoutDeductionCentsFromBreakdown(breakdown)).toBe(72_692);
  });

  it('ignores net platform on payout 1', () => {
    expect(
      jasonNegativeNetPlatformCreditCents({
        cycleStage: 'FIRST',
        commissionFee: 0,
        platformPaybackTotal: 19_500,
      }),
    ).toBe(0);
  });
});