import { resolveBranchPayoutDisplay } from '@/components/admin/branchPayoutDisplay';
import {
  buildPayoutBreakdownDisplayInput,
  resolvePayoutReportValues,
  resolveReportNetPayoutFinalPayLkr,
} from '@/components/admin/resolvePayoutReportValues';
import { paybackEnabledFromBreakdown } from '@/lib/walletUtils';
import {
  resolvePeriodPayoutCardAmounts,
  type PeriodPayoutCardAmounts,
} from '@/components/admin/periodPayoutSplitDisplay';
import {
  buildSettlementPreviewFromChannelBreakdown,
  computePeriodPayoutSplitLkr,
  extractSharedPromoLkrFromBreakdown,
  parseWithdrawalBreakdown,
  parseWithdrawalBreakdownFromNetPreview,
  resolveNetPlatformAmountForPeriodLkr,
  resolveTotalDeliveryFeeForAllocationLkr,
  sumAllRevenueSubtotal,
  type SettlementPreview,
  type WithdrawalBreakdown,
  withdrawalBreakdownToLkr,
  type PayoutFormulaBreakdownLkr,
} from '@/components/admin/settlementTypes';
import { withAdminCredentials } from '@/lib/adminSession';
import {
  paidPayoutAllTimeExpenseDeductionCents,
  readPayoutCycleStageFromBreakdown,
} from '@/components/admin/paidPayoutAllTimeDeduction';
import { resolveSlabRatePctFromPreview } from '@/components/admin/commissionUtils';

type PayoutPeriodExpenseRow = {
  status: 'PAID' | 'PENDING' | 'IN_PROGRESS' | 'PAYMENT_PENDING';
  amountCents: number;
  breakdown?: unknown;
  periodFrom: string;
  periodTo: string;
  summaryThrough?: string;
};

export type PayoutPeriodExpensesCents = {
  netPlatformAmountCents: number;
  gatewayFeeCents: number;
  /** Paid branch payouts including Jason top-up (light-blue Branch Receivable card). */
  branchReceivableCents: number;
  /** Paid branch payouts excluding Jason's investment (All-Time Available Balance). */
  branchReceivableExcludingJasonCents: number;
  /** Jason shared-promo top-up included in paid branch payouts. */
  jasonInvestmentCents: number;
  totalExpensesCents: number;
  allTimeExpenseDeductionCents: number;
};

/** Branch payout received through paid 15-day cycles, excluding Jason's investment. */
export function branchReceivableExcludingJasonCents(
  branchReceivableCents: number,
  jasonInvestmentCents: number,
): number {
  return Math.max(0, branchReceivableCents - Math.max(0, jasonInvestmentCents));
}

/** Cumulative pickup + delivery online wallet from day one — never reduced by branch payouts. */
export function computeAllTimeOnlineWalletCents(
  pickupOnlineIn: number,
  deliveryOnlineIn: number,
): number {
  return Math.max(0, pickupOnlineIn + deliveryOnlineIn);
}

/**
 * Remaining online wallet after paid branch payouts (Jason excluded).
 * Super Admin “Online Available Balance”.
 */
export function computeAllTimeAvailableBalanceCents(
  pickupOnlineIn: number,
  deliveryOnlineIn: number,
  branchReceivableExcludingJason: number,
): number {
  return Math.max(
    0,
    computeAllTimeOnlineWalletCents(pickupOnlineIn, deliveryOnlineIn) -
      branchReceivableExcludingJason,
  );
}

