import { resolveFinalNetPayoutPayLkr } from '@/components/admin/resolvePayoutReportValues';
import type { PayoutReportValues } from '@/components/admin/resolvePayoutReportValues';
import {
  computeFinalPayoutLkr,
  extractSharedPromoLkrFromBreakdown,
  parseWithdrawalBreakdown,
  parseWithdrawalBreakdownFromNetPreview,
  resolveBranchRequestNetLkrFromBreakdown,
  resolveFinalPayoutAmountLkr,
  resolvePeriodNetLkrFromBreakdown,
  type WithdrawalBreakdown,
} from '@/components/admin/settlementTypes';

export type BranchPayoutDisplayScope = 'fullPeriod' | 'thisPayment';

/** Explains why branch receives is below full-period net payout (wallet cap on this payment). */
export type BranchReceiveDifference = {
  periodFinalPayLkr: number;
  requestedWalletLkr: number;
  availableWalletLkr: number;
  periodNetLkr: number;
  payableWalletLkr: number;
};

const PAYOUT_EPSILON_LKR = 0.001;

export function branchPayoutAmountIsVisible(lkr: number): boolean {
  return lkr > PAYOUT_EPSILON_LKR;
}

export function branchPayoutWalletLabel(scope: BranchPayoutDisplayScope): string {
  return scope === 'thisPayment' ? 'From branch wallet' : 'Period wallet net';
}

export function shouldShowBranchReceiveDifference(
  diff: BranchReceiveDifference | null | undefined,
  branchTotalLkr: number,
): diff is BranchReceiveDifference {
  return diff != null && diff.periodFinalPayLkr > branchTotalLkr + 0.01;
}

/** Fills card-level fallbacks when `branchPayout` was not passed from the modal. */
export function coalesceBranchPayoutDisplay(params: {
  branchPayout: BranchPayoutDisplay | null | undefined;
  branchReceivesLkr: number;
  periodNetLkr?: number | null;
}): BranchPayoutDisplay {
  const { branchPayout, branchReceivesLkr, periodNetLkr } = params;
  if (branchPayout) return branchPayout;
  const walletNet = periodNetLkr ?? branchReceivesLkr;
  return {
    totalBranchPayoutLkr: branchReceivesLkr,
    periodWalletNetLkr: walletNet,
    walletRequestLkr: branchReceivesLkr,
    jasonTopUpLkr: 0,
    scope: 'fullPeriod',
  };
}

/** Wallet portion paid this time — lowest of request, available balance, and period net. */
export function resolvePayableWalletLkrForPayout(params: {
  requestedWalletLkr: number;
  availableWalletLkr: number;
  periodNetLkr: number;
}): number {
  const { requestedWalletLkr, availableWalletLkr, periodNetLkr } = params;
  if (periodNetLkr > 0.001) {
    return Math.min(requestedWalletLkr, availableWalletLkr, periodNetLkr);
  }
  return Math.min(requestedWalletLkr, availableWalletLkr);
}

/** Branch receives total aligned with payout report "Net payout (final pay amount)". */
export function branchPayoutDisplayFromReportValues(
  reportValues: PayoutReportValues,
): BranchPayoutDisplay {
  return {
    totalBranchPayoutLkr: resolveFinalNetPayoutPayLkr(reportValues),
    periodWalletNetLkr: reportValues.branchNetPayoutLkr,
    walletRequestLkr: reportValues.branchNetPayoutLkr,
    jasonTopUpLkr: reportValues.sharedPromoJasonLkr,
    scope: 'fullPeriod',
  };
}

/** Branch-facing payout figures — one source for tables, modals, and allocation cards. */
export type BranchPayoutDisplay = {
  /** Total cash the branch receives for this view (payment or full period). */
  totalBranchPayoutLkr: number;
  /** Wallet net line shown in breakdown (full period net or this payment's wallet portion). */
  periodWalletNetLkr: number;
  walletRequestLkr: number;
  jasonTopUpLkr: number;
  scope: BranchPayoutDisplayScope;
};

