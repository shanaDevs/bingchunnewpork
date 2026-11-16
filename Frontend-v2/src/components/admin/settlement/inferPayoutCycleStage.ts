import type { PayoutFormulaBreakdownLkr } from '@/components/admin/settlementTypes';

/** Infer two-stage payout cycle when `cycleStage` is not stored on the breakdown. */
export function inferPayoutCycleStage(
  periodBreakdownLkr: PayoutFormulaBreakdownLkr,
): 'FIRST' | 'SECOND' | undefined {
  return (
    periodBreakdownLkr.cycleStage ??
    (periodBreakdownLkr.commissionFee <= 0.001 &&
    (periodBreakdownLkr.netPlatformEarning ?? 0) <= 0.001 &&
    (periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0) <= 0.001
      ? ('FIRST' as const)
      : undefined)
  );
}
