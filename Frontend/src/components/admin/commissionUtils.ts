/** Rolling payout window slab tiers — rate applies to period commissionable base (excludes delivery & convenience fees). */
export const COMMISSION_SLABS = [
  { upTo: 1_000_000, rate: 0.065, label: 'Up to LKR 1,000,000' },
  { upTo: 2_000_000, rate: 0.055, label: 'LKR 1,000,001 – 2,000,000' },
  { upTo: 3_000_000, rate: 0.05, label: 'LKR 2,000,001 – 3,000,000' },
  { upTo: Infinity, rate: 0.045, label: 'Above LKR 3,000,000' },
] as const;

export type CommissionSlab = (typeof COMMISSION_SLABS)[number];

export type CommissionChannel = 'pickupCash' | 'pickupCard' | 'pickupOnline' | 'deliveryOnline';

export type SlabInfo = {
  monthlyBase: number;
  effectiveRate: number;
  slabIndex: number;
  slabs?: readonly CommissionSlab[];
};

export type MonthlySlabInfo = SlabInfo & { month: string };

/**
 * Net item value for commission — excludes delivery fee and convenience fee.
 * Applies promo/loyalty discounts to the item subtotal.
 */
export function commissionableSubtotal(order: {
  subtotal: number;
  discount?: number;
  loyaltyDiscount?: number;
}): number {
  return Math.max(0, order.subtotal - (order.discount ?? 0) - (order.loyaltyDiscount ?? 0));
}

export function resolveCommissionSlabs(
  slabs?: readonly CommissionSlab[] | null,
): readonly CommissionSlab[] {
  return slabs?.length ? slabs : COMMISSION_SLABS;
}

export function getSlabIndex(monthlyBase: number): number {
  for (let i = 0; i < COMMISSION_SLABS.length; i++) {
    if (monthlyBase <= COMMISSION_SLABS[i].upTo) return i;
  }
  return COMMISSION_SLABS.length - 1;
}

export function getEffectiveRate(
  monthlyBase: number,
  slabs?: readonly CommissionSlab[] | null,
): number {
  const tiers = resolveCommissionSlabs(slabs);
  for (let i = 0; i < tiers.length; i++) {
    if (monthlyBase <= tiers[i].upTo) return tiers[i].rate;
  }
  return tiers[tiers.length - 1].rate;
}

export function buildSlabInfo(monthlyBase: number): SlabInfo {
  const slabIndex = getSlabIndex(monthlyBase);
  return {
    monthlyBase,
    effectiveRate: COMMISSION_SLABS[slabIndex].rate,
    slabIndex,
  };
}

export function computePlatformCommission(subtotal: number, monthlyBase: number): number {
  return subtotal * getEffectiveRate(monthlyBase);
}

export function formatCommissionRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Decimal commission rate (e.g. 0.065) → one-decimal percent (6.5) for payout breakdown UI. */
export function commissionRateToDisplayPct(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

/** First positive decimal rate wins (stored snapshot rate, then live preview slab rates). */
export function resolveSlabRatePct(
  ...rates: Array<number | null | undefined>
): number | null {
  for (const rate of rates) {
    if (rate != null && rate > 0) {
      return commissionRateToDisplayPct(rate);
    }
  }
  return null;
}

export function resolveSlabRatePctFromPreview(
  preview: { slabInfo: SlabInfo } | null | undefined,
): number | null {
  return resolveSlabRatePct(preview?.slabInfo.effectiveRate);
}

export function slabRangeLabel(index: number): string {
  return COMMISSION_SLABS[index]?.label ?? '';
}

export function getNextTierProgress(monthlyBase: number, slabIndex: number): {
  remaining: number;
  progressPercent: number;
  nextTierNumber: number;
  nextRate: number;
} | null {
  const ceiling = COMMISSION_SLABS[slabIndex]?.upTo;
  if (ceiling == null || ceiling === Infinity) return null;

  const floor = slabIndex === 0 ? 0 : COMMISSION_SLABS[slabIndex - 1]!.upTo;
  const nextSlab = COMMISSION_SLABS[slabIndex + 1];
  if (!nextSlab) return null;

  const span = ceiling - floor;
  const progressPercent = span > 0 ? Math.min(100, ((monthlyBase - floor) / span) * 100) : 0;
  const remaining = Math.max(0, ceiling - monthlyBase);

  return {
    remaining,
    progressPercent,
    nextTierNumber: slabIndex + 2,
    nextRate: nextSlab.rate,
  };
}
