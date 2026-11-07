export type LoyaltyTierId = string;

export interface LoyaltyTier {
  id: LoyaltyTierId;
  name: string;
  minSpendLkr: number;
  emoji: string;
  perk: string;
  gradient?: string;
  accent?: string;
}

/** Three-tier Bing Chun rewards journey — unlocked by lifetime spend (LKR). */
export const LOYALTY_TIERS: LoyaltyTier[] = [
  {
    id: 'pearl',
    name: 'Pearl',
    minSpendLkr: 7500,
    emoji: '🫧',
    perk: 'Earn points on every order',
    gradient: 'linear-gradient(145deg, #dbeafe 0%, #bfdbfe 100%)',
    accent: '#2563eb',
  },
  {
    id: 'crystal',
    name: 'Crystal',
    minSpendLkr: 15000,
    emoji: '💠',
    perk: '5% bonus points on weekends',
    gradient: 'linear-gradient(145deg, #e0f2fe 0%, #a5f3fc 100%)',
    accent: '#0891b2',
  },
  {
    id: 'crown',
    name: 'Crown',
    minSpendLkr: 30000,
    emoji: '👑',
    perk: 'Free topping & priority on exclusive drops',
    gradient: 'linear-gradient(145deg, #ede9fe 0%, #c4b5fd 100%)',
    accent: '#7c3aed',
  },
];

export function getLoyaltyTier(spendLkr: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): LoyaltyTier | null {
  let tier: LoyaltyTier | null = null;
  for (const t of tiers) {
    if (spendLkr >= t.minSpendLkr) tier = t;
  }
  return tier;
}

export function getLoyaltyTierDisplay(spendLkr: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): LoyaltyTier {
  return getLoyaltyTier(spendLkr, tiers) ?? tiers[0];
}

export function loyaltyTierLabel(spendLkr: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): string {
  const tier = getLoyaltyTier(spendLkr, tiers);
  return tier ? `${tier.name} Member` : 'Rewards Member';
}

export function loyaltyTierProgress(
  spendLkr: number,
  tiers: LoyaltyTier[] = LOYALTY_TIERS,
): {
  nextTier: string | null;
  remaining: number;
  currentTier: LoyaltyTier | null;
  nextTierDef: LoyaltyTier | null;
} {
  const currentTier = getLoyaltyTier(spendLkr, tiers);

  if (!currentTier) {
    const firstTier = tiers[0];
    if (!firstTier) {
      return { nextTier: null, remaining: 0, currentTier: null, nextTierDef: null };
    }
    return {
      nextTier: `${firstTier.name} Member`,
      remaining: Math.max(0, firstTier.minSpendLkr - spendLkr),
      currentTier: null,
      nextTierDef: firstTier,
    };
  }

  const idx = tiers.findIndex((t) => t.id === currentTier.id);
  const nextTierDef = idx < tiers.length - 1 ? tiers[idx + 1] : null;

  if (!nextTierDef) {
    return { nextTier: null, remaining: 0, currentTier, nextTierDef: null };
  }

  return {
    nextTier: `${nextTierDef.name} Member`,
    remaining: Math.max(0, nextTierDef.minSpendLkr - spendLkr),
    currentTier,
    nextTierDef,
  };
}

export function getLoyaltyTierProgressPercent(spendLkr: number, tiers: LoyaltyTier[] = LOYALTY_TIERS): number {
  const { currentTier, nextTierDef } = loyaltyTierProgress(spendLkr, tiers);
  if (!nextTierDef) return 100;

  const floor = currentTier?.minSpendLkr ?? 0;
  const span = nextTierDef.minSpendLkr - floor;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, ((spendLkr - floor) / span) * 100));
}

export function formatLoyaltySpend(lkr: number): string {
  return `LKR ${Math.max(0, lkr).toLocaleString()}`;
}

export interface LoyaltySettings {
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  customerRedeemEnabled?: boolean;
  checkoutRedeemEnabled?: boolean;
  /** Lifetime points required before checkout redemption unlocks. */
  minPointsToRedeem?: number;
}

export const LOYALTY_LKR_PER_POINT = 100;

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  pointsPerLkr: 1 / LOYALTY_LKR_PER_POINT,
  redeemValue: 1.0,
  maxRedeemPct: 100,
  minOrderToEarn: 200,
  customerRedeemEnabled: true,
  checkoutRedeemEnabled: true,
  minPointsToRedeem: 100,
};

