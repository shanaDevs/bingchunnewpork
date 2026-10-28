import { prisma } from './prisma';
import { ensureLoyaltySchema } from './loyaltySchema';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_LOYALTY_TIERS,
  DEFAULT_REDEEM_REWARDS,
  DEFAULT_UPCOMING_OFFERS,
  type LoyaltyRedeemRewardConfig,
  type LoyaltyTierConfig,
  type LoyaltyUpcomingOfferConfig,
} from './loyaltyProgram';

export type LoyaltySettingRow = {
  id: string;
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  referralBonusPoints: number;
  customerRedeemEnabled: boolean;
  checkoutRedeemEnabled: boolean;
  minPointsToRedeem: number;
  tiersJson: Prisma.JsonValue;
  redeemRewardsJson: Prisma.JsonValue;
  upcomingOffersJson: Prisma.JsonValue;
};

function parseJsonColumn<T>(value: unknown): T[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function rowToLoyaltyFields(row: LoyaltySettingRow | null) {
  return {
    pointsPerLkr: row?.pointsPerLkr ?? 0.01,
    redeemValue: row?.redeemValue ?? 1,
    maxRedeemPct: row?.maxRedeemPct ?? 100,
    minOrderToEarn: row?.minOrderToEarn ?? 200,
    referralBonusPoints: row?.referralBonusPoints ?? 100,
    customerRedeemEnabled: row?.customerRedeemEnabled ?? true,
    checkoutRedeemEnabled: row?.checkoutRedeemEnabled ?? true,
    minPointsToRedeem: Math.max(0, Math.floor(row?.minPointsToRedeem ?? 100)),
    tiers: parseJsonColumn<LoyaltyTierConfig>(row?.tiersJson) ?? DEFAULT_LOYALTY_TIERS,
    redeemRewards:
      parseJsonColumn<LoyaltyRedeemRewardConfig>(row?.redeemRewardsJson) ?? DEFAULT_REDEEM_REWARDS,
    upcomingOffers:
      parseJsonColumn<LoyaltyUpcomingOfferConfig>(row?.upcomingOffersJson) ?? DEFAULT_UPCOMING_OFFERS,
  };
}

export async function fetchLoyaltySettingRow(): Promise<LoyaltySettingRow | null> {
  await ensureLoyaltySchema();
  const rows = await prisma.$queryRaw<LoyaltySettingRow[]>`
    SELECT
      id,
      "pointsPerLkr" AS "pointsPerLkr",
      "redeemValue" AS "redeemValue",
      "maxRedeemPct" AS "maxRedeemPct",
      "minOrderToEarn" AS "minOrderToEarn",
      "referralBonusPoints" AS "referralBonusPoints",
      "customerRedeemEnabled" AS "customerRedeemEnabled",
      "checkoutRedeemEnabled" AS "checkoutRedeemEnabled",
      "minPointsToRedeem" AS "minPointsToRedeem",
      "tiersJson" AS "tiersJson",
      "redeemRewardsJson" AS "redeemRewardsJson",
      "upcomingOffersJson" AS "upcomingOffersJson"
    FROM loyalty_settings
    WHERE id = 'default'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type UpsertLoyaltySettingInput = {
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  referralBonusPoints: number;
  customerRedeemEnabled: boolean;
  checkoutRedeemEnabled: boolean;
  minPointsToRedeem: number;
  tiers: LoyaltyTierConfig[];
  redeemRewards: LoyaltyRedeemRewardConfig[];
  upcomingOffers: LoyaltyUpcomingOfferConfig[];
};

export async function upsertLoyaltySettingRow(input: UpsertLoyaltySettingInput): Promise<LoyaltySettingRow> {
  await ensureLoyaltySchema();

  const tiersJson = JSON.stringify(input.tiers);
  const redeemRewardsJson = JSON.stringify(input.redeemRewards);
  const upcomingOffersJson = JSON.stringify(input.upcomingOffers);

  await prisma.$executeRaw`
    INSERT INTO loyalty_settings (
      id,
      "pointsPerLkr",
      "redeemValue",
      "maxRedeemPct",
      "minOrderToEarn",
      "referralBonusPoints",
      "customerRedeemEnabled",
      "checkoutRedeemEnabled",
      "minPointsToRedeem",
      "tiersJson",
      "redeemRewardsJson",
      "upcomingOffersJson"
    ) VALUES (
      'default',
      ${input.pointsPerLkr},
      ${input.redeemValue},
      ${input.maxRedeemPct},
      ${input.minOrderToEarn},
      ${input.referralBonusPoints},
      ${input.customerRedeemEnabled},
      ${input.checkoutRedeemEnabled},
      ${input.minPointsToRedeem},
      ${tiersJson}::jsonb,
      ${redeemRewardsJson}::jsonb,
      ${upcomingOffersJson}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      "pointsPerLkr" = EXCLUDED."pointsPerLkr",
      "redeemValue" = EXCLUDED."redeemValue",
      "maxRedeemPct" = EXCLUDED."maxRedeemPct",
      "minOrderToEarn" = EXCLUDED."minOrderToEarn",
      "referralBonusPoints" = EXCLUDED."referralBonusPoints",
      "customerRedeemEnabled" = EXCLUDED."customerRedeemEnabled",
      "checkoutRedeemEnabled" = EXCLUDED."checkoutRedeemEnabled",
      "minPointsToRedeem" = EXCLUDED."minPointsToRedeem",
      "tiersJson" = EXCLUDED."tiersJson",
      "redeemRewardsJson" = EXCLUDED."redeemRewardsJson",
      "upcomingOffersJson" = EXCLUDED."upcomingOffersJson"
  `;

  const row = await fetchLoyaltySettingRow();
  if (!row) throw new Error('Failed to load loyalty settings after save');
  return row;
}
