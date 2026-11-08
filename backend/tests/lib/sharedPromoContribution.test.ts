import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import {
  aggregateSharedPromoUsageRows,
  applySppcToBreakdown,
  computeFinalPayoutAmountCents,
  computeSharedPromoContribution,
  enrichSharedPromoForApi,
  mergeSharedPromoIntoBreakdown,
  parseSharedPromoFromBreakdown,
  resolveFinalPayoutAmountFromBreakdown,
  EMPTY_SHARED_PROMO_CONTRIBUTION,
} from '../../src/lib/sharedPromoContribution';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    promotionUsage: {
      findMany: vi.fn(),
    },
  },
}));
import type { PeriodBreakdown } from '../../src/lib/walletService';
import { DEFAULT_COMMISSION_SLABS, emptySettlementBreakdown } from '../../src/lib/commission';

function basePeriodBreakdown(overrides: Partial<PeriodBreakdown> = {}): PeriodBreakdown {
  return {
    grossAmount: 100_000,
    windowBase: 100_000,
    commissionRate: 0.065,
    tierLabel: 'Up to LKR 1,000,000',
    onlineWalletGross: 90_000,
    onlinePaymentsCollected: 90_000,
    deliveryFee: 0,
    commissionFee: 5_000,
    gatewayFee: 1_000,
    gatewayBase: 90_000,
    gatewayRatePct: 1.9,
    convenienceFee: 0,
    netAmount: 84_000,
    periodDiscountsTotal: 0,
    periodLoyaltyDiscountTotal: 0,
    platformPaybackTotal: 0,
    netPlatformEarning: 5_000,
    periodDues: 0,
    orderCount: 1,
    cancelledByBranchGatewayFee: 0,
    cancelledByBranchOrderCount: 0,
    customerLateCancelSubtotal: 0,
    customerLateCancelGatewayDeduction: 0,
    customerLateCancelNetAmount: 0,
    refundConvenienceFee: 0,
    refundDeliveryFee: 0,
    rejectedRefundSubtotal: 0,
    rejectedRefundGatewayDeduction: 0,
    rejectedRefundNetAmount: 0,
    rejectedRefundConvenienceFee: 0,
    rejectedRefundDeliveryFee: 0,
    channelBreakdown: emptySettlementBreakdown(),
    commissionSlabs: DEFAULT_COMMISSION_SLABS,
    gatewayRate: 0.019,
    ...EMPTY_SHARED_PROMO_CONTRIBUTION,
    finalPayoutAmount: 0,
    ...overrides,
  };
}

describe('aggregateSharedPromoUsageRows', () => {
  it('routes second-party share to Jason when contribution source is missing', () => {
    const totals = aggregateSharedPromoUsageRows([
      {
        totalDiscountAmount: 100,
        branchShareAmount: 60,
        platformShareAmount: 40,
        branchSharePct: 60,
        platformSharePct: 40,
        contributionSource: null,
      },
    ]);

    expect(totals.platform).toBe(0);
    expect(totals.jason).toBe(4_000);
  });

  it('splits branch and platform shares to the cent from total and percentages', () => {
    const totals = aggregateSharedPromoUsageRows([
      {
        totalDiscountAmount: 604,
        branchShareAmount: 362,
        platformShareAmount: 242,
        branchSharePct: 60,
        platformSharePct: 40,
        contributionSource: 'PLATFORM',
      },
    ]);

    expect(totals.totalDiscount).toBe(60_400);
    expect(totals.branch).toBe(36_240);
    expect(totals.platform).toBe(24_160);
  });

  it('handles uneven percentage splits (LKR 101 at 60%)', () => {
    const totals = aggregateSharedPromoUsageRows([
      {
        totalDiscountAmount: 101,
        branchShareAmount: 60,
        platformShareAmount: 41,
        branchSharePct: 60,
        platformSharePct: 40,
        contributionSource: 'PLATFORM',
      },
    ]);

    expect(totals.branch).toBe(6_060);
    expect(totals.platform).toBe(4_040);
  });

  it('falls back to stored share columns when percentages are missing', () => {
    const totals = aggregateSharedPromoUsageRows([
      {
        totalDiscountAmount: 604,
        branchShareAmount: 362,
        platformShareAmount: 242,
        contributionSource: 'PLATFORM',
      },
    ]);

    expect(totals.branch).toBe(36_200);
    expect(totals.platform).toBe(24_200);
  });
});

