/** All monetary fields are integer cents unless noted. gatewayRatePct is e.g. 1.9 for 1.9%. */

export type PlatformProviderReceivableInput = {
  commissionFeeCents: number;
  platformPaybackCents?: number;
  loyaltyDiscountCents?: number;
  sharedPromoPlatformCents?: number;
  normalConvenienceFeeCents?: number;
  completedRefundConvenienceFeeCents?: number;
  rejectedRefundConvenienceFeeCents?: number;
  /** Combined refund convenience fallback when split values are unavailable. */
  refundConvenienceFeeCents?: number;
  gatewayRatePct: number;
};

export type PlatformProviderReceivableBreakdown = {
  commissionFeeCents: number;
  platformPaybackCents: number;
  loyaltyDiscountCents: number;
  sharedPromoPlatformCents: number;
  netPlatformCommissionCents: number;
  completedRefundConvenienceFeeCents: number;
  rejectedRefundConvenienceFeeCents: number;
  netPlatformEarningsCents: number;
  normalConvenienceFeeCents: number;
  eligibleProviderAmountCents: number;
  gatewayDeductionCents: number;
  totalPlatformProviderReceivableCents: number;
  gatewayRatePct: number;
};

/** LKR breakdown (2 dp) for API/UI payloads. */
export type PlatformProviderReceivableLkr = {
  commissionFeeLkr: number;
  platformPaybackLkr: number;
  loyaltyDiscountLkr: number;
  sharedPromoPlatformLkr: number;
  netPlatformCommissionLkr: number;
  completedRefundConvenienceFeeLkr: number;
  rejectedRefundConvenienceFeeLkr: number;
  netPlatformEarningsLkr: number;
  normalConvenienceFeeLkr: number;
  eligibleProviderAmountLkr: number;
  gatewayDeductionLkr: number;
  totalPlatformProviderReceivableLkr: number;
  gatewayRatePct: number;
};

export type PlatformProviderReceivableLkrInput = {
  commissionFeeLkr: number;
  platformPaybackLkr?: number;
  loyaltyDiscountLkr?: number;
  sharedPromoPlatformLkr?: number;
  normalConvenienceFeeLkr?: number;
  /** Alias for normalConvenienceFeeLkr. */
  convenienceFeeLkr?: number;
  completedRefundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
  refundConvenienceFeeLkr?: number;
  gatewayRatePct: number;
};

function resolveRefundConvenienceFees(params: {
  completedRefundConvenienceFeeCents?: number;
  rejectedRefundConvenienceFeeCents?: number;
  refundConvenienceFeeCents?: number;
}): { completed: number; rejected: number } {
  const hasSplit =
    params.completedRefundConvenienceFeeCents != null ||
    params.rejectedRefundConvenienceFeeCents != null;

  if (hasSplit) {
    return {
      completed: params.completedRefundConvenienceFeeCents ?? 0,
      rejected: params.rejectedRefundConvenienceFeeCents ?? 0,
    };
  }

  return {
    completed: params.refundConvenienceFeeCents ?? 0,
    rejected: 0,
  };
}

function roundGatewayDeductionCents(amountCents: number, gatewayRatePct: number): number {
  return Math.round((amountCents * gatewayRatePct) / 100);
}

export function computePlatformProviderReceivable(
  params: PlatformProviderReceivableInput,
): PlatformProviderReceivableBreakdown {
  const platformPaybackCents = params.platformPaybackCents ?? 0;
  const loyaltyDiscountCents = params.loyaltyDiscountCents ?? 0;
  const sharedPromoPlatformCents = params.sharedPromoPlatformCents ?? 0;
  const normalConvenienceFeeCents = params.normalConvenienceFeeCents ?? 0;
  const { completed: completedRefundConvenienceFeeCents, rejected: rejectedRefundConvenienceFeeCents } =
    resolveRefundConvenienceFees({
      completedRefundConvenienceFeeCents: params.completedRefundConvenienceFeeCents,
      rejectedRefundConvenienceFeeCents: params.rejectedRefundConvenienceFeeCents,
      refundConvenienceFeeCents: params.refundConvenienceFeeCents,
    });

  const netPlatformCommissionCents =
    params.commissionFeeCents -
    platformPaybackCents -
    loyaltyDiscountCents -
    sharedPromoPlatformCents;

  const netPlatformEarningsCents =
    netPlatformCommissionCents +
    completedRefundConvenienceFeeCents +
    rejectedRefundConvenienceFeeCents;

  const eligibleProviderAmountCents =
    netPlatformEarningsCents + normalConvenienceFeeCents;

  const gatewayDeductionCents = roundGatewayDeductionCents(
    eligibleProviderAmountCents,
    params.gatewayRatePct,
  );

  const totalPlatformProviderReceivableCents =
    eligibleProviderAmountCents - gatewayDeductionCents;

  return {
    commissionFeeCents: params.commissionFeeCents,
    platformPaybackCents,
    loyaltyDiscountCents,
    sharedPromoPlatformCents,
    netPlatformCommissionCents,
    completedRefundConvenienceFeeCents,
    rejectedRefundConvenienceFeeCents,
    netPlatformEarningsCents,
    normalConvenienceFeeCents,
    eligibleProviderAmountCents,
    gatewayDeductionCents,
    totalPlatformProviderReceivableCents,
    gatewayRatePct: params.gatewayRatePct,
  };
}

