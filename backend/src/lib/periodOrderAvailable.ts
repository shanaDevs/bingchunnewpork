import { prisma } from './prisma';
import { sumOnlinePaymentsCollectedFromBreakdown, sumFirstPayoutOnlineWalletBaseFromBreakdown } from './commission';
import {
  buildPeriodChannelPreview,
  type PeriodChannelPreview,
} from './periodChannelPreview';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { resolvePayoutCycleContext, type PayoutCycleContext } from './payoutCycle';

export type PeriodOrderAvailable = {
  fromOrdersCents: number;
  priorPayoutCents: number;
  remainingCents: number;
};

async function priorPayoutCentsForPeriod(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<number> {
  const periodFrom = new Date(`${fromStr}T00:00:00.000Z`);
  const periodTo = new Date(`${toStr}T23:59:59.999Z`);
  const agg = await prisma.storeWithdrawal.aggregate({
    _sum: { amount: true },
    where: {
      storeId,
      status: { in: ['APPROVED', 'PENDING'] },
      periodFrom,
      periodTo,
    },
  });
  return decimalFieldToCentsNumber(agg._sum.amount);
}

/** Derive available cents from online-collected cents already computed for the period. */
export async function periodOrderAvailableFromOnlineCollectedCents(
  storeId: string,
  fromStr: string,
  toStr: string,
  fromOrdersCents: number,
): Promise<PeriodOrderAvailable> {
  const priorPayoutCents = await priorPayoutCentsForPeriod(storeId, fromStr, toStr);
  return {
    fromOrdersCents,
    priorPayoutCents,
    remainingCents: Math.max(0, fromOrdersCents - priorPayoutCents),
  };
}

/** Derive available cents from an already-built channel preview (avoids a second order scan). */
export async function periodOrderAvailableFromChannelPreview(
  storeId: string,
  fromStr: string,
  toStr: string,
  channelPreview: PeriodChannelPreview,
): Promise<PeriodOrderAvailable> {
  const fromOrdersCents = Math.round(
    sumOnlinePaymentsCollectedFromBreakdown(channelPreview.breakdown) * 100,
  );
  return periodOrderAvailableFromOnlineCollectedCents(storeId, fromStr, toStr, fromOrdersCents);
}

/** Pickup + delivery online net (LKR) for paid orders in the period — matches Initiate Payout UI. */
export async function computePeriodOrderAvailableCents(
  storeId: string,
  fromStr: string,
  toStr: string,
  cycleCtx?: PayoutCycleContext,
): Promise<PeriodOrderAvailable> {
  const cycle = cycleCtx ?? (await resolvePayoutCycleContext(storeId));
  const orderFrom = cycle.cycleStage === 'SECOND' && cycle.cycleFrom ? cycle.cycleFrom : fromStr;
  const channelPreview = await buildPeriodChannelPreview(storeId, orderFrom, toStr);
  const sumOnlineCollected = (breakdown: PeriodChannelPreview['breakdown']) =>
    Math.round(
      (cycle.cycleStage === 'FIRST'
        ? sumFirstPayoutOnlineWalletBaseFromBreakdown(breakdown)
        : sumOnlinePaymentsCollectedFromBreakdown(breakdown)) * 100,
    );

  const fromOrdersCents = sumOnlineCollected(channelPreview.breakdown);
  let adjustedFromOrdersCents = fromOrdersCents;
  if (cycle.cycleStage === 'SECOND') {
    adjustedFromOrdersCents = Math.max(
      0,
      fromOrdersCents - (cycle.priorOnlineWalletAmountCents ?? 0),
    );
  }
  return periodOrderAvailableFromOnlineCollectedCents(
    storeId,
    fromStr,
    toStr,
    adjustedFromOrdersCents,
  );
}
