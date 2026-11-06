import { describe, expect, it } from 'vitest';
import {
  resolveBranchWalletBeforeGatewayLkr,
  resolveFinalNetPayoutPayLkr,
  resolvePayoutReportValues,
  resolveReportNetPayoutFinalPayLkr,
  resolveSecondCycleDisplayFinalPayLkr,
} from '@/components/admin/resolvePayoutReportValues';

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
    expect(values?.branchNetPayoutLkr).toBeCloseTo(979_580, 2);
  });

  it('SECOND payout net matches visible breakdown lines (full cycle wallet minus payout 1)', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: {
        grossAmount: 39_953,
        orderCount: 20,
        commissionFee: 1_840.95,
        gatewayFee: 350.8,
        gatewayBase: 18_463,
        gatewayRatePct: 1.9,
        onlineWalletGross: 39_953,
        onlinePaymentsCollected: 39_953,
        netAmount: 16_271.25,
        netPlatformEarning: 1_840.95,
        platformPaybackTotal: 0,
        periodDiscountsTotal: 508,
        periodLoyaltyDiscountTotal: 0,
        cycleStage: 'SECOND',
        priorOnlineWalletAmountLkr: 21_081.69,
        remainingOnlineWalletLkr: 18_871.31,
      },
      onlineOrderSubtotalLkr: 39_953,
      convenienceFeeLkr: 0,
      paybackEnabled: false,
      sharedPromo: {
        totalDiscountLkr: 508,
        branchContributionLkr: 0,
        branchContributionPct: 0,
        platformContributionLkr: 0,
        platformContributionPct: 0,
        jasonContributionLkr: 508,
        jasonContributionPct: 100,
        finalPayoutLkr: 16_779.25,
      },
    });

    const beforeGateway = resolveBranchWalletBeforeGatewayLkr(values!);
    const displayFinal = resolveSecondCycleDisplayFinalPayLkr(values!);
    expect(beforeGateway).not.toBeNull();
    expect(values!.gatewayLkr).toBeCloseTo((beforeGateway ?? 0) * 0.019, 2);
    expect(displayFinal).toBeCloseTo(
      (beforeGateway ?? 0) - (values!.gatewayLkr + values!.cancelledByBranchGatewayFeeLkr),
      2,
    );
    expect(resolveFinalNetPayoutPayLkr(values!)).toBe(displayFinal);
    expect(resolveReportNetPayoutFinalPayLkr(values!)).toBe(displayFinal);
  });

  it('matches spec SECOND-stage net payout (30-day combined cycle)', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: {
        grossAmount: 500_000,
        orderCount: 50,
        commissionFee: 19_500,
        gatewayFee: 5_700,
        gatewayBase: 300_000,
        gatewayRatePct: 1.9,
        onlineWalletGross: 500_000,
        onlinePaymentsCollected: 500_000,
        netAmount: 279_800,
        netPlatformEarning: 19_500,
        platformPaybackTotal: 0,
        periodDiscountsTotal: 0,
        periodLoyaltyDiscountTotal: 0,
        cycleStage: 'SECOND',
        priorOnlineWalletAmountLkr: 200_000,
        remainingOnlineWalletLkr: 300_000,
        customerLateCancelNetAmount: 5_000,
      },
      onlineOrderSubtotalLkr: 500_000,
      convenienceFeeLkr: 0,
      paybackEnabled: false,
      useStoredSnapshot: true,
      snapshotNetAmountLkr: 279_800,
      snapshotGatewayFeeLkr: 5_700,
    });

    expect(values?.cycleStage).toBe('SECOND');
    expect(values?.priorOnlineWalletAmountLkr).toBe(200_000);
    expect(values?.commissionLkr).toBe(19_500);
    expect(values?.branchNetPayoutLkr).toBeCloseTo(279_800, 2);
  });
});
