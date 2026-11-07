/** Primary promotion mechanic — drives rule fields & checkout behaviour */
export type PromotionKind =
  | 'PERCENTAGE_DISCOUNT'
  | 'FIXED_DISCOUNT'
  | 'BOGO'
  | 'BXGY'
  | 'GIFT_ITEM'
  | 'CATEGORY_OFF'
  | 'COMBO_OFFER'
  | 'NEW_PRODUCT'
  | 'FREE_DELIVERY'
  | 'REDUCED_DELIVERY'
  | 'DELIVERY_ZONE'
  | 'DELIVERY_DISTANCE'
  | 'MIN_ORDER'
  | 'SPEND_OVER'
  | 'BULK_ORDER'
  | 'HAPPY_HOUR'
  | 'WEEKEND'
  | 'TIME_SLOT'
  | 'EVERY_FRIDAY'
  | 'BIRTHDAY'
  | 'WELCOME'
  | 'REFERRAL'
  | 'WIN_BACK'
  | 'LOYALTY_TIER'
  | 'WALLET_OFFER'
  | 'BANK_OFFER'
  | 'CARD_OFFER'
  | 'SEASONAL'
  | 'CUSTOM'
  | 'UPLOAD_BANNER';

export interface PromotionTypeOption {
  kind: PromotionKind;
  label: string;
  description: string;
  criteriaKey: string;
  /** When false, customers use Add to Cup / direct ordering — no checkout code. */
  requiresPromoCode: boolean;
}

export interface PromotionTypeCategory {
  id: string;
  label: string;
  types: PromotionTypeOption[];
  /** When every type in the category skips checkout codes. */
  requiresPromoCode?: boolean;
}

