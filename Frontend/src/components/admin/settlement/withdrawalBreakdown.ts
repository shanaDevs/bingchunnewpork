import {
  centsToLkrAmount,
  coerceBreakdownNumber,
  hasAnyPositiveLkr,
  parseJsonObjectIfString,
} from './lkrUtils';
import { normalizeSettlementBreakdown } from './channelBreakdown';
import type { SettlementBreakdown } from './channelBreakdown';

export type WithdrawalBreakdown = {
  grossAmount: number;
  deliveryFee: number;
  commissionFee: number;
  gatewayFee: number;
  gatewayBase?: number;
  onlineWalletGross?: number;
  convenienceFee?: number;
  netAmount: number;
  platformPaybackTotal?: number;
  periodDiscountsTotal?: number;
  /** Loyalty-points redemption discounts only (cents). Subset of periodDiscountsTotal. */
  periodLoyaltyDiscountTotal?: number;
  netPlatformEarning?: number;
  periodDues?: number;
  orderCount: number;
  /** Branch-admin cancellation gateway penalties in period (cents). */
  cancelledByBranchGatewayFee?: number;
  /** Count of branch-admin cancellations with gateway fee in period. */
  cancelledByBranchOrderCount?: number;
  /** Sum of notReturningSubtotal from eligible customer late-cancellations (cents). */
  customerLateCancelSubtotal?: number;
  /** Gateway deduction on customer late-cancel non-returning subtotal (cents). */
  customerLateCancelGatewayDeduction?: number;
  /** Net amount added to branch payout from customer late-cancellations (cents). */
  customerLateCancelNetAmount?: number;
  /** Sum of nonRefundableConvenienceFee from eligible customer late-cancel refunds (cents). */
  refundConvenienceFee?: number;
  /** Sum of nonRefundableDeliveryFee from eligible customer late-cancel refunds (cents). */
  refundDeliveryFee?: number;
  /** Sum of notReturningSubtotal from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundSubtotal?: number;
  /** Gateway deduction on rejected-refund non-returning subtotal (cents). */
  rejectedRefundGatewayDeduction?: number;
  /** Net amount added to branch payout from rejected refunds (cents). */
  rejectedRefundNetAmount?: number;
  /** Sum of nonRefundableConvenienceFee from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundConvenienceFee?: number;
  /** Sum of nonRefundableDeliveryFee from rejected refunds not covered by late-cancel recovery (cents). */
  rejectedRefundDeliveryFee?: number;
  /** Effective commission rate (0–1) locked in at payout request time. */
  commissionRate?: number;
  /** Gateway fee rate locked at payout request time (display percent, e.g. 1.9). */
  gatewayRatePct?: number;
  /** Per-channel LKR snapshot captured at payout request submission. */
  channelBreakdown?: SettlementBreakdown;
  /** Total discount from SHARED promotions in period (cents). */
  sharedPromoTotalDiscount?: number;
  sharedPromoBranchContributionPct?: number;
  sharedPromoBranchContributionAmount?: number;
  sharedPromoPlatformContributionPct?: number;
  sharedPromoPlatformContributionAmount?: number;
  sharedPromoJasonContributionPct?: number;
  sharedPromoJasonContributionAmount?: number;
  /** Branch wallet request + Jason shared-promo top-up (cents). */
  finalPayoutAmount?: number;
  /** Locked calculated period net at request time (cents). Mirrors netAmount when present. */
  periodNetAmount?: number;
  /** Branch wallet request locked at request time (cents). */
  branchRequestNetAmount?: number;
  /** BRANCH-ownership promotion discounts in period (cents). Display snapshot only. */
  branchOwnedPromoDiscountTotal?: number;
  /** PLATFORM-ownership promotion discounts in period (cents). Display snapshot only. */
  platformOwnedPromoDiscountTotal?: number;
  cycleStage?: 'FIRST' | 'SECOND';
  cycleFrom?: string;
  cycleTo?: string;
  cyclePairId?: string;
  priorOnlineWalletAmountCents?: number;
  remainingOnlineWalletCents?: number;
};

const WITHDRAWAL_REQUIRED_NUMBER_KEYS = [
  'grossAmount',
  'deliveryFee',
  'commissionFee',
  'gatewayFee',
  'netAmount',
  'orderCount',
] as const satisfies ReadonlyArray<keyof WithdrawalBreakdown>;

