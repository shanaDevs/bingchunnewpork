import type { InvoicePayoutStatement } from './invoice/types';
import { secondPayoutPriorBeforeGatewayFeeCents } from './payoutCycle';
import { refreshSecondPayoutGatewayAndNet, type PeriodBreakdown } from './walletService';

/** Replace a stored Payout 2 prior (net after gateway) with the Payout 1 online wallet before gateway. */
export async function rebaseSecondPayoutPriorBeforeGateway(input: {
  storeId: string;
  cycleStage?: string | null;
  cyclePairId?: string | null;
  breakdown: unknown;
  payoutStatement?: InvoicePayoutStatement | null;
}): Promise<{ breakdown: unknown; payoutStatement?: InvoicePayoutStatement | null }> {
  if (input.cycleStage !== 'SECOND' || !input.breakdown || typeof input.breakdown !== 'object') {
    return { breakdown: input.breakdown, payoutStatement: input.payoutStatement };
  }
  const prior = await secondPayoutPriorBeforeGatewayFeeCents(input.storeId, input.cyclePairId);
  if (prior == null) {
    return { breakdown: input.breakdown, payoutStatement: input.payoutStatement };
  }

  const breakdown = refreshSecondPayoutGatewayAndNet({
    ...(input.breakdown as PeriodBreakdown),
    cycleStage: 'SECOND',
    priorOnlineWalletAmountCents: prior,
  });
  const payoutStatement = input.payoutStatement
    ? {
        ...input.payoutStatement,
        priorOnlineWalletAmountCents: prior,
        gatewayFeeCents: breakdown.gatewayFee,
        branchNetPayoutCents: breakdown.netAmount,
      }
    : input.payoutStatement;

  return { breakdown, payoutStatement };
}