export const PROMOTION_TYPE_CATEGORIES: PromotionTypeCategory[] = [
  {
    id: 'display',
    label: 'Display Based',
    requiresPromoCode: false,
    types: [
      { kind: 'UPLOAD_BANNER', label: 'Upload Banner', description: 'KFC-style card with banner image, title, price & order button', criteriaKey: 'display::Upload Banner', requiresPromoCode: false },
      { kind: 'CUSTOM', label: 'Custom', description: 'Fully custom offer — define your own benefit text and rules', criteriaKey: 'display::Custom Offer', requiresPromoCode: false },
    ],
  },
  {
    id: 'product',
    label: 'Product Based',
    requiresPromoCode: false,
    types: [
      { kind: 'BOGO', label: 'Buy 1 Get 1', description: 'Customer gets a free item when buying one', criteriaKey: 'product::Buy 1 Get 1', requiresPromoCode: false },
      { kind: 'BXGY', label: 'Buy X Get Y', description: 'Buy a quantity, get another free or discounted', criteriaKey: 'product::Buy X Get Y', requiresPromoCode: false },
      { kind: 'GIFT_ITEM', label: 'Gift Item', description: 'Free gift with qualifying purchase', criteriaKey: 'product::Gift Item', requiresPromoCode: false },
      { kind: 'CATEGORY_OFF', label: 'Specific Category', description: 'Discount on items in a category', criteriaKey: 'product::Specific Category', requiresPromoCode: false },
      { kind: 'COMBO_OFFER', label: 'Combo Offer', description: 'Bundle price for selected items', criteriaKey: 'product::Combo Offer', requiresPromoCode: false },
      { kind: 'NEW_PRODUCT', label: 'New Product Launch', description: 'Introductory offer on new items', criteriaKey: 'product::New Product Launch', requiresPromoCode: false },
    ],
  },
  {
    id: 'discount',
    label: 'Discount Based',
    requiresPromoCode: true,
    types: [
      { kind: 'PERCENTAGE_DISCOUNT', label: 'Percentage Off', description: 'Percentage discount on order — customer enters code at checkout', criteriaKey: 'order::Spend Over Amount', requiresPromoCode: true },
      { kind: 'FIXED_DISCOUNT', label: 'Fixed Amount Off', description: 'Flat LKR discount on order — customer enters code at checkout', criteriaKey: 'order::Minimum Order Value', requiresPromoCode: true },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery Based',
    requiresPromoCode: true,
    types: [
      { kind: 'FREE_DELIVERY', label: 'Free Delivery', description: 'Waive delivery fee — checkout code', criteriaKey: 'delivery::Free Delivery', requiresPromoCode: true },
      { kind: 'REDUCED_DELIVERY', label: 'Reduced Delivery Fee', description: 'Partial delivery fee discount — checkout code', criteriaKey: 'delivery::Reduced Delivery Fee', requiresPromoCode: true },
      { kind: 'DELIVERY_ZONE', label: 'Delivery Zone', description: 'Offer limited to a delivery zone — checkout code', criteriaKey: 'delivery::Delivery Zone', requiresPromoCode: true },
      { kind: 'DELIVERY_DISTANCE', label: 'Delivery Distance', description: 'Offer based on distance from branch — checkout code', criteriaKey: 'delivery::Delivery Distance', requiresPromoCode: true },
    ],
  },
  {
    id: 'order',
    label: 'Order Based',
    types: [
      { kind: 'MIN_ORDER', label: 'Minimum Order Value', description: 'Unlock offer above min spend — checkout code', criteriaKey: 'order::Minimum Order Value', requiresPromoCode: true },
      { kind: 'SPEND_OVER', label: 'Spend Over Amount', description: 'Tiered benefit above spend threshold — checkout code', criteriaKey: 'order::Spend Over Amount', requiresPromoCode: true },
      { kind: 'BULK_ORDER', label: 'Bulk Orders', description: 'Discount for large quantity — Add to Cup, no code needed', criteriaKey: 'order::Bulk Orders', requiresPromoCode: false },
    ],
  },
  {
    id: 'datetime',
    label: 'Date & Time Based',
    requiresPromoCode: false,
    types: [
      { kind: 'WEEKEND', label: 'Weekend', description: 'Active Sat–Sun only — applied automatically', criteriaKey: 'datetime::Weekend', requiresPromoCode: false },
      { kind: 'TIME_SLOT', label: '7 PM – 10 PM', description: 'Evening time-slot offer — applied automatically', criteriaKey: 'datetime::7 PM - 10 PM', requiresPromoCode: false },
      { kind: 'HAPPY_HOUR', label: 'Happy Hour', description: 'Short daily happy-hour window — applied automatically', criteriaKey: 'datetime::Happy Hour', requiresPromoCode: false },
      { kind: 'EVERY_FRIDAY', label: 'Every Friday', description: 'Weekly Friday promotion — applied automatically', criteriaKey: 'datetime::Every Friday', requiresPromoCode: false },
      { kind: 'BIRTHDAY', label: 'Birthday', description: 'Customer birthday reward — applied automatically', criteriaKey: 'datetime::Birthday', requiresPromoCode: false },
    ],
  },
  {
    id: 'payment',
    label: 'Payment Based',
    requiresPromoCode: true,
    types: [
      { kind: 'WALLET_OFFER', label: 'Digital Wallet', description: 'Extra benefit when paying via wallet — checkout code', criteriaKey: 'payment::Digital Wallet', requiresPromoCode: true },
      { kind: 'BANK_OFFER', label: 'Bank Promotions', description: 'Partner bank card offer — checkout code', criteriaKey: 'payment::Bank Promotions', requiresPromoCode: true },
      { kind: 'CARD_OFFER', label: 'Card Offers', description: 'Credit/debit card exclusive — checkout code', criteriaKey: 'payment::Card Offers', requiresPromoCode: true },
    ],
  },
  {
    id: 'customer',
    label: 'Customer Based',
    requiresPromoCode: true,
    types: [
      { kind: 'WELCOME', label: 'First Order Offer', description: 'Discount for a customer’s first order — checkout code', criteriaKey: 'customer::First Order Offer', requiresPromoCode: true },
      { kind: 'REFERRAL', label: 'Referral Offer', description: 'Discount for customers who joined via a referral link — checkout code', criteriaKey: 'customer::Referral Offer', requiresPromoCode: true },
      { kind: 'WIN_BACK', label: 'Win-back Offers', description: 'Re-engage inactive customers — checkout code', criteriaKey: 'customer::Win-back Offers', requiresPromoCode: true },
      { kind: 'LOYALTY_TIER', label: 'Tier Benefits', description: 'Loyalty tier exclusive perk — checkout code', criteriaKey: 'customer::Tier Benefits', requiresPromoCode: true },
    ],
  },
  {
    id: 'seasonal',
    label: 'Seasonal Based',
    requiresPromoCode: false,
    types: [
      { kind: 'SEASONAL', label: 'Seasonal Campaign', description: 'Holiday or seasonal event — applied automatically', criteriaKey: 'seasonal::New Year', requiresPromoCode: false },
    ],
  },
];

export const ALL_PROMOTION_TYPES = PROMOTION_TYPE_CATEGORIES.flatMap((c) => c.types);

/** Categories shown in the promotion-type picker (excludes display/card-only types). */
export const PROMOTION_KIND_CATEGORIES = PROMOTION_TYPE_CATEGORIES.filter((c) => c.id !== 'display');

export function getPromotionTypeOption(kind: PromotionKind): PromotionTypeOption | undefined {
  return ALL_PROMOTION_TYPES.find((t) => t.kind === kind);
}

export function getCategoryForKind(kind: PromotionKind): PromotionTypeCategory | undefined {
  return PROMOTION_TYPE_CATEGORIES.find((c) => c.types.some((t) => t.kind === kind));
}

/** Whether customers must enter a code at checkout for this offer type. */
export function promotionKindRequiresCode(kind: PromotionKind | '' | null | undefined): boolean {
  if (!kind) return true;
  return getPromotionTypeOption(kind as PromotionKind)?.requiresPromoCode ?? true;
}

/** Product / bundle offers redeemed via Add to Cup — no checkout code. */
export function isDirectOfferKind(kind: PromotionKind | string | null | undefined): boolean {
  if (!kind) return false;
  return !promotionKindRequiresCode(kind as PromotionKind);
}

export function generateInternalPromoCode(kind: PromotionKind, title?: string): string {
  const fromTitle = (title ?? '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 12)
    .toUpperCase();
  if (fromTitle.length >= 3) {
    return fromTitle.slice(0, 20);
  }
  const kindPart = kind.replace(/_/g, '').slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${kindPart}${rand}`.slice(0, 20);
}

/** Resolve code for API save — auto-generates for direct-offer types when empty. */
export function resolvePromoCodeForSave(
  kind: PromotionKind | '',
  code: string,
  title?: string,
): string {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length >= 3) return trimmed;
  if (kind && !promotionKindRequiresCode(kind)) {
    return generateInternalPromoCode(kind as PromotionKind, title);
  }
  return trimmed;
}

export interface SelectedPromoProduct {
  id: string;
  name: string;
  imageUrl?: string;
  basePrice?: number;
  categoryName?: string;
}

export interface PromotionRules {
  /** BOGO / BXGY */
  buyQty?: number;
  getQty?: number;
  /** Product / category targeting */
  productName?: string;
  productId?: string;
  selectedProducts?: SelectedPromoProduct[];
  giftProductName?: string;
  giftProductId?: string;
  giftProduct?: SelectedPromoProduct;
  categoryName?: string;
  categoryId?: string;
  comboItems?: string;
  comboProducts?: SelectedPromoProduct[];
  /** Discount mechanics */
  discountPercent?: number;
  discountAmount?: number;
  /** Delivery */
  deliveryFeeReduction?: number;
  deliveryZone?: string;
  maxDistanceKm?: number;
  /** Order thresholds */
  minSpend?: number;
  bulkMinQty?: number;
  /** Time windows */
  timeStart?: string;
  timeEnd?: string;
  daysOfWeek?: string[];
  /** Payment / customer */
  paymentMethod?: string;
  bankName?: string;
  cardNetwork?: string;
  loyaltyTier?: string;
  /** WELCOME / REFERRAL: PERCENTAGE | FIXED */
  referralDiscountMode?: 'PERCENTAGE' | 'FIXED';
  seasonalEvent?: string;
  /** Upload Banner display */
  bannerImageUrl?: string;
  displayPrice?: number;
  ctaLabel?: string;
  /** Custom offer */
  customBenefit?: string;
  /** Linked spin-wheel prize */
  source?: string;
  spinOfferId?: string;
  offerType?: string;
  color?: string;
}

export interface PromotionUsageLimits {
  maxTotal?: number;
  maxPerCustomer?: number;
  maxPerDay?: number;
  /** Available units for this offer — acts as a redemption cap when stock is limited */
  stock?: number;
}

export function defaultRulesForKind(kind: PromotionKind): PromotionRules {
  switch (kind) {
    case 'BOGO': return { buyQty: 1, getQty: 1 };
    case 'BXGY': return { buyQty: 2, getQty: 1 };
    case 'PERCENTAGE_DISCOUNT': return { discountPercent: 10 };
    case 'FIXED_DISCOUNT': return { discountAmount: 100 };
    case 'FREE_DELIVERY': return { minSpend: 1000 };
    case 'REDUCED_DELIVERY': return { deliveryFeeReduction: 50, minSpend: 500 };
    case 'MIN_ORDER': return { minSpend: 800 };
    case 'SPEND_OVER': return { minSpend: 1500, discountAmount: 200 };
    case 'HAPPY_HOUR': return { timeStart: '17:00', timeEnd: '19:00' };
    case 'TIME_SLOT': return { timeStart: '19:00', timeEnd: '22:00' };
    case 'WEEKEND': return { daysOfWeek: ['Sat', 'Sun'] };
    case 'EVERY_FRIDAY': return { daysOfWeek: ['Fri'] };
    case 'UPLOAD_BANNER': return { ctaLabel: 'Add to Bucket' };
    case 'CUSTOM': return { customBenefit: 'Special offer' };
    case 'WELCOME': return { referralDiscountMode: 'PERCENTAGE', discountPercent: 10, minSpend: 0 };
    case 'REFERRAL': return { referralDiscountMode: 'PERCENTAGE', discountPercent: 10, minSpend: 0 };
    default: return {};
  }
}

export function isBannerPromotion(kind?: string | null): boolean {
  return kind === 'UPLOAD_BANNER';
}

export function isSpinLinkedPromo(promo: {
  promotionKind?: string | null;
  promotionRules?: PromotionRules | unknown | null;
}): boolean {
  const rules = promo.promotionRules as PromotionRules | null | undefined;
  if (rules?.spinOfferId || rules?.source === 'SPIN_WHEEL') return true;
  return (promo.promotionKind || '').toUpperCase() === 'SPIN_WHEEL';
}

export function isCustomPromotion(kind?: string | null): boolean {
  return kind === 'CUSTOM';
}

export function kindUsesDiscountValue(kind: PromotionKind): boolean {
  return kind === 'PERCENTAGE_DISCOUNT' || kind === 'FIXED_DISCOUNT' || kind === 'WELCOME' || kind === 'REFERRAL';
}

/** Customer-based checkout offers with first-order / referral eligibility. */
export function isCustomerEligibilityKind(kind: PromotionKind | string | null | undefined): boolean {
  const k = (kind || '').toUpperCase();
  return k === 'WELCOME' || k === 'FIRST_ORDER' || k === 'REFERRAL';
}

export function kindLabel(kind: PromotionKind): string {
  if ((kind as string) === 'SPIN_WHEEL') return 'Spin Wheel';
  return getPromotionTypeOption(kind)?.label ?? kind;
}

function formatSelectedProductNames(
  selectedProducts: PromotionRules['selectedProducts'],
  fallbackName?: string | null,
): string | undefined {
  const names = (selectedProducts ?? [])
    .map((p) => p.name?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return fallbackName ?? undefined;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

export function formatPromotionBenefit(kind: PromotionKind, rules: PromotionRules, discountValue?: number): string {
  switch (kind) {
    case 'PERCENTAGE_DISCOUNT': return `${rules.discountPercent ?? discountValue ?? 0}% off`;
    case 'FIXED_DISCOUNT': return `LKR ${rules.discountAmount ?? discountValue ?? 0} off`;
    case 'BOGO':
    case 'BXGY': {
      const prod = formatSelectedProductNames(rules.selectedProducts, rules.productName);
      const base = kind === 'BOGO'
        ? `Buy ${rules.buyQty ?? 1} Get ${rules.getQty ?? 1}`
        : `Buy ${rules.buyQty ?? 2} Get ${rules.getQty ?? 1}`;
      return prod ? `${base} — ${prod}` : base;
    }
    case 'GIFT_ITEM': {
      const gift = rules.giftProduct?.name ?? rules.giftProductName;
      return gift ? `Free ${gift}` : 'Free gift';
    }
    case 'FREE_DELIVERY': return 'Free delivery';
    case 'REDUCED_DELIVERY': return `LKR ${rules.deliveryFeeReduction ?? 0} off delivery`;
    case 'COMBO_OFFER': {
      const names = rules.comboProducts?.map((p) => p.name).join(' + ') ?? rules.comboItems;
      return names ? `Combo: ${names}` : 'Combo offer';
    }
    case 'CATEGORY_OFF': return rules.categoryName ? `${rules.categoryName} offer` : 'Category offer';
    case 'NEW_PRODUCT': return rules.selectedProducts?.[0]?.name ?? rules.productName ?? 'New product offer';
    case 'UPLOAD_BANNER': {
      const price = rules.displayPrice;
      return price ? `From LKR ${price.toLocaleString()}` : 'Banner offer';
    }
    case 'CUSTOM': return rules.customBenefit ?? 'Custom offer';
    case 'WELCOME':
    case 'REFERRAL': {
      if (rules.referralDiscountMode === 'FIXED' || (rules.discountAmount && !rules.discountPercent)) {
        return `LKR ${rules.discountAmount ?? discountValue ?? 0} off`;
      }
      return `${rules.discountPercent ?? discountValue ?? 0}% off`;
    }
    default: return getPromotionTypeOption(kind)?.label ?? kind;
  }
}

export function formatUsageLimits(limits: PromotionUsageLimits, usedCount = 0): string {
  const parts: string[] = [`${usedCount}${limits.maxTotal ? `/${limits.maxTotal}` : ''} total uses`];
  if (limits.maxPerCustomer) parts.push(`${limits.maxPerCustomer}/customer`);
  if (limits.maxPerDay) parts.push(`${limits.maxPerDay}/day`);
  if (limits.stock != null) parts.push(`${usedCount}/${limits.stock} stock`);
  return parts.join(' · ');
}
