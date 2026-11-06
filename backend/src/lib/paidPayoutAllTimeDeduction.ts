export type PayoutCycleStage = 'FIRST' | 'SECOND';

/** Locked withdrawal snapshot cycle (Payout 1 / Payout 2). */
export function readPayoutCycleStageFromBreakdown(
  breakdown: unknown,
): PayoutCycleStage | undefined {
  if (!breakdown || typeof breakdown !== 'object') return undefined;
  const o = breakdown as Record<string, unknown>;
  if (o.cycleStage === 'FIRST' || o.cycleStage === 'SECOND') {
    return o.cycleStage;
  }
  const prior = o.priorOnlineWalletAmountCents;
  if (typeof prior === 'number' && Number.isFinite(prior) && prior > 0) {
    return 'SECOND';
  }
  return undefined;
}

/**
 * Cycle-aware expense total for paid payout period aggregation (expense cards / reporting).
 * Not used for Branch Payables “All-Time Available Balance” (online revenue − branch receivable only).
 */
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
