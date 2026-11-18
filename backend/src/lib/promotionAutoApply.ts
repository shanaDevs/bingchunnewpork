import { AppError } from '../middleware/errorHandler';
import { assertCustomerPromoEligibility, isFirstOrderPromoKind, isReferralPromoKind, isWelcomeFirstOrderOffer } from './referral';
import { assertPromoRedemptionAllowed } from './promotionUsage';
import type { PromoCartLine } from './promotionUsage';
import { evaluatePromoAgainstCart, resolvePromoGiftDisplay } from './promotionCartEligibility';

/** Kinds that auto-apply in cart/checkout without typing a code. */
export const AUTO_APPLY_PROMO_KINDS = new Set([
  'WELCOME',
  'FIRST_ORDER',
  'LOYALTY_OFFER_1',
  'LOYALTY_OFFER_2',
  'LOYALTY_OFFER_2_GIFT',
  'REFERRAL',
  'BOGO',
  'BXGY',
  'GIFT_ITEM',
  'FREE_DELIVERY',
  'REDUCED_DELIVERY',
  'WEEKEND',
  'TIME_SLOT',
  'HAPPY_HOUR',
  'EVERY_FRIDAY',
  'BIRTHDAY',
  'SEASONAL',
  'MIN_ORDER',
  'SPEND_OVER',
  'PERCENTAGE_DISCOUNT',
  'FIXED_DISCOUNT',
  'BULK_ORDER',
  'CATEGORY_OFF',
  'COMBO_OFFER',
  'NEW_PRODUCT',
]);

export function isAutoApplyPromoKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return AUTO_APPLY_PROMO_KINDS.has(kind.toUpperCase());
}

/** @deprecated prefer isWelcomeFirstOrderOffer from referral — kept for local helpers */
export function isWelcomeFirstOrderPromo(promo: {
  promotionKind?: string | null;
  code?: string;
}): boolean {
  return isWelcomeFirstOrderOffer(promo);
}

export function isAutoApplyPromo(promo: {
  promotionKind?: string | null;
  code?: string;
  discountType?: string | null;
}): boolean {
  if (isAutoApplyPromoKind(promo.promotionKind) || isWelcomeFirstOrderOffer(promo)) return true;
  if (promo.promotionKind) return false;
  const type = (promo.discountType || '').toUpperCase();
  return type === 'PERCENTAGE' || type === 'FIXED';
}

/** BOGO / BXGY / gift-with-purchase — should auto-apply before generic discounts. */
export const FREE_PRODUCT_PROMO_KINDS = new Set(['BOGO', 'BXGY', 'GIFT_ITEM']);

export function isFreeProductPromoKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return FREE_PRODUCT_PROMO_KINDS.has(kind.toUpperCase());
}

export type AutoApplyOfferRankInput = {
  promotionKind?: string | null;
  freeDelivery?: boolean;
  discount?: number;
  giftProduct?: { id: string } | null;
  loyaltyOffer?: boolean;
  code?: string;
};

export function isFreeProductPromoOffer(offer: AutoApplyOfferRankInput): boolean {
  if (isFreeProductPromoKind(offer.promotionKind)) return true;
  return Boolean(offer.giftProduct?.id);
}

function autoApplyOfferRank(offer: AutoApplyOfferRankInput): number {
  if (offer.loyaltyOffer) return 40;
  if (isFreeProductPromoOffer(offer)) return 30;
  if (isWelcomeFirstOrderPromo(offer)) return 20;
  if (offer.freeDelivery) return 10;
  return 0;
}

/** Rank auto-apply candidates: loyalty → free product → welcome → delivery → discount amount. */
export function compareAutoApplyOffers(a: AutoApplyOfferRankInput, b: AutoApplyOfferRankInput): number {
  const rankDiff = autoApplyOfferRank(b) - autoApplyOfferRank(a);
  if (rankDiff !== 0) return rankDiff;
  return (b.discount ?? 0) - (a.discount ?? 0);
}

function isFreeDeliveryPromo(promo: {
  code: string;
  discountType: string;
  promotionKind?: string | null;
}): boolean {
  const kind = (promo.promotionKind || '').toUpperCase();
  const type = (promo.discountType || '').toUpperCase();
  const code = (promo.code || '').toUpperCase();
  return (
    kind === 'FREE_DELIVERY' ||
    kind === 'REDUCED_DELIVERY' ||
    kind === 'DELIVERY_ZONE' ||
    type === 'DELIVERY' ||
    type === 'FREE_DELIVERY' ||
    code === 'FREEDELIVERY' ||
    code.includes('FREEDELIVERY') ||
    code.includes('FREE-DELIVERY')
  );
}

function parseRules(rules: unknown): Record<string, unknown> {
  if (!rules || typeof rules !== 'object') return {};
  return rules as Record<string, unknown>;
}

/** Basic date/time window checks for schedule-based kinds. */
export function passesScheduleRules(
  kind: string | null | undefined,
  rules: unknown,
  now = new Date(),
): boolean {
  const k = (kind || '').toUpperCase();
  const r = parseRules(rules);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = dayNames[now.getDay()];
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const current = `${hh}:${mm}`;

  const days = Array.isArray(r.daysOfWeek) ? (r.daysOfWeek as string[]) : null;
  const timeStart = typeof r.timeStart === 'string' ? r.timeStart : null;
  const timeEnd = typeof r.timeEnd === 'string' ? r.timeEnd : null;

  if (k === 'WEEKEND') {
    return day === 'Sat' || day === 'Sun';
  }
  if (k === 'EVERY_FRIDAY') {
    return day === 'Fri';
  }
  if (days && days.length > 0 && !days.includes(day)) {
    return false;
  }
  if ((k === 'HAPPY_HOUR' || k === 'TIME_SLOT') && timeStart && timeEnd) {
    if (timeStart <= timeEnd) {
      return current >= timeStart && current <= timeEnd;
    }
    // Overnight window
    return current >= timeStart || current <= timeEnd;
  }
  if (timeStart && timeEnd) {
    if (timeStart <= timeEnd) {
      return current >= timeStart && current <= timeEnd;
    }
    return current >= timeStart || current <= timeEnd;
  }
  return true;
}

