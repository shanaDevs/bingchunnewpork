import { parseWithdrawalBreakdown } from '@/components/admin/settlementTypes';

export type PayoutCycleStage = 'FIRST' | 'SECOND';

export function readPayoutCycleStageFromBreakdown(
  breakdown: unknown,
): PayoutCycleStage | undefined {
  if (breakdown && typeof breakdown === 'object') {
    const stage = (breakdown as Record<string, unknown>).cycleStage;
    if (stage === 'FIRST' || stage === 'SECOND') {
      return stage;
    }
  }
  const parsed = parseWithdrawalBreakdown(breakdown);
  if (parsed?.cycleStage === 'FIRST' || parsed?.cycleStage === 'SECOND') {
    return parsed.cycleStage;
  }
  const prior = parsed?.priorOnlineWalletAmountCents;
  if (typeof prior === 'number' && Number.isFinite(prior) && prior > 0) {
    return 'SECOND';
  }
  if (breakdown && typeof breakdown === 'object') {
    const priorRaw = (breakdown as Record<string, unknown>).priorOnlineWalletAmountCents;
    if (typeof priorRaw === 'number' && Number.isFinite(priorRaw) && priorRaw > 0) {
      return 'SECOND';
    }
  }
  return undefined;
}

export function paidPayoutAllTimeExpenseDeductionCents(params: {
  cycleStage: PayoutCycleStage | undefined;
  netPlatformAmountCents: number;
  gatewayFeeCents: number;
  branchReceivableCents: number;
}): number {
  const { cycleStage, netPlatformAmountCents, gatewayFeeCents, branchReceivableCents } =
    params;
  if (cycleStage === 'SECOND') {
    return branchReceivableCents;
  }
  if (cycleStage === 'FIRST') {
    return gatewayFeeCents + branchReceivableCents;
  }
  return netPlatformAmountCents + gatewayFeeCents + branchReceivableCents;
}
