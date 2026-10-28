import type { Prisma } from '@prisma/client';

export type LoyaltyTierConfig = {
  id: string;
  name: string;
  minSpendLkr: number;
  emoji: string;
  perk: string;
  accent?: string;
};

export type LoyaltyRedeemRewardConfig = {
  id: string;
  title: string;
  description: string;
  cost: number;
  emoji: string;
  tag?: string;
  isActive?: boolean;
};

export type LoyaltyUpcomingOfferConfig = {
  id: string;
  title: string;
  date: string;
  description: string;
  emoji: string;
  isActive?: boolean;
};

export const DEFAULT_LOYALTY_TIERS: LoyaltyTierConfig[] = [
  {
    id: 'pearl',
    name: 'Pearl',
    minSpendLkr: 7500,
    emoji: '🫧',
    perk: 'Earn points on every order',
    accent: '#2563eb',
  },
  {
    id: 'crystal',
    name: 'Crystal',
    minSpendLkr: 15000,
    emoji: '💠',
    perk: '5% bonus points on weekends',
    accent: '#0891b2',
  },
  {
    id: 'crown',
    name: 'Crown',
    minSpendLkr: 30000,
    emoji: '👑',
    perk: 'Free topping & priority on exclusive drops',
    accent: '#7c3aed',
  },
];

export const DEFAULT_REDEEM_REWARDS: LoyaltyRedeemRewardConfig[] = [
  {
    id: 'free-topping',
    title: 'Free Topping',
    description: 'Any pearl, jelly, or pudding topping on your next drink.',
    cost: 150,
    emoji: '🧋',
    tag: 'Popular',
    isActive: true,
  },
  {
    id: 'free-delivery',
    title: 'Free Delivery',
    description: 'Waive delivery fee on your next order anywhere in Colombo.',
    cost: 300,
    emoji: '🛵',
    isActive: true,
  },
  {
    id: 'medium-upgrade',
    title: 'Size Upgrade',
    description: 'Upgrade any medium drink to large — on us.',
    cost: 250,
    emoji: '🥤',
    isActive: true,
  },
  {
    id: 'milk-tea',
    title: 'Classic Milk Tea',
    description: 'Redeem for one signature Classic Milk Tea (medium).',
    cost: 500,
    emoji: '🍵',
    tag: 'Best value',
    isActive: true,
  },
  {
    id: 'ice-cream',
    title: 'Ice Cream Scoop',
    description: 'One premium ice cream scoop from our dessert menu.',
    cost: 400,
    emoji: '🍨',
    isActive: true,
  },
  {
    id: 'combo',
    title: 'Tea + Dessert Combo',
    description: 'Any bubble tea plus one dessert — perfect treat bundle.',
    cost: 900,
    emoji: '🎁',
    tag: 'Premium',
    isActive: true,
  },
];

export const DEFAULT_UPCOMING_OFFERS: LoyaltyUpcomingOfferConfig[] = [
  {
    id: 'monsoon',
    title: 'Monsoon Mango Drop',
    date: 'Aug 2026',
    description: 'Double points on all mango series drinks.',
    emoji: '🥭',
    isActive: true,
  },
  {
    id: 'birthday',
    title: 'Birthday Month Bonus',
    date: 'Your birthday',
    description: '3× points on orders during your birthday week.',
    emoji: '🎂',
    isActive: true,
  },
  {
    id: 'weekend',
    title: 'Weekend Bubble Boost',
    date: 'Every Sat–Sun',
    description: 'Crystal+ members earn 25% extra points.',
    emoji: '✨',
    isActive: true,
  },
];

export type LoyaltyProgramConfig = {
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  referralBonusPoints: number;
  customerRedeemEnabled: boolean;
  checkoutRedeemEnabled: boolean;
  minPointsToRedeem: number;
  lkrPerPoint: number;
  tiers: LoyaltyTierConfig[];
  redeemRewards: LoyaltyRedeemRewardConfig[];
  upcomingOffers: LoyaltyUpcomingOfferConfig[];
};

type LoyaltySettingRow = {
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  referralBonusPoints?: number | null;
  customerRedeemEnabled?: boolean | null;
  checkoutRedeemEnabled?: boolean | null;
  minPointsToRedeem?: number | null;
  tiersJson?: Prisma.JsonValue | null;
  redeemRewardsJson?: Prisma.JsonValue | null;
  upcomingOffersJson?: Prisma.JsonValue | null;
};

function parseJsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] | null {
  if (!Array.isArray(value)) return null;
  return value as T[];
}

export function buildLoyaltyProgramConfig(
  row?: Partial<LoyaltySettingRow> | null,
  options?: { includeInactive?: boolean },
): LoyaltyProgramConfig {
  const includeInactive = options?.includeInactive ?? false;
  const pointsPerLkr = row?.pointsPerLkr ?? 0.01;
  const tiers = parseJsonArray<LoyaltyTierConfig>(row?.tiersJson) ?? DEFAULT_LOYALTY_TIERS;
  const redeemRewardsRaw =
    parseJsonArray<LoyaltyRedeemRewardConfig>(row?.redeemRewardsJson) ?? DEFAULT_REDEEM_REWARDS;
  const upcomingOffersRaw =
    parseJsonArray<LoyaltyUpcomingOfferConfig>(row?.upcomingOffersJson) ?? DEFAULT_UPCOMING_OFFERS;
  const redeemRewards = includeInactive
    ? redeemRewardsRaw
    : redeemRewardsRaw.filter((r) => r.isActive !== false);
  const upcomingOffers = includeInactive
    ? upcomingOffersRaw
    : upcomingOffersRaw.filter((o) => o.isActive !== false);

  return {
    pointsPerLkr,
    redeemValue: row?.redeemValue ?? 1,
    maxRedeemPct: row?.maxRedeemPct ?? 100,
    minOrderToEarn: row?.minOrderToEarn ?? 200,
    referralBonusPoints: row?.referralBonusPoints ?? 100,
    customerRedeemEnabled: row?.customerRedeemEnabled ?? true,
    checkoutRedeemEnabled: row?.checkoutRedeemEnabled ?? true,
    minPointsToRedeem: Math.max(0, Math.floor(row?.minPointsToRedeem ?? 100)),
    lkrPerPoint: Math.max(1, Math.round(1 / pointsPerLkr)),
    tiers: [...tiers].sort((a, b) => a.minSpendLkr - b.minSpendLkr),
    redeemRewards,
    upcomingOffers,
  };
}
