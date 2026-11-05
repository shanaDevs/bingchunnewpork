import { prisma } from './prisma';
import {
  computeBreakdownForPeriod,
  type PeriodBreakdown,
} from './walletService';
import {
  computeSharedPromoContribution,
  mergeSharedPromoIntoBreakdown,
} from './sharedPromoContribution';
import {
  attachPromoOwnershipTotals,
  loadPromoOwnershipTotalsForPeriod,
} from './promoOwnershipTotals';
import {
  cycleContextFromWithdrawal,
  determineNextPayoutCycleStage,
  readFirstPayoutOnlineSubtotalCentsFromBreakdown,
  resolvePayoutCycleContext,
  type PayoutCycleContext,
  type PayoutBreakdownOptions,
  type PayoutCycleStage,
} from './payoutCycle';
import {
  addDaysToUtcDateStr,
  dayAfterUtcDateStr,
  toUtcDateStr,
} from './utcDateString';
import { getNextPayoutStartDate } from './withdrawalPayoutPeriod';
import {
  sumBreakdownConvenienceFee,
  sumFirstPayoutOnlineWalletBaseFromBreakdown,
} from './commission';
import { buildPeriodChannelPreview } from './periodChannelPreview';

export type PayoutWindowBounds = { from: string; to: string };

export const PAYOUT_WINDOW_DAYS = 15;

export function payoutWindowKey(from: string, to: string): string {
  return `${from}|${to}`;
}

/** Inclusive 15-day payout window ending on from + 14 days. */
export function canonicalPayoutWindowEnd(from: string): string {
  return addDaysToUtcDateStr(from, PAYOUT_WINDOW_DAYS - 1);
}

/** Pure alternating FIRST/SECOND stages for windows in chronological order. */
export function computeWindowStageSequence(
  anchorStage: PayoutCycleStage,
  windows: PayoutWindowBounds[],
): PayoutCycleStage[] {
  const sorted = [...windows].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  return sorted.map((_, index) => {
    if (index % 2 === 0) return anchorStage;
    return anchorStage === 'FIRST' ? 'SECOND' : 'FIRST';
  });
}

export function buildWindowsFromAnchorThroughStart(
  anchorFrom: string,
  lastWindowFrom: string,
): PayoutWindowBounds[] {
  const windows: PayoutWindowBounds[] = [];
  let from = anchorFrom;
  for (let guard = 0; guard < 64 && from <= lastWindowFrom; guard++) {
    const to = canonicalPayoutWindowEnd(from);
    windows.push({ from, to });
    if (from === lastWindowFrom) break;
    from = dayAfterUtcDateStr(to);
  }
  return windows;
}