const WITHDRAWAL_OPTIONAL_NUMBER_KEYS = [
  'convenienceFee',
  'gatewayBase',
  'onlineWalletGross',
  'platformPaybackTotal',
  'periodDiscountsTotal',
  'periodLoyaltyDiscountTotal',
  'netPlatformEarning',
  'periodDues',
  'commissionRate',
  'cancelledByBranchGatewayFee',
  'cancelledByBranchOrderCount',
  'customerLateCancelSubtotal',
  'customerLateCancelGatewayDeduction',
  'customerLateCancelNetAmount',
  'refundConvenienceFee',
  'refundDeliveryFee',
  'rejectedRefundSubtotal',
  'rejectedRefundGatewayDeduction',
  'rejectedRefundNetAmount',
  'rejectedRefundConvenienceFee',
  'rejectedRefundDeliveryFee',
  'gatewayRatePct',
  'sharedPromoTotalDiscount',
  'sharedPromoBranchContributionPct',
  'sharedPromoBranchContributionAmount',
  'sharedPromoPlatformContributionPct',
  'sharedPromoPlatformContributionAmount',
  'sharedPromoJasonContributionPct',
  'sharedPromoJasonContributionAmount',
  'finalPayoutAmount',
  'periodNetAmount',
  'branchRequestNetAmount',
  'branchOwnedPromoDiscountTotal',
  'platformOwnedPromoDiscountTotal',
  'priorOnlineWalletAmountCents',
  'remainingOnlineWalletCents',
] as const satisfies ReadonlyArray<keyof WithdrawalBreakdown>;

const PAYOUT_CYCLE_STAGE_VALUES = ['FIRST', 'SECOND'] as const;

function parseWithdrawalCycleFields(
  raw: Record<string, unknown>,
  result: WithdrawalBreakdown,
): void {
  const stage = raw.cycleStage;
  if (stage === 'FIRST' || stage === 'SECOND') {
    result.cycleStage = stage;
  }
  if (typeof raw.cycleFrom === 'string' && raw.cycleFrom.trim()) {
    result.cycleFrom = raw.cycleFrom.trim();
  }
  if (typeof raw.cycleTo === 'string' && raw.cycleTo.trim()) {
    result.cycleTo = raw.cycleTo.trim();
  }
  if (typeof raw.cyclePairId === 'string' && raw.cyclePairId.trim()) {
    result.cyclePairId = raw.cyclePairId.trim();
  }

  const priorCents = coerceBreakdownNumber(raw.priorOnlineWalletAmountCents);
  if (priorCents != null) {
    result.priorOnlineWalletAmountCents = priorCents;
  } else {
    const priorLkr = coerceBreakdownNumber(raw.priorOnlineWalletAmountLkr);
    if (priorLkr != null) {
      result.priorOnlineWalletAmountCents = Math.round(priorLkr * 100);
    }
  }
}

/** Payout math fields refreshed from live net preview for Payout 1 (FIRST cycle stage). */
const FIRST_PAYOUT_PREVIEW_MATH_KEYS = [
  'commissionFee',
  'netPlatformEarning',
  'gatewayFee',
  'netAmount',
  'gatewayBase',
  'onlineWalletGross',
  'remainingOnlineWalletCents',
] as const satisfies ReadonlyArray<keyof WithdrawalBreakdown>;

export function parseWithdrawalBreakdown(value: unknown): WithdrawalBreakdown | null {
  const parsed = parseJsonObjectIfString(value);
  if (parsed === null) return null;
  const raw = parsed
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const coerced: Partial<Record<(typeof WITHDRAWAL_REQUIRED_NUMBER_KEYS)[number], number>> = {};
  for (const key of WITHDRAWAL_REQUIRED_NUMBER_KEYS) {
    const n = coerceBreakdownNumber(o[key]);
    if (n == null) return null;
    coerced[key] = n;
  }
  const result: WithdrawalBreakdown = {
    grossAmount: coerced.grossAmount!,
    deliveryFee: coerced.deliveryFee!,
    commissionFee: coerced.commissionFee!,
    gatewayFee: coerced.gatewayFee!,
    netAmount: coerced.netAmount!,
    orderCount: coerced.orderCount!,
  };
  for (const key of WITHDRAWAL_OPTIONAL_NUMBER_KEYS) {
    const n = coerceBreakdownNumber(o[key]);
    if (n != null) {
      result[key] = n;
    }
  }
  const channelBreakdownRaw = o.channelBreakdown;
  if (channelBreakdownRaw && typeof channelBreakdownRaw === 'object') {
    result.channelBreakdown = normalizeSettlementBreakdown(channelBreakdownRaw);
  }
  parseWithdrawalCycleFields(o, result);
  return result;
}

