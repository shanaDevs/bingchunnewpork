import { describe, expect, it } from 'vitest';
import {
  computePlatformProviderReceivable,
  computePlatformProviderReceivableLkr,
  platformProviderReceivableInputFromBreakdownCents,
  platformProviderReceivableToLkr,
} from '@bingchun/settlement';

describe('@bingchun/settlement computePlatformProviderReceivable', () => {
  it('applies the 4-step formula with gateway rounding', () => {
    const result = computePlatformProviderReceivable({
      commissionFeeCents: 500000,
      platformPaybackCents: 10000,
      loyaltyDiscountCents: 5000,
      sharedPromoPlatformCents: 2000,
      normalConvenienceFeeCents: 82000,
      completedRefundConvenienceFeeCents: 3000,
      rejectedRefundConvenienceFeeCents: 1000,
      gatewayRatePct: 1.9,
    });

    expect(result.netPlatformCommissionCents).toBe(483000);
    expect(result.netPlatformEarningsCents).toBe(487000);
    expect(result.eligibleProviderAmountCents).toBe(569000);
    expect(result.gatewayDeductionCents).toBe(Math.round((569000 * 1.9) / 100));
    expect(result.totalPlatformProviderReceivableCents).toBe(
      result.eligibleProviderAmountCents - result.gatewayDeductionCents,
    );
  });

  it('uses combined refund convenience fallback when split is missing', () => {
    const result = computePlatformProviderReceivable({
      commissionFeeCents: 100000,
      refundConvenienceFeeCents: 2500,
      gatewayRatePct: 1.9,
    });

    expect(result.completedRefundConvenienceFeeCents).toBe(2500);
    expect(result.rejectedRefundConvenienceFeeCents).toBe(0);
    expect(result.netPlatformEarningsCents).toBe(102500);
  });

  it('handles all-zero components', () => {
    const result = computePlatformProviderReceivable({
      commissionFeeCents: 0,
      gatewayRatePct: 1.9,
    });

    expect(result.totalPlatformProviderReceivableCents).toBe(0);
  });

  it('builds input from period breakdown cents', () => {
    const input = platformProviderReceivableInputFromBreakdownCents({
      commissionFee: 125000,
      platformPaybackTotal: 5000,
      periodLoyaltyDiscountTotal: 1000,
      sharedPromoPlatformContributionAmount: 2000,
      convenienceFee: 8200,
      refundConvenienceFee: 300,
      rejectedRefundConvenienceFee: 100,
      gatewayRatePct: 1.9,
    });

    expect(input.commissionFeeCents).toBe(125000);
    expect(input.gatewayRatePct).toBe(1.9);
  });

  it('converts breakdown to LKR fields', () => {
    const breakdown = computePlatformProviderReceivable({
      commissionFeeCents: 123456,
      gatewayRatePct: 1.9,
    });
    const lkr = platformProviderReceivableToLkr(breakdown);
    expect(lkr.commissionFeeLkr).toBe(1234.56);
    expect(lkr.gatewayRatePct).toBe(1.9);
  });

  it('computes receivable from LKR inputs for preview paths', () => {
    const lkr = computePlatformProviderReceivableLkr({
      commissionFeeLkr: 5000,
      platformPaybackLkr: 100,
      loyaltyDiscountLkr: 50,
      sharedPromoPlatformLkr: 20,
      normalConvenienceFeeLkr: 820,
      completedRefundConvenienceFeeLkr: 30,
      rejectedRefundConvenienceFeeLkr: 10,
      gatewayRatePct: 1.9,
    });

    expect(lkr.netPlatformCommissionLkr).toBe(4830);
    expect(lkr.netPlatformEarningsLkr).toBe(4870);
    expect(lkr.totalPlatformProviderReceivableLkr).toBeGreaterThan(0);
  });
});
