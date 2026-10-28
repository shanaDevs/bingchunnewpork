/**
 * Promotion discount calculation and shared cost-split helpers.
 */

import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export interface PromoCartLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  categoryName?: string;
}

export interface PromotionCostSplit {
  branchSharePct: number;
  platformSharePct: number;
  branchShareAmount: number;
  platformShareAmount: number;
  offerDetails: Record<string, unknown>;
}

export function computePromoDiscount(
  discountType: string,
  discountValue: number,
  subtotal: number,
): number {
  const cap = Math.max(0, Math.floor(subtotal));
  if (cap <= 0 || discountValue <= 0) return 0;
  if (discountType.toUpperCase() === 'PERCENTAGE') {
    return Math.min(cap, Math.floor((cap * discountValue) / 100));
  }
  return Math.min(cap, Math.floor(discountValue));
}

function getPromotedProductIds(rules: unknown): Set<string> {
  const ids = new Set<string>();
  if (!rules || typeof rules !== 'object') return ids;
  const r = rules as Record<string, unknown>;

  for (const key of ['selectedProducts', 'comboProducts'] as const) {
    const arr = r[key];
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (p && typeof p === 'object' && 'id' in p) {
          ids.add(String((p as { id: string }).id));
        }
      }
    }
  }

  const gift = r.giftProduct;
  if (gift && typeof gift === 'object' && 'id' in gift) {
    ids.add(String((gift as { id: string }).id));
  }

  if (r.productId) ids.add(String(r.productId));
  if (r.giftProductId) ids.add(String(r.giftProductId));

  return ids;
}

/** null / [] / undefined storeIds means all branches. */
export function isPromoAvailableAtStore(storeIds: unknown, storeId: string): boolean {
  let ids = storeIds;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      return true;
    }
  }
  if (!ids) return true;
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return ids.some((id) => String(id) === storeId);
}

export function resolveSharePercentages(
  ownership: string | null | undefined,
  branchSharePct?: number | null,
  platformSharePct?: number | null,
): { branchSharePct: number; platformSharePct: number } {
  if (ownership === 'BRANCH') return { branchSharePct: 100, platformSharePct: 0 };
  if (ownership === 'PLATFORM') return { branchSharePct: 0, platformSharePct: 100 };
  if (ownership === 'SHARED') {
    const branch = branchSharePct ?? 50;
    const platform = platformSharePct ?? 100 - branch;
    return { branchSharePct: branch, platformSharePct: platform };
  }
  return { branchSharePct: 0, platformSharePct: 100 };
}

export type BranchShareSplit = { branchSharePct: number; platformSharePct: number };