type SharedPromoContributionSplit = {
  platformAmount: number;
  jasonAmount: number;
  platformPct: number;
  jasonPct: number;
};

/** Legacy snapshots stored Jason's share in the platform fields. */
function splitSharedPromoContributions(
  breakdown: WithdrawalBreakdown | null | undefined,
): SharedPromoContributionSplit {
  if (breakdown?.sharedPromoJasonContributionAmount == null) {
    return {
      platformAmount: 0,
      jasonAmount: breakdown?.sharedPromoPlatformContributionAmount ?? 0,
      platformPct: 0,
      jasonPct: breakdown?.sharedPromoPlatformContributionPct ?? 0,
    };
  }
  return {
    platformAmount: breakdown.sharedPromoPlatformContributionAmount ?? 0,
    jasonAmount: breakdown.sharedPromoJasonContributionAmount,
    platformPct: breakdown.sharedPromoPlatformContributionPct ?? 0,
    jasonPct: breakdown.sharedPromoJasonContributionPct ?? 0,
  };
}

/** Branch wallet request plus Jason shared-promo top-up (LKR). */
export function computeFinalPayoutLkr(
  branchRequestLkr: number,
  jasonContributionLkr = 0,
): number {
  return branchRequestLkr + jasonContributionLkr;
}

/** Resolve the total branch payment from a withdrawal snapshot (LKR). */
export function resolveFinalPayoutAmountLkr(
  breakdown: WithdrawalBreakdown | null | undefined,
  branchRequestAmountCents: number,
): number {
  if (breakdown?.finalPayoutAmount != null && breakdown.finalPayoutAmount > 0) {
    return centsToLkrAmount(breakdown.finalPayoutAmount);
  }
  return computeFinalPayoutLkr(
    centsToLkrAmount(branchRequestAmountCents),
    centsToLkrAmount(splitSharedPromoContributions(breakdown).jasonAmount),
  );
}

/** Resolve payment amount for a withdrawal row (prefers API finalPayoutAmountLkr when present). */
export function resolveWithdrawalPaymentLkr(withdrawal: {
  amount: number;
  amountLkr?: number;
  breakdown?: unknown;
  finalPayoutAmountLkr?: number | null;
}): number {
  if (withdrawal.finalPayoutAmountLkr != null && withdrawal.finalPayoutAmountLkr > 0) {
    return withdrawal.finalPayoutAmountLkr;
  }
  const breakdown = parseWithdrawalBreakdown(withdrawal.breakdown);
  return resolveFinalPayoutAmountLkr(breakdown, withdrawal.amount);
}

export type SharedPromoBreakdownLkr = {
  totalDiscountLkr: number;
  branchContributionLkr: number;
  branchContributionPct: number;
  platformContributionLkr: number;
  platformContributionPct: number;
  jasonContributionLkr: number;
  jasonContributionPct: number;
  finalPayoutLkr: number;
};

/** Extract shared-promo figures from a withdrawal snapshot (amounts in LKR). */
export function extractSharedPromoLkrFromBreakdown(
  breakdown: WithdrawalBreakdown | null | undefined,
  branchRequestAmountCents = 0,
): SharedPromoBreakdownLkr {
  const split = splitSharedPromoContributions(breakdown);
  return {
    totalDiscountLkr: centsToLkrAmount(breakdown?.sharedPromoTotalDiscount),
    branchContributionLkr: centsToLkrAmount(breakdown?.sharedPromoBranchContributionAmount),
    branchContributionPct: breakdown?.sharedPromoBranchContributionPct ?? 0,
    platformContributionLkr: centsToLkrAmount(split.platformAmount),
    platformContributionPct: split.platformPct,
    jasonContributionLkr: centsToLkrAmount(split.jasonAmount),
    jasonContributionPct: split.jasonPct,
    finalPayoutLkr: resolveFinalPayoutAmountLkr(breakdown, branchRequestAmountCents),
  };
}

