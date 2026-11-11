import { describe, expect, it } from 'vitest';
import {
  aggregatePaidPayoutPeriodExpensesCents,
  branchReceivableExcludingJasonCents,
  computeAllTimeAvailableBalanceCents,
  computeAllTimeOnlineWalletCents,
  resolvePayoutPeriodRowDisplayAmounts,
} from './payoutPeriodRowAmounts';

describe('resolvePayoutPeriodRowDisplayAmounts', () => {
  it('derives branch receivable LKR from payout amount cents when breakdown is missing', () => {
    expect(
      resolvePayoutPeriodRowDisplayAmounts({
        amountCents: 125000,
        breakdown: null,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
      }),
    ).toEqual({
      branchReceives: 1250,
      commissionLkr: 0,
      orderConvenienceFeeLkr: 0,
      deliveryFee: 0,
    });
  });

  it('maps a locked withdrawal breakdown into card amounts', () => {
    const amounts = resolvePayoutPeriodRowDisplayAmounts({
      amountCents: 100000,
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      breakdown: {
        grossAmount: 120000,
        deliveryFee: 5000,
        commissionFee: 10000,
        gatewayFee: 2000,
        netAmount: 100000,
        orderCount: 12,
        convenienceFee: 3000,
      },
    });

    expect(amounts.branchReceives).toBe(1000);
    expect(amounts.commissionLkr).toBe(100);
    expect(amounts.orderConvenienceFeeLkr).toBe(30);
    expect(amounts.deliveryFee).toBe(50);
  });

  it('aggregates paid period rows only', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        status: 'IN_PROGRESS',
        amountCents: 0,
        periodFrom: '2026-10-31',
        periodTo: '2026-11-02',
        breakdown: null,
      },
      {
        status: 'PAID',
        amountCents: 100000,
        periodFrom: '2026-09-01',
        periodTo: '2026-09-15',
        breakdown: {
          grossAmount: 120000,
          deliveryFee: 5000,
          commissionFee: 10000,
          gatewayFee: 2000,
          netAmount: 100000,
          orderCount: 12,
          convenienceFee: 3000,
        },
      },
    ]);

    expect(totals.netPlatformAmountCents).toBe(10000);
    expect(totals.gatewayFeeCents).toBe(2000);
    expect(totals.branchReceivableCents).toBe(100000);
    expect(totals.jasonInvestmentCents).toBe(0);
    expect(totals.totalExpensesCents).toBe(112000);
    expect(totals.allTimeExpenseDeductionCents).toBe(112000);
  });

  it('uses branch-only deduction for paid payout 2 rows', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        status: 'PAID',
        amountCents: 2_931_400,
        periodFrom: '2026-09-01',
        periodTo: '2026-09-15',
        breakdown: {
          cycleStage: 'FIRST',
          grossAmount: 3_000_000,
          commissionFee: 0,
          gatewayFee: 50_000,
          netAmount: 2_931_400,
        },
      },
      {
        status: 'PAID',
        amountCents: 980_445,
        periodFrom: '2026-09-16',
        periodTo: '2026-09-30',
        breakdown: {
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: 2_931_400,
          grossAmount: 3_000_000,
          commissionFee: 100_155,
          gatewayFee: 18_945,
          netAmount: 980_445,
        },
      },
    ]);

    expect(totals.allTimeExpenseDeductionCents).toBe(2_931_400 + 50_000 + 980_445);
    expect(totals.jasonInvestmentCents).toBe(0);
  });

  it('does not add Payout 1 platform discounts into expenses net platform amount', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        status: 'PAID',
        amountCents: 304_600,
        periodFrom: '2026-09-04',
        periodTo: '2026-09-18',
        breakdown: {
          cycleStage: 'FIRST',
          grossAmount: 432_000,
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

  it('separates Jason investment from paid branch receivable', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        status: 'PAID',
        amountCents: 1_935_284,
        periodFrom: '2026-09-01',
        periodTo: '2026-09-15',
        breakdown: {
          grossAmount: 2_232_000,
          deliveryFee: 525_500,
          commissionFee: 272_409,
          gatewayFee: 42_408,
          netAmount: 1_917_184,
          orderCount: 10,
          sharedPromoJasonContributionAmount: 18_100,
          finalPayoutAmount: 1_935_284,
        },
      },
    ]);

    expect(totals.jasonInvestmentCents).toBe(18_100);
    expect(totals.branchReceivableCents).toBe(1_935_284);
    expect(totals.branchReceivableExcludingJasonCents).toBe(1_917_184);
    expect(branchReceivableExcludingJasonCents(
      totals.branchReceivableCents,
      totals.jasonInvestmentCents,
    )).toBe(1_917_184);
  });

  it('does not deduct Jason twice from a SECOND payout whose net already includes Jason', () => {
    const totals = aggregatePaidPayoutPeriodExpensesCents([
      {
        status: 'PAID',
        amountCents: 980_445,
        periodFrom: '2026-09-16',
        periodTo: '2026-09-30',
        breakdown: {
          cycleStage: 'SECOND',
          priorOnlineWalletAmountCents: 2_931_400,
          grossAmount: 1_200_000,
          deliveryFee: 0,
          commissionFee: 100_155,
          gatewayFee: 18_945,
          netAmount: 980_445,
          orderCount: 8,
          sharedPromoJasonContributionAmount: 12_400,
          finalPayoutAmount: 992_845,
        },
      },
    ]);

    expect(totals.jasonInvestmentCents).toBe(12_400);
    expect(totals.branchReceivableExcludingJasonCents).toBe(968_045);
  });
});

describe('branchReceivableExcludingJasonCents', () => {
  it('does not mix Jason investment into the branch payout amount', () => {
    expect(branchReceivableExcludingJasonCents(1_414_082, 18_100)).toBe(1_395_982);
    expect(branchReceivableExcludingJasonCents(18_100, 18_100)).toBe(0);
    expect(branchReceivableExcludingJasonCents(10_000, 0)).toBe(10_000);
  });
});

describe('computeAllTimeOnlineWalletCents', () => {
  it('is pickup + delivery online and does not change with payouts', () => {
    expect(computeAllTimeOnlineWalletCents(800_000, 667_200)).toBe(1_467_200);
    expect(computeAllTimeOnlineWalletCents(100, 100)).toBe(200);
  });
});

describe('computeAllTimeAvailableBalanceCents', () => {
  it('is remaining online wallet after branch receivable excluding Jason', () => {
    expect(computeAllTimeAvailableBalanceCents(800_000, 667_200, 1_401_682)).toBe(65_518);
    expect(computeAllTimeAvailableBalanceCents(100, 100, 500)).toBe(0);
  });
});
