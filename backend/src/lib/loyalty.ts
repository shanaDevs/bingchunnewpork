/** LKR spent per 1 loyalty point (1 point per LKR 100). */
export const LOYALTY_LKR_PER_POINT = 100;

export const LOYALTY_POINTS_PER_LKR = 1 / LOYALTY_LKR_PER_POINT;

export const DEFAULT_LOYALTY_SETTINGS = {
  pointsPerLkr: LOYALTY_POINTS_PER_LKR,
  redeemValue: 1.0,
  maxRedeemPct: 100,
  minOrderToEarn: 200,
  minPointsToRedeem: 100,
} as const;

export type LoyaltySettingsRecord = {
  pointsPerLkr: number;
  redeemValue: number;
  maxRedeemPct: number;
  minOrderToEarn: number;
  customerRedeemEnabled: boolean;
  checkoutRedeemEnabled: boolean;
  /** Lifetime earned points required before checkout redemption unlocks. */
  minPointsToRedeem: number;
};

export function resolveLoyaltySettings(
  db?: Partial<LoyaltySettingsRecord> | null,
): LoyaltySettingsRecord {
  return {
    pointsPerLkr: db?.pointsPerLkr ?? DEFAULT_LOYALTY_SETTINGS.pointsPerLkr,
    redeemValue: db?.redeemValue ?? DEFAULT_LOYALTY_SETTINGS.redeemValue,
    maxRedeemPct: db?.maxRedeemPct ?? DEFAULT_LOYALTY_SETTINGS.maxRedeemPct,
    minOrderToEarn: db?.minOrderToEarn ?? DEFAULT_LOYALTY_SETTINGS.minOrderToEarn,
    customerRedeemEnabled: db?.customerRedeemEnabled ?? true,
    checkoutRedeemEnabled: db?.checkoutRedeemEnabled ?? true,
    minPointsToRedeem: Math.max(0, Math.floor(db?.minPointsToRedeem ?? DEFAULT_LOYALTY_SETTINGS.minPointsToRedeem)),
  };
}

/** True once the customer has earned at least `minPointsToRedeem` lifetime points. */
export function isCheckoutRedeemUnlocked(opts: {
  lifetimePointsEarned: number;
  minPointsToRedeem: number;
}): boolean {
  const min = Math.max(0, Math.floor(opts.minPointsToRedeem));
  if (min <= 0) return true;
  return Math.max(0, Math.floor(opts.lifetimePointsEarned)) >= min;
}

export function calcLoyaltyPointsEarned(
  orderTotalLkr: number,
  settings: Pick<LoyaltySettingsRecord, 'pointsPerLkr' | 'minOrderToEarn'> = DEFAULT_LOYALTY_SETTINGS,
): number {
  if (orderTotalLkr < settings.minOrderToEarn) return 0;
  return Math.floor(orderTotalLkr * settings.pointsPerLkr);
}

/** Redeem: 1 point = `redeemValue` LKR (default 1). Capped by balance and remaining payable. */
export function calcLoyaltyRedeem(opts: {
  usePoints: number;
  availablePoints: number;
  redeemValue?: number;
  maxRedeemPct?: number;
  subtotal: number;
  remainingPayable: number;
}): { pointsToDeduct: number; loyaltyDiscount: number; maxPoints: number } {
  const redeemValue = Math.max(0.01, opts.redeemValue ?? DEFAULT_LOYALTY_SETTINGS.redeemValue);
  const available = Math.max(0, Math.floor(opts.availablePoints));
  const requested = Math.max(0, Math.floor(opts.usePoints));
  const maxDiscountLkr = Math.max(0, Math.floor(opts.remainingPayable));
  const maxPoints = Math.min(available, Math.floor(maxDiscountLkr / redeemValue));
  const pointsToDeduct = Math.min(requested, maxPoints);
  return {
    maxPoints,
    pointsToDeduct,
    loyaltyDiscount: Math.floor(pointsToDeduct * redeemValue),
  };
}
