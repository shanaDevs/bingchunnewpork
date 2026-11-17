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

/** Period breakdown with shared promo and promo ownership (request + approval validation). */
export async function computePeriodBreakdownForPayout(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<PeriodBreakdown> {
  const [breakdown, sharedPromo, promoOwnership] = await Promise.all([
    computeBreakdownForPeriod(storeId, fromStr, toStr),
    computeSharedPromoContribution(storeId, fromStr, toStr),
    loadPromoOwnershipTotalsForPeriod(storeId, fromStr, toStr),
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
