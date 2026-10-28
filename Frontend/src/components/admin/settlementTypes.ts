import { getApiBaseUrl } from '@/lib/apiBase';

import type { CommissionChannel, MonthlySlabInfo, SlabInfo } from '@/components/admin/commissionUtils';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';

export type ChannelSettlementRow = {
  revenueSubtotal: number;
  commission: number;
  rate: number;
  orderCount: number;
  transactionTotal: number;
  providerFee: number;
  providerFeeRate: number;
  convenientFeeTotal?: number;
  convenienceFeeBaseTotal?: number;
  deliveryFeeTotal?: number;
  grossSalesTotal?: number;
  subtotalBeforeDiscount?: number;
  discountTotal?: number;
  payhereTotal?: number;
  payhereRevenueSubtotal?: number;
  payhereDeliveryFee?: number;
  payhereConvenienceFee?: number;
  cardTotal?: number;
  loyaltyPointsTotal?: number;
};

export type SettlementBreakdown = Record<CommissionChannel, ChannelSettlementRow>;

/** Snapshot of the 4-share ledger split for a payout period (amounts in cents). */
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
] as const satisfies ReadonlyArray<keyof WithdrawalBreakdown>;

export const LKR_EPSILON = 0.001;

export function hasPositiveLkr(value: number | null | undefined): boolean {
  return (value ?? 0) > LKR_EPSILON;
}

export function hasAnyPositiveLkr(
  ...values: Array<number | null | undefined>
): boolean {
  return values.some((value) => hasPositiveLkr(value));
}

export function roundLkr(value: number): number {
  return Math.round(value * 100) / 100;
}