async function getPayoutSequenceAnchorFrom(storeId: string): Promise<string | null> {
  const next = await getNextPayoutStartDate(storeId);
  if (next) return next;
  const earliest = await prisma.order.findFirst({
    where: { storeId, paymentStatus: 'PAID' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!earliest) return null;
  return toUtcDateStr(earliest.createdAt);
}

async function findWithdrawalForWindow(
  storeId: string,
  from: string,
  to: string,
): Promise<{
  id: string;
  cycleStage: PayoutCycleStage | null;
  cyclePairId: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  breakdown: unknown;
} | null> {
  const rows = await prisma.storeWithdrawal.findMany({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodFrom: { not: null },
      periodTo: { not: null },
    },
    select: {
      id: true,
      cycleStage: true,
      cyclePairId: true,
      periodFrom: true,
      periodTo: true,
      breakdown: true,
    },
  });
  for (const row of rows) {
    if (!row.periodFrom || !row.periodTo) continue;
    if (toUtcDateStr(row.periodFrom) === from && toUtcDateStr(row.periodTo) === to) {
      return row;
    }
  }
  return null;
}

/** Fees shown on payout period tables for a single 15-day window. */
export async function resolvePayoutWindowTableAllocationCents(
  storeId: string,
  windowFrom: string,
  windowTo: string,
): Promise<{ convenienceFee: number; deliveryFee: number }> {
  const preview = await buildPeriodChannelPreview(storeId, windowFrom, windowTo);
  const convenienceFeeLkr = sumBreakdownConvenienceFee(preview.breakdown);
  const deliveryFeeLkr = Object.values(preview.breakdown).reduce(
    (sum, row) => sum + row.deliveryFeeTotal,
    0,
  );
  return {
    convenienceFee: Math.round(convenienceFeeLkr * 100),
    deliveryFee: Math.round(deliveryFeeLkr * 100),
  };
}

/**
 * Payout 2 list/table columns: full-cycle convenience & delivery (entire payout cycle, e.g. Sep 1–30).
 */
export async function resolveSecondPayoutTableAllocationCents(
  storeId: string,
  cycleFrom: string,
  cycleTo: string,
): Promise<{ convenienceFee: number; deliveryFee: number }> {
  const cyclePreview = await buildPeriodChannelPreview(storeId, cycleFrom, cycleTo);
  const convenienceFeeLkr = sumBreakdownConvenienceFee(cyclePreview.breakdown);
  const deliveryFeeLkr = Object.values(cyclePreview.breakdown).reduce(
    (sum, row) => sum + row.deliveryFeeTotal,
    0,
  );
  return {
    convenienceFee: Math.round(convenienceFeeLkr * 100),
    deliveryFee: Math.round(deliveryFeeLkr * 100),
  };
}

async function liveFirstOnlineWalletCents(
  storeId: string,
  from: string,
  to: string,
): Promise<number> {
  const preview = await buildPeriodChannelPreview(storeId, from, to);
  return Math.round(
    sumFirstPayoutOnlineWalletBaseFromBreakdown(preview.breakdown) * 100,
  );
}

async function findPairedFirstWithdrawalRow(storeId: string): Promise<{
  id: string;
  periodFrom: Date;
  breakdown: unknown;
} | null> {
  const row = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      cycleStage: 'FIRST',
      periodFrom: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { id: true, periodFrom: true, breakdown: true },
  });
  if (!row?.periodFrom) return null;
  return { id: row.id, periodFrom: row.periodFrom, breakdown: row.breakdown };
}

async function buildSecondCycleContextFromFirstWithdrawal(
  secondWindow: PayoutWindowBounds,
  firstRow: { id: string; periodFrom: Date; breakdown: unknown },
): Promise<PayoutCycleContext> {
  return {
    cycleStage: 'SECOND',
    cycleFrom: toUtcDateStr(firstRow.periodFrom),
    cycleTo: secondWindow.to,
    cyclePairId: firstRow.id,
    priorOnlineWalletAmountCents: readFirstPayoutOnlineSubtotalCentsFromBreakdown(
      firstRow.breakdown,
    ),
  };
}

async function buildSecondCycleContext(
  storeId: string,
  secondWindow: PayoutWindowBounds,
  pairedFirstWindow: PayoutWindowBounds,
): Promise<PayoutCycleContext> {
  const firstWithdrawal = await findWithdrawalForWindow(
    storeId,
    pairedFirstWindow.from,
    pairedFirstWindow.to,
  );

  let priorOnlineWalletAmountCents: number;
  let cyclePairId: string | undefined;

  if (firstWithdrawal) {
    priorOnlineWalletAmountCents = readFirstPayoutOnlineSubtotalCentsFromBreakdown(
      firstWithdrawal.breakdown,
    );
    cyclePairId = firstWithdrawal.id;
  } else {
    priorOnlineWalletAmountCents = await liveFirstOnlineWalletCents(
      storeId,
      pairedFirstWindow.from,
      pairedFirstWindow.to,
    );
  }

  return {
    cycleStage: 'SECOND',
    cycleFrom: pairedFirstWindow.from,
    cycleTo: secondWindow.to,
    cyclePairId,
    priorOnlineWalletAmountCents,
  };
}

/** Resolve FIRST/SECOND context per window for preview/list paths (batch). */
export async function resolveCycleContextsForWindows(
  storeId: string,
  windows: PayoutWindowBounds[],
): Promise<Map<string, PayoutCycleContext>> {
  const map = new Map<string, PayoutCycleContext>();
  if (windows.length === 0) return map;

  const sorted = [...windows].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  const anchorStage = await determineNextPayoutCycleStage(storeId);
  const stages = computeWindowStageSequence(anchorStage, sorted);

  for (let i = 0; i < sorted.length; i++) {
    const window = sorted[i]!;
    const stage = stages[i]!;
    const key = payoutWindowKey(window.from, window.to);

    if (stage === 'FIRST') {
      map.set(key, { cycleStage: 'FIRST' });
      continue;
    }

    const pairedFirstWindow = sorted[i - 1];
    if (pairedFirstWindow) {
      map.set(key, await buildSecondCycleContext(storeId, window, pairedFirstWindow));
      continue;
    }

    const firstRow = await findPairedFirstWithdrawalRow(storeId);
    if (firstRow) {
      map.set(key, await buildSecondCycleContextFromFirstWithdrawal(window, firstRow));
    } else {
      map.set(key, { cycleStage: 'FIRST' });
    }
  }

  return map;
}