export function normalizeLoyaltySettings(settings: Partial<LoyaltySettings> = {}): LoyaltySettings {
  return {
    ...DEFAULT_LOYALTY_SETTINGS,
    ...settings,
    pointsPerLkr: settings.pointsPerLkr ?? DEFAULT_LOYALTY_SETTINGS.pointsPerLkr,
    customerRedeemEnabled: settings.customerRedeemEnabled ?? DEFAULT_LOYALTY_SETTINGS.customerRedeemEnabled,
    checkoutRedeemEnabled: settings.checkoutRedeemEnabled ?? DEFAULT_LOYALTY_SETTINGS.checkoutRedeemEnabled,
    minPointsToRedeem: Math.max(
      0,
      Math.floor(settings.minPointsToRedeem ?? DEFAULT_LOYALTY_SETTINGS.minPointsToRedeem ?? 100),
    ),
  };
}

/** True once the customer has earned at least `minPointsToRedeem` lifetime points. */
export function isCheckoutRedeemUnlocked(opts: {
  lifetimePointsEarned: number;
  minPointsToRedeem?: number;
}): boolean {
  const min = Math.max(0, Math.floor(opts.minPointsToRedeem ?? DEFAULT_LOYALTY_SETTINGS.minPointsToRedeem ?? 100));
  if (min <= 0) return true;
  return Math.max(0, Math.floor(opts.lifetimePointsEarned)) >= min;
}

/** Estimated loyalty points for a cart/order total (matches backend earn formula). */
export function estimateLoyaltyPoints(
  orderTotalLkr: number,
  settings: Pick<LoyaltySettings, 'pointsPerLkr' | 'minOrderToEarn'> = DEFAULT_LOYALTY_SETTINGS,
): number {
  if (orderTotalLkr < settings.minOrderToEarn) return 0;
  return Math.floor(orderTotalLkr * settings.pointsPerLkr);
}

/** Checkout redeem: 1 point = `redeemValue` LKR, capped by balance and remaining payable. */
export function calcCheckoutPointsRedeem(opts: {
  usePoints: number;
  availablePoints: number;
  redeemValue?: number;
  maxRedeemPct?: number;
  subtotal: number;
  remainingPayable: number;
}): { maxPoints: number; points: number; discountLkr: number } {
  const redeemValue = Math.max(0.01, opts.redeemValue ?? DEFAULT_LOYALTY_SETTINGS.redeemValue);
  const available = Math.max(0, Math.floor(opts.availablePoints));
  const requested = Math.max(0, Math.floor(opts.usePoints));
  const maxDiscountLkr = Math.max(0, Math.floor(opts.remainingPayable));
  const maxPoints = Math.min(available, Math.floor(maxDiscountLkr / redeemValue));
  const points = Math.min(requested, maxPoints);
  return {
    maxPoints,
    points,
    discountLkr: Math.floor(points * redeemValue),
  };
}

export function formatLoyaltyEarnRate(
  settings: Pick<LoyaltySettings, 'pointsPerLkr'> = DEFAULT_LOYALTY_SETTINGS,
): string {
  const lkrPerPoint = Math.max(1, Math.round(1 / settings.pointsPerLkr));
  return `1 point per LKR ${lkrPerPoint.toLocaleString()} spent`;
}

export interface LoyaltyTransaction {
  id: string;
  orderId?: string | null;
  points: number;
  type: string;
  note?: string | null;
  createdAt: string;
}

export type CustomerLoyaltyJourneyStepKey = 'OFFER_1' | 'OFFER_2' | 'OFFER_3';

export type CustomerLoyaltyJourneyStepStatus =
  | 'locked'
  | 'current'
  | 'completed'
  | 'expired'
  | 'disabled';

export interface CustomerLoyaltyJourneyStep {
  key: CustomerLoyaltyJourneyStepKey;
  stepNumber: number;
  title: string;
  description: string;
  status: CustomerLoyaltyJourneyStepStatus;
  statusLabel: string;
  detail: string | null;
  progress: { current: number; required: number } | null;
}

export interface CustomerLoyaltyJourney {
  active: boolean;
  validOrderCount: number;
  currentStepKey: CustomerLoyaltyJourneyStepKey | null;
  headline: string;
  steps: CustomerLoyaltyJourneyStep[];
}

