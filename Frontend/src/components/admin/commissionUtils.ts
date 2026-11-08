/** Default branch payout commission tiers (Super Admin can override via settings). */
export const DEFAULT_COMMISSION_SLABS = [
  { upTo: 1_000_000, rate: 0.065, label: 'Up to LKR 1,000,000' },
  { upTo: Infinity, rate: 0.05, label: 'Above LKR 1,000,000' },
] as const;

/** @deprecated Use DEFAULT_COMMISSION_SLABS or slab rows from API `slabInfo.slabs`. */
export const COMMISSION_SLABS = DEFAULT_COMMISSION_SLABS;

export type CommissionSlab = {
  upTo: number;
  rate: number;
  label: string;
};

export type CommissionChannel = 'pickupCash' | 'pickupCard' | 'pickupOnline' | 'deliveryOnline';

export type SerializedCommissionSlab = {
  upTo: number | null;
  rate: number;
  label: string;
};

export type SlabInfo = {
  monthlyBase: number;
  effectiveRate: number;
  slabIndex: number;
  slabs?: SerializedCommissionSlab[];
};

export type MonthlySlabInfo = SlabInfo & { month: string };

export function resolveCommissionSlabs(slabs?: SerializedCommissionSlab[] | null): CommissionSlab[] {
  if (!slabs?.length) return [...DEFAULT_COMMISSION_SLABS];
  return slabs.map((row, index, sorted) => {
    const upTo = row.upTo == null || !Number.isFinite(row.upTo) ? Infinity : row.upTo;
    const prev = sorted[index - 1];
    const prevUpTo = prev?.upTo != null && Number.isFinite(prev.upTo) ? prev.upTo : null;
    return {
      upTo,
      rate: row.rate,
      label:
        row.label ??
        (upTo < Infinity
          ? index === 0
            ? `Up to LKR ${upTo.toLocaleString('en-LK')}`
            : `Above LKR ${prevUpTo?.toLocaleString('en-LK') ?? ''}`
          : `Above LKR ${prevUpTo?.toLocaleString('en-LK') ?? ''}`),
    };
  });
}

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

export function getSlabIndex(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  for (let i = 0; i < slabs.length; i++) {
    if (monthlyBase <= slabs[i].upTo) return i;
  }
  return slabs.length - 1;
}

export function getEffectiveRate(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  return slabs[getSlabIndex(monthlyBase, slabs)].rate;
}

export function buildSlabInfo(
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): SlabInfo {
  const slabIndex = getSlabIndex(monthlyBase, slabs);
  return {
    monthlyBase,
    effectiveRate: slabs[slabIndex].rate,
    slabIndex,
  };
}

export function computePlatformCommission(
  subtotal: number,
  monthlyBase: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): number {
  return subtotal * getEffectiveRate(monthlyBase, slabs);
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

export function slabRangeLabel(
  index: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): string {
  return slabs[index]?.label ?? '';
}

export function getNextTierProgress(
  monthlyBase: number,
  slabIndex: number,
  slabs: readonly CommissionSlab[] = DEFAULT_COMMISSION_SLABS,
): {
  remaining: number;
  progressPercent: number;
  nextTierNumber: number;
  nextRate: number;
} | null {
  const ceiling = slabs[slabIndex]?.upTo;
  if (ceiling == null || ceiling === Infinity) return null;

  const floor = slabIndex === 0 ? 0 : slabs[slabIndex - 1]!.upTo;
  const nextSlab = slabs[slabIndex + 1];
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