function centsToLkrAmount(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

function coerceBreakdownNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseWithdrawalBreakdown(value: unknown): WithdrawalBreakdown | null {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
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

/** Net platform commission for payout allocation cards and summaries. */
export function resolvePlatformCommissionForPeriodLkr(params: {
  commissionLkr: number;
  periodBreakdownLkr: {
    platformPaybackTotal?: number;
    periodLoyaltyDiscountTotal?: number;
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
    netPlatformEarningLkr: params.periodBreakdownLkr?.netPlatformEarning,
  });
  return resolveNetPlatformCommissionWithRefundFeesLkr({
    baseNetPlatformCommissionLkr,
    refundConvenienceFeeLkr: params.periodBreakdownLkr?.refundConvenienceFee,
    rejectedRefundConvenienceFeeLkr: params.periodBreakdownLkr?.rejectedRefundConvenienceFee,
  });
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
    gatewayRatePct: b.gatewayRatePct,
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

export type PlatformSalesSummary = {
  totalPlatformSales: number;
  onlineSales: number;
  pickupCash: number;
  pickupCard: number;
  pickupOnline: number;
  deliveryOnline: number;
  offlineCash: number;
  offlineCard: number;
  offlineTotal: number;
  orderCount: number;
};

export type SettlementPreview = {
  period: { from: string; to: string };
  breakdown: SettlementBreakdown;
  totalCommission: number;
  totalProviderFee: number;
  totalOwed: number;
  orderCount: number;
  platformSales?: PlatformSalesSummary;
  slabInfo: SlabInfo;
  monthlySlabInfo?: MonthlySlabInfo[];
};

export type PendingWithdrawalForSettlement = {
  id: string;
  amount: number;
  amountLkr: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  periodFrom: string | null;
  periodTo: string | null;
  breakdown: unknown;
  remarks: string | null;
  isAdvance: boolean;
  createdAt: string;
  hasSettlement?: boolean;
};

export function isWithdrawalSelectableForSettlement(
  withdrawal: PendingWithdrawalForSettlement,
): boolean {
  return (
    (withdrawal.status === 'PENDING' || withdrawal.status === 'APPROVED') &&
    !withdrawal.hasSettlement &&
    !!withdrawal.periodFrom &&
    !!withdrawal.periodTo
  );
}

export type SettlementStatement = {
  id: string;
  statementRef: string;
  storeId: string;
  storeName: string;
  storeWithdrawalId?: string;
  period: { from: string; to: string };
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  paymentMethod: string;
  hasReceipt?: boolean;
  receiptUrl: string | null;
  invoiceRef?: string;
  invoiceUrl?: string | null;
  breakdown: SettlementBreakdown;
  totalCommission: number;
  totalProviderFee: number;
  totalOwed: number;
  submittedAt: string;
  slabInfo?: SlabInfo;
  monthlySlabInfo?: MonthlySlabInfo[];
};

export type SettlementPaymentMethodKey = 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'ONLINE';

export const SETTLEMENT_PAYMENT_METHOD_OPTIONS: Array<{
  value: SettlementPaymentMethodKey;
  label: string;
}> = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHECK', label: 'Check' },
  { value: 'ONLINE', label: 'Online' },
];

export function settlementPaymentMethodLabel(method: string): string {
  return (
    SETTLEMENT_PAYMENT_METHOD_OPTIONS.find((m) => m.value === method)?.label ?? method
  );
}

export const SETTLEMENT_CHANNELS: Array<{ key: CommissionChannel; label: string }> = [
  { key: 'pickupCash', label: 'Pickup Cash' },
  { key: 'pickupCard', label: 'Pickup Card' },
  { key: 'pickupOnline', label: 'Pickup Online' },
  { key: 'deliveryOnline', label: 'Delivery Online' },
];

const ONLINE_PROVIDER_FEE_RATE = 0.019;

export function emptyChannelSettlementRow(rate = 0): ChannelSettlementRow {
  return {
    revenueSubtotal: 0,
    commission: 0,
    rate,
    orderCount: 0,
    transactionTotal: 0,
    providerFee: 0,
    providerFeeRate: ONLINE_PROVIDER_FEE_RATE,
    convenientFeeTotal: 0,
    convenienceFeeBaseTotal: 0,
    deliveryFeeTotal: 0,
    grossSalesTotal: 0,
    subtotalBeforeDiscount: 0,
    discountTotal: 0,
    payhereTotal: 0,
    payhereRevenueSubtotal: 0,
    payhereDeliveryFee: 0,
    payhereConvenienceFee: 0,
    cardTotal: 0,
    loyaltyPointsTotal: 0,
  };
}

export function emptySettlementBreakdown(): SettlementBreakdown {
  return {
    pickupCash: emptyChannelSettlementRow(),
    pickupCard: emptyChannelSettlementRow(),
    pickupOnline: emptyChannelSettlementRow(),
    deliveryOnline: emptyChannelSettlementRow(),
  };
}

/** Merge stored JSON breakdown with empty defaults for missing channels/fields. */
export function normalizeSettlementBreakdown(value: unknown): SettlementBreakdown {
  const empty = emptySettlementBreakdown();
  if (!value || typeof value !== 'object') return empty;

  const stored = value as Partial<Record<CommissionChannel, Partial<ChannelSettlementRow>>>;
  const result = { ...empty };

  for (const { key } of SETTLEMENT_CHANNELS) {
    const row = stored[key];
    if (row && typeof row === 'object') {
      result[key] = { ...empty[key], ...row };
    }
  }

  return result;
}

/** Sum per-channel commission from a stored channel snapshot (LKR). */
export function sumChannelBreakdownCommission(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].commission ?? 0),
    0,
  );
}

export function sumChannelBreakdownOrderCount(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].orderCount ?? 0),
    0,
  );
}

