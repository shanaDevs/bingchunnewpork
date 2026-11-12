import {
  commissionRateToDisplayPct,
  getEffectiveRate,
  resolveCommissionSlabs,
} from '@/components/admin/commissionUtils';
import { formatMoneyAmount } from '@/lib/receipt';
import type { ResolvePayoutReportValuesInput } from '@/components/admin/resolvePayoutReportValues';
import {
  hasSharedPromoAmounts,
  resolveTotalDiscountsLkr,
  roundLkr,
  sumAllDiscounts,
  sumAllRevenueSubtotal,
  sumAllSubtotalBeforeDiscount,
  resolveOnlinePaymentsCollectedComponents,
  resolveFirstPayoutOnlineSubtotalComponents,
  sumOnlineRevenueSubtotals,
  type PayoutFormulaBreakdownLkr,
  type SettlementBreakdown,
  type SettlementPreview,
  type SharedPromoBreakdownLkr,
} from '@/components/admin/settlementTypes';

function firstNumber(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    if (value != null) return value;
  }
  return 0;
}

function resolveFirstPayoutOnlineCollectionsLkr(params: {
  preview: SettlementPreview | null;
  channelBreakdown: SettlementBreakdown | null | undefined;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  snapshotActive: boolean;
  onlinePaymentsOverride: number | null;
  fallbackOnlineWalletLkr: number;
}): number {
  const breakdown = params.preview?.breakdown ?? params.channelBreakdown ?? null;
  if (breakdown) {
    return sumOnlineRevenueSubtotals(breakdown);
  }
  if (params.onlinePaymentsOverride != null) {
    return params.onlinePaymentsOverride;
  }
  if (params.snapshotActive) {
    return (
      params.periodBreakdownLkr.gatewayBase ??
      params.periodBreakdownLkr.onlineWalletGross ??
      params.fallbackOnlineWalletLkr
    );
  }
  return params.periodBreakdownLkr.gatewayBase ?? params.fallbackOnlineWalletLkr;
}

export function resolveSalesFigures(params: {
  preview: SettlementPreview | null;
  channelBreakdown?: SettlementBreakdown | null;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  snapshotActive: boolean;
  fallbackGrossLkr: number;
  totalSalesOverride: number | null;
  totalDiscountOverride: number | null;
  subtotalBeforeDiscountOverride: number | null;
  onlinePaymentsOverride: number | null;
  cycleStage?: 'FIRST' | 'SECOND';
}) {
  const {
    preview,
    channelBreakdown,
    periodBreakdownLkr,
    snapshotActive,
    fallbackGrossLkr,
    totalSalesOverride,
    totalDiscountOverride,
    subtotalBeforeDiscountOverride,
    onlinePaymentsOverride,
    cycleStage,
  } = params;

  const allChannelsSubtotalLkr =
    totalSalesOverride ??
    (snapshotActive
      ? periodBreakdownLkr.grossAmount
      : preview != null
        ? sumAllRevenueSubtotal(preview)
        : fallbackGrossLkr);
  const previewDiscountLkr = preview && !snapshotActive ? sumAllDiscounts(preview.breakdown) : 0;
  const totalDiscountLkr =
    totalDiscountOverride ??
    resolveTotalDiscountsLkr({
      periodDiscountsTotal: periodBreakdownLkr.periodDiscountsTotal,
      previewDiscountTotal: previewDiscountLkr,
    });
  const subtotalBeforeDiscountLkr =
    subtotalBeforeDiscountOverride ??
    (snapshotActive
      ? (periodBreakdownLkr.periodDiscountsTotal ?? 0) > 0.001
        ? periodBreakdownLkr.grossAmount + (periodBreakdownLkr.periodDiscountsTotal ?? 0)
        : periodBreakdownLkr.grossAmount
      : preview
        ? sumAllSubtotalBeforeDiscount(preview.breakdown)
        : totalDiscountLkr > 0.001 && periodBreakdownLkr.grossAmount != null
          ? periodBreakdownLkr.grossAmount + totalDiscountLkr
          : 0);

  const grossLkr = allChannelsSubtotalLkr ?? periodBreakdownLkr.grossAmount ?? 0;
  const onlineWalletLkr =
    periodBreakdownLkr.onlineWalletGross ?? periodBreakdownLkr.gatewayBase ?? 0;
  const onlinePaymentsCollectedLkr =
    cycleStage === 'FIRST'
      ? resolveFirstPayoutOnlineCollectionsLkr({
          preview,
          channelBreakdown,
          periodBreakdownLkr,
          snapshotActive,
          onlinePaymentsOverride,
          fallbackOnlineWalletLkr: onlineWalletLkr,
        })
      : snapshotActive
        ? (periodBreakdownLkr.onlineWalletGross ?? periodBreakdownLkr.gatewayBase ?? 0)
        : (onlinePaymentsOverride ??
          (preview ? sumOnlineRevenueSubtotals(preview.breakdown) : onlineWalletLkr));
  const commissionLkr = snapshotActive
    ? periodBreakdownLkr.commissionFee
    : preview != null
      ? preview.totalCommission
      : (periodBreakdownLkr.commissionFee ?? 0);

  return {
    grossLkr,
    totalDiscountLkr,
    subtotalBeforeDiscountLkr,
    onlinePaymentsCollectedLkr,
    commissionLkr,
  };
}

