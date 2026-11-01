import { prisma } from './prisma';
import { sumOnlinePaymentsCollectedFromBreakdown } from './commission';
import { buildPeriodChannelPreview } from './periodChannelPreview';
import { decimalFieldToCentsNumber } from './moneyDecimal';

/** Pickup + delivery online net (LKR) for paid orders in the period — matches Initiate Payout UI. */
export async function computePeriodOrderAvailableCents(
  storeId: string,
  fromStr: string,
  toStr: string,
): Promise<{
  fromOrdersCents: number;
  priorPayoutCents: number;
  remainingCents: number;
}> {
  const channelPreview = await buildPeriodChannelPreview(storeId, fromStr, toStr);
  const fromOrdersCents = Math.round(
    sumOnlinePaymentsCollectedFromBreakdown(channelPreview.breakdown) * 100,
  );

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
  const priorPayoutCents = decimalFieldToCentsNumber(agg._sum.amount);
  const remainingCents = Math.max(0, fromOrdersCents - priorPayoutCents);

  return { fromOrdersCents, priorPayoutCents, remainingCents };
}
