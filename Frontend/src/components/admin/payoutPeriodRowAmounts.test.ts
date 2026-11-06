import { describe, expect, it } from 'vitest';
import {
  aggregatePaidPayoutPeriodExpensesCents,
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
  });
});
