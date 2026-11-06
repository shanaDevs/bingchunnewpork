/**
 * Running "Available to withdraw" for Initiate Payout — all-time pickup + delivery
 * online minus branch receivable (pending holds applied upstream), minus net payout for "after".
 */
export type InitiatePayoutAvailableBalance = {
  onlinePoolLkr: number;
  priorPairNetPayoutFinalPayLkr: number;
  availableBeforePayoutLkr: number;
  availableAfterPayoutLkr: number | null;
};

export function resolveInitiatePayoutAvailableBalance(params: {
  /** LKR pool: all-time online revenue − branch receivable (− pending if already deducted). */
  withdrawablePoolLkr: number;
  /** This period's net payout (final pay amount) from the financial report. */
  netPayoutFinalPayLkr: number;
}): InitiatePayoutAvailableBalance {
  const availableBeforePayoutLkr = Math.max(0, params.withdrawablePoolLkr);
  const netPayoutFinalPay = Math.max(0, params.netPayoutFinalPayLkr);
  const availableAfterPayoutLkr =
    netPayoutFinalPay > 0.001
      ? Math.max(0, availableBeforePayoutLkr - netPayoutFinalPay)
      : null;

  return {
    onlinePoolLkr: availableBeforePayoutLkr,
    priorPairNetPayoutFinalPayLkr: 0,
    availableBeforePayoutLkr,
    availableAfterPayoutLkr,
  };
}