/** Build a SettlementPreview from stored channelBreakdown for display-only use. */
export function buildSettlementPreviewFromChannelBreakdown(
  channelBreakdown: SettlementBreakdown,
  opts: {
    from: string;
    to: string;
    commissionRate?: number;
    orderCount?: number;
    slabInfo?: SlabInfo;
    gatewayFeeLkr?: number;
  },
): SettlementPreview {
  const totalCommission = sumChannelBreakdownCommission(channelBreakdown);
  const orderCount = opts.orderCount ?? sumChannelBreakdownOrderCount(channelBreakdown);
  const effectiveRate = opts.commissionRate ?? channelBreakdown.pickupCash.rate ?? 0;

  return {
    period: { from: opts.from, to: opts.to },
    breakdown: channelBreakdown,
    totalCommission,
    totalProviderFee: opts.gatewayFeeLkr ?? 0,
    totalOwed: totalCommission,
    orderCount,
    slabInfo: opts.slabInfo ?? {
      monthlyBase: 0,
      effectiveRate,
      slabIndex: 0,
    },
  };
}

export function sumAllDiscounts(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].discountTotal ?? 0),
    0,
  );
}

/** Sum per-channel revenue subtotals after discount (LKR). */
export function sumChannelRevenueSubtotals(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].revenueSubtotal ?? 0),
    0,
  );
}

/** Gross sales across all channels from a settlement preview (LKR). */
export function sumAllRevenueSubtotal(preview: SettlementPreview): number {
  return sumChannelRevenueSubtotals(preview.breakdown);
}

/** Sum convenience fees from a settlement preview when breakdown LKR is unavailable. */
export function resolvePreviewConvenienceFeeLkr(
  preview: SettlementPreview | null | undefined,
  fallbackLkr = 0,
): number {
  if (!preview) return fallbackLkr;
  return sumChannelConvenienceFees(preview.breakdown);
}

/** Sum per-channel convenience fees (LKR). */
export function sumChannelConvenienceFees(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].convenientFeeTotal ?? 0),
    0,
  );
}

/** Delivery fee shown in Sales by channel — delivery online row only (LKR). */
export function resolveChannelDeliveryFeeLkr(breakdown: SettlementBreakdown | null | undefined): number {
  if (!breakdown) return 0;
  return breakdown.deliveryOnline.deliveryFeeTotal ?? 0;
}

/** Delivery fee for the selected payout period — channel preview when available. */
export function resolvePeriodDeliveryFeeLkr(params: {
  channelBreakdown?: SettlementBreakdown | null;
  periodDeliveryFeeLkr?: number;
}): number {
  if (params.channelBreakdown) {
    return resolveChannelDeliveryFeeLkr(params.channelBreakdown);
  }
  return params.periodDeliveryFeeLkr ?? 0;
}

/** Late-cancel plus rejected retained refund convenience fees (LKR). */
export function resolveTotalRetainedRefundConvenienceFeeLkr(params: {
  refundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
}): number {
  return (params.refundConvenienceFeeLkr ?? 0) + (params.rejectedRefundConvenienceFeeLkr ?? 0);
}

/** Late-cancel plus rejected retained refund delivery fees (LKR). */
export function resolveTotalRetainedRefundDeliveryFeeLkr(params: {
  refundDeliveryFeeLkr?: number;
  rejectedRefundDeliveryFeeLkr?: number;
}): number {
  return (params.refundDeliveryFeeLkr ?? 0) + (params.rejectedRefundDeliveryFeeLkr ?? 0);
}

/** Delivery rider share: active-order delivery plus all retained refund delivery fees (LKR). */
export function resolveTotalDeliveryFeeForAllocationLkr(params: {
  periodDeliveryFeeLkr?: number;
  refundDeliveryFeeLkr?: number;
  rejectedRefundDeliveryFeeLkr?: number;
}): number {
  return (
    (params.periodDeliveryFeeLkr ?? 0) +
    resolveTotalRetainedRefundDeliveryFeeLkr(params)
  );
}

