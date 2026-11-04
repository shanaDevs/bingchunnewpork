import {
  commissionRateToDisplayPct,
  getEffectiveRate,
} from '@/components/admin/commissionUtils';
import { formatMoneyAmount } from '@/lib/receipt';
import {
  computePayoutNetLkr,
  hasSharedPromoAmounts,
  resolveCommissionPaybackLkr,
  resolveExtraPlatformOwnedDeductionLkr,
  resolveNetPlatformCommissionWithRefundFeesLkr,
  resolvePlatformDiscountsReportLkr,
  resolveTotalDiscountsLkr,
  resolveTotalPlatformCommissionDisplayLkr,
  roundLkr,
  sumAllDiscounts,
  sumAllRevenueSubtotal,
  sumAllSubtotalBeforeDiscount,
  resolveOnlinePaymentsCollectedComponents,
  sumOnlineRevenueSubtotals,
  type PayoutFormulaBreakdownLkr,
  type SettlementBreakdown,
  type SettlementPreview,
  type SharedPromoBreakdownLkr,
} from '@/components/admin/settlementTypes';

export type ResolvePayoutReportValuesInput = {
  preview: SettlementPreview | null;
  /** Channel table for report display (e.g. online wallet split); does not change payout totals. */
  channelBreakdown?: SettlementBreakdown | null;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr | null;
  onlineOrderSubtotalLkr: number | null;
  convenienceFeeLkr: number;
  paybackEnabled?: boolean;
  totalSalesLkr?: number | null;
  totalDiscountLkr?: number | null;
  subtotalBeforeDiscountLkr?: number | null;
  onlinePaymentsCollectedLkr?: number | null;
  gatewayRatePct?: number;
  useStoredSnapshot?: boolean;
  snapshotGatewayFeeLkr?: number | null;
  snapshotGatewayRatePct?: number | null;
  snapshotOnlineWalletGrossLkr?: number | null;
  snapshotCancelledByBranchGatewayFeeLkr?: number | null;
  snapshotCancelledByBranchOrderCount?: number | null;
  snapshotCustomerLateCancelSubtotalLkr?: number | null;
  snapshotCustomerLateCancelGatewayDeductionLkr?: number | null;
  snapshotCustomerLateCancelNetAmountLkr?: number | null;
  snapshotRejectedRefundSubtotalLkr?: number | null;
  snapshotRejectedRefundGatewayDeductionLkr?: number | null;
  snapshotRejectedRefundNetAmountLkr?: number | null;
  snapshotNetAmountLkr?: number | null;
  sharedPromo?: SharedPromoBreakdownLkr | null;
  loyaltyDiscountLkr?: number | null;
  /** Active slab commission rate (%) — report display only. */
  slabRatePct?: number | null;
};

