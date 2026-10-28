import type { PromoCode } from '@/types';
import {
  formatPromotionBenefit,
  isBannerPromotion,
  isSpinLinkedPromo,
  promotionKindRequiresCode,
  type PromotionKind,
  type PromotionRules,
} from '@/lib/promotionTypes';
import { extractGiftFromPromotionRules, type PromoGiftProduct } from '@/lib/promoGift';

export type OfferTone = 'blue' | 'cream' | 'green';

export interface HomeOffer {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  image: string;
  tone: OfferTone;
  href: string;
  productIds: string[];
  giftProduct?: PromoGiftProduct | null;
  promotionKind?: string;
  requiresPromoCode?: boolean;
  isDirectOffer?: boolean;
  /** BOGO / BXGY: units to add so the offer can validate. */
  buyQty?: number;
  getQty?: number;
}

export interface PromoDisplay {
  code: string;
  title: string;
  subtitle: string;
  image: string;
  tone: OfferTone;
  minOrderValue: number;
  expiresAt?: string;
  promotionKind?: string;
  displayPrice?: number;
  ctaLabel?: string;
  productHref?: string;
  isBanner?: boolean;
  isDirectOffer?: boolean;
  requiresPromoCode?: boolean;
  isSpinOffer?: boolean;
}

const TONES: OfferTone[] = ['blue', 'cream', 'green'];

export const OFFER_IMAGES: Record<OfferTone, string> = {
  blue: '/promos/promo-offer-bingchun50-removebg-preview.png',
  cream: '/promos/promo-offer-boba100-v2.png',
  green: '/promos/promo-offer-free-delivery-removebg-preview.png',
};

const FALLBACK_OFFERS: HomeOffer[] = [
  {
    id: 'bingchun50',
    code: 'BINGCHUN50',
    title: 'LKR 50 OFF',
    subtitle: 'orders above LKR 800',
    image: OFFER_IMAGES.blue,
    tone: 'blue',
    href: '/promotions',
    productIds: [],
  },
  {
    id: 'boba100',
    code: 'BOBA100',
    title: 'LKR 100 OFF',
    subtitle: 'on boba orders',
    image: OFFER_IMAGES.cream,
    tone: 'cream',
    href: '/promotions',
    productIds: [],
  },
  {
    id: 'free-delivery',
    code: 'FREEDELIVERY',
    title: 'FREE DELIVERY',
    subtitle: 'on orders above LKR 1,000',
    image: OFFER_IMAGES.green,
    tone: 'green',
    href: '/promotions',
    productIds: [],
  },
];

export function formatDiscountTitle(promo: PromoCode): string {
  const type = promo.discountType?.toUpperCase() ?? '';
  const kind = (promo.promotionKind || '').toUpperCase() as PromotionKind | '';
  const code = promo.code.toUpperCase();
  const rules = (promo.promotionRules ?? {}) as PromotionRules;

  if (kind === 'FREE_DELIVERY' || type === 'DELIVERY' || code.includes('FREEDELIVERY') || code.includes('DELIVERY')) {
    return 'FREE DELIVERY';
  }

  // BOGO is stored as FIXED/1 for accounting — never show "LKR 1 OFF".
  if (kind === 'BOGO' || kind === 'BXGY' || kind === 'GIFT_ITEM' || kind === 'COMBO_OFFER') {
    const titled = promo.title?.trim();
    if (titled) return titled;
    return formatPromotionBenefit(kind, rules, promo.discountValue);
  }

  const titled = promo.title?.trim();
  if (titled && kind && !promotionKindRequiresCode(kind)) return titled;

  if (type.includes('PERCENT')) return `${promo.discountValue}% OFF`;
  return `LKR ${promo.discountValue.toLocaleString()} OFF`;
}

export function formatDiscountSubtitle(promo: PromoCode): string {
  if (promo.description?.trim()) return promo.description.trim();
  if (promo.minOrderValue > 0) {
    return `orders above LKR ${promo.minOrderValue.toLocaleString()}`;
  }
  return 'limited time offer';
}

export function toneForPromo(promo: PromoCode, index = 0): OfferTone {
  const code = promo.code.toUpperCase();
  if (code.includes('BOBA')) return 'cream';
  if (code.includes('DELIVERY') || code.includes('FREE')) return 'green';
  if (code.includes('BINGCHUN50') || code.includes('50')) return 'blue';
  return TONES[index % TONES.length];
}

export function imageForPromo(promo: PromoCode, tone: OfferTone): string {
  const code = promo.code.toUpperCase();
  if (code.includes('BOBA')) return OFFER_IMAGES.cream;
  if (code.includes('DELIVERY') || code.includes('FREE')) return OFFER_IMAGES.green;
  if (code.includes('BINGCHUN50') || code.includes('50')) return OFFER_IMAGES.blue;
  return OFFER_IMAGES[tone];
}

