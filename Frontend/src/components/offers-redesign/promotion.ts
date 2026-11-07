/**
 * The Offers page's view of a promotion, built from the admin's live promos (GET /promos).
 *
 * Everything comes from what the admin set when creating the promotion; nothing here is stored:
 * - Filter tab: the promotion type's category in the admin's type picker (Product, Discount, Delivery, Date & Time…).
 * - Colours and card layout: the Card Designer (cardDesign). The dark design is checked first, as the designer opens
 *   on it, then the light one. A design still on the designer's defaults gets the page's own colourway rotation.
 * - Art: the products picked for the offer (or the gift), else the designer's image, else a mascot by type.
 * - Big figure, title, description, minimum order and end date from the offer's rules.
 * - How it's redeemed follows the checkout rules the rest of the site uses (promotionTypes, promotionAutoApply).
 */
import type { PromoCode } from "@/types";
import { mapPromosToHomeOffers, type HomeOffer } from "@/components/home/homeOffers";
import { isAutoApplyPromo } from "@/lib/promotionAutoApply";
import {
  defaultCardDesign,
  defaultLightCardDesign,
  isCardDesignSet,
  type CardLayoutPreset,
  type PromotionCardDesign,
} from "@/lib/promotionCardDesign";
import { resolveProductImageUrl } from "@/lib/productImageUrl";
import {
  formatPromotionBenefit,
  getCategoryForKind,
  isBannerPromotion,
  isSpinLinkedPromo,
  promotionKindRequiresCode,
  type PromotionKind,
  type PromotionRules,
} from "@/lib/promotionTypes";

export type PromotionCategory = "discounts" | "freebies" | "delivery" | "limited";
export const PROMOTION_FILTERS = ["all", "discounts", "freebies", "delivery", "limited"] as const;
export type PromotionFilter = (typeof PROMOTION_FILTERS)[number];

export type PromotionTone = "blue" | "sun" | "ice" | "berry" | "mint" | "ink";
/** Card composition; `banner` is the admin's Upload Banner offer (image, price and its own button). */
export type PromotionLook = "poster" | "wide" | "stamp" | "banner";

export const PROMOTION_MASCOTS = {
  rider: { src: "/images/mascots/delivery-rider.png", width: 500, height: 500 },
  money: { src: "/images/mascots/Character_holding_money.png", width: 500, height: 500 },
  cool: { src: "/images/mascots/order-confirmed-icecream.png", width: 500, height: 500 },
  party: { src: "/images/mascots/order-confirmed-celebration.png", width: 500, height: 500 },
} as const;
export type PromotionMascot = keyof typeof PROMOTION_MASCOTS;

/** Product photos (front first; a second one leans in behind) or a mascot sticker. */
export type PromotionArt = { type: "images"; images: [string] | [string, string] } | { type: "mascot"; mascot: PromotionMascot };

/**
 * - code: copy the code, or Use at checkout.
 * - auto: an offer the cup applies by itself once the order qualifies (most types; see promotionAutoApply), so View in cup.
 * - direct: no code; Add to Cup puts the offer (and its products) in the cup.
 */
export type PromotionRedeem = { type: "code"; code: string } | { type: "auto" } | { type: "direct" };

/** Colours the admin picked in the Card Designer. `dark` = light text goes on it. */
export type PromotionColours = { background: string; accent?: string; dark: boolean };

export type Promotion = {
  id: string;
  /** The promo code the admin set (or the one generated for a no-code offer); shown on every card. */
  code: string;
  categories: PromotionCategory[];
  /** The big figure: "10%", "LKR 200", "1+1", "FREE". */
  headline: string;
  suffix?: "off" | "free";
  title: string;
  description: string;
  minOrderValue: number;
  endsAt?: string;
  art: PromotionArt;
  tone: PromotionTone;
  colours?: PromotionColours;
  look: PromotionLook;
  /** Wide card with its art on the left (the designer's "Image Left · Text Right"). */
  artFirst: boolean;
  redeem: PromotionRedeem;
  /** Upload Banner offers only. */
  banner?: { imageUrl?: string; price?: number; ctaLabel: string };
  /** The offer in the shape the cup's apply-offer flow takes (applyHomeOfferToCart). */
  offer: HomeOffer;
};

/** The page's own rotation for offers without a custom design, in the order the design was laid out in. */
const LOOK_CYCLE: PromotionLook[] = ["poster", "poster", "stamp", "wide", "stamp", "wide", "wide", "poster", "stamp", "wide", "stamp"];
const TONE_CYCLE: PromotionTone[] = ["blue", "ink", "sun", "ice", "berry", "sun", "mint", "berry", "mint", "ink", "blue"];

