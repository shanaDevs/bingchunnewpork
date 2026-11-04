/**
 * Net platform amount (cents) — matches Payout Request Details "Net Platform Amount"
 * (commission − platform promo deduction − shared platform when payback − loyalty).
 * Does not use stored netPlatformEarning snapshot.
 */

function num(o: Record<string, unknown>, key: string): number {
  const value = o[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function paybackEnabledFromBreakdown(o: Record<string, unknown>): boolean {
  if (typeof o.platformDiscountPaybackEnabled === 'boolean') {
    return o.platformDiscountPaybackEnabled;
  }
  return num(o, 'platformPaybackTotal') > 0;
}

export function resolveNetPlatformAmountCentsFromWithdrawalBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const o = breakdown as Record<string, unknown>;

  const commissionCents = num(o, 'commissionFee');
  const platformPaybackTotalCents = num(o, 'platformPaybackTotal');
  const loyaltyDiscountCents = num(o, 'periodLoyaltyDiscountTotal');
  const platformOwnedPromoCents = num(o, 'platformOwnedPromoDiscountTotal');
  const sharedPlatformCents = num(o, 'sharedPromoPlatformContributionAmount');
  const paybackEnabled = paybackEnabledFromBreakdown(o);

  const commissionPaybackCents = paybackEnabled ? platformPaybackTotalCents : 0;
  const platformPromoDeductCents = Math.max(commissionPaybackCents, platformOwnedPromoCents);
  const sharedPromoDeductCents = paybackEnabled ? sharedPlatformCents : 0;

  return (
    commissionCents - platformPromoDeductCents - sharedPromoDeductCents - loyaltyDiscountCents
  );
}
