import { describe, expect, it } from 'vitest';
import {
  resolveNetPlatformAmountForPeriodLkr,
  resolvePlatformCommissionForPeriodLkr,
} from './platformCommissionLkr';

describe('resolveNetPlatformAmountForPeriodLkr', () => {
  const base = {
    commissionLkr: 295.43,
    paybackEnabled: false,
    sharedPromoPlatformLkr: 154,
    periodBreakdownLkr: {
      platformPaybackTotal: 0,
      platformOwnedPromoDiscountTotal: 103,
      periodLoyaltyDiscountTotal: 0,
      netPlatformEarning: 141.43,
      refundConvenienceFee: 500,
      rejectedRefundConvenienceFee: 40,
    },
  };

  it('matches financial report net (no refund convenience fees)', () => {
    expect(resolveNetPlatformAmountForPeriodLkr(base)).toBe(192.43);
  });

  it('ignores netPlatformEarning snapshot (Payout Request Details parity)', () => {
    expect(
      resolveNetPlatformAmountForPeriodLkr({
        commissionLkr: 1254.97,
        paybackEnabled: true,
        sharedPromoPlatformLkr: 0,
        periodBreakdownLkr: {
          platformPaybackTotal: 500,
          platformOwnedPromoDiscountTotal: 700,
          periodLoyaltyDiscountTotal: 200,
          netPlatformEarning: -345.03,
        },
      }),
    ).toBe(354.97);
  });

  it('differs from allocation commission when refund convenience fees exist', () => {
    const withRefunds = resolvePlatformCommissionForPeriodLkr(base);
    expect(withRefunds).toBe(732.43);
    expect(resolveNetPlatformAmountForPeriodLkr(base)).not.toBe(withRefunds);
  });
});