describe('computeSharedPromoContribution', () => {
  it('converts promotion usage amounts from LKR to cents when aggregating', async () => {
    vi.mocked(prisma.promotionUsage.findMany).mockResolvedValue([
      {
        totalDiscountAmount: 604,
        branchShareAmount: 362,
        platformShareAmount: 242,
        branchSharePct: 60,
        platformSharePct: 40,
        contributionSource: 'PLATFORM',
      },
    ] as never);

    const result = await computeSharedPromoContribution('store-1', '2026-01-01', '2026-01-31');

    expect(result.sharedPromoTotalDiscount).toBe(60_400);
    expect(result.sharedPromoBranchContributionAmount).toBe(36_240);
    expect(result.sharedPromoPlatformContributionAmount).toBe(24_160);
    expect(result.sharedPromoBranchContributionPct).toBe(60);
    expect(result.sharedPromoPlatformContributionPct).toBe(40);
  });
});

describe('applySppcToBreakdown', () => {
  it('deducts platform shared-promo from net platform earning and credits branch net amount', () => {
    const adjusted = applySppcToBreakdown(
      basePeriodBreakdown({
        sharedPromoPlatformContributionAmount: 2_000,
        sharedPromoJasonContributionAmount: 3_000,
      }),
    );

    expect(adjusted.netPlatformEarning).toBe(3_000);
    expect(adjusted.netAmount).toBe(86_000);
    expect(adjusted.netAmount).toBe(
      adjusted.onlinePaymentsCollected -
        adjusted.netPlatformEarning -
        adjusted.gatewayFee -
        adjusted.cancelledByBranchGatewayFee +
        adjusted.customerLateCancelNetAmount +
        adjusted.rejectedRefundNetAmount,
    );
  });
});

describe('mergeSharedPromoIntoBreakdown', () => {
  it('copies contribution fields then credits platform share to branch net', () => {
    const merged = mergeSharedPromoIntoBreakdown(
      basePeriodBreakdown(),
      {
        ...EMPTY_SHARED_PROMO_CONTRIBUTION,
        sharedPromoTotalDiscount: 5_000,
        sharedPromoPlatformContributionAmount: 2_000,
        sharedPromoJasonContributionAmount: 3_000,
      },
    );

    expect(merged.sharedPromoTotalDiscount).toBe(5_000);
    expect(merged.netPlatformEarning).toBe(3_000);
    expect(merged.netAmount).toBe(86_000);
    expect(merged.netAmount).toBe(
      merged.onlinePaymentsCollected -
        merged.netPlatformEarning -
        merged.gatewayFee -
        merged.cancelledByBranchGatewayFee +
        merged.customerLateCancelNetAmount +
        merged.rejectedRefundNetAmount,
    );
  });
});

describe('parseSharedPromoFromBreakdown', () => {
  it('keeps platform and Jason shares when the Jason field is present', () => {
    const parsed = parseSharedPromoFromBreakdown({
      sharedPromoTotalDiscount: 5_000,
      sharedPromoBranchContributionAmount: 2_000,
      sharedPromoBranchContributionPct: 40,
      sharedPromoPlatformContributionAmount: 1_000,
      sharedPromoPlatformContributionPct: 20,
      sharedPromoJasonContributionAmount: 2_000,
      sharedPromoJasonContributionPct: 40,
    });

    expect(parsed.sharedPromoPlatformContributionAmount).toBe(1_000);
    expect(parsed.sharedPromoJasonContributionAmount).toBe(2_000);
  });

  it('treats legacy platform-only snapshots as Jason contribution', () => {
    const parsed = parseSharedPromoFromBreakdown({
      sharedPromoTotalDiscount: 5_000,
      sharedPromoPlatformContributionAmount: 2_500,
      sharedPromoPlatformContributionPct: 50,
    });

    expect(parsed.sharedPromoPlatformContributionAmount).toBe(0);
    expect(parsed.sharedPromoJasonContributionAmount).toBe(2_500);
    expect(parsed.sharedPromoJasonContributionPct).toBe(50);
  });
});

describe('resolveFinalPayoutAmountFromBreakdown', () => {
  it('adds only Jason contribution when stored final payout is missing', () => {
    expect(
      resolveFinalPayoutAmountFromBreakdown(
        {
          sharedPromoPlatformContributionAmount: 2_000,
          sharedPromoJasonContributionAmount: 3_000,
        },
        40_000,
      ),
    ).toBe(43_000);
  });
});

describe('enrichSharedPromoForApi', () => {
  it('adds only Jason contribution to final payout, not platform contribution', () => {
    const sharedPromo = {
      ...EMPTY_SHARED_PROMO_CONTRIBUTION,
      sharedPromoPlatformContributionAmount: 2_000,
      sharedPromoJasonContributionAmount: 3_000,
    };

    const enriched = enrichSharedPromoForApi(sharedPromo, 84_000);

    expect(computeFinalPayoutAmountCents(84_000, 3_000)).toBe(87_000);
    expect(enriched.finalPayoutAmount).toBe(87_000);
    expect(enriched.finalPayoutAmountLkr).toBe(870);
  });
});
