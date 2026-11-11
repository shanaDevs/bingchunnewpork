import { prisma } from './prisma';
import {
  computeBreakdownForPeriod,
  refreshSecondPayoutGatewayAndNet,
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
  cycleStageForRollingWindowFrom,
  getStorePayoutCycleOrigin,
  pairedFirstWindowForSecondFrom,
  readFirstPayoutPriorDeductionCentsFromBreakdown,
  resolvePayoutCycleContext,
  secondPayoutPriorBeforeGatewayFeeCents,
  type PayoutCycleContext,
  type PayoutBreakdownOptions,
  type PayoutCycleStage,
} from './payoutCycle';
import {
  addDaysToUtcDateStr,
  dayAfterUtcDateStr,
  toUtcDateStr,
} from './utcDateString';
import { sumBreakdownConvenienceFee, sumOnlinePaymentsCollectedFromBreakdown } from './commission';
import { buildPeriodChannelPreview } from './periodChannelPreview';

export type PayoutWindowBounds = { from: string; to: string };

export const PAYOUT_WINDOW_DAYS = 15;
const FULL_CYCLE_INCLUSIVE_DAYS = 30;

function inclusiveUtcDays(from: string, to: string): number {
  return (
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).getTime() -
        new Date(`${from}T00:00:00.000Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1
  );
}

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

async function tableAllocationCentsForPeriod(
  storeId: string,
  from: string,
  to: string,
): Promise<{ convenienceFee: number; deliveryFee: number }> {
  const preview = await buildPeriodChannelPreview(storeId, from, to);
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

/** Fees shown on payout period tables for a single 15-day window. */
export async function resolvePayoutWindowTableAllocationCents(
  storeId: string,
  windowFrom: string,
  windowTo: string,
): Promise<{ convenienceFee: number; deliveryFee: number }> {
  return tableAllocationCentsForPeriod(storeId, windowFrom, windowTo);
}

/**
 * Payout 2 list/table columns: full-cycle convenience & delivery (entire payout cycle, e.g. Sep 1–30).
 */
export async function resolveSecondPayoutTableAllocationCents(
  storeId: string,
  cycleFrom: string,
  cycleTo: string,
): Promise<{ convenienceFee: number; deliveryFee: number }> {
  return tableAllocationCentsForPeriod(storeId, cycleFrom, cycleTo);
}

async function liveFirstPayoutPriorDeductionCents(
  storeId: string,
  from: string,
  to: string,
): Promise<number> {
  const preview = await buildPeriodChannelPreview(storeId, from, to);
  const baseCents = Math.round(
    sumOnlinePaymentsCollectedFromBreakdown(preview.breakdown) * 100,
  );
  return Math.max(0, baseCents);
}

async function findPairedFirstWithdrawalRow(
  storeId: string,
  pairedFirstWindow?: PayoutWindowBounds,
): Promise<{
  id: string;
  periodFrom: Date;
  breakdown: unknown;
} | null> {
  if (pairedFirstWindow) {
    const byWindow = await findWithdrawalForWindow(
      storeId,
      pairedFirstWindow.from,
      pairedFirstWindow.to,
    );
    if (byWindow?.periodFrom) {
      return {
        id: byWindow.id,
        periodFrom: byWindow.periodFrom,
        breakdown: byWindow.breakdown,
      };
    }
  }
  const row = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodFrom: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { id: true, periodFrom: true, breakdown: true, cycleStage: true },
  });
  if (row?.cycleStage === 'SECOND') {
    return null;
  }
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
    priorOnlineWalletAmountCents: readFirstPayoutPriorDeductionCentsFromBreakdown(
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
    priorOnlineWalletAmountCents = readFirstPayoutPriorDeductionCentsFromBreakdown(
      firstWithdrawal.breakdown,
    );
    cyclePairId = firstWithdrawal.id;
  } else {
    priorOnlineWalletAmountCents = await liveFirstPayoutPriorDeductionCents(
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

async function secondCycleContextForWindow(
  storeId: string,
  secondWindow: PayoutWindowBounds,
): Promise<PayoutCycleContext> {
  return buildSecondCycleContext(
    storeId,
    secondWindow,
    pairedFirstWindowForSecondFrom(secondWindow.from),
  );
}

/** Resolve FIRST/SECOND context per window for preview/list paths (batch). */
export async function resolveCycleContextsForWindows(
  storeId: string,
  windows: PayoutWindowBounds[],
): Promise<Map<string, PayoutCycleContext>> {
  const map = new Map<string, PayoutCycleContext>();
  if (windows.length === 0) return map;

  const origin = await getStorePayoutCycleOrigin(storeId);
  const sorted = [...windows].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );

  for (const window of sorted) {
    const key = payoutWindowKey(window.from, window.to);
    const stage = origin
      ? cycleStageForRollingWindowFrom(origin, window.from)
      : 'FIRST';

    if (stage === 'FIRST') {
      map.set(key, { cycleStage: 'FIRST' });
      continue;
    }

    map.set(key, await secondCycleContextForWindow(storeId, window));
  }

  return map;
}

/**
 * Cycle context for a specific payout window (net-preview, validation).
 * Identifies FIRST vs SECOND from the rolling 15-day grid, even when Payout 1 is still unpaid
 * and even when the client sends the full 30-day SECOND display range.
 */
export async function resolveCycleContextForWindow(
  storeId: string,
  from: string,
  to: string,
): Promise<PayoutCycleContext> {
  const origin = await getStorePayoutCycleOrigin(storeId);
  const spanDays = inclusiveUtcDays(from, to);

  let windowFrom = from;
  let windowTo = canonicalPayoutWindowEnd(from);

  if (
    origin &&
    spanDays === FULL_CYCLE_INCLUSIVE_DAYS &&
    cycleStageForRollingWindowFrom(origin, from) === 'FIRST'
  ) {
    windowFrom = addDaysToUtcDateStr(from, PAYOUT_WINDOW_DAYS);
    windowTo = to;
  }

  const stored = await findWithdrawalForWindow(
    storeId,
    windowFrom,
    canonicalPayoutWindowEnd(windowFrom),
  );
  const gridStage = origin
    ? cycleStageForRollingWindowFrom(origin, windowFrom)
    : undefined;
  if (
    (stored?.cycleStage === 'FIRST' || stored?.cycleStage === 'SECOND') &&
    (gridStage == null || stored.cycleStage === gridStage)
  ) {
    const ctx = cycleContextFromWithdrawal(stored);
    if (ctx.cycleStage !== 'SECOND') return ctx;
    const prior = await secondPayoutPriorBeforeGatewayFeeCents(storeId, stored.cyclePairId);
    if (prior == null) return ctx;
    return { ...ctx, priorOnlineWalletAmountCents: prior };
  }

  if (!origin || gridStage === 'FIRST') {
    return { cycleStage: 'FIRST' };
  }

  return secondCycleContextForWindow(storeId, { from: windowFrom, to: windowTo });
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
    const paired = pairedFirstWindowForSecondFrom(fromStr);
    const firstRow = await findPairedFirstWithdrawalRow(storeId, paired);
    if (firstRow?.periodFrom) {
      cycle = {
        ...cycle,
        cycleFrom: toUtcDateStr(firstRow.periodFrom),
        cyclePairId: cycle.cyclePairId ?? firstRow.id,
        priorOnlineWalletAmountCents:
          cycle.priorOnlineWalletAmountCents ??
          readFirstPayoutPriorDeductionCentsFromBreakdown(firstRow.breakdown),
      };
    } else {
      cycle = {
        ...cycle,
        cycleFrom: paired.from,
        priorOnlineWalletAmountCents:
          cycle.priorOnlineWalletAmountCents ??
          (await liveFirstPayoutPriorDeductionCents(storeId, paired.from, paired.to)),
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
  return refreshSecondPayoutGatewayAndNet(
    attachPromoOwnershipTotals(
      mergeSharedPromoIntoBreakdown(breakdown, sharedPromo),
      promoOwnership,
    ),
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
