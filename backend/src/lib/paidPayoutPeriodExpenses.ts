import { resolveNetPlatformAmountCentsFromWithdrawalBreakdown } from './invoice/payoutStatement';
import {
  paidPayoutAllTimeExpenseDeductionCents,
  readPayoutCycleStageFromBreakdown,
} from './paidPayoutAllTimeDeduction';
import { branchPayoutCentsFromWithdrawalBreakdown } from './sharedPromoContribution';

function gatewayFeeCentsFromWithdrawalBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const gatewayFee = (breakdown as Record<string, unknown>).gatewayFee;
  return typeof gatewayFee === 'number' && Number.isFinite(gatewayFee)
    ? Math.round(gatewayFee)
    : 0;
}

export type PaidPayoutPeriodExpensesCents = {
  netPlatformAmountCents: number;
  gatewayFeeCents: number;
  branchReceivableCents: number;
  /** Platform + gateway + branch (expenses summary card). */
  totalExpensesCents: number;
  /** Deduction from online revenue for all-time available balance (cycle-aware). */
  allTimeExpenseDeductionCents: number;
};

type PaidPayoutWithdrawalRow = {
  amountCents: number;
  breakdown: unknown;
};

/**
 * Sum Payout Request Details expense lines for **APPROVED** 15-day payouts only.
 * Matches branch Payables “Expenses Summary” (`aggregatePaidPayoutPeriodExpensesCents` on admin UI).
 */
export function aggregatePaidPayoutPeriodExpensesCents(
  rows: PaidPayoutWithdrawalRow[],
): PaidPayoutPeriodExpensesCents {
  let netPlatformAmountCents = 0;
  let gatewayFeeCents = 0;
  let branchReceivableCents = 0;
  let allTimeExpenseDeductionCents = 0;

  for (const row of rows) {
    const rowNetPlatform = resolveNetPlatformAmountCentsFromWithdrawalBreakdown(row.breakdown);
    const rowBranch = branchPayoutCentsFromWithdrawalBreakdown(
      row.breakdown,
      row.amountCents,
    );
    const rowGateway = gatewayFeeCentsFromWithdrawalBreakdown(row.breakdown);
    const cycleStage = readPayoutCycleStageFromBreakdown(row.breakdown);

    netPlatformAmountCents += rowNetPlatform;
    branchReceivableCents += rowBranch;
    gatewayFeeCents += rowGateway;
    allTimeExpenseDeductionCents += paidPayoutAllTimeExpenseDeductionCents({
      cycleStage,
      netPlatformAmountCents: rowNetPlatform,
      gatewayFeeCents: rowGateway,
      branchReceivableCents: rowBranch,
    });
  }

  return {
    netPlatformAmountCents,
    gatewayFeeCents,
    branchReceivableCents,
    totalExpensesCents:
      netPlatformAmountCents + gatewayFeeCents + branchReceivableCents,
    allTimeExpenseDeductionCents,
  };
}
