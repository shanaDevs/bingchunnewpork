import {
  computeBreakdownForPeriod,
  type PeriodBreakdown,
} from './walletService';
import {
  computeSharedPromoContribution,
  mergeSharedPromoIntoBreakdown,
} from './sharedPromoContribution';
import {
  attachPromoOwnershipTotals,
  loadPromoOwnershipTotalsForPeriod,
} from './promoOwnershipTotals';
import {
  resolvePayoutCycleContext,
  type PayoutCycleContext,
  type PayoutBreakdownOptions,
} from './payoutCycle';

function applyFirstCycleFinancialPolicy(period: PeriodBreakdown): PeriodBreakdown {
  return {
    ...period,
    sharedPromoTotalDiscount: 0,
    sharedPromoBranchContributionPct: 0,
    sharedPromoBranchContributionAmount: 0,
    sharedPromoPlatformContributionPct: 0,
    sharedPromoPlatformContributionAmount: 0,
    sharedPromoJasonContributionPct: 0,
    sharedPromoJasonContributionAmount: 0,
    finalPayoutAmount: period.netAmount,
    branchOwnedPromoDiscountTotal: 0,
    platformOwnedPromoDiscountTotal: 0,
  };
}

/** Period breakdown with shared promo and promo ownership (request + approval validation). */
export async function computePeriodBreakdownForPayout(
  storeId: string,
  fromStr: string,
  toStr: string,
  cycleCtx?: PayoutCycleContext,
): Promise<PeriodBreakdown> {
  const cycle = cycleCtx ?? (await resolvePayoutCycleContext(storeId));
  const promoFrom = cycle.cycleStage === 'SECOND' && cycle.cycleFrom ? cycle.cycleFrom : fromStr;
  const breakdownOpts: PayoutBreakdownOptions = { ...cycle, cycleTo: toStr };

  if (cycle.cycleStage === 'FIRST') {
    const breakdown = await computeBreakdownForPeriod(storeId, fromStr, toStr, breakdownOpts);
    return applyFirstCycleFinancialPolicy(breakdown);
  }

  const [breakdown, sharedPromo, promoOwnership] = await Promise.all([
    computeBreakdownForPeriod(storeId, fromStr, toStr, breakdownOpts),
    computeSharedPromoContribution(storeId, promoFrom, toStr),
    loadPromoOwnershipTotalsForPeriod(storeId, promoFrom, toStr),
  ]);
  return attachPromoOwnershipTotals(
    mergeSharedPromoIntoBreakdown(breakdown, sharedPromo),
    promoOwnership,
  );
}

export async function computePeriodNetAmountCents(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<number> {
  const period = await computePeriodBreakdownForPayout(storeId, fromStr, toStr);
  return period.netAmount;
}