export function parseBranchShareSplits(raw: unknown): Record<string, BranchShareSplit> {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out: Record<string, BranchShareSplit> = {};
  for (const [storeId, value] of Object.entries(source as Record<string, unknown>)) {
    if (!storeId || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    const branch = Number(rec.branchSharePct);
    const platform = Number(rec.platformSharePct);
    if (!Number.isFinite(branch) || !Number.isFinite(platform)) continue;
    out[storeId] = { branchSharePct: Math.round(branch), platformSharePct: Math.round(platform) };
  }
  return out;
}

/** Shared + selected stores: use that store's split; otherwise the promo-level pair. */
export function resolveSharePercentagesForStore(
  ownership: string | null | undefined,
  storeId: string | undefined,
  branchSharePct?: number | null,
  platformSharePct?: number | null,
  branchShareSplits?: unknown,
): { branchSharePct: number; platformSharePct: number } {
  if (ownership === 'SHARED' && storeId) {
    const perStore = parseBranchShareSplits(branchShareSplits)[storeId];
    if (perStore) {
      return resolveSharePercentages('SHARED', perStore.branchSharePct, perStore.platformSharePct);
    }
  }
  return resolveSharePercentages(ownership, branchSharePct, platformSharePct);
}

export function normalizeBranchShareSplits(
  ownership: string | null | undefined,
  storeIds: string[] | null | undefined,
  splits: unknown,
): Record<string, BranchShareSplit> | null {
  if (ownership !== 'SHARED') return null;
  const parsed = parseBranchShareSplits(splits);
  if (Object.keys(parsed).length === 0) return null;

  // Selected branches: keep only those store IDs. All branches: keep every valid split entry.
  if (storeIds && storeIds.length > 0) {
    const out: Record<string, BranchShareSplit> = {};
    for (const id of storeIds) {
      if (parsed[id]) out[id] = parsed[id];
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  return parsed;
}

export function validateSelectedBranchShareSplits(
  ownership: string | null | undefined,
  storeIds: string[] | null | undefined,
  splits: unknown,
): string | null {
  if (ownership !== 'SHARED') return null;
  const parsed = parseBranchShareSplits(splits);
  const ids =
    storeIds && storeIds.length > 0
      ? storeIds
      : Object.keys(parsed);
  if (ids.length === 0) return null;
  for (const id of ids) {
    const split = parsed[id];
    const err = validateSharedPromotionShares('SHARED', split?.branchSharePct, split?.platformSharePct);
    if (err) {
      return storeIds && storeIds.length > 0
        ? 'Set a valid cost split (totalling 100%) for every selected branch'
        : 'Set a valid cost split (totalling 100%) for every branch with a custom share';
    }
  }
  return null;
}

export function computePromotionCostSplit(params: {
  ownership: string | null | undefined;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
  totalDiscount: number;
  subtotal: number;
  cartItems: PromoCartLine[];
  promotionRules?: unknown;
  promotionKind?: string | null;
}): PromotionCostSplit {
  const { totalDiscount, subtotal, cartItems, promotionRules, promotionKind } = params;
  const { branchSharePct, platformSharePct } = resolveSharePercentages(
    params.ownership,
    params.branchSharePct,
    params.platformSharePct,
  );

  const branchShareAmount = Math.floor((totalDiscount * branchSharePct) / 100);
  const platformShareAmount = totalDiscount - branchShareAmount;

  const productIds = getPromotedProductIds(promotionRules);
  const ownership = params.ownership ?? 'PLATFORM';

  const offerDetails: Record<string, unknown> = {
    promotionKind,
    ownership,
    branchSharePct,
    platformSharePct,
    totalDiscount,
  };

  if (productIds.size > 0 && cartItems.length > 0) {
    const affectedLines = cartItems.filter((l) => productIds.has(l.productId));
    const affectedSubtotal = affectedLines.reduce((sum, l) => sum + l.lineTotal, 0);

    offerDetails.scope = 'product';
    offerDetails.affectedSubtotal = affectedSubtotal;
    offerDetails.lines = affectedLines.map((line) => {
      const lineDiscount =
        affectedSubtotal > 0 ? Math.floor((totalDiscount * line.lineTotal) / affectedSubtotal) : 0;
      const lineBranch = Math.floor((lineDiscount * branchSharePct) / 100);
      return {
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        discountAmount: lineDiscount,
        branchShareAmount: lineBranch,
        platformShareAmount: lineDiscount - lineBranch,
      };
    });
  } else {
    offerDetails.scope = 'order';
  }

  return {
    branchSharePct,
    platformSharePct,
    branchShareAmount,
    platformShareAmount,
    offerDetails,
  };
}

export function validateSharedPromotionShares(
  ownership: string | undefined | null,
  branchSharePct?: number | null,
  platformSharePct?: number | null,
): string | null {
  if (ownership !== 'SHARED') return null;
  if (branchSharePct == null || platformSharePct == null) {
    return 'Shared promotions require branch and platform percentages';
  }
  if (branchSharePct < 0 || branchSharePct > 100 || platformSharePct < 0 || platformSharePct > 100) {
    return 'Percentages must be between 0 and 100';
  }
  if (branchSharePct + platformSharePct !== 100) {
    return 'Branch and platform percentages must total 100%';
  }
  return null;
}

export interface PromoUsageLimitsJson {
  maxTotal?: number;
  maxPerCustomer?: number;
  maxPerDay?: number;
  stock?: number;
}

export function parsePromoUsageLimits(usageLimits: unknown): PromoUsageLimitsJson {
  if (!usageLimits || typeof usageLimits !== 'object') return {};
  return usageLimits as PromoUsageLimitsJson;
}

/** Throws if redemption caps (total uses or stock) are exhausted. */
export function assertPromoRedemptionAllowed(promo: {
  usedCount: number;
  maxUses?: number | null;
  usageLimits?: unknown;
}): void {
  const limits = parsePromoUsageLimits(promo.usageLimits);
  const totalCap = limits.maxTotal ?? promo.maxUses ?? undefined;
  if (totalCap != null && promo.usedCount >= totalCap) {
    throw new AppError('Promo code usage limit reached', 400);
  }
  if (limits.stock != null && promo.usedCount >= limits.stock) {
    throw new AppError('This offer is out of stock', 400);
  }
}

export interface AppliedPromoSnapshot {
  id: string;
  code: string;
  ownership: string | null;
  contributionSource?: string | null;
  branchSharePct?: number | null;
  platformSharePct?: number | null;
  promotionKind?: string | null;
  promotionRules?: unknown;
  discountType: string;
  discountValue: number;
}

/** Positive gift/product costs only; 0, null, and undefined are ignored. */
export function positiveCost(value: number | null | undefined): number | undefined {
  return value != null && value > 0 ? value : undefined;
}

export function contributionSourceForOwnership(
  ownership: string | null | undefined,
  contributionSource?: string | null,
): string | null {
  return (ownership ?? 'PLATFORM') === 'SHARED'
    ? (contributionSource ?? 'JASON')
    : null;
}

export function resolveUsageOrderDiscount(
  orderDiscount: number,
  giftCostOverride?: number,
): number {
  return positiveCost(giftCostOverride) ?? orderDiscount;
}

export interface RecordPromotionUsageInput {
  orderId: string;
  storeId: string;
  userId?: string | null;
  subtotal: number;
  deliveryFee?: number;
  orderDiscount: number;
  /** When set (e.g. free gift item cost), used for wallet totalDiscountAmount instead of orderDiscount. */
  giftCostOverride?: number;
  promo: AppliedPromoSnapshot;
  cartItems: PromoCartLine[];
  storePaybackEnabled?: boolean;
}

/** Build usage payload for any promotion ownership (branch, platform, or shared). */
export function buildPromotionUsageRecord(input: RecordPromotionUsageInput) {
  const { promo, subtotal, orderDiscount, deliveryFee = 0, cartItems } = input;

  const deliveryKinds = new Set(['FREE_DELIVERY', 'REDUCED_DELIVERY']);
  const deliveryFeeSaved =
    deliveryKinds.has(promo.promotionKind ?? '') ||
    promo.code.toUpperCase().includes('DELIVERY')
      ? deliveryFee
      : 0;

  const effectiveOrderDiscount = resolveUsageOrderDiscount(orderDiscount, input.giftCostOverride);
  const totalBenefit = effectiveOrderDiscount + deliveryFeeSaved;

  const split = computePromotionCostSplit({
    ownership: promo.ownership,
    branchSharePct: promo.branchSharePct,
    platformSharePct: promo.platformSharePct,
    totalDiscount: totalBenefit,
    subtotal,
    cartItems,
    promotionRules: promo.promotionRules,
    promotionKind: promo.promotionKind,
  });

  const isPlatformFunded = (promo.ownership ?? 'PLATFORM') === 'PLATFORM';
  const platformPaybackEligible = isPlatformFunded && Boolean(input.storePaybackEnabled);
  const platformPaybackAmount = platformPaybackEligible ? split.platformShareAmount : 0;

  return {
    orderId: input.orderId,
    promoCodeId: promo.id.startsWith('loyalty-') ? null : promo.id,
    promoCode: promo.code,
    storeId: input.storeId,
    userId: input.userId ?? null,
    ownership: promo.ownership ?? 'PLATFORM',
    contributionSource: contributionSourceForOwnership(promo.ownership, promo.contributionSource),
    branchSharePct: split.branchSharePct,
    platformSharePct: split.platformSharePct,
    promotionKind: promo.promotionKind ?? null,
    promotionRules:
      promo.promotionRules === undefined
        ? undefined
        : (promo.promotionRules as Prisma.InputJsonValue),
    orderSubtotal: subtotal,
    totalDiscountAmount: totalBenefit,
    branchShareAmount: split.branchShareAmount,
    platformShareAmount: split.platformShareAmount,
    platformPaybackEligible,
    platformPaybackAmount,
    offerDetails: {
      ...split.offerDetails,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      orderDiscount,
      deliveryFee,
      deliveryFeeSaved,
    } as Prisma.InputJsonValue,
  };
}