export function computeEligibleDiscount(params: {
  discountType: string;
  discountValue: number;
  orderTotal: number;
  promotionKind?: string | null;
  code: string;
}): { discount: number; freeDelivery: boolean } {
  const freeDelivery = isFreeDeliveryPromo(params);
  if (freeDelivery) return { discount: 0, freeDelivery: true };
  const cap = Math.max(0, Math.floor(params.orderTotal));
  const discount =
    params.discountType.toUpperCase() === 'PERCENTAGE'
      ? Math.min(cap, Math.floor((cap * params.discountValue) / 100))
      : Math.min(cap, Math.floor(params.discountValue));
  return { discount: Math.max(0, discount), freeDelivery: false };
}

export type EligiblePromoCandidate = {
  code: string;
  title: string | null;
  description: string | null;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  promotionKind: string | null;
  promotionRules: unknown;
  usageLimits: unknown;
  usedCount: number;
  maxUses: number | null;
  id: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  deletedAt?: Date | null;
};

export async function evaluateEligiblePromo(
  promo: EligiblePromoCandidate,
  opts: {
    orderTotal: number;
    orderMode?: 'DELIVERY' | 'TAKEAWAY' | null;
    userId?: string | null;
    cartItems?: PromoCartLine[];
  },
): Promise<{
  code: string;
  title: string | null;
  description: string | null;
  discount: number;
  freeDelivery: boolean;
  discountType: string;
  discountValue: number;
  promotionKind: string | null;
  autoApply: boolean;
  hideCode: boolean;
  label: string;
  giftLabel: string | null;
  giftProduct: {
    id: string;
    name: string;
    basePrice: number;
    imageUrl?: string | null;
  } | null;
  cartBoost?: { productId: string; addQty: number } | null;
} | null> {
  if (!promo.isActive) return null;
  if (promo.deletedAt) return null;
  const now = new Date();
  if (promo.expiresAt && promo.expiresAt < now) return null;
  if (promo.startsAt && promo.startsAt > now) return null;
  if (opts.orderTotal < promo.minOrderValue) return null;
  if (!passesScheduleRules(promo.promotionKind, promo.promotionRules, now)) return null;

  try {
    assertPromoRedemptionAllowed(promo);
  } catch {
    return null;
  }

  const kind = (promo.promotionKind || '').toUpperCase();
  const treatAsFirstOrder = isWelcomeFirstOrderPromo(promo) || isFirstOrderPromoKind(kind);
  const eligibilityPromo = {
    ...promo,
    promotionKind: treatAsFirstOrder ? (promo.promotionKind || 'WELCOME') : promo.promotionKind,
    code: promo.code,
  };

  // Welcome / first-order never auto-applies for guests
  if (treatAsFirstOrder && !opts.userId) {
    return null;
  }

  if (treatAsFirstOrder || isReferralPromoKind(kind)) {
    try {
      await assertCustomerPromoEligibility({ promo: eligibilityPromo, userId: opts.userId });
    } catch (err) {
      if (err instanceof AppError && (err.statusCode === 401 || err.statusCode === 400)) {
        return null;
      }
      throw err;
    }
  } else {
    try {
      await assertCustomerPromoEligibility({ promo: { ...promo, code: promo.code }, userId: opts.userId });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) return null;
      if (err instanceof AppError && err.statusCode === 401) {
        return null;
      }
      throw err;
    }
  }

  const cartEval = evaluatePromoAgainstCart({
    promotionKind: promo.promotionKind,
    promotionRules: promo.promotionRules,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    orderTotal: opts.orderTotal,
    cartItems: opts.cartItems ?? [],
    orderMode: opts.orderMode,
    code: promo.code,
  });
  if (!cartEval.eligible) return null;

  const { discount, freeDelivery, cartBoost } = cartEval;

  if (freeDelivery && opts.orderMode === 'TAKEAWAY') return null;

  const autoApply = isAutoApplyPromo(promo);
  if (!autoApply && !freeDelivery && discount <= 0 && !cartBoost) return null;

  const gift = resolvePromoGiftDisplay(promo.promotionKind, promo.promotionRules);
  const freeProductOffer = isFreeProductPromoKind(promo.promotionKind);
  const label =
    gift.giftLabel ||
    promo.title ||
    promo.description ||
    (freeDelivery
      ? 'Free delivery'
      : freeProductOffer
        ? promo.title || promo.description || 'Buy 1 Get 1'
        : discount > 0
          ? `Save LKR ${discount}`
          : promo.code);

  return {
    code: promo.code,
    title: promo.title,
    description: promo.description,
    discount,
    freeDelivery,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    promotionKind: eligibilityPromo.promotionKind ?? promo.promotionKind,
    autoApply,
    hideCode: autoApply,
    label,
    giftLabel: gift.giftLabel,
    giftProduct: gift.giftProduct,
    cartBoost: cartBoost ?? null,
  };
}
