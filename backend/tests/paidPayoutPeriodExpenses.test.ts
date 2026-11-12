import { describe, expect, it } from 'vitest';
import {
  aggregatePaidPayoutPeriodExpensesCents,
  branchReceivableExcludingJasonFromWithdrawal,
} from '../src/lib/paidPayoutPeriodExpenses';

describe('branchReceivableExcludingJasonFromWithdrawal', () => {
  it('subtracts Jason once from a FIRST payout (net does not include Jason)', () => {
    expect(
      branchReceivableExcludingJasonFromWithdrawal(
        {
          cycleStage: 'FIRST',
          netAmount: 1_917_184,
          sharedPromoJasonContributionAmount: 18_100,
          finalPayoutAmount: 1_935_284,
        },
        1_935_284,
      ),
    ).toBe(1_917_184);
  });

  it('excludes Jason from a SECOND payout whose stored final added Jason on top of net', () => {
    expect(
      branchReceivableExcludingJasonFromWithdrawal(
        {
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: 2_931_400,
          netAmount: 980_445,
          sharedPromoJasonContributionAmount: 12_400,
          finalPayoutAmount: 992_845,
        },
        992_845,
      ),
    ).toBe(968_045);
  });

  it('excludes Jason from a SECOND payout whose final equals period net', () => {
    expect(
      branchReceivableExcludingJasonFromWithdrawal(
        {
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: 2_931_400,
          netAmount: 980_445,
          sharedPromoJasonContributionAmount: 12_400,
          finalPayoutAmount: 980_445,
        },
        980_445,
      ),
    ).toBe(968_045);
  });
});

describe('aggregatePaidPayoutPeriodExpensesCents', () => {
  it('sums actual branch receivable without Jason for all-time available balance', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        amountCents: 1_935_284,
        breakdown: {
          cycleStage: 'FIRST',
          netAmount: 1_917_184,
          sharedPromoJasonContributionAmount: 18_100,
          finalPayoutAmount: 1_935_284,
        },
      },
      {
        amountCents: 992_845,
        breakdown: {
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: 1_935_284,
          netAmount: 980_445,
          sharedPromoJasonContributionAmount: 12_400,
          finalPayoutAmount: 992_845,
        },
      },
    ]);

    expect(totals.jasonInvestmentCents).toBe(18_100 + 12_400);
    expect(totals.branchReceivableExcludingJasonCents).toBe(1_917_184 + 968_045);
  });

  it('does not count Payout 1 platform discounts as net platform amount', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        amountCents: 304_600,
        breakdown: {
          cycleStage: 'FIRST',
          commissionFee: 0,
          gatewayFee: 5_900,
          netAmount: 304_600,
          platformPaybackTotal: 19_500,
          platformOwnedPromoDiscountTotal: 0,
          netPlatformEarning: 0,
        },
      },
    ]);

    expect(totals.netPlatformAmountCents).toBe(0);
    expect(totals.gatewayFeeCents).toBe(5_900);
  });
});
