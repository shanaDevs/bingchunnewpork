/**
 * Shared Promotion Platform Contribution (SPPC) — aggregates SHARED-ownership
 * promotion usage for a branch payout period, split by contribution source.
 */

import { prisma } from './prisma';
import { periodActivePaidOrdersWhere } from './walletRevenue';
import type { PeriodBreakdown } from './walletService';

export type SharedPromoContribution = {
  sharedPromoTotalDiscount: number;
  sharedPromoBranchContributionPct: number;
  sharedPromoBranchContributionAmount: number;
  sharedPromoPlatformContributionPct: number;
  sharedPromoPlatformContributionAmount: number;
  sharedPromoJasonContributionPct: number;
  sharedPromoJasonContributionAmount: number;
};

export const EMPTY_SHARED_PROMO_CONTRIBUTION: SharedPromoContribution = {
  sharedPromoTotalDiscount: 0,
  sharedPromoBranchContributionPct: 0,
  sharedPromoBranchContributionAmount: 0,
  sharedPromoPlatformContributionPct: 0,
  sharedPromoPlatformContributionAmount: 0,
  sharedPromoJasonContributionPct: 0,
  sharedPromoJasonContributionAmount: 0,
};

type SharedPromoUsageRow = {
  totalDiscountAmount: number;
  branchShareAmount: number;
  platformShareAmount: number;
  contributionSource: string | null;
};

type SharedPromoAmountTotals = {
  totalDiscount: number;
  branch: number;
  platform: number;
  jason: number;
};

function lkrToCents(amount: number): number {
  return Math.round(amount * 100);
}

function centsToLkr(cents: number): number {
  return cents / 100;
}

function pctOfTotal(amount: number, total: number): number {
  return total > 0 ? Math.round((amount * 100) / total) : 0;
}

function isPlatformContributionSource(source: string | null | undefined): boolean {
  return (source ?? 'JASON').toUpperCase() === 'PLATFORM';
}

/** Sum SHARED promotion usage rows (amounts in DB are LKR; totals are cents). */
export function aggregateSharedPromoUsageRows(rows: SharedPromoUsageRow[]): SharedPromoAmountTotals {
  const totals: SharedPromoAmountTotals = {
    totalDiscount: 0,
    branch: 0,
    platform: 0,
    jason: 0,
  };

  for (const row of rows) {
    totals.totalDiscount += lkrToCents(row.totalDiscountAmount);
    totals.branch += lkrToCents(row.branchShareAmount);
    const secondParty = lkrToCents(row.platformShareAmount);
    if (isPlatformContributionSource(row.contributionSource)) {
      totals.platform += secondParty;
    } else {
      totals.jason += secondParty;
    }
  }

  return totals;
}

function contributionFromAmountTotals(totals: SharedPromoAmountTotals): SharedPromoContribution {
  const { totalDiscount, branch, platform, jason } = totals;
  return {
    sharedPromoTotalDiscount: totalDiscount,
    sharedPromoBranchContributionPct: pctOfTotal(branch, totalDiscount),
    sharedPromoBranchContributionAmount: branch,
    sharedPromoPlatformContributionPct: pctOfTotal(platform, totalDiscount),
    sharedPromoPlatformContributionAmount: platform,
    sharedPromoJasonContributionPct: pctOfTotal(jason, totalDiscount),
    sharedPromoJasonContributionAmount: jason,
  };
}

/** Sum SHARED promotion discounts and cost splits for paid, non-cancelled orders in the period. */
export async function computeSharedPromoContribution(
  storeId: string,
  from?: string,
  to?: string,
): Promise<SharedPromoContribution> {
  const rows = await prisma.promotionUsage.findMany({
    where: {
      storeId,
      ownership: 'SHARED',
      order: periodActivePaidOrdersWhere(storeId, from, to),
    },
    select: {
      totalDiscountAmount: true,
      branchShareAmount: true,
      platformShareAmount: true,
      contributionSource: true,
    },
  });

  if (rows.length === 0) return { ...EMPTY_SHARED_PROMO_CONTRIBUTION };

  return contributionFromAmountTotals(aggregateSharedPromoUsageRows(rows));
}

/** Merge SHARED-promo totals into a period breakdown and apply platform-share adjustments. */
export function mergeSharedPromoIntoBreakdown(
  breakdown: PeriodBreakdown,
  sharedPromo: SharedPromoContribution,
): PeriodBreakdown {
  return applySppcToBreakdown({ ...breakdown, ...sharedPromo });
}