export interface LoyaltySummary {
  points: number;
  lifetimePointsEarned?: number;
  checkoutRedeemUnlocked?: boolean;
  totalSpendLkr: number;
  settings: LoyaltySettings;
  referralBonusPoints?: number;
  tiers?: LoyaltyTier[];
  redeemRewards?: LoyaltyRedeemReward[];
  upcomingOffers?: LoyaltyUpcomingOffer[];
  journey?: CustomerLoyaltyJourney | null;
  transactions: LoyaltyTransaction[];
}

export interface LoyaltyRedeemReward {
  id: string;
  title: string;
  description: string;
  cost: number;
  emoji: string;
  tag?: string;
  isActive?: boolean;
}

export const LOYALTY_REDEEM_REWARDS: LoyaltyRedeemReward[] = [
  {
    id: 'free-topping',
    title: 'Free Topping',
    description: 'Any pearl, jelly, or pudding topping on your next drink.',
    cost: 150,
    emoji: '🧋',
    tag: 'Popular',
  },
  {
    id: 'free-delivery',
    title: 'Free Delivery',
    description: 'Waive delivery fee on your next order anywhere in Colombo.',
    cost: 300,
    emoji: '🛵',
  },
  {
    id: 'medium-upgrade',
    title: 'Size Upgrade',
    description: 'Upgrade any medium drink to large — on us.',
    cost: 250,
    emoji: '🥤',
  },
  {
    id: 'milk-tea',
    title: 'Classic Milk Tea',
    description: 'Redeem for one signature Classic Milk Tea (medium).',
    cost: 500,
    emoji: '🍵',
    tag: 'Best value',
  },
  {
    id: 'ice-cream',
    title: 'Ice Cream Scoop',
    description: 'One premium ice cream scoop from our dessert menu.',
    cost: 400,
    emoji: '🍨',
  },
  {
    id: 'combo',
    title: 'Tea + Dessert Combo',
    description: 'Any bubble tea plus one dessert — perfect treat bundle.',
    cost: 900,
    emoji: '🎁',
    tag: 'Premium',
  },
];

export interface LoyaltyUpcomingOffer {
  id: string;
  title: string;
  date: string;
  description: string;
  emoji: string;
  isActive?: boolean;
}

export const LOYALTY_UPCOMING_REWARDS: LoyaltyUpcomingOffer[] = [
  {
    id: 'monsoon',
    title: 'Monsoon Mango Drop',
    date: 'Aug 2026',
    description: 'Double points on all mango series drinks.',
    emoji: '🥭',
  },
  {
    id: 'birthday',
    title: 'Birthday Month Bonus',
    date: 'Your birthday',
    description: '3× points on orders during your birthday week.',
    emoji: '🎂',
  },
  {
    id: 'weekend',
    title: 'Weekend Bubble Boost',
    date: 'Every Sat–Sun',
    description: 'Crystal+ members earn 25% extra points.',
    emoji: '✨',
  },
];

export interface LoyaltyAchievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  unlocked: boolean;
}

export function computeLoyaltyStats(
  transactions: LoyaltyTransaction[],
  points: number,
  totalSpendLkr = 0,
  tiers: LoyaltyTier[] = LOYALTY_TIERS,
  redeemValue = DEFAULT_LOYALTY_SETTINGS.redeemValue,
) {
  const earned = transactions.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
  const redeemed = Math.abs(
    transactions.filter((t) => t.points < 0).reduce((s, t) => s + t.points, 0),
  );
  const orderCount = transactions.filter(
    (t) => t.type.toUpperCase().includes('EARN') || t.type.toUpperCase().includes('ORDER'),
  ).length;
  const tier = getLoyaltyTier(totalSpendLkr, tiers);

  return {
    balance: points,
    lifetimeEarned: earned || points,
    lifetimeRedeemed: redeemed,
    lifetimeSpendLkr: totalSpendLkr,
    orderCount,
    redeemValueLkr: points * redeemValue,
    tierName: tier?.name ?? 'Rewards',
    tierEmoji: tier?.emoji ?? '🎁',
  };
}