export function hasSharedPromoAmounts(promo: SharedPromoBreakdownLkr): boolean {
  return hasAnyPositiveLkr(
    promo.totalDiscountLkr,
    promo.platformContributionLkr,
    promo.jasonContributionLkr,
  );
}

const SHARED_PROMO_BREAKDOWN_FIELD_KEYS = [
  'sharedPromoTotalDiscount',
  'sharedPromoBranchContributionPct',
  'sharedPromoBranchContributionAmount',
  'sharedPromoPlatformContributionPct',
  'sharedPromoPlatformContributionAmount',
  'sharedPromoJasonContributionPct',
  'sharedPromoJasonContributionAmount',
] as const satisfies ReadonlyArray<keyof WithdrawalBreakdown>;

/** Refresh cent-accurate shared-promo splits from net preview without changing locked payout math fields. */
export function mergeSharedPromoContributionFieldsIntoBreakdown(
  stored: WithdrawalBreakdown,
  preview: WithdrawalBreakdown,
): WithdrawalBreakdown {
  const merged: WithdrawalBreakdown = { ...stored };
  for (const key of SHARED_PROMO_BREAKDOWN_FIELD_KEYS) {
    const value = preview[key];
    if (value != null) merged[key] = value;
  }
  return merged;
}

/** Merge live net-preview cycle stage and Payout 1 math into a locked withdrawal snapshot. */
export function mergeLivePayoutPreviewIntoStoredBreakdown(
  stored: WithdrawalBreakdown,
  preview: WithdrawalBreakdown,
): WithdrawalBreakdown {
  let merged = mergeSharedPromoContributionFieldsIntoBreakdown(stored, preview);

  if (preview.cycleStage && PAYOUT_CYCLE_STAGE_VALUES.includes(preview.cycleStage)) {
    merged.cycleStage = preview.cycleStage;
  }
  if (preview.cycleFrom) merged.cycleFrom = preview.cycleFrom;
  if (preview.cycleTo) merged.cycleTo = preview.cycleTo;
  if (preview.cyclePairId) merged.cyclePairId = preview.cyclePairId;
  if (preview.priorOnlineWalletAmountCents != null) {
    merged.priorOnlineWalletAmountCents = preview.priorOnlineWalletAmountCents;
  }

  if (preview.cycleStage === 'FIRST') {
    for (const key of FIRST_PAYOUT_PREVIEW_MATH_KEYS) {
      const value = preview[key];
      if (value != null) merged[key] = value;
    }
  }

  return merged;
}

/** Compact payout reference for Jason ledger and admin tables. */
export function formatWithdrawalPayoutRef(
  storeWithdrawalId: string,
  storeId?: string | null,
): string {
  const branchPrefix = storeId ? `${storeId.slice(0, 8)}… · ` : '';
  return `${branchPrefix}WD-${storeWithdrawalId.slice(0, 8).toUpperCase()}`;
}

/** Parse wallet net-preview API payload into a withdrawal breakdown snapshot (cents). */
export function parseWithdrawalBreakdownFromNetPreview(data: unknown): WithdrawalBreakdown | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const grossAmount = coerceBreakdownNumber(raw.grossAmount);
  if (grossAmount == null) return null;

  const result: WithdrawalBreakdown = {
    grossAmount,
    deliveryFee: coerceBreakdownNumber(raw.deliveryFee) ?? 0,
    commissionFee: coerceBreakdownNumber(raw.commissionFee) ?? 0,
    gatewayFee: coerceBreakdownNumber(raw.gatewayFee) ?? 0,
    netAmount: coerceBreakdownNumber(raw.netAmount) ?? 0,
    orderCount: coerceBreakdownNumber(raw.orderCount) ?? 0,
  };

  for (const key of WITHDRAWAL_OPTIONAL_NUMBER_KEYS) {
    const n = coerceBreakdownNumber(raw[key]);
    if (n != null) result[key] = n;
  }

  if (result.onlineWalletGross == null) {
    const gatewayBase = coerceBreakdownNumber(raw.gatewayBase);
    if (gatewayBase != null) result.onlineWalletGross = gatewayBase;
  }

  parseWithdrawalCycleFields(raw, result);

  return result;
}