export function resolveDiscountReport(params: {
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  totalDiscountLkr: number;
  sharedPromo: SharedPromoBreakdownLkr | null;
  loyaltyDiscountLkr: number;
  paybackEnabled: boolean;
}) {
  const { periodBreakdownLkr, totalDiscountLkr, sharedPromo, loyaltyDiscountLkr, paybackEnabled } =
    params;
  const sharedPromoPlatformLkr = sharedPromo?.platformContributionLkr ?? 0;
  const sharedPromoJasonLkr = sharedPromo?.jasonContributionLkr ?? 0;
  const sharedPromoBranchLkr = sharedPromo?.branchContributionLkr ?? 0;
  const sharedPromoTotalLkr = sharedPromo?.totalDiscountLkr ?? 0;
  const totalProvidedDiscountsLkr = periodBreakdownLkr.periodDiscountsTotal ?? totalDiscountLkr;
  const branchOwnedPromoDiscountsLkr = periodBreakdownLkr.branchOwnedPromoDiscountTotal ?? 0;
  const platformOwnedPromoDiscountsLkr = periodBreakdownLkr.platformOwnedPromoDiscountTotal ?? 0;
  const totalPromotionDiscountsLkr =
    branchOwnedPromoDiscountsLkr + platformOwnedPromoDiscountsLkr + sharedPromoTotalLkr;
  const untrackedDiscountsLkr = Math.max(
    0,
    roundLkr(totalProvidedDiscountsLkr - totalPromotionDiscountsLkr - loyaltyDiscountLkr),
  );
  const costPartnerBranchDiscountsLkr = branchOwnedPromoDiscountsLkr + sharedPromoBranchLkr;
  const sharedPromoPlatformForCostPartner = paybackEnabled ? sharedPromoPlatformLkr : 0;
  const costPartnerPlatformDiscountsLkr =
    platformOwnedPromoDiscountsLkr + sharedPromoPlatformForCostPartner + loyaltyDiscountLkr;
  const costPartnerJasonDiscountsLkr = sharedPromoJasonLkr;
  const costPartnerDiscountsTotalLkr =
    costPartnerBranchDiscountsLkr +
    costPartnerPlatformDiscountsLkr +
    costPartnerJasonDiscountsLkr;

  return {
    sharedPromoPlatformLkr,
    sharedPromoJasonLkr,
    sharedPromoTotalLkr,
    totalProvidedDiscountsLkr,
    branchOwnedPromoDiscountsLkr,
    platformOwnedPromoDiscountsLkr,
    totalSharedPromoDiscountsLkr: sharedPromoTotalLkr,
    totalPromotionDiscountsLkr,
    untrackedDiscountsLkr,
    branchDiscountsLkr: sharedPromoBranchLkr,
    platformDiscountsLkr: sharedPromoPlatformLkr,
    jasonDiscountsLkr: sharedPromoJasonLkr,
    costPartnerBranchDiscountsLkr,
    costPartnerPlatformDiscountsLkr,
    costPartnerJasonDiscountsLkr,
    costPartnerDiscountsTotalLkr,
    showSharedPromo: sharedPromo != null && hasSharedPromoAmounts(sharedPromo),
  };
}