export function computeAchievements(
  transactions: LoyaltyTransaction[],
  points: number,
  totalSpendLkr = 0,
  tiers: LoyaltyTier[] = LOYALTY_TIERS,
): LoyaltyAchievement[] {
  const orderCount = transactions.filter((t) => t.points > 0).length;
  const hasRedeemed = transactions.some((t) => t.points < 0);

  const tierThresholds = tiers.length >= 3
    ? [tiers[0].minSpendLkr, tiers[1].minSpendLkr, tiers[2].minSpendLkr]
    : [7500, 15000, 30000];

  return [
    {
      id: 'first-sip',
      title: 'First Sip',
      description: 'Placed your first Bing Chun order',
      emoji: '🧋',
      unlocked: orderCount >= 1 || points > 0,
    },
    {
      id: 'bubble-lover',
      title: 'Bubble Lover',
      description: 'Earned points from 5 orders',
      emoji: '💙',
      unlocked: orderCount >= 5,
    },
    {
      id: 'points-collector',
      title: 'Points Collector',
      description: 'Reached 500 lifetime points',
      emoji: '⭐',
      unlocked: points >= 500,
    },
    {
      id: 'pearl-member',
      title: `${tiers[0]?.name ?? 'Pearl'} Member`,
      description: `Unlocked ${tiers[0]?.name ?? 'Pearl'} — LKR ${tierThresholds[0].toLocaleString()} lifetime spend`,
      emoji: tiers[0]?.emoji ?? '🫧',
      unlocked: totalSpendLkr >= tierThresholds[0],
    },
    {
      id: 'crystal-rise',
      title: `${tiers[1]?.name ?? 'Crystal'} Rise`,
      description: `Unlocked ${tiers[1]?.name ?? 'Crystal'} — LKR ${tierThresholds[1].toLocaleString()} lifetime spend`,
      emoji: tiers[1]?.emoji ?? '💠',
      unlocked: totalSpendLkr >= tierThresholds[1],
    },
    {
      id: 'crown-elite',
      title: `${tiers[2]?.name ?? 'Crown'} Elite`,
      description: `Reached ${tiers[2]?.name ?? 'Crown'} — LKR ${tierThresholds[2].toLocaleString()} lifetime spend`,
      emoji: tiers[2]?.emoji ?? '👑',
      unlocked: totalSpendLkr >= tierThresholds[2],
    },
    {
      id: 'reward-redeemer',
      title: 'Reward Redeemer',
      description: 'Redeemed points for a treat',
      emoji: '🎁',
      unlocked: hasRedeemed,
    },
    {
      id: 'loyal-regular',
      title: 'Loyal Regular',
      description: '10+ orders with Bing Chun',
      emoji: '🔥',
      unlocked: orderCount >= 10,
    },
  ];
}

export function formatReferralCode(userId: string, name?: string): string {
  const initials = (name ?? '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const suffix = userId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `BC${initials || 'CH'}${suffix}`;
}

export function formatTransactionLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type LoyaltyTransactionKind = 'earn' | 'redeem' | 'other';

export function getLoyaltyTransactionKind(txn: LoyaltyTransaction): LoyaltyTransactionKind {
  const type = txn.type.toUpperCase();
  if (txn.points > 0 || type.includes('EARN')) return 'earn';
  if (txn.points < 0 || type.includes('REDEEM')) return 'redeem';
  return 'other';
}

export function extractOrderNumberFromNote(note?: string | null): string | null {
  if (!note) return null;
  const match = note.match(/Order\s+(BC[\d-]+)/i);
  return match?.[1] ?? null;
}

export function describeLoyaltyTransaction(
  txn: LoyaltyTransaction,
  lkrPerPoint = LOYALTY_LKR_PER_POINT,
): string {
  const kind = getLoyaltyTransactionKind(txn);
  const orderNum = extractOrderNumberFromNote(txn.note);

  if (kind === 'earn') {
    if (orderNum) {
      return `Earned from order #${orderNum} — 1 point per LKR ${lkrPerPoint.toLocaleString()} spent on that order`;
    }
    return txn.note ?? 'Points earned from a qualifying Bing Chun order';
  }

  if (kind === 'redeem') {
    if (orderNum) {
      return `Redeemed on order #${orderNum} at checkout`;
    }
    return txn.note ?? 'Points redeemed toward an order total';
  }

  return txn.note ?? formatTransactionLabel(txn.type);
}