export type WithdrawalLockedSnapshotLkr = {
  gatewayFeeLkr: number | null;
  gatewayRatePct: number;
  onlineWalletGrossLkr: number | null;
  cancelledByBranchGatewayFeeLkr: number | null;
  cancelledByBranchOrderCount: number | null;
  customerLateCancelSubtotalLkr: number | null;
  customerLateCancelGatewayDeductionLkr: number | null;
  customerLateCancelNetAmountLkr: number | null;
  rejectedRefundSubtotalLkr: number | null;
  rejectedRefundGatewayDeductionLkr: number | null;
  rejectedRefundNetAmountLkr: number | null;
  netAmountLkr: number | null;
};

/** Resolve locked snapshot fee fields for approval/display (amounts in LKR). */
export function resolveWithdrawalLockedSnapshotLkr(params: {
  snapshotFees: ReturnType<typeof extractWithdrawalSnapshotFees> | null;
  storedBreakdownLkr: ReturnType<typeof withdrawalBreakdownToLkr> | null;
  breakdown: WithdrawalBreakdown | null;
  fallbackGatewayRatePct?: number;
}): WithdrawalLockedSnapshotLkr {
  const { snapshotFees, storedBreakdownLkr, breakdown, fallbackGatewayRatePct = 1.9 } = params;
  const gatewayRatePct =
    snapshotFees?.gatewayRatePct ??
    storedBreakdownLkr?.gatewayRatePct ??
    breakdown?.gatewayRatePct ??
    fallbackGatewayRatePct;

  return {
    gatewayFeeLkr: snapshotFees?.gatewayFeeLkr ?? storedBreakdownLkr?.gatewayFee ?? null,
    gatewayRatePct,
    onlineWalletGrossLkr:
      snapshotFees?.onlineWalletGrossLkr ?? storedBreakdownLkr?.onlineWalletGross ?? null,
    cancelledByBranchGatewayFeeLkr:
      snapshotFees?.cancelledByBranchGatewayFeeLkr ??
      storedBreakdownLkr?.cancelledByBranchGatewayFee ??
      null,
    cancelledByBranchOrderCount:
      snapshotFees?.cancelledByBranchOrderCount ??
      storedBreakdownLkr?.cancelledByBranchOrderCount ??
      null,
    customerLateCancelSubtotalLkr:
      snapshotFees?.customerLateCancelSubtotalLkr ??
      storedBreakdownLkr?.customerLateCancelSubtotal ??
      null,
    customerLateCancelGatewayDeductionLkr:
      snapshotFees?.customerLateCancelGatewayDeductionLkr ??
      storedBreakdownLkr?.customerLateCancelGatewayDeduction ??
      null,
    customerLateCancelNetAmountLkr:
      snapshotFees?.customerLateCancelNetAmountLkr ??
      storedBreakdownLkr?.customerLateCancelNetAmount ??
      null,
    rejectedRefundSubtotalLkr:
      snapshotFees?.rejectedRefundSubtotalLkr ?? storedBreakdownLkr?.rejectedRefundSubtotal ?? null,
    rejectedRefundGatewayDeductionLkr:
      snapshotFees?.rejectedRefundGatewayDeductionLkr ??
      storedBreakdownLkr?.rejectedRefundGatewayDeduction ??
      null,
    rejectedRefundNetAmountLkr:
      snapshotFees?.rejectedRefundNetAmountLkr ??
      storedBreakdownLkr?.rejectedRefundNetAmount ??
      null,
    netAmountLkr:
      snapshotFees?.periodNetAmountLkr ??
      snapshotFees?.netAmountLkr ??
      (breakdown ? resolvePeriodNetLkrFromBreakdown(breakdown) : null),
  };
}