/** Cycle context for a specific payout window (net-preview, validation). */
export async function resolveCycleContextForWindow(
  storeId: string,
  from: string,
  to: string,
): Promise<PayoutCycleContext> {
  const windowFrom = from;
  const windowTo = canonicalPayoutWindowEnd(from);

  const stored = await findWithdrawalForWindow(storeId, windowFrom, windowTo);
  if (stored?.cycleStage) {
    return cycleContextFromWithdrawal(stored);
  }

  const anchorFrom = await getPayoutSequenceAnchorFrom(storeId);
  if (!anchorFrom) {
    return { cycleStage: 'FIRST' };
  }

  if (windowFrom < anchorFrom) {
    return resolvePayoutCycleContext(storeId);
  }

  const windows = buildWindowsFromAnchorThroughStart(anchorFrom, windowFrom);
  const contexts = await resolveCycleContextsForWindows(storeId, windows);
  return (
    contexts.get(payoutWindowKey(windowFrom, windowTo)) ?? {
      cycleStage: 'FIRST' as const,
    }
  );
}

function applyFirstCycleFinancialPolicy(period: PeriodBreakdown): PeriodBreakdown {
  return {
    ...period,
    sharedPromoTotalDiscount: 0,
    sharedPromoBranchContributionPct: 0,
    sharedPromoBranchContributionAmount: 0,
    sharedPromoPlatformContributionPct: 0,
    sharedPromoPlatformContributionAmount: 0,
    sharedPromoJasonContributionPct: 0,
    sharedPromoJasonContributionAmount: 0,
    finalPayoutAmount: period.netAmount,
    branchOwnedPromoDiscountTotal: 0,
    platformOwnedPromoDiscountTotal: 0,
  };
}

/** Period breakdown with shared promo and promo ownership (request + approval validation). */
export async function computePeriodBreakdownForPayout(
  storeId: string,
  fromStr: string,
  toStr: string,
  cycleCtx?: PayoutCycleContext,
): Promise<PeriodBreakdown> {
  let cycle = cycleCtx ?? (await resolvePayoutCycleContext(storeId));

  if (cycle.cycleStage === 'SECOND' && !cycle.cycleFrom) {
    const firstRow = await findPairedFirstWithdrawalRow(storeId);
    if (firstRow?.periodFrom) {
      cycle = {
        ...cycle,
        cycleFrom: toUtcDateStr(firstRow.periodFrom),
        cyclePairId: cycle.cyclePairId ?? firstRow.id,
        priorOnlineWalletAmountCents:
          cycle.priorOnlineWalletAmountCents ??
          readFirstPayoutOnlineSubtotalCentsFromBreakdown(firstRow.breakdown),
      };
    }
  }

  const promoFrom = cycle.cycleStage === 'SECOND' && cycle.cycleFrom ? cycle.cycleFrom : fromStr;
  const breakdownOpts: PayoutBreakdownOptions = { ...cycle, cycleTo: toStr };

  if (cycle.cycleStage === 'FIRST') {
    const breakdown = await computeBreakdownForPeriod(storeId, fromStr, toStr, breakdownOpts);
    return applyFirstCycleFinancialPolicy(breakdown);
  }

  const [breakdown, sharedPromo, promoOwnership] = await Promise.all([
    computeBreakdownForPeriod(storeId, fromStr, toStr, breakdownOpts),
    computeSharedPromoContribution(storeId, promoFrom, toStr),
    loadPromoOwnershipTotalsForPeriod(storeId, promoFrom, toStr),
  ]);
  return attachPromoOwnershipTotals(
    mergeSharedPromoIntoBreakdown(breakdown, sharedPromo),
    promoOwnership,
  );
}

export async function computePeriodNetAmountCents(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<number> {
  const period = await computePeriodBreakdownForPayout(storeId, fromStr, toStr);
  return period.netAmount;
}
