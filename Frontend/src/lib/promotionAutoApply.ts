import type { SpinEligibility } from '@/lib/spinEligibility';

/** Kinds that auto-apply in cup/checkout without typing a code. */
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

export function isWelcomeFirstOrderPromo(promo: {
  promotionKind?: string | null;
  code?: string;
}): boolean {
  const kind = (promo.promotionKind || '').toUpperCase();
  if (kind === 'WELCOME' || kind === 'FIRST_ORDER' || kind === 'LOYALTY_OFFER_1') return true;
  const code = (promo.code || '').toUpperCase();
  return code === 'WELCOME10' || code.startsWith('WELCOME') || code === 'LOYALTY-OFFER1';
}

/** Loyalty campaign Offer 1 (first order) or Offer 2 (follow-up gift/discount). */
export function isLoyaltyCampaignOffer(
  promo:
    | {
        promotionKind?: string | null;
        code?: string;
      }
    | null
    | undefined,
): boolean {
  if (!promo) return false;
  if (isWelcomeFirstOrderPromo(promo)) return true;
  const kind = (promo.promotionKind || '').toUpperCase();
  if (kind === 'LOYALTY_OFFER_2' || kind === 'LOYALTY_OFFER_2_GIFT') return true;
  const code = (promo.code || '').toUpperCase();
  return code === 'LOYALTY-OFFER2';
}

export function isAutoApplyPromo(promo: {
  promotionKind?: string | null;
  code?: string;
  discountType?: string | null;
}): boolean {
  if (isAutoApplyPromoKind(promo.promotionKind) || isLoyaltyCampaignOffer(promo)) return true;
  if (promo.promotionKind) return false;
  const type = (promo.discountType || '').toUpperCase();
  return type === 'PERCENTAGE' || type === 'FIXED';
}

/** BOGO / BXGY / gift-with-purchase — auto-apply before generic discounts at checkout. */
export const FREE_PRODUCT_PROMO_KINDS = new Set(['BOGO', 'BXGY', 'GIFT_ITEM']);

export function isFreeProductPromoKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return FREE_PRODUCT_PROMO_KINDS.has(kind.toUpperCase());
}

export function isFreeProductPromoOffer(offer: Pick<EligiblePromoOffer, 'promotionKind' | 'giftProduct'>): boolean {
  if (isFreeProductPromoKind(offer.promotionKind)) return true;
  return Boolean(offer.giftProduct?.id);
}

function isAllowedAutoApplyOffer(
  offer: EligiblePromoOffer,
  opts: { dismissed: Set<string>; isAuthenticated: boolean },
): boolean {
  if (!offer.autoApply) return false;
  if (opts.dismissed.has(offer.code.toUpperCase())) return false;
  if (isLoyaltyCampaignOffer(offer) && !opts.isAuthenticated) return false;
  return true;
}

/**
 * Signed-in loyalty campaign offer (1st-order or 2nd-order) — always auto-applies
 * even when other deals exist.
 */
export function pickLoyaltyCampaignAutoApply(
  offers: EligiblePromoOffer[],
  opts: { dismissedCodes: Iterable<string>; isAuthenticated: boolean },
): EligiblePromoOffer | null {
  if (!opts.isAuthenticated) return null;
  const dismissed = new Set([...opts.dismissedCodes].map((code) => code.toUpperCase()));
  return (
    offers.find(
      (offer) => isLoyaltyCampaignOffer(offer) && isAllowedAutoApplyOffer(offer, { dismissed, isAuthenticated: true }),
    ) ?? null
  );
}

/** @deprecated prefer pickLoyaltyCampaignAutoApply */
export function pickFirstOrderAutoApply(
  offers: EligiblePromoOffer[],
  opts: { dismissedCodes: Iterable<string>; isAuthenticated: boolean },
): EligiblePromoOffer | null {
  return pickLoyaltyCampaignAutoApply(offers, opts);
}

/**
 * BOGO / BXGY / gift item — always preferred when the cup qualifies.
 * Honors dismissedCodes so an explicit "turn off" stays off. Quiet clears
 * (qty drop / empty cart) use clearReward and never add the code, so B1G1
 * still re-applies when the qualifying product is added again.
 */
