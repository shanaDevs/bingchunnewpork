import { resolveBranchPayoutDisplay } from '@/components/admin/branchPayoutDisplay';
import { paybackEnabledFromBreakdown } from '@/lib/walletUtils';
import {
  resolvePeriodPayoutCardAmounts,
  type PeriodPayoutCardAmounts,
} from '@/components/admin/periodPayoutSplitDisplay';
import {
  buildSettlementPreviewFromChannelBreakdown,
  computePeriodPayoutSplitLkr,
  parseWithdrawalBreakdown,
  parseWithdrawalBreakdownFromNetPreview,
  resolveNetPlatformAmountForPeriodLkr,
  resolveTotalDeliveryFeeForAllocationLkr,
  type SettlementPreview,
  withdrawalBreakdownToLkr,
} from '@/components/admin/settlementTypes';
import { withAdminCredentials } from '@/lib/adminSession';

type PayoutPeriodExpenseRow = {
  status: 'PAID' | 'PENDING' | 'IN_PROGRESS';
  amountCents: number;
  breakdown?: unknown;
  periodFrom: string;
  periodTo: string;
  summaryThrough?: string;
};

export type PayoutPeriodExpensesCents = {
  netPlatformAmountCents: number;
  gatewayFeeCents: number;
  branchReceivableCents: number;
  totalExpensesCents: number;
};

function lkrToExpenseCents(lkr: number): number {
  return Math.round(lkr * 100);
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

  for (const row of rows) {
    if (row.status !== 'PAID') continue;

    const periodTo = row.summaryThrough ?? row.periodTo;
    const amounts = resolvePayoutPeriodRowDisplayAmounts({
      amountCents: row.amountCents,
      breakdown: row.breakdown,
      periodFrom: row.periodFrom,
      periodTo,
    });

    netPlatformAmountCents += lkrToExpenseCents(amounts.commissionLkr);
    branchReceivableCents += lkrToExpenseCents(amounts.branchReceives);

    const parsed = parseWithdrawalBreakdown(row.breakdown);
    if (parsed?.gatewayFee != null && Number.isFinite(parsed.gatewayFee)) {
      gatewayFeeCents += Math.round(parsed.gatewayFee);
    }
  }

  return {
    netPlatformAmountCents,
    gatewayFeeCents,
    branchReceivableCents,
    totalExpensesCents:
      netPlatformAmountCents + gatewayFeeCents + branchReceivableCents,
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

/** Unpaid / in-progress cycles without a stored breakdown need live net-preview. */
export function payoutPeriodRowNeedsLiveNetPreview(breakdown: unknown): boolean {
  return parseWithdrawalBreakdown(breakdown) == null;
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
  let channelPreview: SettlementPreview | null = null;
  let paybackEnabled = paybackEnabledFromBreakdown(parsed);

  if (!parsed && params.netPreviewData) {
    paybackEnabled = Boolean(params.netPreviewData.platformDiscountPaybackEnabled);
    parsed = parseWithdrawalBreakdownFromNetPreview(params.netPreviewData);
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
    breakdown: params.breakdown,
    amountCents: params.amountCents,
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

  return resolvePeriodPayoutCardAmounts({
    payoutSplit,
    branchReceivesLkr: branchPayout.totalBranchPayoutLkr,
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