/** Amount to subtract from commission when payback is enabled (platform-owned promos only). */
export function resolveCommissionPaybackLkr(params: {
  paybackEnabled: boolean;
  platformPaybackTotal?: number;
}): number {
  if (!params.paybackEnabled) return 0;
  return params.platformPaybackTotal ?? 0;
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
  /** Prefer API snapshot when available (already includes SPPC platform deduction). */
  netPlatformEarningLkr?: number | null;
}): number {
  if (params.netPlatformEarningLkr != null) {
    return params.netPlatformEarningLkr;
  }
  return (
    resolveNetCommissionLkr(params) -
    (params.sharedPromoPlatformLkr ?? 0) -
    (params.loyaltyDiscountLkr ?? 0)
  );
}

/** Branch-chargeable platform commission for payout allocation (excludes refund convenience fees). */
export function resolveTotalPlatformCommissionDisplayLkr(params: {
  commissionLkr: number;
  platformPaybackTotal?: number;
  paybackEnabled: boolean;
  sharedPromoPlatformLkr?: number;
  loyaltyDiscountLkr?: number;
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

export function sumAllSubtotalBeforeDiscount(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) =>
      sum + (breakdown[key].subtotalBeforeDiscount ?? breakdown[key].revenueSubtotal),
    0,
  );
}

export function sumChannelGrossSales(breakdown: SettlementBreakdown): number {
  return SETTLEMENT_CHANNELS.reduce(
    (sum, { key }) => sum + (breakdown[key].grossSalesTotal ?? 0),
    0,
  );
}

export function sumOfflineGrossSales(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupCash.grossSalesTotal ?? 0) + (breakdown.pickupCard.grossSalesTotal ?? 0)
  );
}

export function sumOnlineGrossSales(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupOnline.grossSalesTotal ?? 0) +
    (breakdown.deliveryOnline.grossSalesTotal ?? 0)
  );
}

/** PayHere wallet inflow — pickup online & delivery online order totals. */
export function sumOnlinePaymentsCollected(breakdown: SettlementBreakdown): number {
  return (
    (breakdown.pickupOnline.payhereTotal ?? 0) + (breakdown.deliveryOnline.payhereTotal ?? 0)
  );
}

export function resolveOnlinePaymentsCollectedChannelAmounts(
  breakdown: SettlementBreakdown,
): { pickupOnlineLkr: number; deliveryOnlineLkr: number } {
  return {
    pickupOnlineLkr: breakdown.pickupOnline.payhereTotal ?? 0,
    deliveryOnlineLkr: breakdown.deliveryOnline.payhereTotal ?? 0,
  };
}

export type OnlinePaymentsCollectedComponents = {
  pickupRevenueLkr: number;
  deliveryRevenueLkr: number;
  revenueSubtotalLkr: number;
  deliveryFeeLkr: number;
  convenienceFeeLkr: number;
  totalLkr: number;
};

export function resolveOnlinePaymentsCollectedComponents(
  breakdown: SettlementBreakdown,
): OnlinePaymentsCollectedComponents {
  const pickup = breakdown.pickupOnline;
  const delivery = breakdown.deliveryOnline;
  // Same item net the Classic table shows. Card and loyalty delivery orders
  // sit in Delivery Online and must be included. Fees stay out of the sum.
  const pickupRevenueLkr = pickup.revenueSubtotal ?? 0;
  const deliveryRevenueLkr = delivery.revenueSubtotal ?? 0;
  const deliveryFeeLkr = delivery.deliveryFeeTotal ?? 0;
  const convenienceFeeLkr =
    (pickup.convenientFeeTotal ?? 0) + (delivery.convenientFeeTotal ?? 0);
  const revenueSubtotalLkr = pickupRevenueLkr + deliveryRevenueLkr;

  return {
    pickupRevenueLkr,
    deliveryRevenueLkr,
    revenueSubtotalLkr,
    deliveryFeeLkr,
    convenienceFeeLkr,
    totalLkr: revenueSubtotalLkr,
  };
}