const LOOK_BY_PRESET: Record<CardLayoutPreset, PromotionLook> = {
  "text-left-image-right": "wide",
  "text-right-image-left": "wide",
  "text-on-image": "poster",
  "background-image": "poster",
  custom: "stamp",
};

const FREEBIE_KINDS = new Set(["BOGO", "BXGY", "GIFT_ITEM", "COMBO_OFFER"]);
/** The designer's stock picture, which only stands in until a product is picked. */
const DESIGNER_PLACEHOLDER_IMAGE = "/promos/promo-offer-bingchun50-removebg-preview.png";
/** Offers ending within this many days are also listed under Limited Time. */
const LIMITED_WITHIN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): [number, number, number] {
  const full = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : hex;
  const n = Number.parseInt(full.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isCustomised(design: PromotionCardDesign | undefined, defaults: PromotionCardDesign): design is PromotionCardDesign {
  if (!design || typeof design !== "object") return false;
  return (
    (design.backgroundColor ?? "").toLowerCase() !== defaults.backgroundColor.toLowerCase() ||
    (design.accentColor ?? "").toLowerCase() !== defaults.accentColor.toLowerCase() ||
    design.layoutPreset !== defaults.layoutPreset
  );
}

/** The admin's Card Designer design, when they changed it from the defaults (dark first, as the designer opens on it). */
export function customCardDesign(raw: unknown): PromotionCardDesign | null {
  const value = parseJson(raw);
  if (!value || typeof value !== "object") return null;
  const dark = isCardDesignSet(value) ? value.dark : (value as PromotionCardDesign);
  const light = isCardDesignSet(value) ? value.light : undefined;
  if (isCustomised(dark, defaultCardDesign())) return dark;
  if (isCustomised(light, defaultLightCardDesign())) return light;
  return null;
}

function coloursFrom(design: PromotionCardDesign): PromotionColours | undefined {
  const background = design.backgroundColor;
  if (!background || !HEX.test(background)) return undefined;
  const dark = contrastRatio(background, "#ffffff") >= contrastRatio(background, "#0f2147");
  // The accent colours the big figure, so only where it stands out (large-text contrast).
  const accent = design.accentColor && HEX.test(design.accentColor) && contrastRatio(design.accentColor, background) >= 3 ? design.accentColor : undefined;
  return { background, accent, dark };
}

const lkr = (amount: number) => `LKR ${Math.round(amount).toLocaleString("en-US")}`;

/** The big figure and its OFF / FREE tag. */
export function dealFigure(promo: PromoCode): Pick<Promotion, "headline" | "suffix"> {
  const kind = (promo.promotionKind || "").toUpperCase();
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const value = Number(promo.discountValue) || 0;
  const isPercent = (promo.discountType || "").toUpperCase().includes("PERCENT");

  switch (kind) {
    case "BOGO":
    case "BXGY":
      return { headline: `${rules.buyQty ?? (kind === "BOGO" ? 1 : 2)}+${rules.getQty ?? 1}`, suffix: "free" };
    case "GIFT_ITEM":
    case "FREE_DELIVERY":
      return { headline: "FREE" };
    case "REDUCED_DELIVERY": {
      const off = rules.deliveryFeeReduction ?? value;
      return off > 0 ? { headline: lkr(off), suffix: "off" } : { headline: "FREE" };
    }
    case "COMBO_OFFER":
      return rules.displayPrice ? { headline: lkr(rules.displayPrice) } : { headline: "COMBO" };
    case "WELCOME":
    case "REFERRAL":
      if (rules.referralDiscountMode === "FIXED") return { headline: lkr(rules.discountAmount ?? value), suffix: "off" };
      if (rules.referralDiscountMode === "PERCENTAGE") return { headline: `${rules.discountPercent ?? value}%`, suffix: "off" };
      break;
  }

  if (isPercent && value > 0) return { headline: `${value}%`, suffix: "off" };
  // BOGO-style offers are stored as FIXED 1 for accounting, so a 1 is never shown as "LKR 1 OFF".
  if (value > 1) return { headline: lkr(value), suffix: "off" };
  if (rules.discountPercent) return { headline: `${rules.discountPercent}%`, suffix: "off" };
  if (rules.discountAmount) return { headline: lkr(rules.discountAmount), suffix: "off" };
  return { headline: "DEAL" };
}

/** Filter tabs, from the type's category in the admin's type picker. */
export function promotionCategories(promo: PromoCode, now: Date): PromotionCategory[] {
  const kind = (promo.promotionKind || "").toUpperCase();
  const category = kind ? getCategoryForKind(kind as PromotionKind)?.id : undefined;
  const categories: PromotionCategory[] = [];
  if (FREEBIE_KINDS.has(kind)) categories.push("freebies");
  else if (category === "delivery") categories.push("delivery");
  else if (category !== "display") categories.push("discounts");

  const endsAt = promo.expiresAt ? new Date(promo.expiresAt).getTime() : null;
  const endsSoon = endsAt !== null && endsAt - now.getTime() <= LIMITED_WITHIN_DAYS * DAY_MS;
  if (category === "datetime" || category === "seasonal" || endsSoon) categories.push("limited");
  return categories;
}

function mascotFor(promo: PromoCode, categories: PromotionCategory[]): PromotionMascot {
  const kind = (promo.promotionKind || "").toUpperCase();
  if (categories.includes("delivery")) return "rider";
  if (categories.includes("freebies")) return "party";
  if (categories.includes("limited") || getCategoryForKind(kind as PromotionKind)?.id === "customer") return "cool";
  return (promo.discountType || "").toUpperCase().includes("PERCENT") ? "cool" : "money";
}

function artFor(promo: PromoCode, design: PromotionCardDesign | null, categories: PromotionCategory[]): PromotionArt {
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const pictures = [
    ...(rules.selectedProducts ?? []),
    ...(rules.comboProducts ?? []),
    ...(rules.giftProduct ? [rules.giftProduct] : []),
  ]
    .map((product) => resolveProductImageUrl(product?.imageUrl))
    .filter((src): src is string => Boolean(src));
  const [front, back] = [...new Set(pictures)];
  if (front) return { type: "images", images: back ? [front, back] : [front] };

  const designed = design?.elements.find((el) => el.type === "image")?.content;
  const designedSrc = designed && designed !== DESIGNER_PLACEHOLDER_IMAGE ? resolveProductImageUrl(designed) : undefined;
  if (designedSrc) return { type: "images", images: [designedSrc] };

  return { type: "mascot", mascot: mascotFor(promo, categories) };
}

function redeemFor(promo: PromoCode): PromotionRedeem {
  const kind = promo.promotionKind as PromotionKind | undefined;
  const requiresCode = kind ? promotionKindRequiresCode(kind) : true;
  if (!requiresCode) return { type: "direct" };
  // Same check as the old promotions page: most types apply themselves in the cup once the order qualifies.
  if (isAutoApplyPromo({ promotionKind: promo.promotionKind, code: promo.code })) return { type: "auto" };
  return { type: "code", code: promo.code.toUpperCase() };
}

/** One live promo as a card. `index` is its place among the page's cards, for the colourway and layout rotation. */
export function toPromotion(promo: PromoCode, index: number, now: Date): Promotion {
  const kind = promo.promotionKind as PromotionKind | undefined;
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const design = customCardDesign(promo.cardDesign);
  const categories = promotionCategories(promo, now);
  const isBanner = isBannerPromotion(promo.promotionKind);
  const [offer] = mapPromosToHomeOffers([promo]);

  return {
    id: promo.id ?? promo.code,
    code: promo.code.toUpperCase(),
    categories,
    ...dealFigure(promo),
    title: promo.title?.trim() || (kind ? formatPromotionBenefit(kind, rules, promo.discountValue) : promo.code.toUpperCase()),
    description: promo.description?.trim() ?? "",
    minOrderValue: Number(promo.minOrderValue) || Number(rules.minSpend) || 0,
    endsAt: promo.expiresAt || undefined,
    art: artFor(promo, design, categories),
    tone: TONE_CYCLE[index % TONE_CYCLE.length],
    colours: design ? coloursFrom(design) : undefined,
    look: isBanner ? "banner" : design ? LOOK_BY_PRESET[design.layoutPreset] ?? "wide" : LOOK_CYCLE[index % LOOK_CYCLE.length],
    artFirst: design?.layoutPreset === "text-right-image-left",
    redeem: redeemFor(promo),
    banner: isBanner
      ? {
          imageUrl: resolveProductImageUrl(rules.bannerImageUrl) ?? resolveProductImageUrl(design?.backgroundImage),
          price: rules.displayPrice && rules.displayPrice > 0 ? rules.displayPrice : undefined,
          ctaLabel: rules.ctaLabel?.trim() || "Add to Bucket",
        }
      : undefined,
    offer,
  };
}

/** The page's cards, in the admin's order. Spin & Win prizes stay with the spin wheel, as on the home page. */
export function toPromotions(promos: PromoCode[], now = new Date()): Promotion[] {
  return promos.filter((promo) => !isSpinLinkedPromo(promo)).map((promo, i) => toPromotion(promo, i, now));
}

export function matchesFilter(promotion: Promotion, filter: PromotionFilter): boolean {
  return filter === "all" || promotion.categories.includes(filter);
}
