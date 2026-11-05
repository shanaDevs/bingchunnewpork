import { prisma } from './prisma';
import {
  sumFirstPayoutOnlineWalletBaseFromBreakdown,
  type ChannelSettlementRow,
  type CommissionChannel,
} from './commission';
import { toUtcDateStr } from './utcDateString';

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
 * Payout 1 pickup + delivery online subtotals before discounts (channel table Subtotal column).
 * Used as “Online Wallet Amount (Payout 1)” on Payout 2 reports.
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

/** Next payout alternates FIRST after a completed SECOND pair. */
export async function determineNextPayoutCycleStage(storeId: string): Promise<PayoutCycleStage> {
  const latest = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      periodTo: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { cycleStage: true },
  });
  if (!latest?.cycleStage || latest.cycleStage === 'SECOND') return 'FIRST';
  return 'SECOND';
}

export async function resolvePayoutCycleContext(storeId: string): Promise<PayoutCycleContext> {
  const stage = await determineNextPayoutCycleStage(storeId);
  if (stage === 'FIRST') {
    return { cycleStage: 'FIRST' };
  }

  const pairedFirst = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId,
      status: { in: ['PENDING', 'APPROVED'] },
      cycleStage: 'FIRST',
      periodFrom: { not: null },
    },
    orderBy: { periodTo: 'desc' },
    select: { id: true, periodFrom: true, breakdown: true },
  });

  if (!pairedFirst?.periodFrom) {
    return { cycleStage: 'FIRST' };
  }

  return {
    cycleStage: 'SECOND',
    cycleFrom: toUtcDateStr(pairedFirst.periodFrom),
    cyclePairId: pairedFirst.id,
    priorOnlineWalletAmountCents: readFirstPayoutOnlineSubtotalCentsFromBreakdown(
      pairedFirst.breakdown,
    ),
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