/** Lenient read of fee fields locked at payout request time (amounts in LKR). */
export function extractWithdrawalSnapshotFees(raw: unknown): {
  gatewayFeeLkr: number;
  gatewayRatePct: number;
  onlineWalletGrossLkr: number;
  cancelledByBranchGatewayFeeLkr: number;
  cancelledByBranchOrderCount: number;
  customerLateCancelSubtotalLkr: number;
  customerLateCancelGatewayDeductionLkr: number;
  customerLateCancelNetAmountLkr: number;
  refundConvenienceFeeAmountLkr: number;
  refundDeliveryFeeAmountLkr: number;
  rejectedRefundConvenienceFeeAmountLkr: number;
  rejectedRefundDeliveryFeeAmountLkr: number;
  rejectedRefundSubtotalLkr: number;
  rejectedRefundGatewayDeductionLkr: number;
  rejectedRefundNetAmountLkr: number;
  netAmountLkr: number;
  periodNetAmountLkr: number;
  branchRequestNetAmountLkr: number | null;
} | null {
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const o = parsed as Record<string, unknown>;
  const gatewayFeeCents = coerceBreakdownNumber(o.gatewayFee);
  const netAmountCents = coerceBreakdownNumber(o.netAmount);
  if (gatewayFeeCents == null || netAmountCents == null) return null;

  const onlineWalletCents =
    coerceBreakdownNumber(o.onlineWalletGross) ??
    coerceBreakdownNumber(o.gatewayBase) ??
    0;

  return {
    gatewayFeeLkr: gatewayFeeCents / 100,
    gatewayRatePct: coerceBreakdownNumber(o.gatewayRatePct) ?? 1.9,
    onlineWalletGrossLkr: onlineWalletCents / 100,
    cancelledByBranchGatewayFeeLkr:
      (coerceBreakdownNumber(o.cancelledByBranchGatewayFee) ?? 0) / 100,
    cancelledByBranchOrderCount:
      coerceBreakdownNumber(o.cancelledByBranchOrderCount) ?? 0,
    customerLateCancelSubtotalLkr:
      (coerceBreakdownNumber(o.customerLateCancelSubtotal) ?? 0) / 100,
    customerLateCancelGatewayDeductionLkr:
      (coerceBreakdownNumber(o.customerLateCancelGatewayDeduction) ?? 0) / 100,
    customerLateCancelNetAmountLkr:
      (coerceBreakdownNumber(o.customerLateCancelNetAmount) ?? 0) / 100,
    refundConvenienceFeeAmountLkr:
      (coerceBreakdownNumber(o.refundConvenienceFee) ?? 0) / 100,
    refundDeliveryFeeAmountLkr:
      (coerceBreakdownNumber(o.refundDeliveryFee) ?? 0) / 100,
    rejectedRefundConvenienceFeeAmountLkr:
      (coerceBreakdownNumber(o.rejectedRefundConvenienceFee) ?? 0) / 100,
    rejectedRefundDeliveryFeeAmountLkr:
      (coerceBreakdownNumber(o.rejectedRefundDeliveryFee) ?? 0) / 100,
    rejectedRefundSubtotalLkr:
      (coerceBreakdownNumber(o.rejectedRefundSubtotal) ?? 0) / 100,
    rejectedRefundGatewayDeductionLkr:
      (coerceBreakdownNumber(o.rejectedRefundGatewayDeduction) ?? 0) / 100,
    rejectedRefundNetAmountLkr:
      (coerceBreakdownNumber(o.rejectedRefundNetAmount) ?? 0) / 100,
    netAmountLkr: netAmountCents / 100,
    periodNetAmountLkr:
      (coerceBreakdownNumber(o.periodNetAmount) ?? netAmountCents) / 100,
    branchRequestNetAmountLkr:
      coerceBreakdownNumber(o.branchRequestNetAmount) != null
        ? coerceBreakdownNumber(o.branchRequestNetAmount)! / 100
        : null,
  };
}

/** Calculated period net from a withdrawal snapshot (LKR). */
export function resolvePeriodNetLkrFromBreakdown(
  breakdown: WithdrawalBreakdown | null | undefined,
): number {
  if (!breakdown) return 0;
  return centsToLkrAmount(breakdown.periodNetAmount ?? breakdown.netAmount);
}

/** Branch wallet request from a withdrawal snapshot (LKR). */
export function resolveBranchRequestNetLkrFromBreakdown(
  breakdown: WithdrawalBreakdown | null | undefined,
  fallbackAmountCents = 0,
): number {
  if (!breakdown) return centsToLkrAmount(fallbackAmountCents);
  return centsToLkrAmount(breakdown.branchRequestNetAmount ?? fallbackAmountCents);
}