export function resolveRefundReport(
  periodBreakdownLkr: PayoutFormulaBreakdownLkr,
  snapshots: Pick<
    ResolvePayoutReportValuesInput,
    | 'snapshotCancelledByBranchGatewayFeeLkr'
    | 'snapshotCancelledByBranchOrderCount'
    | 'snapshotCustomerLateCancelSubtotalLkr'
    | 'snapshotCustomerLateCancelGatewayDeductionLkr'
    | 'snapshotCustomerLateCancelNetAmountLkr'
    | 'snapshotRejectedRefundSubtotalLkr'
    | 'snapshotRejectedRefundGatewayDeductionLkr'
    | 'snapshotRejectedRefundNetAmountLkr'
  >,
) {
  const cancelledByBranchGatewayFeeLkr = firstNumber(
    snapshots.snapshotCancelledByBranchGatewayFeeLkr,
    periodBreakdownLkr.cancelledByBranchGatewayFee,
  );
  const cancelledByBranchOrderCount = firstNumber(
    snapshots.snapshotCancelledByBranchOrderCount,
    periodBreakdownLkr.cancelledByBranchOrderCount,
  );
  const customerLateCancelSubtotalLkr = firstNumber(
    snapshots.snapshotCustomerLateCancelSubtotalLkr,
    periodBreakdownLkr.customerLateCancelSubtotal,
  );
  const customerLateCancelGatewayDeductionLkr = firstNumber(
    snapshots.snapshotCustomerLateCancelGatewayDeductionLkr,
    periodBreakdownLkr.customerLateCancelGatewayDeduction,
  );
  const customerLateCancelNetAmountLkr = firstNumber(
    snapshots.snapshotCustomerLateCancelNetAmountLkr,
    periodBreakdownLkr.customerLateCancelNetAmount,
  );
  const rejectedRefundSubtotalLkr = firstNumber(
    snapshots.snapshotRejectedRefundSubtotalLkr,
    periodBreakdownLkr.rejectedRefundSubtotal,
  );
  const rejectedRefundGatewayDeductionLkr = firstNumber(
    snapshots.snapshotRejectedRefundGatewayDeductionLkr,
    periodBreakdownLkr.rejectedRefundGatewayDeduction,
  );
  const rejectedRefundNetAmountLkr = firstNumber(
    snapshots.snapshotRejectedRefundNetAmountLkr,
    periodBreakdownLkr.rejectedRefundNetAmount,
  );
  const refundConvenienceFeeLkr = periodBreakdownLkr.refundConvenienceFee ?? 0;
  const rejectedRefundConvenienceFeeLkr = periodBreakdownLkr.rejectedRefundConvenienceFee ?? 0;
  const refundDeliveryFeeLkr = periodBreakdownLkr.refundDeliveryFee ?? 0;
  const rejectedRefundDeliveryFeeLkr = periodBreakdownLkr.rejectedRefundDeliveryFee ?? 0;
  const platformRefundsLkr = refundConvenienceFeeLkr + rejectedRefundConvenienceFeeLkr;
  const deliveryRefundsLkr = refundDeliveryFeeLkr + rejectedRefundDeliveryFeeLkr;
  const nonReturningRefundsBranchLkr =
    customerLateCancelNetAmountLkr + rejectedRefundNetAmountLkr;
  const nonReturningRefundsBranchGrossLkr =
    customerLateCancelSubtotalLkr + rejectedRefundSubtotalLkr;
  const showBranchRefunds = cancelledByBranchGatewayFeeLkr > 0.001;
  const showCustomerRefunds =
    customerLateCancelSubtotalLkr > 0.001 ||
    customerLateCancelGatewayDeductionLkr > 0.001 ||
    customerLateCancelNetAmountLkr > 0.001;
  const showRejectedRefunds =
    rejectedRefundSubtotalLkr > 0.001 ||
    rejectedRefundGatewayDeductionLkr > 0.001 ||
    rejectedRefundNetAmountLkr > 0.001;

  return {
    cancelledByBranchGatewayFeeLkr,
    cancelledByBranchOrderCount,
    customerLateCancelSubtotalLkr,
    customerLateCancelGatewayDeductionLkr,
    customerLateCancelNetAmountLkr,
    rejectedRefundSubtotalLkr,
    rejectedRefundGatewayDeductionLkr,
    rejectedRefundNetAmountLkr,
    refundConvenienceFeeLkr,
    rejectedRefundConvenienceFeeLkr,
    refundDeliveryFeeLkr,
    rejectedRefundDeliveryFeeLkr,
    platformRefundsLkr,
    deliveryRefundsLkr,
    nonReturningRefundsBranchLkr,
    nonReturningRefundsBranchGrossLkr,
    totalRefundAmountLkr: nonReturningRefundsBranchLkr,
    totalRefundAmountGrossLkr:
      nonReturningRefundsBranchGrossLkr + platformRefundsLkr + deliveryRefundsLkr,
    showBranchRefunds,
    showCustomerRefunds,
    showRejectedRefunds,
    showRefundSection: showBranchRefunds || showCustomerRefunds || showRejectedRefunds,
  };
}

