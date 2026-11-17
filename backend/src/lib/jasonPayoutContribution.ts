import { resolveNetPlatformAmountCentsFromWithdrawalBreakdown } from './invoice/netPlatformAmountFromBreakdown';
import { parseSharedPromoFromBreakdown } from './sharedPromoContribution';

/** Cents credited to the branch when net platform amount is negative (funded from Jason). */
export function jasonNegativeNetPlatformCreditCents(breakdown: unknown): number {
  const netPlatform = resolveNetPlatformAmountCentsFromWithdrawalBreakdown(breakdown);
  return netPlatform < 0 ? -netPlatform : 0;
}

export function jasonSharedPromoContributionCents(breakdown: unknown): number {
  return Math.max(
    0,
    parseSharedPromoFromBreakdown(breakdown).sharedPromoJasonContributionAmount,
  );
}

/** Total Jason ledger expense for an approved payout (SPPC + net platform deficit). */
export function jasonPayoutDeductionCentsFromBreakdown(breakdown: unknown): number {
  return (
    jasonSharedPromoContributionCents(breakdown) +
    jasonNegativeNetPlatformCreditCents(breakdown)
  );
}