export type PayoutReportValues = {
  hasPeriodData: boolean;
  grossLkr: number;
  subtotalBeforeDiscountLkr: number;
  totalDiscountLkr: number;
  totalProvidedDiscountsLkr: number;
  branchOwnedPromoDiscountsLkr: number;
  platformOwnedPromoDiscountsLkr: number;
  totalSharedPromoDiscountsLkr: number;
  totalPromotionDiscountsLkr: number;
  untrackedDiscountsLkr: number;
  onlinePaymentsCollectedLkr: number;
  /** Pickup online net amount (revenue subtotal) for Online Wallet info display. */
  onlinePickupNetLkr: number;
  /** Delivery online net amount (revenue subtotal) for Online Wallet info display. */
  onlineDeliveryNetLkr: number;
  commissionLkr: number;
  slabRatePct: number | null;
  /** Slab tier rate (%) from rolling monthly sales — Financial Report commission popover only. */
  applicableSlabCommissionRatePct: number | null;
  /** Rolling monthly sales base (LKR) used to pick the slab tier — display only. */
  slabMonthlyBaseLkr: number | null;
  platformPaybackLkr: number;
  commissionPaybackLkr: number;
  platformDiscountsReportLkr: number;
  branchDiscountsLkr: number;
  platformDiscountsLkr: number;
  jasonDiscountsLkr: number;
  /** Branch-owned + shared branch contribution. */
  costPartnerBranchDiscountsLkr: number;
  /** Platform-owned + shared platform + loyalty. */
  costPartnerPlatformDiscountsLkr: number;
  /** Shared Jason contribution. */
  costPartnerJasonDiscountsLkr: number;
  /** Sum of Branch + Platform + Jason cost-partner discount totals. */
  costPartnerDiscountsTotalLkr: number;
  loyaltyDiscountLkr: number;
  sharedPromoPlatformLkr: number;
  sharedPromoJasonLkr: number;
  sharedPromoTotalLkr: number;
  showSharedPromo: boolean;
  /** Commission section "Net platform earnings" — includes retained refund convenience fees. */
  netPlatformCommissionLkr: number;
  /** Branch payout deduction — excludes retained refund convenience fees. */
  netPlatformCommissionForPayoutLkr: number;
  /**
   * Financial Report "Net Platform Amount" — commission after platform discounts & loyalty.
   * Customer convenience is platform-retained and must not reduce branch earnings here.
   */
  netPlatformAmountLkr: number;
  orderConvenienceFeeLkr: number;
  platformRefundsLkr: number;
  deliveryRefundsLkr: number;
  nonReturningRefundsBranchLkr: number;
  nonReturningRefundsBranchGrossLkr: number;
  totalRefundAmountLkr: number;
  totalRefundAmountGrossLkr: number;
  totalBranchPayoutLkr: number;
  gatewayLkr: number;
  gatewayRatePct: number;
  gatewayBaseLkr: number;
  gatewayHint: string;
  branchNetPayoutLkr: number;
  cancelledByBranchGatewayFeeLkr: number;
  cycleStage?: 'FIRST' | 'SECOND';
  priorOnlineWalletAmountLkr: number;
  cancelledByBranchOrderCount: number;
  customerLateCancelSubtotalLkr: number;
  customerLateCancelGatewayDeductionLkr: number;
  customerLateCancelNetAmountLkr: number;
  rejectedRefundSubtotalLkr: number;
  rejectedRefundGatewayDeductionLkr: number;
  rejectedRefundNetAmountLkr: number;
  refundConvenienceFeeLkr: number;
  rejectedRefundConvenienceFeeLkr: number;
  refundDeliveryFeeLkr: number;
  rejectedRefundDeliveryFeeLkr: number;
  showBranchRefunds: boolean;
  showCustomerRefunds: boolean;
  showRejectedRefunds: boolean;
  showRefundSection: boolean;
  showPaybackDetails: boolean;
};

export type PayoutBreakdownDisplayInput = ResolvePayoutReportValuesInput & {
  deliveryFeeLkr: number;
  slabRatePct: number | null;
  periodLabel?: string | null;
};

export type PayoutBreakdownBundle = {
  breakdownProps: PayoutBreakdownDisplayInput;
  reportValues: PayoutReportValues;
};

type BuildPayoutBreakdownDisplayInputParams = Omit<
  PayoutBreakdownDisplayInput,
  'loyaltyDiscountLkr'
> & {
  loyaltyDiscountLkr?: number | null;
};

export function buildPayoutBreakdownDisplayInput(
  input: BuildPayoutBreakdownDisplayInputParams,
): PayoutBreakdownDisplayInput {
  return {
    ...input,
    loyaltyDiscountLkr:
      input.loyaltyDiscountLkr ?? input.periodBreakdownLkr?.periodLoyaltyDiscountTotal ?? 0,
  };
}

function firstNumber(
  ...values: Array<number | null | undefined>
): number {
  for (const value of values) {
    if (value != null) return value;
  }
  return 0;
}