function centsToLkr(cents: number): number {
  return Math.round(cents) / 100;
}

function lkrToCents(lkr: number): number {
  return Math.round(lkr * 100);
}

/** Convert cents breakdown to LKR (2 dp) for API/UI payloads. */
export function platformProviderReceivableToLkr(
  breakdown: PlatformProviderReceivableBreakdown,
): PlatformProviderReceivableLkr {
  return {
    commissionFeeLkr: centsToLkr(breakdown.commissionFeeCents),
    platformPaybackLkr: centsToLkr(breakdown.platformPaybackCents),
    loyaltyDiscountLkr: centsToLkr(breakdown.loyaltyDiscountCents),
    sharedPromoPlatformLkr: centsToLkr(breakdown.sharedPromoPlatformCents),
    netPlatformCommissionLkr: centsToLkr(breakdown.netPlatformCommissionCents),
    completedRefundConvenienceFeeLkr: centsToLkr(breakdown.completedRefundConvenienceFeeCents),
    rejectedRefundConvenienceFeeLkr: centsToLkr(breakdown.rejectedRefundConvenienceFeeCents),
    netPlatformEarningsLkr: centsToLkr(breakdown.netPlatformEarningsCents),
    normalConvenienceFeeLkr: centsToLkr(breakdown.normalConvenienceFeeCents),
    eligibleProviderAmountLkr: centsToLkr(breakdown.eligibleProviderAmountCents),
    gatewayDeductionLkr: centsToLkr(breakdown.gatewayDeductionCents),
    totalPlatformProviderReceivableLkr: centsToLkr(breakdown.totalPlatformProviderReceivableCents),
    gatewayRatePct: breakdown.gatewayRatePct,
  };
}

export function platformProviderReceivableInputFromLkr(
  input: PlatformProviderReceivableLkrInput,
): PlatformProviderReceivableInput {
  return {
    commissionFeeCents: lkrToCents(input.commissionFeeLkr),
    platformPaybackCents: lkrToCents(input.platformPaybackLkr ?? 0),
    loyaltyDiscountCents: lkrToCents(input.loyaltyDiscountLkr ?? 0),
    sharedPromoPlatformCents: lkrToCents(input.sharedPromoPlatformLkr ?? 0),
    normalConvenienceFeeCents: lkrToCents(
      input.normalConvenienceFeeLkr ?? input.convenienceFeeLkr ?? 0,
    ),
    completedRefundConvenienceFeeCents:
      input.completedRefundConvenienceFeeLkr != null
        ? lkrToCents(input.completedRefundConvenienceFeeLkr)
        : undefined,
    rejectedRefundConvenienceFeeCents:
      input.rejectedRefundConvenienceFeeLkr != null
        ? lkrToCents(input.rejectedRefundConvenienceFeeLkr)
        : undefined,
    refundConvenienceFeeCents:
      input.refundConvenienceFeeLkr != null ? lkrToCents(input.refundConvenienceFeeLkr) : undefined,
    gatewayRatePct: input.gatewayRatePct,
  };
}

/** Compute receivable from LKR inputs (preview/fallback paths). */
export function computePlatformProviderReceivableLkr(
  input: PlatformProviderReceivableLkrInput,
): PlatformProviderReceivableLkr {
  const centsInput = platformProviderReceivableInputFromLkr(input);
  return platformProviderReceivableToLkr(computePlatformProviderReceivable(centsInput));
}

export function platformProviderReceivableInputFromBreakdownCents(
  breakdown: {
    commissionFee?: number;
    platformPaybackTotal?: number;
    periodLoyaltyDiscountTotal?: number;
    sharedPromoPlatformContributionAmount?: number;
    convenienceFee?: number;
    refundConvenienceFee?: number;
    rejectedRefundConvenienceFee?: number;
    gatewayRatePct?: number;
  },
): PlatformProviderReceivableInput {
  return {
    commissionFeeCents: breakdown.commissionFee ?? 0,
    platformPaybackCents: breakdown.platformPaybackTotal ?? 0,
    loyaltyDiscountCents: breakdown.periodLoyaltyDiscountTotal ?? 0,
    sharedPromoPlatformCents: breakdown.sharedPromoPlatformContributionAmount ?? 0,
    normalConvenienceFeeCents: breakdown.convenienceFee ?? 0,
    completedRefundConvenienceFeeCents: breakdown.refundConvenienceFee ?? 0,
    rejectedRefundConvenienceFeeCents: breakdown.rejectedRefundConvenienceFee ?? 0,
    gatewayRatePct: breakdown.gatewayRatePct ?? 1.9,
  };
}