export function withdrawalBreakdownToLkr(b: WithdrawalBreakdown) {
  const gross = b.grossAmount / 100;
  const commission = b.commissionFee / 100;
  const gateway = b.gatewayFee / 100;
  const net = b.netAmount / 100;
  const delivery = b.deliveryFee / 100;
  const onlineWalletRaw = b.onlineWalletGross ?? b.gatewayBase ?? 0;
  const onlineWallet = onlineWalletRaw / 100;
  const convenienceRaw = b.convenienceFee;
  const convenience =
    typeof convenienceRaw === 'number' && Number.isFinite(convenienceRaw)
      ? convenienceRaw / 100
      : Math.max(0, Math.round((onlineWallet - commission - gateway - net) * 100) / 100);

  return {
    grossAmount: gross,
    deliveryFee: delivery,
    commissionFee: commission,
    gatewayFee: gateway,
    onlineWalletGross: onlineWallet,
    gatewayBase: (b.gatewayBase ?? onlineWalletRaw) / 100,
    convenienceFee: convenience,
    netAmount: net,
    platformPaybackTotal: (b.platformPaybackTotal ?? 0) / 100,
    periodDiscountsTotal: (b.periodDiscountsTotal ?? 0) / 100,
    periodLoyaltyDiscountTotal: (b.periodLoyaltyDiscountTotal ?? 0) / 100,
    branchOwnedPromoDiscountTotal: (b.branchOwnedPromoDiscountTotal ?? 0) / 100,
    platformOwnedPromoDiscountTotal: (b.platformOwnedPromoDiscountTotal ?? 0) / 100,
    netPlatformEarning: (b.netPlatformEarning ?? b.commissionFee - (b.periodDiscountsTotal ?? 0)) / 100,
    sharedPromoPlatformContributionLkr: centsToLkrAmount(b.sharedPromoPlatformContributionAmount),
    sharedPromoJasonContributionLkr: centsToLkrAmount(b.sharedPromoJasonContributionAmount),
    periodDues: (b.periodDues ?? 0) / 100,
    cancelledByBranchGatewayFee: (b.cancelledByBranchGatewayFee ?? 0) / 100,
    cancelledByBranchOrderCount: b.cancelledByBranchOrderCount ?? 0,
    customerLateCancelSubtotal: (b.customerLateCancelSubtotal ?? 0) / 100,
    customerLateCancelGatewayDeduction: (b.customerLateCancelGatewayDeduction ?? 0) / 100,
    customerLateCancelNetAmount: (b.customerLateCancelNetAmount ?? 0) / 100,
    refundConvenienceFee: (b.refundConvenienceFee ?? 0) / 100,
    refundDeliveryFee: (b.refundDeliveryFee ?? 0) / 100,
    rejectedRefundSubtotal: (b.rejectedRefundSubtotal ?? 0) / 100,
    rejectedRefundGatewayDeduction: (b.rejectedRefundGatewayDeduction ?? 0) / 100,
    rejectedRefundNetAmount: (b.rejectedRefundNetAmount ?? 0) / 100,
    rejectedRefundConvenienceFee: (b.rejectedRefundConvenienceFee ?? 0) / 100,
    rejectedRefundDeliveryFee: (b.rejectedRefundDeliveryFee ?? 0) / 100,
    orderCount: b.orderCount,
    commissionRate: b.commissionRate,
    gatewayRatePct: b.gatewayRatePct,
    cycleStage: b.cycleStage,
    cycleFrom: b.cycleFrom,
    cycleTo: b.cycleTo,
    priorOnlineWalletAmountLkr: (b.priorOnlineWalletAmountCents ?? 0) / 100,
    remainingOnlineWalletLkr: (b.remainingOnlineWalletCents ?? 0) / 100,
  };
}

export type PayoutFormulaBreakdownLkr = ReturnType<typeof withdrawalBreakdownToLkr>;

/** Splits a withdrawal row into requested total vs advance vs period net. Amounts in LKR. */
export function withdrawalAmountParts(row: {
  amount: number;
  isAdvance?: boolean;
  breakdown?: unknown;
}) {
  const requestedLkr = row.amount / 100;
  const parsed = parseWithdrawalBreakdown(row.breakdown);
  const periodNetLkr = parsed ? resolvePeriodNetLkrFromBreakdown(parsed) : null;

  let advanceLkr = 0;
  if (periodNetLkr != null && requestedLkr > periodNetLkr + 0.001) {
    advanceLkr = Math.round((requestedLkr - periodNetLkr) * 100) / 100;
  }

  const periodPayoutLkr =
    periodNetLkr != null ? Math.min(requestedLkr, periodNetLkr) : requestedLkr - advanceLkr;

  return {
    requestedLkr,
    periodNetLkr,
    periodPayoutLkr,
    advanceLkr,
    hasAdvance: advanceLkr > 0.001 || !!row.isAdvance,
  };
}