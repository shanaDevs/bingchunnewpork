import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: {
      findUnique: vi.fn(),
    },
    promotionUsage: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/platformPaybackSchema', () => ({
  ensurePlatformPaybackSchema: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import {
  attachPromoOwnershipTotals,
  applyPlatformOwnedDiscountToBreakdown,
  loadPromoOwnershipTotalsForPeriod,
  resolveExtraPlatformOwnedDeductionCents,
} from '../../src/lib/promoOwnershipTotals';

const asMock = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

describe('loadPromoOwnershipTotalsForPeriod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.store.findUnique).mockResolvedValue({
      platformDiscountPaybackEnabled: true,
    });
  });

  it('returns branch and platform ownership promo totals in cents', async () => {
    asMock(prisma.promotionUsage.findMany).mockResolvedValue([
      {
        promoCode: 'SUMMER10',
        ownership: 'PLATFORM',
        totalDiscountAmount: 186,
        platformShareAmount: 186,
        branchShareAmount: 0,
      },
      {
        promoCode: 'BRANCHWEL',
        ownership: 'BRANCH',
        totalDiscountAmount: 50,
        platformShareAmount: 0,
        branchShareAmount: 50,
      },
      {
        promoCode: 'COLLAB5',
        ownership: 'SHARED',
        totalDiscountAmount: 30,
        platformShareAmount: 15,
        branchShareAmount: 15,
      },
    ]);

    const totals = await loadPromoOwnershipTotalsForPeriod('store-1', '2020-01-01', '2020-01-15');

    expect(totals).toEqual({
      branchOwnedPromoDiscountTotal: 5000,
      platformOwnedPromoDiscountTotal: 18600,
    });
  });

  it('returns zero totals when no promotion usages exist', async () => {
    asMock(prisma.promotionUsage.findMany).mockResolvedValue([]);

    const totals = await loadPromoOwnershipTotalsForPeriod('store-1', '2020-01-01', '2020-01-15');

    expect(totals).toEqual({
      branchOwnedPromoDiscountTotal: 0,
      platformOwnedPromoDiscountTotal: 0,
    });
  });
});

describe('attachPromoOwnershipTotals', () => {
  it('attaches ownership totals onto a period breakdown snapshot', () => {
    const merged = attachPromoOwnershipTotals(
      { netAmount: 100_000, orderCount: 3, netPlatformEarning: 20_000, platformPaybackTotal: 0 },
      {
        branchOwnedPromoDiscountTotal: 5_000,
        platformOwnedPromoDiscountTotal: 18_600,
      },
    );

    expect(merged).toEqual({
      netAmount: 118_600,
      orderCount: 3,
      netPlatformEarning: 1_400,
      platformPaybackTotal: 0,
      branchOwnedPromoDiscountTotal: 5_000,
      platformOwnedPromoDiscountTotal: 18_600,
    });
  });
});

describe('applyPlatformOwnedDiscountToBreakdown', () => {
  it('deducts platform-only promos not already covered by payback', () => {
    const adjusted = applyPlatformOwnedDiscountToBreakdown({
      netPlatformEarning: 50_000,
      netAmount: 200_000,
      platformOwnedPromoDiscountTotal: 10_000,
      platformPaybackTotal: 0,
    });
    expect(adjusted.netPlatformEarning).toBe(40_000);
    expect(adjusted.netAmount).toBe(210_000);
  });

  it('does not double-deduct when payback already equals platform-owned total', () => {
    const unchanged = applyPlatformOwnedDiscountToBreakdown({
      netPlatformEarning: 40_000,
      netAmount: 210_000,
      platformOwnedPromoDiscountTotal: 10_000,
      platformPaybackTotal: 10_000,
    });
    expect(unchanged.netPlatformEarning).toBe(40_000);
    expect(unchanged.netAmount).toBe(210_000);
  });

  it('resolveExtraPlatformOwnedDeductionCents returns only the uncovered portion', () => {
    expect(
      resolveExtraPlatformOwnedDeductionCents({
        platformOwnedPromoDiscountTotal: 10_300,
        platformPaybackTotal: 4_000,
      }),
    ).toBe(6_300);
    expect(
      resolveExtraPlatformOwnedDeductionCents({
        platformOwnedPromoDiscountTotal: 5_000,
        platformPaybackTotal: 8_000,
      }),
    ).toBe(0);
  });
});