export function formatOnlinePaymentsCollectedHint(
  components: OnlinePaymentsCollectedComponents,
): string {
  const amt = formatMoneyAmount;
  return `(Pickup online ${amt(components.pickupRevenueLkr)} + Delivery online ${amt(components.deliveryRevenueLkr)})`;
}

/** Pickup online + delivery online revenue subtotals only (excludes delivery & convenience fees). */
export function sumOnlineRevenueSubtotals(breakdown: SettlementBreakdown): number {
  const components = resolveOnlinePaymentsCollectedComponents(breakdown);
  return components.revenueSubtotalLkr;
}

/** Total customer convenience fee for payout allocation (order + retained refund fees). */
export function resolveTotalCustomerConvenienceFeeLkr(params: {
  orderConvenienceFeeLkr?: number;
  refundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
}): number {
  return (
    (params.orderConvenienceFeeLkr ?? 0) +
    (params.refundConvenienceFeeLkr ?? 0) +
    (params.rejectedRefundConvenienceFeeLkr ?? 0)
  );
}

export function computePayoutNetLkr(params: {
  onlinePaymentsCollectedLkr: number;
  netPlatformCommissionLkr: number;
  gatewayLkr: number;
  cancelledByBranchGatewayFeeLkr?: number;
  customerLateCancelNetAmountLkr?: number;
  rejectedRefundNetAmountLkr?: number;
}): number {
  const raw =
    params.onlinePaymentsCollectedLkr -
    params.netPlatformCommissionLkr -
    params.gatewayLkr;
  const afterBranchCancellations =
    raw - (params.cancelledByBranchGatewayFeeLkr ?? 0);
  const afterCustomerRecovery =
    afterBranchCancellations + (params.customerLateCancelNetAmountLkr ?? 0);
  const afterRejectedRefunds =
    afterCustomerRecovery + (params.rejectedRefundNetAmountLkr ?? 0);
  return Math.max(0, Math.round(afterRejectedRefunds * 100) / 100);
}

export function computePeriodGatewayLkr(params: {
  onlinePaymentsCollectedLkr: number;
  gatewayRatePct?: number;
}): number {
  const rate = (params.gatewayRatePct ?? 1.9) / 100;
  return Math.round(params.onlinePaymentsCollectedLkr * 100 * rate) / 100;
}

/** Branch net payout using the same formula as ApprovePayoutBreakdown summary. */
export function computePeriodPayoutNetFromPreview(params: {
  preview: SettlementPreview | null;
  periodBreakdownLkr: {
    commissionFee: number;
    platformPaybackTotal?: number;
    periodDiscountsTotal?: number;
    periodLoyaltyDiscountTotal?: number;
    netPlatformEarning?: number;
    sharedPromoPlatformContributionLkr?: number;
    onlineWalletGross?: number;
    convenienceFee?: number;
    deliveryFee?: number;
    cancelledByBranchGatewayFee?: number;
    customerLateCancelNetAmount?: number;
    rejectedRefundNetAmount?: number;
  } | null;
  sharedPromoPlatformLkr?: number;
  convenienceFeeLkr?: number;
  deliveryFeeLkr?: number;
  gatewayRatePct?: number;
  paybackEnabled: boolean;
}): number | null {
  if (!params.periodBreakdownLkr) return null;

  const preview = params.preview;
  const period = params.periodBreakdownLkr;
  const onlinePaymentsCollectedLkr = preview
    ? sumOnlineRevenueSubtotals(preview.breakdown)
    : (period.onlineWalletGross ?? 0);
  const commissionLkr = preview?.totalCommission ?? period.commissionFee;
  const sharedPromoPlatformLkr =
    params.sharedPromoPlatformLkr ?? period.sharedPromoPlatformContributionLkr ?? 0;
  const netPlatformCommissionLkr = resolveTotalPlatformCommissionDisplayLkr({
    commissionLkr,
    platformPaybackTotal: period.platformPaybackTotal,
    paybackEnabled: params.paybackEnabled,
    sharedPromoPlatformLkr,
    loyaltyDiscountLkr: period.periodLoyaltyDiscountTotal,
    netPlatformEarningLkr: period.netPlatformEarning,
  });

  const gatewayLkr = computePeriodGatewayLkr({
    onlinePaymentsCollectedLkr,
    gatewayRatePct: params.gatewayRatePct,
  });

  return computePayoutNetLkr({
    onlinePaymentsCollectedLkr,
    netPlatformCommissionLkr,
    gatewayLkr,
    cancelledByBranchGatewayFeeLkr: period.cancelledByBranchGatewayFee,
    customerLateCancelNetAmountLkr: period.customerLateCancelNetAmount,
    rejectedRefundNetAmountLkr: period.rejectedRefundNetAmount,
  });
}

