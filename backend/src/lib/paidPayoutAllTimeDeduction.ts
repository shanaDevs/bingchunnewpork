/** Read two-stage payout cycle from a stored withdrawal breakdown. */
export function readPayoutCycleStageFromBreakdown(
  breakdown: unknown,
): 'FIRST' | 'SECOND' | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const stage = (breakdown as Record<string, unknown>).cycleStage;
  if (stage === 'FIRST' || stage === 'SECOND') return stage;
  return null;
}