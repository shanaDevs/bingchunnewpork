import { Request, Response, NextFunction } from 'express';

import { prisma } from '../lib/prisma';

import { success } from '../utils/apiResponse';

import { AppError } from '../middleware/errorHandler';

import { resolveLoyaltySettings, isCheckoutRedeemUnlocked } from '../lib/loyalty';

import { buildLoyaltyProgramConfig } from '../lib/loyaltyProgram';
import { fetchLoyaltySettingRow } from '../lib/loyaltySettingStore';
import { getCustomerLoyaltyJourney } from '../lib/loyaltyCampaign';
import { loyaltySummaryQuerySchema } from '../lib/httpSchemas';

export async function getLoyaltySummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { storeId: queryStoreId } = loyaltySummaryQuerySchema.parse(req.query);
    const storeId = queryStoreId ?? null;

    const row = await fetchLoyaltySettingRow();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true },
    });

    if (!user) throw new AppError('User not found', 404);

    const program = buildLoyaltyProgramConfig(row);
    const settings = resolveLoyaltySettings(row);

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const lifetimeAgg = await prisma.loyaltyTransaction.aggregate({
      where: { userId, points: { gt: 0 } },
      _sum: { points: true },
    });
    const lifetimePointsEarned = lifetimeAgg._sum.points ?? 0;

    const spendAgg = await prisma.order.aggregate({
      where: { userId, paymentStatus: 'PAID' },
      _sum: { total: true },
    });

    const journey = await getCustomerLoyaltyJourney({ userId, storeId });

    return success(res, {
      points: user.loyaltyPoints,
      lifetimePointsEarned,
      checkoutRedeemUnlocked: isCheckoutRedeemUnlocked({
        lifetimePointsEarned,
        minPointsToRedeem: settings.minPointsToRedeem,
      }),
      totalSpendLkr: spendAgg._sum.total ?? 0,
      settings,
      referralBonusPoints: program.referralBonusPoints,
      tiers: program.tiers,
      redeemRewards: program.redeemRewards,
      upcomingOffers: program.upcomingOffers,
      journey,
      transactions,
    });
  } catch (err) {
    next(err);
  }
}
