import { prisma } from './prisma';
import {
  sumFirstPayoutOnlineWalletBaseFromBreakdown,
  type ChannelSettlementRow,
  type CommissionChannel,
} from './commission';
import { resolveNetPayoutFinalPayCentsFromWithdrawalBreakdown } from './payoutWithdrawalAmounts';
import {
  addDaysToUtcDateStr,
  dayAfterUtcDateStr,
  toUtcDateStr,
} from './utcDateString';

const ROLLING_PAYOUT_HALF_CYCLE_DAYS = 15;

async function getEarliestPaidOrderDateStr(storeId: string): Promise<string | null> {
  const earliest = await prisma.order.findFirst({
    where: { storeId, paymentStatus: 'PAID' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (!earliest) return null;
  return toUtcDateStr(earliest.createdAt);
}

/**
 * Steps along the rolling 15-day payout grid from `origin` (first window start, usually first paid order day).
 * Returns -1 if `targetFrom` is not on the grid (should not happen for valid payout windows).
 */
export function rollingPayoutWindowIndexFromOrigin(
  origin: string,
  targetFrom: string,
): number {
  if (targetFrom < origin) return -1;
  let from = origin;
  for (let i = 0; i < 512; i++) {
    if (from === targetFrom) return i;
    const to = addDaysToUtcDateStr(from, ROLLING_PAYOUT_HALF_CYCLE_DAYS - 1);
    from = dayAfterUtcDateStr(to);
  }
  return -1;
}

/** FIRST on even 15-day windows from origin, SECOND on odd — independent of whether Payout 1 is paid. */
export function cycleStageForRollingWindowFrom(
  origin: string,
  windowFrom: string,
): PayoutCycleStage {
  const index = rollingPayoutWindowIndexFromOrigin(origin, windowFrom);
  if (index < 0) return 'FIRST';
  return index % 2 === 0 ? 'FIRST' : 'SECOND';
}

/** Contiguous prior 15-day half that pairs with a SECOND window starting on `secondFrom`. */
export function pairedFirstWindowForSecondFrom(secondFrom: string): { from: string; to: string } {
  const to = addDaysToUtcDateStr(secondFrom, -1);
  const from = addDaysToUtcDateStr(to, -(ROLLING_PAYOUT_HALF_CYCLE_DAYS - 1));
  return { from, to };
}

export async function getStorePayoutCycleOrigin(storeId: string): Promise<string | null> {
  return getEarliestPaidOrderDateStr(storeId);
}

export type PayoutCycleStage = 'FIRST' | 'SECOND';

export type PayoutCycleContext = {
  cycleStage: PayoutCycleStage;
  cycleFrom?: string;
  cycleTo?: string;
  cyclePairId?: string;
  priorOnlineWalletAmountCents?: number;
};

export type PayoutBreakdownOptions = PayoutCycleContext;

export function readOnlineWalletCentsFromBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const row = breakdown as {
    onlinePaymentsCollected?: number;
    onlineWalletGross?: number;
  };
  if (typeof row.onlinePaymentsCollected === 'number') return row.onlinePaymentsCollected;
  if (typeof row.onlineWalletGross === 'number') return row.onlineWalletGross;
  return 0;
}

/**
 * Payout 1 pickup + delivery online revenue after discounts (gateway fee base).
 */
export function readFirstPayoutOnlineSubtotalCentsFromBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== 'object') return 0;
  const row = breakdown as {
    firstPayoutOnlineSubtotalCents?: number;
    channelBreakdown?: Record<CommissionChannel, ChannelSettlementRow>;
    onlinePaymentsCollected?: number;
    onlineWalletGross?: number;
  };
  if (
    typeof row.firstPayoutOnlineSubtotalCents === 'number' &&
    Number.isFinite(row.firstPayoutOnlineSubtotalCents)
  ) {
    return Math.round(row.firstPayoutOnlineSubtotalCents);
  }
  if (row.channelBreakdown && typeof row.channelBreakdown === 'object') {
    return Math.round(
      sumFirstPayoutOnlineWalletBaseFromBreakdown(row.channelBreakdown) * 100,
    );
  }
  return readOnlineWalletCentsFromBreakdown(breakdown);
}

/** Payout 2 prior deduction — net payout (final pay amount) from the paired Payout 1 withdrawal. */
export function readFirstPayoutPriorDeductionCentsFromBreakdown(breakdown: unknown): number {
  const fallbackCents = readFirstPayoutOnlineSubtotalCentsFromBreakdown(breakdown);
  return resolveNetPayoutFinalPayCentsFromWithdrawalBreakdown(breakdown, fallbackCents);
}

