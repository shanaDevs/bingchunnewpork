import type {
  GenerateWithdrawalInvoiceInput,
  InvoicePayoutStatement,
  InvoicePeriodBreakdown,
} from './types';
import { resolveNetPlatformAmountCentsFromWithdrawalBreakdown } from './netPlatformAmountFromBreakdown';

export { resolveNetPlatformAmountCentsFromWithdrawalBreakdown } from './netPlatformAmountFromBreakdown';

function num(o: Record<string, unknown>, key: string): number {
  const value = o[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function hasNumber(o: Record<string, unknown>, key: string): boolean {
  const value = o[key];
  return typeof value === 'number' && Number.isFinite(value);
}

const EMPTY_STATEMENT: InvoicePayoutStatement = {
  totalSaleCents: 0,
  onlineWalletCents: 0,
  commissionCents: 0,
  branchDiscountCents: 0,
  platformDiscountCents: 0,
  jasonDiscountCents: 0,
  costPartnerTotalCents: 0,
  nonReturningRefundsCents: 0,
  platformRefundsCents: 0,
  deliveryRefundsCents: 0,
  totalRefundCents: 0,
  platformDiscountsReportCents: 0,
  platformOwnedPromoCents: 0,
  sharedPlatformDiscountCents: 0,
  platformPaybackCents: 0,
  loyaltyDiscountCents: 0,
  netPlatformAmountCents: 0,
  gatewayFeeCents: 0,
  gatewayRatePct: 1.9,
  bankPenaltyCents: 0,
  bankPenaltyOrderCount: 0,
  jasonPayoutTopUpCents: 0,
  branchNetPayoutCents: 0,
};

function paybackEnabledFromWithdrawalBreakdown(o: Record<string, unknown>): boolean {
  if (typeof o.platformDiscountPaybackEnabled === 'boolean') {
    return o.platformDiscountPaybackEnabled;
  }
  return num(o, 'platformPaybackTotal') > 0;
}

/** Build page-2 payout figures from the stored withdrawal breakdown (cents). */
export function buildPayoutStatementFromBreakdown(
  breakdown: unknown,
  requestedCents: number,
  storePaybackEnabled = true,
): InvoicePayoutStatement {
  if (!breakdown || typeof breakdown !== 'object') {
    return { ...EMPTY_STATEMENT, branchNetPayoutCents: requestedCents };
  }

  const o = breakdown as Record<string, unknown>;
  const totalSaleCents = num(o, 'grossAmount');
  const onlineWalletCents = num(o, 'onlinePaymentsCollected') || num(o, 'onlineWalletGross');
  const commissionCents = num(o, 'commissionFee');
  const branchOwned = num(o, 'branchOwnedPromoDiscountTotal');
  const platformOwned = num(o, 'platformOwnedPromoDiscountTotal');
  const sharedBranch = num(o, 'sharedPromoBranchContributionAmount');
  const sharedPlatform = num(o, 'sharedPromoPlatformContributionAmount');
  const sharedJason = num(o, 'sharedPromoJasonContributionAmount');
  const loyaltyDiscountCents = num(o, 'periodLoyaltyDiscountTotal');
  const paybackCents = storePaybackEnabled ? num(o, 'platformPaybackTotal') : 0;

  const branchDiscountCents = branchOwned + sharedBranch;
  const platformDiscountCents = platformOwned + sharedPlatform + loyaltyDiscountCents;
  const jasonDiscountCents = sharedJason;
  const costPartnerTotalCents =
    branchDiscountCents + platformDiscountCents + jasonDiscountCents;

  const nonReturningRefundsCents =
    num(o, 'customerLateCancelSubtotal') + num(o, 'rejectedRefundSubtotal');
  const platformRefundsCents =
    num(o, 'refundConvenienceFee') + num(o, 'rejectedRefundConvenienceFee');
  const deliveryRefundsCents =
    num(o, 'refundDeliveryFee') + num(o, 'rejectedRefundDeliveryFee');
  const totalRefundCents =
    nonReturningRefundsCents + platformRefundsCents + deliveryRefundsCents;

  const platformPromoDeductCents = Math.max(paybackCents, platformOwned);
  const platformDiscountsReportCents = platformPromoDeductCents + sharedPlatform;
  const netPlatformAmountCents = resolveNetPlatformAmountCentsFromWithdrawalBreakdown(breakdown);
  const platformPaybackCents = paybackCents;

  const gatewayRateRaw = o.gatewayRatePct;
  const gatewayRatePct =
    typeof gatewayRateRaw === 'number' && Number.isFinite(gatewayRateRaw) && gatewayRateRaw > 0
      ? gatewayRateRaw
      : 1.9;

  return {
    totalSaleCents,
    onlineWalletCents,
    commissionCents,
    branchDiscountCents,
    platformDiscountCents,
    jasonDiscountCents,
    costPartnerTotalCents,
    nonReturningRefundsCents,
    platformRefundsCents,
    deliveryRefundsCents,
    totalRefundCents,
    platformDiscountsReportCents,
    platformOwnedPromoCents: platformOwned,
    sharedPlatformDiscountCents: sharedPlatform,
    platformPaybackCents,
    loyaltyDiscountCents,
    netPlatformAmountCents,
    gatewayFeeCents: num(o, 'gatewayFee'),
    gatewayRatePct,
    bankPenaltyCents: num(o, 'cancelledByBranchGatewayFee'),
    bankPenaltyOrderCount: num(o, 'cancelledByBranchOrderCount'),
    jasonPayoutTopUpCents: sharedJason,
    branchNetPayoutCents: requestedCents,
  };
}

function fallbackFromPeriod(
  pb: InvoicePeriodBreakdown | null | undefined,
  requestedCents: number,
  paybackCents: number,
  gatewayRatePct: number,
): InvoicePayoutStatement {
  const commissionCents = pb?.commissionFeeCents ?? 0;
  const platformDiscountsReportCents = paybackCents;
  return {
    ...EMPTY_STATEMENT,
    totalSaleCents: pb?.grossAmountCents ?? 0,
    onlineWalletCents: pb?.onlineWalletGrossCents ?? 0,
    commissionCents,
    platformDiscountsReportCents,
    netPlatformAmountCents: commissionCents - paybackCents,
    gatewayFeeCents: pb?.gatewayFeeCents ?? 0,
    gatewayRatePct,
    branchNetPayoutCents: requestedCents,
  };
}

/** Prefer stored snapshot; fall back to period/promo fields for legacy invoiceData. */
export function resolvePayoutStatement(input: GenerateWithdrawalInvoiceInput): InvoicePayoutStatement {
  if (input.payoutStatement) {
    return {
      ...EMPTY_STATEMENT,
      ...input.payoutStatement,
      branchNetPayoutCents: input.payoutStatement.branchNetPayoutCents || input.requestedCents,
    };
  }
  return fallbackFromPeriod(
    input.periodBreakdown,
    input.requestedCents,
    input.promoSummary?.platformPaybackCents ?? 0,
    input.gatewayRatePct ?? 1.9,
  );
}

export function parsePayoutStatement(value: unknown): InvoicePayoutStatement | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.totalSaleCents !== 'number' && typeof o.commissionCents !== 'number') {
    return null;
  }
  return {
    ...EMPTY_STATEMENT,
    totalSaleCents: num(o, 'totalSaleCents'),
    onlineWalletCents: num(o, 'onlineWalletCents'),
    commissionCents: num(o, 'commissionCents'),
    branchDiscountCents: num(o, 'branchDiscountCents'),
    platformDiscountCents: num(o, 'platformDiscountCents'),
    jasonDiscountCents: num(o, 'jasonDiscountCents'),
    costPartnerTotalCents: num(o, 'costPartnerTotalCents'),
    nonReturningRefundsCents: num(o, 'nonReturningRefundsCents'),
    platformRefundsCents: num(o, 'platformRefundsCents'),
    deliveryRefundsCents: num(o, 'deliveryRefundsCents'),
    totalRefundCents: num(o, 'totalRefundCents'),
    platformDiscountsReportCents: num(o, 'platformDiscountsReportCents'),
    platformOwnedPromoCents: num(o, 'platformOwnedPromoCents'),
    sharedPlatformDiscountCents: num(o, 'sharedPlatformDiscountCents'),
    platformPaybackCents: num(o, 'platformPaybackCents'),
    loyaltyDiscountCents: num(o, 'loyaltyDiscountCents'),
    netPlatformAmountCents: num(o, 'netPlatformAmountCents'),
    gatewayFeeCents: num(o, 'gatewayFeeCents'),
    gatewayRatePct:
      typeof o.gatewayRatePct === 'number' && Number.isFinite(o.gatewayRatePct)
        ? o.gatewayRatePct
        : 1.9,
    bankPenaltyCents: num(o, 'bankPenaltyCents'),
    bankPenaltyOrderCount: num(o, 'bankPenaltyOrderCount'),
    jasonPayoutTopUpCents: num(o, 'jasonPayoutTopUpCents'),
    branchNetPayoutCents: num(o, 'branchNetPayoutCents'),
  };
}
