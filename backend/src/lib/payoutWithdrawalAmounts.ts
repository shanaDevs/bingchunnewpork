import {
  sumFirstPayoutOnlineWalletBaseFromBreakdown,
  type ChannelSettlementRow,
  type CommissionChannel,
} from './commission';
function computeFinalPayoutAmountCents(
  branchRequestCents: number,
  jasonContributionCents = 0,
): number {
  return branchRequestCents + jasonContributionCents;
}

function readJasonContributionCents(raw: Record<string, unknown>): number {
  if (typeof raw.sharedPromoJasonContributionAmount === 'number') {
    return finiteAmount(raw.sharedPromoJasonContributionAmount);
  }
  return finiteAmount(raw.sharedPromoPlatformContributionAmount);
}

function asBreakdownRecord(breakdown: unknown): Record<string, unknown> | null {
  if (!breakdown || typeof breakdown !== 'object') return null;
  return breakdown as Record<string, unknown>;
}

function finiteAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function readWithdrawalCycleStage(
  raw: Record<string, unknown>,
): 'FIRST' | 'SECOND' | null {
  if (raw.cycleStage === 'FIRST' || raw.cycleStage === 'SECOND') return raw.cycleStage;
  return null;
}

/** Pickup + delivery online subtotal before discounts (cents), from a stored withdrawal snapshot. */
export function resolveFirstPayoutOnlineSubtotalCentsFromStoredBreakdown(
  raw: Record<string, unknown>,
): number | null {
  const firstStored = finiteAmount(raw.firstPayoutOnlineSubtotalCents);
  if (firstStored > 0) return Math.round(firstStored);

  const channel = raw.channelBreakdown;
  if (channel && typeof channel === 'object') {
    return Math.round(
      sumFirstPayoutOnlineWalletBaseFromBreakdown(
        channel as Record<CommissionChannel, ChannelSettlementRow>,
      ) * 100,
    );
  }

  const gatewayBase = finiteAmount(raw.gatewayBase);
  const onlineGross = finiteAmount(raw.onlineWalletGross);
  const candidate = gatewayBase > 0 ? gatewayBase : onlineGross;
  return candidate > 0 ? Math.round(candidate) : null;
}

/** Payout 1 branch wallet net after gateway on online subtotal (cents). */
export function resolveFirstPayoutBranchWalletNetCentsFromStoredBreakdown(
  raw: Record<string, unknown>,
): number | null {
  const subtotalCents = resolveFirstPayoutOnlineSubtotalCentsFromStoredBreakdown(raw);
  if (subtotalCents == null) return null;
  const ratePct = typeof raw.gatewayRatePct === 'number' ? raw.gatewayRatePct : 1.9;
  const gatewayCents = Math.round(subtotalCents * (ratePct / 100));
  return Math.max(0, subtotalCents - gatewayCents);
}

/**
 * Net payout (final pay amount) for a withdrawal — matches admin
 * "Net payout (final pay amount)" (branch wallet net + Jason top-up).
 */
export function resolveNetPayoutFinalPayCentsFromWithdrawalBreakdown(
  breakdown: unknown,
  fallbackAmountCents: number,
): number {
  const raw = asBreakdownRecord(breakdown);
  if (!raw) return fallbackAmountCents;

  const jasonCents = readJasonContributionCents(raw);

  if (readWithdrawalCycleStage(raw) === 'FIRST') {
    const firstWalletNetCents = resolveFirstPayoutBranchWalletNetCentsFromStoredBreakdown(raw);
    if (firstWalletNetCents != null) {
      return computeFinalPayoutAmountCents(firstWalletNetCents, jasonCents);
    }
  }

  const finalAmount = finiteAmount(raw.finalPayoutAmount);
  if (finalAmount > 0) return Math.round(finalAmount);

  const branchRequestRaw = finiteAmount(raw.branchRequestNetAmount);
  const branchRequestCents =
    branchRequestRaw > 0 ? Math.round(branchRequestRaw) : fallbackAmountCents;

  const withPromo = computeFinalPayoutAmountCents(branchRequestCents, jasonCents);
  if (withPromo > 0) return withPromo;

  const periodNetRaw =
    finiteAmount(raw.periodNetAmount) > 0
      ? finiteAmount(raw.periodNetAmount)
      : finiteAmount(raw.netAmount);
  if (periodNetRaw > 0) return Math.round(periodNetRaw);

  return fallbackAmountCents;
}