/**
 * Apply SPPC platform share after merge:
 * - deduct from net platform earning (platform funds the promo)
 * - credit the same amount to branch net payout
 * Identity: netAmount === onlinePaymentsCollected − netPlatformEarning − gatewayFee ± refunds
 */
export function applySppcToBreakdown(breakdown: PeriodBreakdown): PeriodBreakdown {
  const sppcPlatform = breakdown.sharedPromoPlatformContributionAmount ?? 0;
  return {
    ...breakdown,
    netPlatformEarning: breakdown.netPlatformEarning - sppcPlatform,
    netAmount: breakdown.netAmount + sppcPlatform,
  };
}

/** Branch wallet request plus Jason shared-promo top-up. Platform share is not added. */
export function computeFinalPayoutAmountCents(
  branchRequestCents: number,
  jasonContributionCents = 0,
): number {
  return branchRequestCents + jasonContributionCents;
}

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

type ContributionSplit = {
  platformAmount: number;
  jasonAmount: number;
  platformPct: number;
  jasonPct: number;
};

/** Legacy snapshots stored Jason's share in the platform fields. */
function splitContributionAmounts(raw: Record<string, unknown>): ContributionSplit {
  if (typeof raw.sharedPromoJasonContributionAmount !== 'number') {
    return {
      platformAmount: 0,
      jasonAmount: finiteAmount(raw.sharedPromoPlatformContributionAmount),
      platformPct: 0,
      jasonPct: finiteAmount(raw.sharedPromoPlatformContributionPct),
    };
  }
  return {
    platformAmount: finiteAmount(raw.sharedPromoPlatformContributionAmount),
    jasonAmount: finiteAmount(raw.sharedPromoJasonContributionAmount),
    platformPct: finiteAmount(raw.sharedPromoPlatformContributionPct),
    jasonPct: finiteAmount(raw.sharedPromoJasonContributionPct),
  };
}

function asBreakdownRecord(breakdown: unknown): Record<string, unknown> | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  return breakdown as Record<string, unknown>;
}

export function resolveFinalPayoutAmountFromBreakdown(
  breakdown: unknown,
  fallbackAmount: number,
): number {
  const raw = asBreakdownRecord(breakdown);
  if (!raw) return fallbackAmount;
  const finalAmount = finiteAmount(raw.finalPayoutAmount);
  if (finalAmount > 0) return finalAmount;
  return computeFinalPayoutAmountCents(fallbackAmount, splitContributionAmounts(raw).jasonAmount);
}

export function parseSharedPromoFromBreakdown(breakdown: unknown): SharedPromoContribution {
  const raw = asBreakdownRecord(breakdown);
  if (!raw) return { ...EMPTY_SHARED_PROMO_CONTRIBUTION };
  const split = splitContributionAmounts(raw);

  return {
    sharedPromoTotalDiscount: finiteAmount(raw.sharedPromoTotalDiscount),
    sharedPromoBranchContributionPct: finiteAmount(raw.sharedPromoBranchContributionPct),
    sharedPromoBranchContributionAmount: finiteAmount(raw.sharedPromoBranchContributionAmount),
    sharedPromoPlatformContributionPct: split.platformPct,
    sharedPromoPlatformContributionAmount: split.platformAmount,
    sharedPromoJasonContributionPct: split.jasonPct,
    sharedPromoJasonContributionAmount: split.jasonAmount,
  };
}

/** Attach LKR display fields and final payout total for wallet API responses. */
export function enrichSharedPromoForApi(
  sharedPromo: SharedPromoContribution,
  netAmountCents: number,
) {
  const finalPayoutAmount = computeFinalPayoutAmountCents(
    netAmountCents,
    sharedPromo.sharedPromoJasonContributionAmount,
  );
  return {
    ...sharedPromo,
    sharedPromoTotalDiscountLkr: centsToLkr(sharedPromo.sharedPromoTotalDiscount),
    sharedPromoBranchContributionAmountLkr: centsToLkr(
      sharedPromo.sharedPromoBranchContributionAmount,
    ),
    sharedPromoPlatformContributionAmountLkr: centsToLkr(
      sharedPromo.sharedPromoPlatformContributionAmount,
    ),
    sharedPromoJasonContributionAmountLkr: centsToLkr(
      sharedPromo.sharedPromoJasonContributionAmount,
    ),
    finalPayoutAmount,
    finalPayoutAmountLkr: centsToLkr(finalPayoutAmount),
  };
}
