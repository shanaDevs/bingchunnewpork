/**
 * Running "Available to withdraw" for Initiate Payout — all-time pickup + delivery
 * online minus branch receivable (pending holds applied upstream).
 * Jason discounts are paid from Jason's investment, not from the branch online wallet.
 */
export type InitiatePayoutAvailableBalance = {
  onlinePoolLkr: number;
  priorPairNetPayoutFinalPayLkr: number;
  /** Amount taken from pickup + delivery online (final pay minus Jason discounts). */
  onlineWalletDebitLkr: number;
  availableBeforePayoutLkr: number;
  availableAfterPayoutLkr: number | null;
};

/** Branch online-wallet debit — Jason discounts are excluded. */
export function onlineWalletDebitLkrFromPayout(params: {
  netPayoutFinalPayLkr: number;
  jasonDiscountsLkr?: number;
}): number {
  const netPayout = Math.max(0, params.netPayoutFinalPayLkr);
  const jason = Math.max(0, params.jasonDiscountsLkr ?? 0);
  return Math.max(0, netPayout - jason);
}

export function resolveInitiatePayoutAvailableBalance(params: {
  /** LKR pool: all-time online revenue − branch receivable (− pending if already deducted). */
  withdrawablePoolLkr: number;
  /** This period's net payout (final pay amount) from the financial report. */
  netPayoutFinalPayLkr: number;
  /** Jason shared-promo discounts — funded by Jason's investment, not the online wallet. */
  jasonDiscountsLkr?: number;
}): InitiatePayoutAvailableBalance {
  const availableBeforePayoutLkr = Math.max(0, params.withdrawablePoolLkr);
  const netPayoutFinalPay = Math.max(0, params.netPayoutFinalPayLkr);
  const onlineWalletDebitLkr = onlineWalletDebitLkrFromPayout({
    netPayoutFinalPayLkr: netPayoutFinalPay,
    jasonDiscountsLkr: params.jasonDiscountsLkr,
  });
  const availableAfterPayoutLkr =
    netPayoutFinalPay > 0.001
      ? Math.max(0, availableBeforePayoutLkr - onlineWalletDebitLkr)
      : null;

  return {
    onlinePoolLkr: availableBeforePayoutLkr,
    priorPairNetPayoutFinalPayLkr: 0,
    onlineWalletDebitLkr,
    availableBeforePayoutLkr,
    availableAfterPayoutLkr,
  };
}
