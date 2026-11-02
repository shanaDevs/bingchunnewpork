import { roundLkr } from './lkrUtils';
import { resolveTotalRetainedRefundConvenienceFeeLkr } from './channelBreakdown';

/** Net platform commission for payout allocation cards and summaries. */
export function resolvePlatformCommissionForPeriodLkr(params: {
  commissionLkr: number;
  periodBreakdownLkr: {
    platformPaybackTotal?: number;
    periodLoyaltyDiscountTotal?: number;
    platformOwnedPromoDiscountTotal?: number;
    netPlatformEarning?: number;
    refundConvenienceFee?: number;
    rejectedRefundConvenienceFee?: number;
  } | null;
  paybackEnabled: boolean;
  sharedPromoPlatformLkr?: number;
}): number {
  const baseNetPlatformCommissionLkr = resolveTotalPlatformCommissionDisplayLkr({
    commissionLkr: params.commissionLkr,
    platformPaybackTotal: params.periodBreakdownLkr?.platformPaybackTotal,
    paybackEnabled: params.paybackEnabled,
    sharedPromoPlatformLkr: params.sharedPromoPlatformLkr ?? 0,
    loyaltyDiscountLkr: params.periodBreakdownLkr?.periodLoyaltyDiscountTotal ?? 0,
    platformOwnedPromoDiscountLkr: params.periodBreakdownLkr?.platformOwnedPromoDiscountTotal,
    netPlatformEarningLkr: params.periodBreakdownLkr?.netPlatformEarning,
  });
  return resolveNetPlatformCommissionWithRefundFeesLkr({
    baseNetPlatformCommissionLkr,
    refundConvenienceFeeLkr: params.periodBreakdownLkr?.refundConvenienceFee,
    rejectedRefundConvenienceFeeLkr: params.periodBreakdownLkr?.rejectedRefundConvenienceFee,
  });
}

/** Amount to subtract from commission when payback is enabled (platform-owned promos only). */
export function resolveCommissionPaybackLkr(params: {
  paybackEnabled: boolean;
  platformPaybackTotal?: number;
}): number {
  if (!params.paybackEnabled) return 0;
  return params.platformPaybackTotal ?? 0;
}

/** Platform-owned promo not already counted in store payback (LKR). */
export function resolveExtraPlatformOwnedDeductionLkr(params: {
  platformOwnedPromoDiscountLkr?: number;
  commissionPaybackLkr?: number;
}): number {
  const owned = params.platformOwnedPromoDiscountLkr ?? 0;
  const payback = params.commissionPaybackLkr ?? 0;
  return Math.max(0, roundLkr(owned - payback));
}

/** Platform + shared platform shares shown as "- Platform Discounts" on the financial report. */
export function resolvePlatformDiscountsReportLkr(params: {
  platformOwnedPromoDiscountLkr?: number;
  commissionPaybackLkr: number;
  sharedPromoPlatformLkr: number;
  paybackEnabled: boolean;
}): number {
  const owned = params.platformOwnedPromoDiscountLkr ?? 0;
  const platformDeduct = Math.max(params.commissionPaybackLkr, owned);
  const sppc = params.paybackEnabled ? params.sharedPromoPlatformLkr : 0;
  return roundLkr(platformDeduct + sppc);
}

/** Max(platform-owned, payback) deducted from commission before shared promo & loyalty. */
export function resolvePlatformPromoCommissionDeductionLkr(params: {
  platformOwnedPromoDiscountLkr?: number;
  commissionPaybackLkr: number;
}): number {
  const owned = params.platformOwnedPromoDiscountLkr ?? 0;
  return Math.max(params.commissionPaybackLkr, owned);
}

/** Branch commission after platform payback — matches Net commission in payout calculation. */
export function resolveNetCommissionLkr(params: {
  commissionLkr: number;
  platformPaybackTotal?: number;
  paybackEnabled: boolean;
}): number {
  const paybackLkr = resolveCommissionPaybackLkr({
    paybackEnabled: params.paybackEnabled,
    platformPaybackTotal: params.platformPaybackTotal,
  });
  return params.paybackEnabled ? params.commissionLkr - paybackLkr : params.commissionLkr;
}

/** Net platform commission after payback, shared-promo platform share, and loyalty deductions. */
export function resolveNetPlatformCommissionLkr(params: {
  commissionLkr: number;
  platformPaybackTotal?: number;
  paybackEnabled: boolean;
  sharedPromoPlatformLkr?: number;
  loyaltyDiscountLkr?: number;
  platformOwnedPromoDiscountLkr?: number;
  /** Prefer API snapshot when available (already includes SPPC platform deduction). */
  netPlatformEarningLkr?: number | null;
}): number {
  const commissionPaybackLkr = resolveCommissionPaybackLkr({
    paybackEnabled: params.paybackEnabled,
    platformPaybackTotal: params.platformPaybackTotal,
  });
  const extraOwned = resolveExtraPlatformOwnedDeductionLkr({
    platformOwnedPromoDiscountLkr: params.platformOwnedPromoDiscountLkr,
    commissionPaybackLkr,
  });
  const sharedPromoDeductLkr = params.paybackEnabled ? (params.sharedPromoPlatformLkr ?? 0) : 0;

  if (params.netPlatformEarningLkr != null) {
    const snapshotNet = params.netPlatformEarningLkr - extraOwned;
    if (!params.paybackEnabled && (params.sharedPromoPlatformLkr ?? 0) > 0) {
      return roundLkr(snapshotNet + (params.sharedPromoPlatformLkr ?? 0));
    }
    return roundLkr(snapshotNet);
  }

  const platformPromoDeduct = resolvePlatformPromoCommissionDeductionLkr({
    platformOwnedPromoDiscountLkr: params.platformOwnedPromoDiscountLkr,
    commissionPaybackLkr,
  });

  return roundLkr(
    params.commissionLkr -
      platformPromoDeduct -
      sharedPromoDeductLkr -
      (params.loyaltyDiscountLkr ?? 0),
  );
}

/** Branch-chargeable platform commission for payout allocation (excludes refund convenience fees). */
export function resolveTotalPlatformCommissionDisplayLkr(params: {
  commissionLkr: number;
  platformPaybackTotal?: number;
  paybackEnabled: boolean;
  sharedPromoPlatformLkr?: number;
  loyaltyDiscountLkr?: number;
  platformOwnedPromoDiscountLkr?: number;
  netPlatformEarningLkr?: number | null;
}): number {
  return resolveNetPlatformCommissionLkr(params);
}

/** Net platform commission shown in the Commission section (includes retained refund convenience fees). */
export function resolveNetPlatformCommissionWithRefundFeesLkr(params: {
  baseNetPlatformCommissionLkr: number;
  refundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
}): number {
  return (
    params.baseNetPlatformCommissionLkr +
    resolveTotalRetainedRefundConvenienceFeeLkr(params)
  );
}

/** Total discounts for Sales display (all promos + loyalty). */
export function resolveTotalDiscountsLkr(params: {
  periodDiscountsTotal?: number;
  previewDiscountTotal?: number;
}): number {
  if (params.previewDiscountTotal != null && params.previewDiscountTotal > 0.001) {
    return params.previewDiscountTotal;
  }
  return params.periodDiscountsTotal ?? 0;
}