export function pickFreeProductAutoApply(
  offers: EligiblePromoOffer[],
  opts: { dismissedCodes?: Iterable<string>; isAuthenticated: boolean },
): EligiblePromoOffer | null {
  const dismissed = new Set([...(opts.dismissedCodes ?? [])].map((code) => code.toUpperCase()));
  return (
    offers.find((offer) => {
      if (!isFreeProductPromoOffer(offer)) return false;
      if (!offer.autoApply) return false;
      if (dismissed.has(offer.code.toUpperCase())) return false;
      if (isLoyaltyCampaignOffer(offer) && !opts.isAuthenticated) return false;
      return true;
    }) ?? null
  );
}

/** First auto-apply offer that is still allowed after the shopper dismissed codes. */
export function pickAutoApplyCandidate(
  offers: EligiblePromoOffer[],
  opts: { dismissedCodes: Iterable<string>; isAuthenticated: boolean; paused?: boolean },
): EligiblePromoOffer | null {
  const loyalty = pickLoyaltyCampaignAutoApply(offers, opts);
  if (loyalty) return loyalty;
  // Free product (B1G1) always wins when eligible — even if other auto-apply is paused.
  const freeProduct = pickFreeProductAutoApply(offers, opts);
  if (freeProduct) return freeProduct;
  if (opts.paused) return null;
  const dismissed = new Set([...opts.dismissedCodes].map((code) => code.toUpperCase()));
  return (
    offers.find((offer) => isAllowedAutoApplyOffer(offer, { dismissed, isAuthenticated: opts.isAuthenticated })) ?? null
  );
}

export interface EligiblePromoOffer {
  code: string;
  title?: string | null;
  description?: string | null;
  discount: number;
  freeDelivery: boolean;
  discountType?: string | null;
  discountValue?: number | null;
  promotionKind?: string | null;
  autoApply: boolean;
  hideCode: boolean;
  label: string;
  giftLabel?: string | null;
  giftProduct?: {
    id: string;
    name: string;
    basePrice: number;
    imageUrl?: string | null;
  } | null;
  /** Backend asks the cart to add free BOGO/BXGY units before the discount unlocks. */
  cartBoost?: { productId: string; addQty: number } | null;
}

export interface EligiblePromosResponse {
  offers: EligiblePromoOffer[];
  autoApplyOffers: EligiblePromoOffer[];
  suggested: EligiblePromoOffer | null;
  loyaltySpin?: SpinEligibility['loyaltySpin'];
}

export function formatEligibleOfferBenefit(offer: EligiblePromoOffer): string {
  if (offer.giftProduct?.name) return `Free ${offer.giftProduct.name}`;
  if (offer.giftLabel) return offer.giftLabel;
  if (offer.freeDelivery) return 'Free delivery';
  if (isFreeProductPromoKind(offer.promotionKind)) {
    if (offer.cartBoost && offer.cartBoost.addQty > 0) return 'Buy 1 Get 1 free';
    if (offer.discount > 0) return `Save LKR ${offer.discount.toLocaleString()}`;
    return 'Buy 1 Get 1';
  }
  if (offer.discount > 0) return `Save LKR ${offer.discount.toLocaleString()}`;
  return offer.label || offer.title || 'Special offer';
}

export function rewardToEligibleOffer(reward: {
  code: string;
  discount: number;
  freeDelivery: boolean;
  giftLabel?: string | null;
  giftProduct?: EligiblePromoOffer['giftProduct'];
  label: string;
  promotionKind?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  hideCode?: boolean;
}): EligiblePromoOffer {
  const title = reward.giftLabel || reward.label;
  return {
    code: reward.code,
    title,
    description: reward.giftLabel && reward.giftLabel !== reward.label ? reward.label : null,
    discount: reward.discount,
    freeDelivery: reward.freeDelivery,
    discountType: reward.discountType,
    discountValue: reward.discountValue,
    promotionKind: reward.promotionKind,
    autoApply: false,
    hideCode: Boolean(reward.hideCode),
    label: title,
    giftLabel: reward.giftLabel ?? null,
    giftProduct: reward.giftProduct ?? null,
  };
}
