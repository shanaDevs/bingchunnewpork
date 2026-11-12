import {
  resolveApplicableSlabCommissionRateDisplay,
  resolveDiscountReport,
  resolveGatewayFigures,
  resolveOnlineWalletChannelNets,
  resolveRefundReport,
  resolveSalesFigures,
} from '@/components/admin/resolvePayoutReportValuesHelpers';
import { inferPayoutCycleStage } from '@/components/admin/settlement/inferPayoutCycleStage';
import {
  computeBranchWalletBeforeGatewayLkr,
  computePeriodGatewayLkr,
  computePayoutNetLkr,
  resolveCommissionPaybackLkr,
  resolveExtraPlatformOwnedDeductionLkr,
  resolveNetPlatformCommissionWithRefundFeesLkr,
  resolvePlatformDiscountsReportLkr,
  resolveTotalPlatformCommissionDisplayLkr,
  roundLkr,
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
  const cycleStage = inferPayoutCycleStage(periodBreakdownLkr);
  const isFirstCyclePayout = cycleStage === 'FIRST';
  const sales = resolveSalesFigures({
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
  const secondCycleBranchWalletBeforeGatewayLkr =
    isFirstCyclePayout
      ? null
      : Math.max(
          0,
          computeBranchWalletBeforeGatewayLkr({
            onlinePaymentsCollectedLkr: sales.onlinePaymentsCollectedLkr,
            jasonDiscountsLkr: discounts.jasonDiscountsLkr,
            priorOnlineWalletAmountLkr: periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0,
            nonReturningRefundsBranchGrossLkr: refunds.nonReturningRefundsBranchGrossLkr,
            netPlatformAmountLkr,
            bankPenaltyLkr: refunds.cancelledByBranchGatewayFeeLkr,
          }),
        );
  const gateway = resolveGatewayFigures({
    periodBreakdownLkr,
    snapshotActive,
    useStoredSnapshot,
    onlinePaymentsCollectedLkr: sales.onlinePaymentsCollectedLkr,
    gatewayRatePctProp,
    snapshotGatewayFeeLkr,
    snapshotGatewayRatePct,
    snapshotOnlineWalletGrossLkr,
    isFirstCyclePayout,
    secondCycleBranchWalletBeforeGatewayLkr,
  });
  const priorOnlineWalletForNetLkr = periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0;
  const onlineWalletBaseForBranchNetLkr =
    cycleStage === 'SECOND'
      ? Math.max(
          0,
          periodBreakdownLkr.remainingOnlineWalletLkr ??
            sales.onlinePaymentsCollectedLkr - priorOnlineWalletForNetLkr,
        )
      : sales.onlinePaymentsCollectedLkr;
  const recalculatedNetLkr = computePayoutNetLkr({
    onlinePaymentsCollectedLkr: onlineWalletBaseForBranchNetLkr,
    netPlatformCommissionLkr: netPlatformCommissionForPayoutLkr,
    gatewayLkr: gateway.gatewayLkr,
    cancelledByBranchGatewayFeeLkr: refunds.cancelledByBranchGatewayFeeLkr,
    customerLateCancelNetAmountLkr: refunds.customerLateCancelNetAmountLkr,
    rejectedRefundNetAmountLkr: refunds.rejectedRefundNetAmountLkr,
  });
  const liveSecondCycleNetAmountLkr =
    cycleStage === 'SECOND' &&
    snapshotNetAmountLkr == null &&
    !snapshotActive &&
    periodBreakdownLkr.netAmount != null &&
    periodBreakdownLkr.netAmount >= 0
      ? periodBreakdownLkr.netAmount
      : null;
  const branchNetPayoutLkr =
    snapshotNetAmountLkr != null
      ? roundLkr(
          snapshotNetAmountLkr +
            (snapshotMissingPlatformOwnedAdjustment ? extraPlatformOwnedDeductionLkr : 0),
        )
      : snapshotActive
        ? periodBreakdownLkr.netAmount
        : liveSecondCycleNetAmountLkr != null
          ? liveSecondCycleNetAmountLkr
          : gateway.gatewayBaseLkr > 0.001
            ? recalculatedNetLkr
            : (periodBreakdownLkr.netAmount ?? recalculatedNetLkr);
  const onlineWalletChannelNets = resolveOnlineWalletChannelNets({
    preview,
    channelBreakdown,
    cycleStage,
  });
  const applicableSlabCommission = resolveApplicableSlabCommissionRateDisplay({
    preview,
    slabRatePct,
    periodBreakdownLkr,
  });

  const priorOnlineWalletAmountLkr = isFirstCyclePayout
    ? 0
    : (periodBreakdownLkr.priorOnlineWalletAmountLkr ?? 0);

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
  values: Pick<
    PayoutReportValues,
    | 'branchNetPayoutLkr'
    | 'sharedPromoJasonLkr'
    | 'cycleStage'
    | 'onlinePaymentsCollectedLkr'
    | 'jasonDiscountsLkr'
    | 'priorOnlineWalletAmountLkr'
    | 'nonReturningRefundsBranchGrossLkr'
    | 'netPlatformAmountLkr'
    | 'gatewayLkr'
    | 'gatewayRatePct'
    | 'cancelledByBranchGatewayFeeLkr'
  >,
): number {
  if (values.cycleStage === 'SECOND') {
    const fromWalkthrough = resolveSecondCycleDisplayFinalPayLkr(values);
    if (fromWalkthrough != null) return fromWalkthrough;
  }
  const jason = values.sharedPromoJasonLkr;
  return roundLkr(values.branchNetPayoutLkr + (jason > 0.001 ? jason : 0));
}

type SecondCycleBranchWalletWalkthrough = Pick<
  PayoutReportValues,
  | 'cycleStage'
  | 'onlinePaymentsCollectedLkr'
  | 'jasonDiscountsLkr'
  | 'priorOnlineWalletAmountLkr'
  | 'nonReturningRefundsBranchGrossLkr'
  | 'netPlatformAmountLkr'
  | 'gatewayLkr'
  | 'cancelledByBranchGatewayFeeLkr'
>;

function computeSecondCycleBranchWalletBeforeGatewayLkr(
  values: SecondCycleBranchWalletWalkthrough,
  includeBankPenalty: boolean,
): number {
  return Math.max(
    0,
    computeBranchWalletBeforeGatewayLkr({
      onlinePaymentsCollectedLkr: values.onlinePaymentsCollectedLkr,
      jasonDiscountsLkr: values.jasonDiscountsLkr,
      priorOnlineWalletAmountLkr: values.priorOnlineWalletAmountLkr,
      nonReturningRefundsBranchGrossLkr: values.nonReturningRefundsBranchGrossLkr,
      netPlatformAmountLkr: values.netPlatformAmountLkr,
      bankPenaltyLkr: includeBankPenalty ? values.cancelledByBranchGatewayFeeLkr : 0,
    }),
  );
}

/** Payout 2 gateway-fee base — branch wallet before gateway (after bank penalty, PayHere 1.9%). */
export function resolveBranchWalletBeforeGatewayLkr(
  values: SecondCycleBranchWalletWalkthrough,
): number | null {
  if (values.cycleStage !== 'SECOND') return null;
  return computeSecondCycleBranchWalletBeforeGatewayLkr(values, true);
}

/** Payout 2 report subtotal — same walkthrough after bank penalty, before gateway fee. */
export function resolveDisplayedBranchWalletBeforeGatewayLkr(
  values: SecondCycleBranchWalletWalkthrough,
): number | null {
  return resolveBranchWalletBeforeGatewayLkr(values);
}

/** Payout 2 gateway fee — 1.9% of branch wallet before gateway (after bank penalty). */
export function resolveSecondCycleGatewayLkr(
  values: SecondCycleBranchWalletWalkthrough & { gatewayRatePct: number },
): number | null {
  const gatewayBase = resolveBranchWalletBeforeGatewayLkr(values);
  if (gatewayBase == null) return null;
  return computePeriodGatewayLkr({
    onlinePaymentsCollectedLkr: gatewayBase,
    gatewayRatePct: values.gatewayRatePct,
  });
}

/** Payout 2 report footer — displayed before-gateway subtotal minus gateway fee. */
export function resolveSecondCycleDisplayFinalPayLkr(
  values: SecondCycleBranchWalletWalkthrough & { gatewayRatePct: number },
): number | null {
  const displayedBeforeGateway = resolveDisplayedBranchWalletBeforeGatewayLkr(values);
  const gatewayLkr = resolveSecondCycleGatewayLkr(values);
  if (displayedBeforeGateway == null || gatewayLkr == null) return null;
  return roundLkr(Math.max(0, displayedBeforeGateway - gatewayLkr));
}

/** Report “Net payout (final pay amount)” — Payout 2 uses the visible walkthrough total. */
export function resolveReportNetPayoutFinalPayLkr(values: PayoutReportValues): number {
  const fromWalkthrough = resolveSecondCycleDisplayFinalPayLkr(values);
  if (fromWalkthrough != null) return fromWalkthrough;
  return resolveFinalNetPayoutPayLkr(values);
}
