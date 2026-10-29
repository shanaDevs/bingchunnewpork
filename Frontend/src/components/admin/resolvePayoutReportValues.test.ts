import { describe, expect, it } from 'vitest';
import { resolvePayoutReportValues } from '@/components/admin/resolvePayoutReportValues';

describe('resolvePayoutReportValues platform discount deduction', () => {
  const basePeriod = {
    grossAmount: 5000,
    orderCount: 2,
    commissionFee: 295.43,
    gatewayFee: 86.36,
    gatewayBase: 4545,
    gatewayRatePct: 1.9,
    onlineWalletGross: 4545,
    onlinePaymentsCollected: 4545,
    netAmount: 4167.22,
    netPlatformEarning: 141.43,
    platformPaybackTotal: 0,
    platformOwnedPromoDiscountTotal: 103,
    sharedPromoPlatformContributionLkr: 154,
    periodLoyaltyDiscountTotal: 0,
    cancelledByBranchGatewayFee: 150,
    cancelledByBranchOrderCount: 1,
  };

  it('reports platform + shared platform on - Platform Discounts and net platform amount', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: basePeriod,
      onlineOrderSubtotalLkr: 4545,
      convenienceFeeLkr: 0,
      paybackEnabled: false,
      useStoredSnapshot: true,
      snapshotGatewayFeeLkr: 86.36,
      snapshotNetAmountLkr: 4167.22,
      sharedPromo: {
        platformContributionLkr: 154,
        jasonContributionLkr: 0,
        branchContributionLkr: 38,
        totalDiscountLkr: 192,
        platformContributionPct: 0,
        jasonContributionPct: 0,
        branchContributionPct: 0,
      },
    });

    expect(values?.platformDiscountsReportLkr).toBe(257);
    expect(values?.netPlatformAmountLkr).toBe(38.43);
  });

  it('does not inflate branch net when snapshot already includes platform-owned adjustment', () => {
    const values = resolvePayoutReportValues({
      preview: null,
      periodBreakdownLkr: {
        ...basePeriod,
        netPlatformEarning: 38.43,
        netAmount: 4270.22,
      },
      onlineOrderSubtotalLkr: 4545,
      convenienceFeeLkr: 0,
      paybackEnabled: false,
      useStoredSnapshot: true,
      snapshotGatewayFeeLkr: 86.36,
      snapshotNetAmountLkr: 4270.22,
      sharedPromo: {
        platformContributionLkr: 154,
        jasonContributionLkr: 0,
        branchContributionLkr: 38,
        totalDiscountLkr: 192,
        platformContributionPct: 0,
        jasonContributionPct: 0,
        branchContributionPct: 0,
      },
    });

    expect(values?.branchNetPayoutLkr).toBe(4270.22);
    expect(values?.netPlatformAmountLkr).toBe(38.43);
  });
});