export type PeriodPayoutSplitLkr = {
  /** Branch payout after commission and gateway deductions. */
  branchReceivesLkr: number;
  /** Same as branchReceivesLkr — online share after platform deductions. */
  branchProductShareLkr: number;
  commissionLkr: number;
  convenienceFeeLkr: number;
  /** @deprecated Use commissionLkr + convenienceFeeLkr */
  dartCodesReceivesLkr: number;
  deliveryFeeLkr: number;
};

export function computePeriodPayoutSplitLkr(breakdown: {
  netAmount: number;
  deliveryFee: number;
  commissionFee: number;
  convenienceFee?: number;
}): PeriodPayoutSplitLkr {
  const deliveryFeeLkr = breakdown.deliveryFee;
  const commissionLkr = breakdown.commissionFee;
  const convenienceFeeLkr = breakdown.convenienceFee ?? 0;
  const dartCodesReceivesLkr = commissionLkr + convenienceFeeLkr;

  return {
    branchReceivesLkr: breakdown.netAmount,
    branchProductShareLkr: breakdown.netAmount,
    commissionLkr,
    convenienceFeeLkr,
    dartCodesReceivesLkr,
    deliveryFeeLkr,
  };
}

export function settlementApiBase(): string {
  const api = getApiBaseUrl();
  return api.replace(/\/api\/?$/, '');
}

export function settlementReceiptHref(receiptUrl: string | null | undefined): string | null {
  if (!receiptUrl) return null;
  if (receiptUrl.startsWith('http')) return receiptUrl;
  if (receiptUrl.startsWith('/settlements/')) return null;
  return `${settlementApiBase()}${receiptUrl}`;
}

export function hasProtectedSettlementReceipt(receiptUrl: string | null | undefined): boolean {
  return Boolean(receiptUrl?.startsWith('/settlements/'));
}

export function settlementReceiptIsPdf(href: string): boolean {
  try {
    const pathname = new URL(href, 'http://local').pathname;
    return pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return href.split('?')[0].toLowerCase().endsWith('.pdf');
  }
}

export function isProtectedWithdrawalInvoice(invoiceUrl: string | null | undefined): boolean {
  if (!invoiceUrl) return false;
  if (invoiceUrl.startsWith('/invoices/')) return true;
  if (invoiceUrl.startsWith('/api/admin/invoices/')) return true;
  if (/^https?:\/\//i.test(invoiceUrl)) {
    try {
      const pathname = new URL(invoiceUrl).pathname;
      return pathname.includes('/admin/invoices/');
    } catch {
      return false;
    }
  }
  return false;
}

export function hasWithdrawalInvoice(invoiceUrl: string | null | undefined): boolean {
  return Boolean(invoiceUrl?.trim());
}

export function withdrawalInvoiceHref(invoiceUrl: string | null | undefined): string | null {
  if (!invoiceUrl || isProtectedWithdrawalInvoice(invoiceUrl)) return null;
  return settlementReceiptHref(invoiceUrl);
}

export function settlementStatusLabel(status: SettlementStatement['status']): string {
  switch (status) {
    case 'VERIFIED':
      return 'Settled';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Pending';
  }
}
