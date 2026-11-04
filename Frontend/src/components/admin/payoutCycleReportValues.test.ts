import { describe, expect, it } from 'vitest';
import { resolvePayoutReportValues } from '@/components/admin/resolvePayoutReportValues';

describe('resolvePayoutReportValues two-stage cycle', () => {
  it('zeros commission, discounts, and net platform on FIRST payout', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: {
        grossAmount: 16907,
        orderCount: 13,
        commissionFee: 1098.97,
        gatewayFee: 280.19,
        gatewayBase: 14747,
        gatewayRatePct: 1.9,
        onlineWalletGross: 14747,
        netAmount: 14349.84,
        netPlatformEarning: 398.97,
        platformPaybackTotal: 0,
        periodDiscountsTotal: 1843,
        periodLoyaltyDiscountTotal: 0,
        cycleStage: 'FIRST',
        priorOnlineWalletAmountLkr: 0,
        remainingOnlineWalletLkr: 14747,
      },
      onlineOrderSubtotalLkr: 14747,
      convenienceFeeLkr: 1240,
      paybackEnabled: false,
    });

    expect(values?.cycleStage).toBe('FIRST');
    expect(values?.commissionLkr).toBe(0);
    expect(values?.totalProvidedDiscountsLkr).toBe(0);
    expect(values?.netPlatformAmountLkr).toBe(0);
    expect(values?.branchNetPayoutLkr).toBeCloseTo(14466.81, 2);
  });

  it('shows payout 1 online wallet deduction on SECOND payout', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: {
        grossAmount: 3860000,
        orderCount: 100,
        commissionFee: 193000,
        gatewayFee: 22420,
        gatewayBase: 1180000,
        gatewayRatePct: 1.9,
        onlineWalletGross: 2180000,
        netAmount: 979580,
        netPlatformEarning: 193000,
        platformPaybackTotal: 0,
        periodDiscountsTotal: 0,
        periodLoyaltyDiscountTotal: 0,
        cycleStage: 'SECOND',
        priorOnlineWalletAmountLkr: 1_000_000,
        remainingOnlineWalletLkr: 1_180_000,
      },
      onlineOrderSubtotalLkr: 2180000,
      convenienceFeeLkr: 0,
      paybackEnabled: false,
    });

    expect(values?.priorOnlineWalletAmountLkr).toBe(1_000_000);
    expect(values?.commissionLkr).toBe(193000);
  });
});