/**
 * Stage for the **next** unpaid 15-day window (same basis as `listElapsedPayoutWindows`: starts at
 * `dayAfter(latest.periodTo)` when a payout exists, otherwise the first paid order day).
 *
 * Older withdrawals may omit `cycleStage`; we derive FIRST/SECOND from the window's index on the rolling 15-day grid
 * from the store's first paid order day so Payout 2 is not treated as Payout 1.
 */
export async function determineNextPayoutCycleStage(storeId: string): Promise<PayoutCycleStage> {
  const earliestOrder = await getEarliestPaidOrderDateStr(storeId);
  if (!earliestOrder) return 'FIRST';

  const latest = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodTo: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { cycleStage: true, periodTo: true },
  });

  const nextWindowFrom = latest?.periodTo
    ? dayAfterUtcDateStr(toUtcDateStr(latest.periodTo))
    : earliestOrder;

  const windowIndex = rollingPayoutWindowIndexFromOrigin(earliestOrder, nextWindowFrom);
  if (windowIndex >= 0) {
    return windowIndex % 2 === 0 ? 'FIRST' : 'SECOND';
  }

  if (latest?.cycleStage === 'FIRST') return 'SECOND';
  if (latest?.cycleStage === 'SECOND') return 'FIRST';
  return 'FIRST';
}

export async function resolvePayoutCycleContext(storeId: string): Promise<PayoutCycleContext> {
  const stage = await determineNextPayoutCycleStage(storeId);
  if (stage === 'FIRST') {
    return { cycleStage: 'FIRST' };
  }

  const origin = await getEarliestPaidOrderDateStr(storeId);
  const latest = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodTo: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { periodTo: true },
  });
  const secondFrom = latest?.periodTo
    ? dayAfterUtcDateStr(toUtcDateStr(latest.periodTo))
    : origin
      ? dayAfterUtcDateStr(
          addDaysToUtcDateStr(origin, ROLLING_PAYOUT_HALF_CYCLE_DAYS - 1),
        )
      : null;

  const pairedFirst = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodFrom: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { id: true, periodFrom: true, breakdown: true, cycleStage: true },
  });
  const firstByStage =
    pairedFirst?.cycleStage === 'FIRST' || pairedFirst?.cycleStage == null ? pairedFirst : null;

  const cycleFrom = firstByStage?.periodFrom
    ? toUtcDateStr(firstByStage.periodFrom)
    : secondFrom
      ? pairedFirstWindowForSecondFrom(secondFrom).from
      : origin ?? undefined;

  return {
    cycleStage: 'SECOND',
    cycleFrom,
    cyclePairId: firstByStage?.id,
    priorOnlineWalletAmountCents: firstByStage
      ? readFirstPayoutPriorDeductionCentsFromBreakdown(firstByStage.breakdown)
      : undefined,
  };
}

export async function resolveCycleFromDate(
  storeId: string,
  cyclePairId: string,
): Promise<string | null> {
  const first = await prisma.storeWithdrawal.findFirst({
    where: { id: cyclePairId, storeId, cycleStage: 'FIRST' },
    select: { periodFrom: true },
  });
  if (!first?.periodFrom) return null;
  return toUtcDateStr(first.periodFrom);
}

export function cycleContextFromWithdrawal(withdrawal: {
  cycleStage?: PayoutCycleStage | null;
  cyclePairId?: string | null;
  periodFrom?: Date | null;
  periodTo?: Date | null;
  breakdown?: unknown;
}): PayoutCycleContext {
  const cycleStage = withdrawal.cycleStage ?? 'FIRST';
  if (cycleStage === 'FIRST') {
    return {
      cycleStage: 'FIRST',
      cycleTo: withdrawal.periodTo ? toUtcDateStr(withdrawal.periodTo) : undefined,
    };
  }
  const stored = withdrawal.breakdown as {
    cycleFrom?: string;
    cycleTo?: string;
    priorOnlineWalletAmountCents?: number;
  } | null;
  return {
    cycleStage: 'SECOND',
    cycleFrom: stored?.cycleFrom,
    cycleTo: withdrawal.periodTo ? toUtcDateStr(withdrawal.periodTo) : stored?.cycleTo,
    cyclePairId: withdrawal.cyclePairId ?? undefined,
    priorOnlineWalletAmountCents: stored?.priorOnlineWalletAmountCents,
  };
}