export function resolveGatewayFigures(params: {
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  snapshotActive: boolean;
  useStoredSnapshot: boolean;
  onlinePaymentsCollectedLkr: number;
  gatewayRatePctProp: number;
  snapshotGatewayFeeLkr: number | null;
  snapshotGatewayRatePct: number | null;
  snapshotOnlineWalletGrossLkr: number | null;
  isFirstCyclePayout?: boolean;
  secondCycleBranchWalletBeforeGatewayLkr?: number | null;
}) {
  const {
    periodBreakdownLkr,
    snapshotActive,
    useStoredSnapshot,
    onlinePaymentsCollectedLkr,
    gatewayRatePctProp,
    snapshotGatewayFeeLkr,
    snapshotGatewayRatePct,
    snapshotOnlineWalletGrossLkr,
    isFirstCyclePayout = false,
    secondCycleBranchWalletBeforeGatewayLkr = null,
  } = params;
  const gatewayBaseLkr = isFirstCyclePayout
    ? (snapshotOnlineWalletGrossLkr ?? onlinePaymentsCollectedLkr)
    : secondCycleBranchWalletBeforeGatewayLkr != null && secondCycleBranchWalletBeforeGatewayLkr >= 0
      ? secondCycleBranchWalletBeforeGatewayLkr
      : (snapshotOnlineWalletGrossLkr ??
        (periodBreakdownLkr.gatewayBase != null && periodBreakdownLkr.gatewayBase > 0
          ? periodBreakdownLkr.gatewayBase
          : periodBreakdownLkr.remainingOnlineWalletLkr != null &&
              periodBreakdownLkr.remainingOnlineWalletLkr >= 0
            ? periodBreakdownLkr.remainingOnlineWalletLkr
            : onlinePaymentsCollectedLkr));
  const gatewayRatePct =
    snapshotGatewayRatePct ??
    (snapshotActive
      ? (periodBreakdownLkr.gatewayRatePct ?? gatewayRatePctProp)
      : gatewayRatePctProp);
  const gatewayLkr = isFirstCyclePayout
    ? roundLkr(gatewayBaseLkr * (gatewayRatePct / 100))
    : (snapshotGatewayFeeLkr ??
      (useStoredSnapshot || snapshotActive
        ? (periodBreakdownLkr.gatewayFee ?? 0)
        : roundLkr(gatewayBaseLkr * (gatewayRatePct / 100))));
  const gatewayHint =
    gatewayBaseLkr > 0.001
      ? `Online payments collected (branch revenue) ${formatMoneyAmount(gatewayBaseLkr)} x ${gatewayRatePct}%`
      : `Online payments collected (branch revenue) x ${gatewayRatePct}%`;

  return { gatewayBaseLkr, gatewayRatePct, gatewayLkr, gatewayHint };
}

export function resolveApplicableSlabCommissionRateDisplay(params: {
  preview: SettlementPreview | null;
  slabRatePct: number | null;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
}): { applicableSlabCommissionRatePct: number | null; slabMonthlyBaseLkr: number | null } {
  const monthlyBase = params.preview?.slabInfo.monthlyBase;
  const payoutSlabs = resolveCommissionSlabs(params.preview?.slabInfo.slabs);
  if (monthlyBase != null && monthlyBase >= 0) {
    return {
      applicableSlabCommissionRatePct: commissionRateToDisplayPct(
        getEffectiveRate(monthlyBase, payoutSlabs),
      ),
      slabMonthlyBaseLkr: monthlyBase,
    };
  }
  const previewRate = params.preview?.slabInfo.effectiveRate;
  if (previewRate != null && previewRate > 0) {
    return {
      applicableSlabCommissionRatePct: commissionRateToDisplayPct(previewRate),
      slabMonthlyBaseLkr: params.preview?.slabInfo.monthlyBase ?? null,
    };
  }
  if (params.slabRatePct != null) {
    return { applicableSlabCommissionRatePct: params.slabRatePct, slabMonthlyBaseLkr: null };
  }
  const storedRate = params.periodBreakdownLkr.commissionRate;
  if (storedRate != null && storedRate > 0) {
    return {
      applicableSlabCommissionRatePct: commissionRateToDisplayPct(storedRate),
      slabMonthlyBaseLkr: null,
    };
  }
  return { applicableSlabCommissionRatePct: null, slabMonthlyBaseLkr: null };
}

export function resolveOnlineWalletChannelNets(params: {
  preview: SettlementPreview | null;
  channelBreakdown: SettlementBreakdown | null | undefined;
  cycleStage?: 'FIRST' | 'SECOND';
}): { onlinePickupNetLkr: number; onlineDeliveryNetLkr: number } {
  const breakdown = params.preview?.breakdown ?? params.channelBreakdown ?? null;
  if (!breakdown) {
    return { onlinePickupNetLkr: 0, onlineDeliveryNetLkr: 0 };
  }
  if (params.cycleStage === 'FIRST') {
    const parts = resolveFirstPayoutOnlineSubtotalComponents(breakdown);
    return {
      onlinePickupNetLkr: parts.pickupSubtotalLkr,
      onlineDeliveryNetLkr: parts.deliverySubtotalLkr,
    };
  }
  const components = resolveOnlinePaymentsCollectedComponents(breakdown);
  return {
    onlinePickupNetLkr: components.pickupRevenueLkr,
    onlineDeliveryNetLkr: components.deliveryRevenueLkr,
  };
}
