import { prisma } from './prisma';
import { sumOnlinePaymentsCollectedFromBreakdown } from './commission';
import {
  buildPeriodChannelPreview,
  type PeriodChannelPreview,
} from './periodChannelPreview';
import { decimalFieldToCentsNumber } from './moneyDecimal';

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
  const priorPayoutCents = await priorPayoutCentsForPeriod(storeId, fromStr, toStr);
  return {
    fromOrdersCents,
    priorPayoutCents,
    remainingCents: Math.max(0, fromOrdersCents - priorPayoutCents),
  };
}

/** Pickup + delivery online net (LKR) for paid orders in the period — matches Initiate Payout UI. */
export async function computePeriodOrderAvailableCents(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<PeriodOrderAvailable> {
  const channelPreview = await buildPeriodChannelPreview(storeId, fromStr, toStr);
  return periodOrderAvailableFromChannelPreview(storeId, fromStr, toStr, channelPreview);
}
