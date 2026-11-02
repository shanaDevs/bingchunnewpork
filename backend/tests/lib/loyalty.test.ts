import { describe, expect, it } from 'vitest';
import { calcLoyaltyRedeem } from '../../src/lib/loyalty';

describe('calcLoyaltyRedeem', () => {
  it('converts 1 point to 1 LKR without a percentage cap', () => {
    const result = calcLoyaltyRedeem({
      usePoints: 500,
      availablePoints: 1000,
      redeemValue: 1,
      subtotal: 1000,
      remainingPayable: 1150,
    });
    expect(result).toEqual({
      maxPoints: 1000,
      pointsToDeduct: 500,
      loyaltyDiscount: 500,
    });
  });

  it('does not redeem more points than the customer has', () => {
    const result = calcLoyaltyRedeem({
      usePoints: 400,
      availablePoints: 80,
      redeemValue: 1,
      maxRedeemPct: 100,
      subtotal: 1000,
      remainingPayable: 1000,
    });
    expect(result.pointsToDeduct).toBe(80);
    expect(result.loyaltyDiscount).toBe(80);
  });

  it('cannot discount more than the remaining payable', () => {
    const result = calcLoyaltyRedeem({
      usePoints: 900,
      availablePoints: 900,
      redeemValue: 1,
      maxRedeemPct: 100,
      subtotal: 1000,
      remainingPayable: 150,
    });
    expect(result.pointsToDeduct).toBe(150);
    expect(result.loyaltyDiscount).toBe(150);
  });
});
