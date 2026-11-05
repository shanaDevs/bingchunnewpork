/**
 * Running "Available to withdraw" for Initiate Payout — online wallet pool minus
 * prior net payouts (final pay amount) in the same cycle pair.
 */
export type InitiatePayoutAvailableBalance = {
  onlinePoolLkr: number;
  priorPairNetPayoutFinalPayLkr: number;
  availableBeforePayoutLkr: number;
  availableAfterPayoutLkr: number | null;
};

export function resolveInitiatePayoutAvailableBalance(params: {
  /** Current wallet summary (already reduced by approved net payouts). */
  onlineWalletAvailableLkr: number;
  /** Payout 1 net payout (final pay amount) in this cycle pair. */
  priorPairNetPayoutFinalPayLkr: number;
  cycleStage: 'FIRST' | 'SECOND' | undefined;
  /** This period's net payout (final pay amount) from the financial report. */
  netPayoutFinalPayLkr: number;
}): InitiatePayoutAvailableBalance {
  const prior = Math.max(0, params.priorPairNetPayoutFinalPayLkr);
  const onlinePoolLkr = Math.max(0, params.onlineWalletAvailableLkr + prior);
  const availableBeforePayoutLkr =
    params.cycleStage === 'SECOND'
      ? Math.max(0, onlinePoolLkr - prior)
      : onlinePoolLkr;
  const netPayoutFinalPay = Math.max(0, params.netPayoutFinalPayLkr);
  const availableAfterPayoutLkr =
    netPayoutFinalPay > 0.001
      ? Math.max(0, availableBeforePayoutLkr - netPayoutFinalPay)
      : null;

  return {
    onlinePoolLkr,
    priorPairNetPayoutFinalPayLkr: prior,
    availableBeforePayoutLkr,
    availableAfterPayoutLkr,
  };
}
