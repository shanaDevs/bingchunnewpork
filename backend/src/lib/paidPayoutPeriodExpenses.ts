import { resolveNetPlatformAmountCentsFromWithdrawalBreakdown } from './invoice/payoutStatement';
import {
  paidPayoutAllTimeExpenseDeductionCents,
  readPayoutCycleStageFromBreakdown,
} from './paidPayoutAllTimeDeduction';
import {
  branchPayoutCentsFromWithdrawalBreakdown,
  parseSharedPromoFromBreakdown,
} from './sharedPromoContribution';

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
  /** Paid branch payouts including Jason top-up (expenses / Branch Receivable total). */
  branchReceivableCents: number;
  /** Paid branch payouts excluding Jason's investment (All-Time Available Balance). */
  branchReceivableExcludingJasonCents: number;
  jasonInvestmentCents: number;
  /** Platform + gateway + branch (expenses summary card). */
  totalExpensesCents: number;
  /** Deduction from online revenue for all-time available balance (cycle-aware). */
  allTimeExpenseDeductionCents: number;
};

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function netAmountCentsFromBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  return Math.max(0, finiteAmount((breakdown as Record<string, unknown>).netAmount));
}

export function jasonInvestmentCentsFromBreakdown(breakdown: unknown): number {
  return Math.max(0, parseSharedPromoFromBreakdown(breakdown).sharedPromoJasonContributionAmount);
}

/**
 * Actual branch receivable for All-Time Available Balance — Jason's investment excluded.
 * SECOND period net already includes Jason; some stored snapshots also added Jason onto final pay.
 */
export function branchReceivableExcludingJasonFromWithdrawal(
  breakdown: unknown,
  fallbackAmountCents: number,
): number {
  const total = branchPayoutCentsFromWithdrawalBreakdown(breakdown, fallbackAmountCents);
  const jason = jasonInvestmentCentsFromBreakdown(breakdown);
  if (jason <= 0) return Math.max(0, total);

  const cycleStage = readPayoutCycleStageFromBreakdown(breakdown);
  const netAmount = netAmountCentsFromBreakdown(breakdown);
  if (
    cycleStage === 'SECOND' &&
    netAmount > 0 &&
    Math.abs(total - (netAmount + jason)) <= 1
  ) {
    return Math.max(0, netAmount - jason);
  }
  return Math.max(0, total - jason);
}

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
  let branchReceivableExcludingJasonCents = 0;
  let jasonInvestmentCents = 0;
  let allTimeExpenseDeductionCents = 0;

  for (const row of rows) {
    const rowNetPlatform = resolveNetPlatformAmountCentsFromWithdrawalBreakdown(row.breakdown);
    const rowBranch = branchPayoutCentsFromWithdrawalBreakdown(
      row.breakdown,
      row.amountCents,
    );
    const rowJason = jasonInvestmentCentsFromBreakdown(row.breakdown);
    const rowBranchExcludingJason = branchReceivableExcludingJasonFromWithdrawal(
      row.breakdown,
      row.amountCents,
    );
    const rowGateway = gatewayFeeCentsFromWithdrawalBreakdown(row.breakdown);
    const cycleStage = readPayoutCycleStageFromBreakdown(row.breakdown);

    netPlatformAmountCents += rowNetPlatform;
    branchReceivableCents += rowBranch;
    branchReceivableExcludingJasonCents += rowBranchExcludingJason;
    jasonInvestmentCents += rowJason;
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
    branchReceivableExcludingJasonCents,
    jasonInvestmentCents,
    totalExpensesCents:
      netPlatformAmountCents + gatewayFeeCents + branchReceivableCents,
    allTimeExpenseDeductionCents,
  };
}
