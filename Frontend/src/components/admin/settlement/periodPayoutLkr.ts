import type { SettlementPreview } from './settlementModels';
import {
  sumOnlineRevenueSubtotals,
  sumOnlineSubtotalBeforeDiscount,
  type SettlementBreakdown,
} from './channelBreakdown';
import { resolveTotalPlatformCommissionDisplayLkr } from './platformCommissionLkr';

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
    platformOwnedPromoDiscountTotal?: number;
    periodDiscountsTotal?: number;
    periodLoyaltyDiscountTotal?: number;
    netPlatformEarning?: number;
    sharedPromoPlatformContributionLkr?: number;
    onlineWalletGross?: number;
    gatewayBase?: number;
    convenienceFee?: number;
    deliveryFee?: number;
    cycleStage?: 'FIRST' | 'SECOND';
    channelBreakdown?: SettlementBreakdown;
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
    ? period.cycleStage === 'FIRST'
      ? sumOnlineSubtotalBeforeDiscount(preview.breakdown)
      : sumOnlineRevenueSubtotals(preview.breakdown)
    : period.cycleStage === 'FIRST' && period.channelBreakdown
      ? sumOnlineSubtotalBeforeDiscount(period.channelBreakdown)
      : period.cycleStage === 'FIRST'
        ? (period.gatewayBase ?? period.onlineWalletGross ?? 0)
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
    platformOwnedPromoDiscountLkr: period.platformOwnedPromoDiscountTotal,
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