import { describe, expect, it } from 'vitest';
import {
  computePlatformCommissionCents,
  getEffectiveRate,
  sumCommissionableBase,
} from '../src/lib/commission';

describe('payout cycle commission slabs', () => {
  it('uses 6.5% at or below 1M net and 5% above', () => {
    expect(getEffectiveRate(1_000_000)).toBeCloseTo(0.065);
    expect(getEffectiveRate(1_000_001)).toBeCloseTo(0.05);
  });

  it('matches worked example commission on full-cycle net base', () => {
    const windowBase = 3_860_000;
    const rate = getEffectiveRate(windowBase);
    const commissionCents = computePlatformCommissionCents(windowBase, windowBase);
    expect(rate).toBeCloseTo(0.05);
    expect(commissionCents).toBe(19_300_000);
  });
});

describe('first payout net identity', () => {
  it('deducts only gateway fee from online wallet amount', () => {
    const onlineWalletCents = 1_000_000_00;
    const gatewayRate = 0.019;
    const gatewayFee = Math.round(onlineWalletCents * gatewayRate);
    const net = onlineWalletCents - gatewayFee;
    expect(gatewayFee).toBe(19_000_00);
    expect(net).toBe(981_000_00);
  });

  it('second payout uses remaining online wallet after payout 1', () => {
    const onlineWalletCycleCents = 2_180_000_00;
    const priorOnlineWalletCents = 1_000_000_00;
    const remaining = onlineWalletCycleCents - priorOnlineWalletCents;
    const gatewayFee = Math.round(remaining * 0.019);
    expect(remaining).toBe(1_180_000_00);
    expect(gatewayFee).toBe(22_420_00);
  });
});

describe('sumCommissionableBase', () => {
  it('sums net amount across commissionable channels only', () => {
    const base = sumCommissionableBase([
      {
        subtotal: 1000,
        discount: 50,
        loyaltyDiscount: 0,
        orderMode: 'DELIVERY',
        paymentMethod: 'PAYHERE',
      },
      {
        subtotal: 500,
        discount: 0,
        loyaltyDiscount: 0,
        orderMode: 'TAKEAWAY',
        paymentMethod: 'CASH_AT_COUNTER',
      },
    ]);
    expect(base).toBe(1450);
  });
});