function readRoundedCentsField(breakdown: unknown, key: string): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const value = (breakdown as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function netAmountCentsFromBreakdown(breakdown: unknown): number {
  return readRoundedCentsField(breakdown, 'netAmount');
}

function branchReceivableExcludingJasonFromRow(params: {
  branchReceivableCents: number;
  jasonInvestmentCents: number;
  cycleStage: ReturnType<typeof readPayoutCycleStageFromBreakdown>;
  netAmountCents: number;
}): number {
  const total = Math.max(0, params.branchReceivableCents);
  const jason = Math.max(0, params.jasonInvestmentCents);
  if (jason <= 0) return total;
  if (
    params.cycleStage === 'SECOND' &&
    params.netAmountCents > 0 &&
    Math.abs(total - (params.netAmountCents + jason)) <= 1
  ) {
    return Math.max(0, params.netAmountCents - jason);
  }
  return Math.max(0, total - jason);
}

function jasonInvestmentCentsFromBreakdown(breakdown: unknown): number {
  const parsed = parseWithdrawalBreakdown(breakdown);
  if (!parsed) return 0;
  return lkrToExpenseCents(
    extractSharedPromoLkrFromBreakdown(parsed, 0).jasonContributionLkr,
  );
}

function lkrToExpenseCents(lkr: number): number {
  return Math.round(lkr * 100);
}

function readPreviewLkr(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function gatewayFeeCentsFromBreakdown(breakdown: unknown): number {
  return readRoundedCentsField(breakdown, 'gatewayFee');
}

/**
 * Expenses Summary totals — Payout Request Details figures summed for **PAID** periods only.
 * Pending / in-progress cycles are excluded.
 */
export function aggregatePaidPayoutPeriodExpensesCents(
  rows: PayoutPeriodExpenseRow[],
): PayoutPeriodExpensesCents {
  let netPlatformAmountCents = 0;
  let gatewayFeeCents = 0;
  let branchReceivableCents = 0;
  let branchReceivableExcludingJason = 0;
  let jasonInvestmentCents = 0;
  let allTimeExpenseDeductionCents = 0;

  for (const row of rows) {
    if (row.status !== 'PAID') continue;

    const periodTo = row.summaryThrough ?? row.periodTo;
    const amounts = resolvePayoutPeriodRowDisplayAmounts({
      amountCents: row.amountCents,
      breakdown: row.breakdown,
      periodFrom: row.periodFrom,
      periodTo,
    });

    const rowNetPlatform = lkrToExpenseCents(amounts.commissionLkr ?? 0);
    const rowBranchDisplay = lkrToExpenseCents(amounts.branchReceives);
    const rowJasonInvestment = jasonInvestmentCentsFromBreakdown(row.breakdown);
    const rowGateway = gatewayFeeCentsFromBreakdown(row.breakdown);
    const cycleStage = readPayoutCycleStageFromBreakdown(row.breakdown);
    const rowBranchExcludingJason = branchReceivableExcludingJasonFromRow({
      branchReceivableCents: rowBranchDisplay,
      jasonInvestmentCents: rowJasonInvestment,
      cycleStage,
      netAmountCents: netAmountCentsFromBreakdown(row.breakdown),
    });
    const rowBranchForAllTime =
      cycleStage === 'FIRST' ? row.amountCents : rowBranchDisplay;

    netPlatformAmountCents += rowNetPlatform;
    branchReceivableCents += rowBranchDisplay;
    branchReceivableExcludingJason += rowBranchExcludingJason;
    jasonInvestmentCents += rowJasonInvestment;
    gatewayFeeCents += rowGateway;
    allTimeExpenseDeductionCents += paidPayoutAllTimeExpenseDeductionCents({
      cycleStage,
      netPlatformAmountCents: rowNetPlatform,
      gatewayFeeCents: rowGateway,
      branchReceivableCents: rowBranchForAllTime,
    });
  }

  return {
    netPlatformAmountCents,
    gatewayFeeCents,
    branchReceivableCents,
    branchReceivableExcludingJasonCents: branchReceivableExcludingJason,
    jasonInvestmentCents,
    totalExpensesCents:
      netPlatformAmountCents + gatewayFeeCents + branchReceivableCents,
    allTimeExpenseDeductionCents,
  };
}

function netPreviewToChannelPreview(
  preview: {
    period?: { from: string; to: string };
    breakdown?: SettlementPreview['breakdown'];
    totalCommission?: number;
    totalProviderFee?: number;
    orderCount?: number;
    slabInfo?: SettlementPreview['slabInfo'];
  } | null | undefined,
  from: string,
  to: string,
): SettlementPreview | null {
  if (!preview?.breakdown) return null;
  return {
    period: preview.period ?? { from, to },
    breakdown: preview.breakdown,
    totalCommission: preview.totalCommission ?? 0,
    totalProviderFee: preview.totalProviderFee ?? 0,
    totalOwed: preview.totalCommission ?? 0,
    orderCount: preview.orderCount ?? 0,
    slabInfo: preview.slabInfo ?? {
      monthlyBase: 0,
      effectiveRate: 0,
      slabIndex: 0,
    },
  };
}

/** Same “Net payout (final pay amount)” as Initiate Payout financial report. */
function resolveBranchReceivesFromPayoutReport(params: {
  parsed: WithdrawalBreakdown;
  breakdownLkr: PayoutFormulaBreakdownLkr;
  channelPreview: SettlementPreview | null;
  paybackEnabled: boolean;
  amountCents: number;
}): number | null {
  const { parsed, breakdownLkr, channelPreview, paybackEnabled, amountCents } = params;
  if (breakdownLkr.orderCount <= 0) return null;

  const sharedPromo = extractSharedPromoLkrFromBreakdown(parsed, amountCents);
  const onlineOrderSubtotalLkr = channelPreview
    ? sumAllRevenueSubtotal(channelPreview)
    : breakdownLkr.grossAmount;
  const deliveryFeeForPeriodLkr = resolveTotalDeliveryFeeForAllocationLkr({
    periodDeliveryFeeLkr: breakdownLkr.deliveryFee,
    refundDeliveryFeeLkr: breakdownLkr.refundDeliveryFee ?? 0,
    rejectedRefundDeliveryFeeLkr: breakdownLkr.rejectedRefundDeliveryFee ?? 0,
  });
  const slabRatePct = resolveSlabRatePctFromPreview(channelPreview);

  const reportValues = resolvePayoutReportValues(
    buildPayoutBreakdownDisplayInput({
      preview: channelPreview,
      channelBreakdown: parsed.channelBreakdown ?? channelPreview?.breakdown ?? null,
      periodBreakdownLkr: breakdownLkr,
      onlineOrderSubtotalLkr,
      convenienceFeeLkr: breakdownLkr.convenienceFee,
      deliveryFeeLkr: deliveryFeeForPeriodLkr,
      slabRatePct,
      paybackEnabled,
      gatewayRatePct: breakdownLkr.gatewayRatePct ?? 1.9,
      sharedPromo,
    }),
  );

  if (!reportValues) return null;
  return resolveReportNetPayoutFinalPayLkr(reportValues);
}

/** Live net-preview drives Payout 2 table columns; locked snapshots alone miss window delivery & current net. */
export function payoutPeriodRowNeedsLiveNetPreview(breakdown: unknown): boolean {
  if (breakdown == null) return true;
  const parsed = parseWithdrawalBreakdown(breakdown);
  if (parsed == null) return true;
  return parsed.cycleStage === 'SECOND';
}

/** Same allocation fields as payout modals / PeriodPayoutSplitCards (display only). */
export function resolvePayoutPeriodRowDisplayAmounts(params: {
  amountCents: number;
  breakdown: unknown;
  periodFrom: string;
  periodTo: string;
  netPreviewData?: Record<string, unknown> | null;
}): PeriodPayoutCardAmounts {
  let parsed = parseWithdrawalBreakdown(params.breakdown);
  const previewParsed = params.netPreviewData
    ? parseWithdrawalBreakdownFromNetPreview(params.netPreviewData)
    : null;

  if (!parsed && previewParsed) {
    parsed = previewParsed;
  } else if (previewParsed?.cycleStage === 'SECOND') {
    parsed = previewParsed;
  }

  let channelPreview: SettlementPreview | null = null;
  let paybackEnabled = paybackEnabledFromBreakdown(parsed);

  if (params.netPreviewData && (!params.breakdown || previewParsed?.cycleStage === 'SECOND')) {
    paybackEnabled = Boolean(params.netPreviewData.platformDiscountPaybackEnabled);
    if (!parsed) parsed = previewParsed;
    channelPreview = netPreviewToChannelPreview(
      params.netPreviewData.channelPreview as Parameters<typeof netPreviewToChannelPreview>[0],
      params.periodFrom,
      params.periodTo,
    );
  } else if (parsed?.channelBreakdown) {
    const breakdownLkr = withdrawalBreakdownToLkr(parsed);
    channelPreview = buildSettlementPreviewFromChannelBreakdown(parsed.channelBreakdown, {
      from: params.periodFrom,
      to: params.periodTo,
      commissionRate: parsed.commissionRate,
      orderCount: parsed.orderCount,
      gatewayFeeLkr: breakdownLkr.gatewayFee,
    });
  }

  const branchPayout = resolveBranchPayoutDisplay({
    breakdown:
      previewParsed?.cycleStage === 'SECOND' ? null : params.breakdown,
    amountCents:
      previewParsed?.cycleStage === 'SECOND'
        ? (previewParsed?.netAmount ?? params.amountCents)
        : params.amountCents,
    netPreviewData: params.netPreviewData,
  });

  if (!parsed) {
    return {
      branchReceives: branchPayout.totalBranchPayoutLkr,
      commissionLkr: 0,
      orderConvenienceFeeLkr: 0,
      deliveryFee: 0,
    };
  }

  const breakdownLkr = withdrawalBreakdownToLkr(parsed);
  if (parsed.cycleStage === 'SECOND' && params.netPreviewData) {
    const previewRaw = params.netPreviewData;
    const tableConv = previewRaw.tableAllocationConvenienceFee;
    if (typeof tableConv === 'number' && Number.isFinite(tableConv)) {
      breakdownLkr.convenienceFee = tableConv / 100;
    }
    const tableDelivery = previewRaw.tableAllocationDeliveryFee;
    if (typeof tableDelivery === 'number' && Number.isFinite(tableDelivery)) {
      breakdownLkr.deliveryFee = tableDelivery / 100;
    }
  }
  const deliveryFeeForPeriodLkr = resolveTotalDeliveryFeeForAllocationLkr({
    periodDeliveryFeeLkr: breakdownLkr.deliveryFee,
    refundDeliveryFeeLkr: breakdownLkr.refundDeliveryFee ?? 0,
    rejectedRefundDeliveryFeeLkr: breakdownLkr.rejectedRefundDeliveryFee ?? 0,
  });

  const payoutSplit = computePeriodPayoutSplitLkr({
    netAmount: breakdownLkr.netAmount,
    deliveryFee: deliveryFeeForPeriodLkr,
    commissionFee: breakdownLkr.commissionFee,
    convenienceFee: breakdownLkr.convenienceFee,
  });

  const netPlatformAmountLkr = resolveNetPlatformAmountForPeriodLkr({
    commissionLkr:
      breakdownLkr.commissionFee ?? channelPreview?.totalCommission ?? 0,
    periodBreakdownLkr: breakdownLkr,
    paybackEnabled,
    sharedPromoPlatformLkr: breakdownLkr.sharedPromoPlatformContributionLkr ?? 0,
  });

  let branchReceivesLkr =
    resolveBranchReceivesFromPayoutReport({
      parsed,
      breakdownLkr,
      channelPreview,
      paybackEnabled,
      amountCents: params.amountCents,
    }) ?? branchPayout.totalBranchPayoutLkr;

  if (branchReceivesLkr <= 0 && parsed.cycleStage === 'SECOND') {
    const previewRaw = params.netPreviewData;
    const finalFromPreview =
      previewRaw && typeof previewRaw === 'object'
        ? readPreviewLkr(previewRaw as Record<string, unknown>, 'finalPayoutAmountLkr')
        : null;
    if (finalFromPreview != null && finalFromPreview > 0) {
      branchReceivesLkr = finalFromPreview;
    } else if (parsed.finalPayoutAmount != null && parsed.finalPayoutAmount > 0) {
      branchReceivesLkr = parsed.finalPayoutAmount / 100;
    }
  }

  return resolvePeriodPayoutCardAmounts({
    payoutSplit,
    branchReceivesLkr,
    platformCommissionLkr: netPlatformAmountLkr,
    periodNetLkr: branchPayout.periodWalletNetLkr,
    deliveryFeeLkr: deliveryFeeForPeriodLkr,
  });
}

export async function fetchPayoutPeriodNetPreview(
  apiBase: string,
  storeId: string,
  periodFrom: string,
  periodTo: string,
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ from: periodFrom, to: periodTo, storeId });
  const res = await fetch(`${apiBase}/admin/wallet/net-preview?${qs}`, withAdminCredentials());
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Failed to load period preview');
  return (json.data ?? {}) as Record<string, unknown>;
}
