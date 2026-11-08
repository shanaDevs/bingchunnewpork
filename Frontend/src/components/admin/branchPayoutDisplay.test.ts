import { describe, expect, it } from 'vitest';
import {
  branchPayoutDisplayFromReportValues,
  resolveBranchPayoutDisplay,
  resolvePayableWalletLkrForPayout,
} from './branchPayoutDisplay';
import type { PayoutReportValues } from './resolvePayoutReportValues';

describe('resolveBranchPayoutDisplay', () => {
  it('adds Jason top-up to period net for total branch payout', () => {
    const display = resolveBranchPayoutDisplay({
      amountCents: 1_917_183,
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
    });

    expect(display.periodWalletNetLkr).toBeCloseTo(19_171.84, 2);
    expect(display.jasonTopUpLkr).toBeCloseTo(181, 2);
    expect(display.totalBranchPayoutLkr).toBeCloseTo(19_352.84, 2);
  });

  it('uses finalPayoutAmountLkr from net-preview when breakdown is missing', () => {
    const display = resolveBranchPayoutDisplay({
      amountCents: 1_917_184,
      breakdown: null,
      netPreviewData: {
        grossAmount: 100,
        netAmount: 80_000,
        netAmountLkr: 19_171.84,
        finalPayoutAmountLkr: 19_352.84,
        sharedPromoJasonContributionAmount: 18_100,
      },
    });

    expect(display.totalBranchPayoutLkr).toBe(19_352.84);
  });

  it('uses this payment wallet portion plus Jason for capped initiate/approve views', () => {
    const display = resolveBranchPayoutDisplay({
      amountCents: 1_586_000,
      scope: 'thisPayment',
      paymentWalletRequestLkr: 15_860,
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
    });

    expect(display.scope).toBe('thisPayment');
    expect(display.periodWalletNetLkr).toBe(15_860);
    expect(display.jasonTopUpLkr).toBeCloseTo(181, 2);
    expect(display.totalBranchPayoutLkr).toBeCloseTo(16_041, 2);
  });

  it('matches net payout final pay from report values', () => {
    const reportValues = {
      branchNetPayoutLkr: 396_051.28,
      sharedPromoJasonLkr: 1_944,
      jasonDiscountsLkr: 0,
    } as Pick<
      PayoutReportValues,
      'branchNetPayoutLkr' | 'sharedPromoJasonLkr' | 'jasonDiscountsLkr'
    > as PayoutReportValues;

    const display = branchPayoutDisplayFromReportValues(reportValues);

    expect(display.periodWalletNetLkr).toBe(396_051.28);
    expect(display.totalBranchPayoutLkr).toBeCloseTo(397_995.28, 2);
  });

  it('Payout 2: branch receives equals report net payout (Jason already in walkthrough)', () => {
    const reportValues = {
      cycleStage: 'SECOND',
      onlinePaymentsCollectedLkr: 31_605,
      jasonDiscountsLkr: 691,
      priorOnlineWalletAmountLkr: 18_834.22,
      nonReturningRefundsBranchGrossLkr: 0,
      netPlatformAmountLkr: 809.36,
      gatewayLkr: 240.4,
      gatewayRatePct: 1.9,
      cancelledByBranchGatewayFeeLkr: 0,
      branchNetPayoutLkr: 11_718.78,
      sharedPromoJasonLkr: 691,
    } as PayoutReportValues;

    const display = branchPayoutDisplayFromReportValues(reportValues);

    expect(display.totalBranchPayoutLkr).toBeCloseTo(12_412.02, 2);
    expect(display.jasonTopUpLkr).toBe(0);
  });

  it('caps payable wallet by request, available balance, and period net', () => {
    expect(
      resolvePayableWalletLkrForPayout({
        requestedWalletLkr: 19_171.84,
        availableWalletLkr: 15_860,
        periodNetLkr: 19_171.84,
      }),
    ).toBe(15_860);
  });
});