export function mapPromoToDisplay(promo: PromoCode, index = 0): PromoDisplay {
  const tone = toneForPromo(promo, index);
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const isBanner = isBannerPromotion(promo.promotionKind);
  const isSpinOffer = isSpinLinkedPromo(promo);
  const requiresCode = promo.promotionKind
    ? promotionKindRequiresCode(promo.promotionKind as PromotionKind)
    : true;
  const product =
    rules.selectedProducts?.[0] ??
    rules.comboProducts?.[0] ??
    (rules.giftProduct ? rules.giftProduct : undefined);

  if (isSpinOffer) {
    return {
      code: promo.code.toUpperCase(),
      title: promo.title?.trim() || formatDiscountTitle(promo),
      subtitle: promo.description?.trim() || formatDiscountSubtitle(promo),
      image: product?.imageUrl || imageForPromo(promo, tone),
      tone,
      minOrderValue: promo.minOrderValue ?? 0,
      expiresAt: promo.expiresAt,
      promotionKind: promo.promotionKind,
      ctaLabel: 'Spin to win',
      isBanner: false,
      isDirectOffer: false,
      requiresPromoCode: false,
      isSpinOffer: true,
    };
  }

  if (isBanner) {
    return {
      code: promo.code.toUpperCase(),
      title: promo.title?.trim() || formatDiscountTitle(promo),
      subtitle: promo.description?.trim() || '',
      image: rules.bannerImageUrl || imageForPromo(promo, tone),
      tone,
      minOrderValue: promo.minOrderValue ?? 0,
      expiresAt: promo.expiresAt,
      promotionKind: promo.promotionKind,
      displayPrice: rules.displayPrice,
      ctaLabel: rules.ctaLabel || 'Add to Bucket',
      productHref: product?.id ? `/product/${product.id}` : undefined,
      isBanner: true,
      isDirectOffer: false,
      requiresPromoCode: false,
    };
  }

  if (!requiresCode) {
    return {
      code: promo.code.toUpperCase(),
      title: promo.title?.trim() || formatDiscountTitle(promo),
      subtitle: promo.description?.trim() || formatDiscountSubtitle(promo),
      image: product?.imageUrl || imageForPromo(promo, tone),
      tone,
      minOrderValue: promo.minOrderValue ?? 0,
      expiresAt: promo.expiresAt,
      promotionKind: promo.promotionKind,
      ctaLabel: 'Add to Cup',
      productHref: product?.id ? `/product/${product.id}` : '/menu',
      isBanner: false,
      isDirectOffer: true,
      requiresPromoCode: false,
    };
  }

  return {
    code: promo.code.toUpperCase(),
    title: promo.title?.trim() || formatDiscountTitle(promo),
    subtitle: promo.description?.trim() || formatDiscountSubtitle(promo),
    image: imageForPromo(promo, tone),
    tone,
    minOrderValue: promo.minOrderValue ?? 0,
    expiresAt: promo.expiresAt,
    promotionKind: promo.promotionKind,
    isBanner: false,
    isDirectOffer: false,
    requiresPromoCode: true,
  };
}

function productIdsFromPromo(promo: PromoCode): string[] {
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const giftId = extractGiftFromPromotionRules(rules).giftProduct?.id;
  const ids = [
    ...(rules.selectedProducts ?? []).map((product) => product.id),
    ...(rules.comboProducts ?? []).map((product) => product.id),
    rules.productId,
  ].filter((id): id is string => Boolean(id) && id !== giftId);
  return [...new Set(ids)];
}

export function mapPromosToHomeOffers(promos: PromoCode[], href = '/promotions'): HomeOffer[] {
  // Only real API codes — never invent hardcoded codes that fail at checkout.
  // Spin-wheel prizes are listed on the promotions page, not copied as checkout codes.
  return promos.filter((promo) => !isSpinLinkedPromo(promo)).map((promo, index) => {
    const tone = toneForPromo(promo, index);
    const kind = promo.promotionKind;
    const rules = (promo.promotionRules ?? {}) as PromotionRules;
    const requiresCode = kind ? promotionKindRequiresCode(kind as PromotionKind) : true;
    const productIds = productIdsFromPromo(promo);
    const imageFromRules =
      rules.selectedProducts?.[0]?.imageUrl ||
      rules.comboProducts?.[0]?.imageUrl ||
      rules.giftProduct?.imageUrl ||
      rules.bannerImageUrl;
    return {
      id: promo.code,
      code: promo.code.toUpperCase(),
      title: formatDiscountTitle(promo),
      subtitle: formatDiscountSubtitle(promo),
      image: imageFromRules || imageForPromo(promo, tone),
      tone,
      href,
      productIds,
      giftProduct: extractGiftFromPromotionRules(rules).giftProduct,
      promotionKind: kind,
      requiresPromoCode: requiresCode,
      isDirectOffer: !requiresCode,
      buyQty: typeof rules.buyQty === 'number' ? rules.buyQty : undefined,
      getQty: typeof rules.getQty === 'number' ? rules.getQty : undefined,
    };
  });
}

export function mapPromosToDisplays(promos: PromoCode[]): PromoDisplay[] {
  // Only real API codes — never invent hardcoded codes that fail at checkout.
  return promos.map((promo, index) => mapPromoToDisplay(promo, index));
}

export function getFallbackHomeOffers(): HomeOffer[] {
  return FALLBACK_OFFERS;
}