function resolveSalesFigures(params: {
  preview: SettlementPreview | null;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  snapshotActive: boolean;
  fallbackGrossLkr: number;
  totalSalesOverride: number | null;
  totalDiscountOverride: number | null;
  subtotalBeforeDiscountOverride: number | null;
  onlinePaymentsOverride: number | null;
}) {
  const {
    preview,
    periodBreakdownLkr,
    snapshotActive,
    fallbackGrossLkr,
    totalSalesOverride,
    totalDiscountOverride,
    subtotalBeforeDiscountOverride,
    onlinePaymentsOverride,
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
  const onlinePaymentsCollectedLkr = snapshotActive
    ? (periodBreakdownLkr.onlineWalletGross ?? periodBreakdownLkr.gatewayBase ?? 0)
    : onlinePaymentsOverride ??
      (preview ? sumOnlineRevenueSubtotals(preview.breakdown) : onlineWalletLkr);
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

function resolveDiscountReport(params: {
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

function resolveRefundReport(
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

function resolveGatewayFigures(params: {
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
  snapshotActive: boolean;
  useStoredSnapshot: boolean;
  onlinePaymentsCollectedLkr: number;
  gatewayRatePctProp: number;
  snapshotGatewayFeeLkr: number | null;
  snapshotGatewayRatePct: number | null;
  snapshotOnlineWalletGrossLkr: number | null;
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
  } = params;
  const gatewayBaseLkr =
    snapshotOnlineWalletGrossLkr ??
    (periodBreakdownLkr.remainingOnlineWalletLkr != null &&
    periodBreakdownLkr.remainingOnlineWalletLkr >= 0
      ? periodBreakdownLkr.remainingOnlineWalletLkr
      : onlinePaymentsCollectedLkr);
  const gatewayRatePct =
    snapshotGatewayRatePct ??
    (snapshotActive
      ? (periodBreakdownLkr.gatewayRatePct ?? gatewayRatePctProp)
      : gatewayRatePctProp);
  const gatewayLkr =
    snapshotGatewayFeeLkr ??
    (useStoredSnapshot || snapshotActive
      ? (periodBreakdownLkr.gatewayFee ?? 0)
      : roundLkr(gatewayBaseLkr * (gatewayRatePct / 100)));
  const gatewayHint =
    gatewayBaseLkr > 0.001
      ? `Online payments collected (branch revenue) ${formatMoneyAmount(gatewayBaseLkr)} x ${gatewayRatePct}%`
      : `Online payments collected (branch revenue) x ${gatewayRatePct}%`;

  return { gatewayBaseLkr, gatewayRatePct, gatewayLkr, gatewayHint };
}

function resolveApplicableSlabCommissionRateDisplay(params: {
  preview: SettlementPreview | null;
  slabRatePct: number | null;
  periodBreakdownLkr: PayoutFormulaBreakdownLkr;
}): { applicableSlabCommissionRatePct: number | null; slabMonthlyBaseLkr: number | null } {
  const monthlyBase = params.preview?.slabInfo.monthlyBase;
  if (monthlyBase != null && monthlyBase >= 0) {
    return {
      applicableSlabCommissionRatePct: commissionRateToDisplayPct(getEffectiveRate(monthlyBase)),
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

function resolveOnlineWalletChannelNets(params: {
  preview: SettlementPreview | null;
  channelBreakdown: SettlementBreakdown | null | undefined;
}): { onlinePickupNetLkr: number; onlineDeliveryNetLkr: number } {
  const breakdown = params.preview?.breakdown ?? params.channelBreakdown ?? null;
  if (!breakdown) {
    return { onlinePickupNetLkr: 0, onlineDeliveryNetLkr: 0 };
  }
  const components = resolveOnlinePaymentsCollectedComponents(breakdown);
  return {
    onlinePickupNetLkr: components.pickupRevenueLkr,
    onlineDeliveryNetLkr: components.deliveryRevenueLkr,
  };
}

export function resolvePayoutBreakdownBundle(
  input: PayoutBreakdownDisplayInput,
): PayoutBreakdownBundle | null {
  const reportValues = resolvePayoutReportValues(input);
  if (!reportValues) return null;
  return { breakdownProps: input, reportValues };
}

export function resolvePayoutReportValues(
  input: ResolvePayoutReportValuesInput,
): PayoutReportValues | null {
  const {
    preview,
    periodBreakdownLkr,
    onlineOrderSubtotalLkr,
    convenienceFeeLkr,
    paybackEnabled = true,
    totalSalesLkr: totalSalesOverride = null,
    totalDiscountLkr: totalDiscountOverride = null,
    subtotalBeforeDiscountLkr: subtotalBeforeDiscountOverride = null,
    onlinePaymentsCollectedLkr: onlinePaymentsOverride = null,
    gatewayRatePct: gatewayRatePctProp = 1.9,
    useStoredSnapshot = false,
    snapshotGatewayFeeLkr = null,
    snapshotGatewayRatePct = null,
    snapshotOnlineWalletGrossLkr = null,
    snapshotNetAmountLkr = null,
    sharedPromo = null,
    loyaltyDiscountLkr: loyaltyOverride = null,
    channelBreakdown = null,
    slabRatePct = null,
  } = input;

  if (!periodBreakdownLkr || periodBreakdownLkr.orderCount <= 0) return null;

  const snapshotActive = useStoredSnapshot || snapshotGatewayFeeLkr != null;
  const fallbackGrossLkr = onlineOrderSubtotalLkr ?? periodBreakdownLkr.grossAmount;
  const sales = resolveSalesFigures({
    preview,
    periodBreakdownLkr,
    snapshotActive,
    fallbackGrossLkr,
    totalSalesOverride,
    totalDiscountOverride,
    subtotalBeforeDiscountOverride,
    onlinePaymentsOverride,
  });
  const showPaybackDetails = paybackEnabled;
  const platformPaybackLkr = periodBreakdownLkr.platformPaybackTotal ?? 0;
  const commissionPaybackLkr = resolveCommissionPaybackLkr({
    paybackEnabled: showPaybackDetails,
    platformPaybackTotal: platformPaybackLkr,
  });
  const loyaltyDiscountLkr =
    loyaltyOverride ?? periodBreakdownLkr.periodLoyaltyDiscountTotal ?? 0;
  const discounts = resolveDiscountReport({
    periodBreakdownLkr,
    totalDiscountLkr: sales.totalDiscountLkr,
    sharedPromo,
    loyaltyDiscountLkr,
    paybackEnabled: showPaybackDetails,
  });
  const refunds = resolveRefundReport(periodBreakdownLkr, input);
  const gateway = resolveGatewayFigures({
    periodBreakdownLkr,
    snapshotActive,
    useStoredSnapshot,
    onlinePaymentsCollectedLkr: sales.onlinePaymentsCollectedLkr,
    gatewayRatePctProp,
    snapshotGatewayFeeLkr,
    snapshotGatewayRatePct,
    snapshotOnlineWalletGrossLkr,
  });
  const netPlatformCommissionForPayoutLkr = resolveTotalPlatformCommissionDisplayLkr({
    commissionLkr: sales.commissionLkr,
    platformPaybackTotal: platformPaybackLkr,
    paybackEnabled: showPaybackDetails,
    sharedPromoPlatformLkr: discounts.sharedPromoPlatformLkr,
    loyaltyDiscountLkr,
    platformOwnedPromoDiscountLkr: discounts.platformOwnedPromoDiscountsLkr,
    netPlatformEarningLkr: null,
  });
  const extraPlatformOwnedDeductionLkr = resolveExtraPlatformOwnedDeductionLkr({
    platformOwnedPromoDiscountLkr: discounts.platformOwnedPromoDiscountsLkr,
    commissionPaybackLkr,
  });
  const legacySnapshotNetPlatformLkr =
    roundLkr(
      sales.commissionLkr -
        commissionPaybackLkr -
        (showPaybackDetails ? discounts.sharedPromoPlatformLkr : 0) -
        loyaltyDiscountLkr,
    );
  const storedNetPlatformLkr =
    snapshotActive && periodBreakdownLkr.netPlatformEarning != null
      ? periodBreakdownLkr.netPlatformEarning
      : null;
  const snapshotMissingPlatformOwnedAdjustment =
    storedNetPlatformLkr != null &&
    extraPlatformOwnedDeductionLkr > 0.001 &&
    Math.abs(storedNetPlatformLkr - legacySnapshotNetPlatformLkr) < 0.02;
  const netPlatformCommissionLkr = resolveNetPlatformCommissionWithRefundFeesLkr({
    baseNetPlatformCommissionLkr: netPlatformCommissionForPayoutLkr,
    refundConvenienceFeeLkr: refunds.refundConvenienceFeeLkr,
    rejectedRefundConvenienceFeeLkr: refunds.rejectedRefundConvenienceFeeLkr,
  });
  // Net Platform Amount = commission after platform discounts & loyalty.
  // Customer convenience is platform-retained and must not reduce branch earnings here.
  const netPlatformAmountLkr = netPlatformCommissionForPayoutLkr;
  const recalculatedNetLkr = computePayoutNetLkr({
    onlinePaymentsCollectedLkr: sales.onlinePaymentsCollectedLkr,
    netPlatformCommissionLkr: netPlatformCommissionForPayoutLkr,
    gatewayLkr: gateway.gatewayLkr,
    cancelledByBranchGatewayFeeLkr: refunds.cancelledByBranchGatewayFeeLkr,
    customerLateCancelNetAmountLkr: refunds.customerLateCancelNetAmountLkr,
    rejectedRefundNetAmountLkr: refunds.rejectedRefundNetAmountLkr,
  });
  const branchNetPayoutLkr =
    snapshotNetAmountLkr != null
      ? roundLkr(
          snapshotNetAmountLkr +
            (snapshotMissingPlatformOwnedAdjustment ? extraPlatformOwnedDeductionLkr : 0),
        )
      : snapshotActive
        ? periodBreakdownLkr.netAmount
        : gateway.gatewayBaseLkr > 0.001
          ? recalculatedNetLkr
          : (periodBreakdownLkr.netAmount ?? recalculatedNetLkr);
  const onlineWalletChannelNets = resolveOnlineWalletChannelNets({
    preview,
    channelBreakdown,
  });
  const applicableSlabCommission = resolveApplicableSlabCommissionRateDisplay({
    preview,
    slabRatePct,
    periodBreakdownLkr,
  });

  const cycleStage =
    periodBreakdownLkr.cycleStage ??
    (periodBreakdownLkr.commissionFee <= 0.001 &&
    (periodBreakdownLkr.netPlatformEarning ?? 0) <= 0.001 &&
    (periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0) <= 0.001
      ? ('FIRST' as const)
      : undefined);
  const priorOnlineWalletAmountLkr = periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0;
  const isFirstCyclePayout = cycleStage === 'FIRST';

  const finalBranchNetPayoutLkr = isFirstCyclePayout
    ? roundLkr(sales.onlinePaymentsCollectedLkr - gateway.gatewayLkr)
    : branchNetPayoutLkr;

  const displayCommissionLkr = isFirstCyclePayout ? 0 : sales.commissionLkr;
  const displayNetPlatformForPayoutLkr = isFirstCyclePayout ? 0 : netPlatformCommissionForPayoutLkr;
  const displayNetPlatformAmountLkr = isFirstCyclePayout ? 0 : netPlatformAmountLkr;
  const displayDiscountTotals = isFirstCyclePayout
    ? {
        totalProvidedDiscountsLkr: 0,
        costPartnerBranchDiscountsLkr: 0,
        costPartnerPlatformDiscountsLkr: 0,
        costPartnerJasonDiscountsLkr: 0,
        costPartnerDiscountsTotalLkr: 0,
        branchDiscountsLkr: 0,
        platformDiscountsLkr: 0,
        jasonDiscountsLkr: 0,
        sharedPromoPlatformLkr: 0,
        sharedPromoJasonLkr: 0,
        sharedPromoTotalLkr: 0,
        showSharedPromo: false,
      }
    : null;

  return {
    hasPeriodData: true,
    ...sales,
    commissionLkr: displayCommissionLkr,
    ...onlineWalletChannelNets,
    ...discounts,
    ...(displayDiscountTotals ?? {}),
    ...refunds,
    ...gateway,
    platformPaybackLkr: isFirstCyclePayout ? 0 : platformPaybackLkr,
    commissionPaybackLkr: isFirstCyclePayout ? 0 : commissionPaybackLkr,
    platformDiscountsReportLkr: isFirstCyclePayout
      ? 0
      : resolvePlatformDiscountsReportLkr({
          platformOwnedPromoDiscountLkr: discounts.platformOwnedPromoDiscountsLkr,
          commissionPaybackLkr,
          sharedPromoPlatformLkr: discounts.sharedPromoPlatformLkr,
          paybackEnabled: showPaybackDetails,
        }),
    loyaltyDiscountLkr: isFirstCyclePayout ? 0 : loyaltyDiscountLkr,
    netPlatformCommissionLkr: isFirstCyclePayout ? 0 : netPlatformCommissionLkr,
    netPlatformCommissionForPayoutLkr: displayNetPlatformForPayoutLkr,
    netPlatformAmountLkr: displayNetPlatformAmountLkr,
    orderConvenienceFeeLkr: convenienceFeeLkr,
    totalBranchPayoutLkr: isFirstCyclePayout
      ? sales.onlinePaymentsCollectedLkr
      : sales.onlinePaymentsCollectedLkr + discounts.sharedPromoJasonLkr,
    branchNetPayoutLkr: finalBranchNetPayoutLkr,
    cycleStage,
    priorOnlineWalletAmountLkr,
    showPaybackDetails: isFirstCyclePayout ? false : showPaybackDetails,
    slabRatePct,
    ...applicableSlabCommission,
  };
}

/** Net payout (final pay amount) — branch wallet net plus Jason shared-promo top-up. */
export function resolveFinalNetPayoutPayLkr(
  values: Pick<PayoutReportValues, 'branchNetPayoutLkr' | 'sharedPromoJasonLkr'>,
): number {
  const jason = values.sharedPromoJasonLkr;
  return roundLkr(values.branchNetPayoutLkr + (jason > 0.001 ? jason : 0));
}
