import { prisma } from './prisma';
import { ensurePlatformPaybackSchema } from './platformPaybackSchema';
import { buildInvoicePromoSummaryFromUsages } from './invoice/dataBuilders';
import { periodActivePaidOrdersWhere } from './walletRevenue';

function assertPeriodRange(from: string, to: string): void {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('Invalid date format');
  }
  if (from > to) {
    throw new Error('Start date must be on or before end date');
  }
}

export type PromoOwnershipTotals = {
  branchOwnedPromoDiscountTotal: number;
  platformOwnedPromoDiscountTotal: number;
};

/** Platform-owned promo not already deducted via store payback (cents). */
export function resolveExtraPlatformOwnedDeductionCents(breakdown: {
  platformOwnedPromoDiscountTotal?: number;
  platformPaybackTotal?: number;
}): number {
  const owned = breakdown.platformOwnedPromoDiscountTotal ?? 0;
  const payback = breakdown.platformPaybackTotal ?? 0;
  return Math.max(0, owned - payback);
}

/** Deduct platform-only promos from net platform earning; credit branch net (same as SPPC). */
export function applyPlatformOwnedDiscountToBreakdown<
  T extends {
    netPlatformEarning: number;
    netAmount: number;
    platformOwnedPromoDiscountTotal?: number;
    platformPaybackTotal?: number;
  },
>(breakdown: T): T {
  const extra = resolveExtraPlatformOwnedDeductionCents(breakdown);
  if (extra <= 0) return breakdown;
  return {
    ...breakdown,
    netPlatformEarning: breakdown.netPlatformEarning - extra,
    netAmount: breakdown.netAmount + extra,
  };
}

export function attachPromoOwnershipTotals<
  T extends {
    netPlatformEarning: number;
    netAmount: number;
    platformPaybackTotal?: number;
  },
>(
  breakdown: T,
  totals: PromoOwnershipTotals,
): T & PromoOwnershipTotals {
  return applyPlatformOwnedDiscountToBreakdown({
    ...breakdown,
    branchOwnedPromoDiscountTotal: totals.branchOwnedPromoDiscountTotal,
    platformOwnedPromoDiscountTotal: totals.platformOwnedPromoDiscountTotal,
  });
}

/** Display-only promo totals by ownership (cents), reusing invoice promo aggregation. */
export async function loadPromoOwnershipTotalsForPeriod(
  storeId: string,
  from: string,
  to: string,
): Promise<PromoOwnershipTotals> {
  await ensurePlatformPaybackSchema();
  assertPeriodRange(from, to);

  const [store, usages] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { platformDiscountPaybackEnabled: true },
    }),
    prisma.promotionUsage.findMany({
      where: {
        storeId,
        order: periodActivePaidOrdersWhere(storeId, from, to),
      },
      select: {
        promoCode: true,
        ownership: true,
        totalDiscountAmount: true,
        platformShareAmount: true,
        branchShareAmount: true,
      },
    }),
  ]);

  const storePaybackEnabled = store?.platformDiscountPaybackEnabled ?? false;
  const centUsages = usages.map((u) => ({
    promoCode: u.promoCode,
    ownership: u.ownership,
    totalDiscountAmount: Math.round(u.totalDiscountAmount * 100),
    platformShareAmount: Math.round(u.platformShareAmount * 100),
    branchShareAmount: Math.round(u.branchShareAmount * 100),
  }));
  const promoSummary = buildInvoicePromoSummaryFromUsages(centUsages, storePaybackEnabled);

  return {
    branchOwnedPromoDiscountTotal: promoSummary?.branchTotalCents ?? 0,
    platformOwnedPromoDiscountTotal: promoSummary?.platformTotalCents ?? 0,
  };
}