function readPreviewNumber(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveBreakdown(
  breakdown: unknown,
  netPreviewData?: Record<string, unknown> | null,
): WithdrawalBreakdown | null {
  const parsed = parseWithdrawalBreakdown(breakdown);
  if (parsed) return parsed;
  if (netPreviewData) return parseWithdrawalBreakdownFromNetPreview(netPreviewData);
  return null;
}

function resolveFullPeriodWalletNetLkr(
  parsed: WithdrawalBreakdown | null,
  preview: Record<string, unknown> | null | undefined,
  fallbackRequestLkr: number,
): number {
  const periodFromBreakdown = parsed ? resolvePeriodNetLkrFromBreakdown(parsed) : 0;
  const periodFromPreview =
    preview != null ? readPreviewNumber(preview, 'netAmountLkr') : null;

  if (periodFromBreakdown > 0) return periodFromBreakdown;
  if (periodFromPreview != null && periodFromPreview > 0) return periodFromPreview;
  return fallbackRequestLkr;
}

/**
 * Resolves the single branch payout total plus a minimal breakdown (wallet + Jason only).
 */
export function resolveBranchPayoutDisplay(params: {
  breakdown: unknown;
  amountCents: number;
  netPreviewData?: Record<string, unknown> | null;
  /** Set when initiating/approving a specific payment (may be below full period net). */
  paymentWalletRequestLkr?: number | null;
  scope?: BranchPayoutDisplayScope;
}): BranchPayoutDisplay {
  const fallbackRequestLkr = params.amountCents / 100;
  const parsed = resolveBreakdown(params.breakdown, params.netPreviewData);
  const preview =
    params.netPreviewData && typeof params.netPreviewData === 'object'
      ? (params.netPreviewData as Record<string, unknown>)
      : null;

  const fullPeriodWalletNetLkr = resolveFullPeriodWalletNetLkr(parsed, preview, fallbackRequestLkr);
  const walletRequestLkr = parsed
    ? resolveBranchRequestNetLkrFromBreakdown(parsed, params.amountCents)
    : fallbackRequestLkr;

  const sharedPromo = extractSharedPromoLkrFromBreakdown(parsed, params.amountCents);
  const jasonTopUpLkr = sharedPromo.jasonContributionLkr;

  const paymentWallet =
    params.paymentWalletRequestLkr != null && params.paymentWalletRequestLkr > 0
      ? params.paymentWalletRequestLkr
      : null;

  const scope: BranchPayoutDisplayScope =
    params.scope ?? (paymentWallet != null ? 'thisPayment' : 'fullPeriod');

  if (scope === 'thisPayment' && paymentWallet != null) {
    return {
      totalBranchPayoutLkr: computeFinalPayoutLkr(paymentWallet, jasonTopUpLkr),
      periodWalletNetLkr: paymentWallet,
      walletRequestLkr: paymentWallet,
      jasonTopUpLkr,
      scope: 'thisPayment',
    };
  }

  let totalBranchPayoutLkr = resolveFinalPayoutAmountLkr(parsed, params.amountCents);
  const finalFromPreview = preview ? readPreviewNumber(preview, 'finalPayoutAmountLkr') : null;
  if (finalFromPreview != null && finalFromPreview > 0) {
    totalBranchPayoutLkr = finalFromPreview;
  } else if (totalBranchPayoutLkr <= 0) {
    totalBranchPayoutLkr = computeFinalPayoutLkr(
      walletRequestLkr > 0 ? walletRequestLkr : fullPeriodWalletNetLkr,
      jasonTopUpLkr,
    );
  }
  if (totalBranchPayoutLkr <= 0) {
    totalBranchPayoutLkr = fullPeriodWalletNetLkr;
  }

  return {
    totalBranchPayoutLkr,
    periodWalletNetLkr: fullPeriodWalletNetLkr,
    walletRequestLkr,
    jasonTopUpLkr,
    scope: 'fullPeriod',
  };
}
