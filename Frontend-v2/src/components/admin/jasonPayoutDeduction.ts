/**
 * Total Jason balance reduction for a branch payout (SPPC + negative net platform credit).
 * Mirrors `jasonPayoutDeductionCentsFromBreakdown` in backend `jasonPayoutContribution.ts` (LKR vs cents).
 */
export function jasonPayoutDeductionLkr(params: {
  jasonContributionLkr?: number;
  netPlatformAmountLkr?: number;
}): number {
  const sppcJason = Math.max(0, params.jasonContributionLkr ?? 0);
  const netPlatform = params.netPlatformAmountLkr ?? 0;
  const deficitCover = netPlatform < -0.001 ? Math.abs(netPlatform) : 0;
  return sppcJason + deficitCover;
}

export function formatJasonPayoutDeductionMessage(deductionLkr: number): string {
  if (deductionLkr <= 0.001) return '';
  return `Jason's balance will be reduced by LKR ${deductionLkr.toFixed(2)} for this payout (shared promo and/or negative net platform amount).`;
}