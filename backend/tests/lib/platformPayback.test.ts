import { describe, expect, it } from 'vitest';
import {
  commissionableSubtotal,
  computePendingDuesLkr,
  computePlatformCommission,
  getEffectiveRate,
  orderPlatformPayback,
  sumOrdersPlatformPaybackLkr,
} from '../../src/lib/commission';

describe('platform discount payback helpers', () => {
  it('sums eligible unsettled payback from promotion usages', () => {
    const order = {
      promotionUsages: [
        {
          platformPaybackEligible: true,
          platformPaybackAmount: 5000,
          platformPaybackSettledAt: null,
          platformPaybackReversedAt: null,
        },
        {
          platformPaybackEligible: true,
          platformPaybackAmount: 1000,
          platformPaybackSettledAt: new Date(),
          platformPaybackReversedAt: null,
        },
      ],
    };
    expect(orderPlatformPayback(order)).toBe(5000);
    expect(sumOrdersPlatformPaybackLkr([order])).toBe(5000);
  });

  it('computes pending dues net of payback settlements', () => {
    const pending = computePendingDuesLkr({
      allTimeCommission: 2_925,
      allTimePayback: 5_000,
      settlements: [{ totalCommission: 292_500, platformPaybackAmount: 500_000 }],
    });
    expect(pending).toBe(0);
  });

  it('matches the worked online example (50k sale, 10% platform promo, first slab)', () => {
    const subtotal = 50_000;
    const discount = 5_000;
    const base = commissionableSubtotal({ subtotal, discount, loyaltyDiscount: 0 });
    expect(base).toBe(45_000);

    const windowBase = base;
    const rate = getEffectiveRate(windowBase);
    expect(rate).toBe(0.065);

    const grossCommission = computePlatformCommission(base, windowBase);
    expect(grossCommission).toBe(2_925);

    const platformPayback = 5_000;
    const onlinePaymentsCollected = 45_000;
    const gatewayFee = 0;
    const netCommissionAfterPayback = grossCommission - platformPayback;
    const signedNetCents =
      onlinePaymentsCollected * 100 -
      netCommissionAfterPayback * 100 -
      gatewayFee * 100;
    const payout = Math.max(0, signedNetCents) / 100;

    expect(netCommissionAfterPayback).toBe(-2_075);
    expect(payout).toBe(47_075);
  });

  it('matches counter-cash-only period with payback enabled', () => {
    const grossCommission = 2_925;
    const platformPayback = 5_000;
    const onlinePaymentsCollected = 0;
    const gatewayFee = 0;
    const netCommissionAfterPayback = grossCommission - platformPayback;
    const signedNet =
      onlinePaymentsCollected - netCommissionAfterPayback - gatewayFee;
    expect(signedNet).toBe(2_075);
    expect(Math.max(0, signedNet)).toBe(2_075);
    expect(netCommissionAfterPayback).toBe(-2_075);
  });

  it('matches counter-cash-only period with payback disabled (regression guard)', () => {
    const grossCommission = 2_925;
    const platformPayback = 0;
    const onlinePaymentsCollected = 0;
    const gatewayFee = 0;
    const signedNet =
      onlinePaymentsCollected - grossCommission - gatewayFee + platformPayback;
    expect(Math.max(0, signedNet)).toBe(0);
    expect(Math.max(0, -signedNet)).toBe(2_925);
  });

  it('returns zero payback for SHARED ownership snapshots', () => {
    const order = {
      promotionUsages: [
        {
          platformPaybackEligible: false,
          platformPaybackAmount: 0,
          platformPaybackSettledAt: null,
          platformPaybackReversedAt: null,
        },
      ],
    };
    expect(orderPlatformPayback(order)).toBe(0);
  });

  it('uses platform payback only for net commission when mixed discounts exist', () => {
    const grossCommission = 9_623;
    const periodDiscountsTotal = 636;
    const platformPaybackTotal = 186;
    const onlinePaymentsCollected = 140_534;
    const gatewayFee = 4_137.76;

    const netCommissionCorrect = grossCommission - platformPaybackTotal;
    const payoutCorrect =
      onlinePaymentsCollected - netCommissionCorrect - gatewayFee;

    const netCommissionWrong = grossCommission - periodDiscountsTotal;
    const payoutWrong =
      onlinePaymentsCollected - netCommissionWrong - gatewayFee;

    expect(netCommissionCorrect).toBe(9_437);
    expect(netCommissionWrong).toBe(8_987);
    expect(Math.round((payoutCorrect - payoutWrong) * 100) / 100).toBe(-450);
  });

  it('uses platformShareAmount at payout time when store payback is enabled', () => {
    const order = {
      promotionUsages: [
        {
          ownership: 'PLATFORM',
          platformShareAmount: 5000,
          platformPaybackEligible: false,
          platformPaybackAmount: 0,
          platformPaybackSettledAt: null,
          platformPaybackReversedAt: null,
        },
      ],
    };
    expect(orderPlatformPayback(order)).toBe(0);
    expect(orderPlatformPayback(order, { storePaybackEnabled: true })).toBe(5000);
  });
});
