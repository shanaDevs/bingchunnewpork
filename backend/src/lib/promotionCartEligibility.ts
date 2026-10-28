import type { PromoCartLine } from './promotionUsage';
import { computePromoDiscount } from './promotionUsage';

function parseRules(rules: unknown): Record<string, unknown> {
  if (!rules || typeof rules !== 'object') return {};
  return rules as Record<string, unknown>;
}

export function getPromotedProductIdsFromRules(rules: unknown): Set<string> {
  const ids = new Set<string>();
  const r = parseRules(rules);

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

/** Qualifying purchase products — excludes the free gift itself. */
export function getQualifyingProductIdsFromRules(rules: unknown): Set<string> {
  const ids = new Set<string>();
  const r = parseRules(rules);

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

  if (r.productId) ids.add(String(r.productId));
  return ids;
}

export type PromoGiftProduct = {
  id: string;
  name: string;
  basePrice: number;
  imageUrl?: string | null;
};

export function extractGiftFromPromotionRules(rules: unknown): {
  giftLabel: string | null;
  giftProduct: PromoGiftProduct | null;
} {
  const r = parseRules(rules);
  const raw = r.giftProduct && typeof r.giftProduct === 'object' ? (r.giftProduct as Record<string, unknown>) : null;
  const id =
    (typeof raw?.id === 'string' && raw.id) ||
    (typeof r.giftProductId === 'string' ? r.giftProductId : '');
  const name =
    (typeof raw?.name === 'string' && raw.name) ||
    (typeof r.giftProductName === 'string' ? r.giftProductName : '');
  if (!id && !name) return { giftLabel: null, giftProduct: null };

  const imageUrl = typeof raw?.imageUrl === 'string' ? raw.imageUrl : null;
  const basePrice = typeof raw?.basePrice === 'number' ? raw.basePrice : 0;
  const giftProduct = id
    ? { id, name: name || 'Free gift', basePrice, imageUrl }
    : null;
  const giftLabel = name ? `Free ${name}` : giftProduct ? `Free ${giftProduct.name}` : 'Free gift';
  return { giftLabel, giftProduct };
}

function readProductSnapshot(raw: unknown): PromoGiftProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === 'string' ? p.id : '';
  const name = typeof p.name === 'string' ? p.name : '';
  if (!id && !name) return null;
  return {
    id: id || name,
    name: name || 'Free item',
    basePrice: typeof p.basePrice === 'number' ? p.basePrice : 0,
    imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : null,
  };
}

/** BOGO / BXGY free item — taken from selectedProducts or legacy productId fields. */
export function extractFreeProductFromBogoBxgyRules(rules: unknown): {
  giftLabel: string | null;
  giftProduct: PromoGiftProduct | null;
} {
  const r = parseRules(rules);
  const selected = Array.isArray(r.selectedProducts) ? r.selectedProducts : [];
  const product =
    readProductSnapshot(selected[0]) ||
    (typeof r.productId === 'string'
      ? readProductSnapshot({
          id: r.productId,
          name: r.productName,
          basePrice: r.basePrice,
          imageUrl: r.imageUrl,
        })
      : null);
  if (!product) return { giftLabel: null, giftProduct: null };
  return {
    giftProduct: product,
    giftLabel: `Free ${product.name}`,
  };
}

export function resolvePromoGiftDisplay(
  promotionKind: string | null | undefined,
  promotionRules: unknown,
): { giftLabel: string | null; giftProduct: PromoGiftProduct | null } {
  const giftItem = extractGiftFromPromotionRules(promotionRules);
  if (giftItem.giftProduct || giftItem.giftLabel) return giftItem;
  const kind = (promotionKind || '').toUpperCase();
  if (kind === 'BOGO' || kind === 'BXGY') {
    return extractFreeProductFromBogoBxgyRules(promotionRules);
  }
  return { giftLabel: null, giftProduct: null };
}

function isFreeDeliveryPromo(params: {
  promotionKind?: string | null;
  discountType: string;
  code?: string;
}): boolean {
  const kind = (params.promotionKind || '').toUpperCase();
  const type = (params.discountType || '').toUpperCase();
  const code = (params.code || '').toUpperCase();
  return (
    kind === 'FREE_DELIVERY' ||
    type === 'DELIVERY' ||
    type === 'FREE_DELIVERY' ||
    code === 'FREEDELIVERY' ||
    code.includes('FREEDELIVERY')
  );
}

function aggregateMatchingLines(
  cartItems: PromoCartLine[],
  productIds: Set<string>,
): { totalQty: number; unitPrices: number[]; lineTotal: number } {
  const unitPrices: number[] = [];
  let totalQty = 0;
  let lineTotal = 0;

  for (const line of cartItems) {
    if (!productIds.has(line.productId)) continue;
    totalQty += line.quantity;
    lineTotal += line.lineTotal;
    for (let i = 0; i < line.quantity; i++) {
      unitPrices.push(line.unitPrice);
    }
  }

  return { totalQty, unitPrices, lineTotal };
}

function computeBogoBxgyDiscount(
  buyQty: number,
  getQty: number,
  cartItems: PromoCartLine[],
  productIds: Set<string>,
): number {
  const { totalQty, unitPrices } = aggregateMatchingLines(cartItems, productIds);
  const bundle = buyQty + getQty;
  if (bundle <= 0 || totalQty < bundle) return 0;

  const sets = Math.floor(totalQty / bundle);
  const freeUnits = sets * getQty;
  unitPrices.sort((a, b) => a - b);

  let discount = 0;
  for (let i = 0; i < Math.min(freeUnits, unitPrices.length); i++) {
    discount += unitPrices[i];
  }
  return discount;
}

function scopedSubtotal(
  cartItems: PromoCartLine[],
  productIds: Set<string>,
  categoryName?: string,
): number {
  if (productIds.size > 0) {
    return cartItems
      .filter((l) => productIds.has(l.productId))
      .reduce((sum, l) => sum + l.lineTotal, 0);
  }
  if (categoryName) {
    const cat = categoryName.toLowerCase();
    return cartItems
      .filter((l) => (l.categoryName || '').toLowerCase() === cat)
      .reduce((sum, l) => sum + l.lineTotal, 0);
  }
  return 0;
}

function discountFromRules(
  rules: Record<string, unknown>,
  discountType: string,
  discountValue: number,
  base: number,
): number {
  const pct = rules.discountPercent;
  const amt = rules.discountAmount;
  if (typeof pct === 'number' && pct > 0) {
    return Math.min(base, Math.floor((base * pct) / 100));
  }
  if (typeof amt === 'number' && amt > 0) {
    return Math.min(amt, base);
  }
  return Math.min(base, computePromoDiscount(discountType, discountValue, base));
}

export type PromoCartEvaluation = {
  eligible: boolean;
  discount: number;
  freeDelivery: boolean;
  /** When set, the shopper needs more units of this product for BOGO/BXGY to unlock. */
  cartBoost?: { productId: string; addQty: number } | null;
};

/**
 * Evaluate whether a promotion applies to the current cart and compute the monetary benefit.
 * Product-scoped kinds return ineligible when the cart has no matching items / quantities.
 */
export function evaluatePromoAgainstCart(params: {
  promotionKind?: string | null;
  promotionRules?: unknown;
  discountType: string;
  discountValue: number;
  orderTotal: number;
  cartItems?: PromoCartLine[];
  orderMode?: 'DELIVERY' | 'TAKEAWAY' | null;
  code?: string;
}): PromoCartEvaluation {
  const kind = (params.promotionKind || '').toUpperCase();
  const rules = parseRules(params.promotionRules);
  const cartItems = params.cartItems ?? [];
  const productIds = getPromotedProductIdsFromRules(params.promotionRules);

  if (isFreeDeliveryPromo(params)) {
    if (params.orderMode === 'TAKEAWAY') {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    return { eligible: true, discount: 0, freeDelivery: true };
  }

  const minSpendFromRules = typeof rules.minSpend === 'number' ? rules.minSpend : 0;
  if (minSpendFromRules > 0 && params.orderTotal < minSpendFromRules) {
    return { eligible: false, discount: 0, freeDelivery: false };
  }

  if (kind === 'BOGO' || kind === 'BXGY') {
    if (productIds.size === 0) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    const buyQty = Number(rules.buyQty) || (kind === 'BOGO' ? 1 : 2);
    const getQty = Number(rules.getQty) || 1;
    const bundle = buyQty + getQty;
    const { totalQty } = aggregateMatchingLines(cartItems, productIds);

    // Have the paid units but not yet the free ones — eligible once cart is boosted.
    if (totalQty >= buyQty && totalQty < bundle) {
      const boostLine = cartItems.find((l) => productIds.has(l.productId));
      if (!boostLine) {
        return { eligible: false, discount: 0, freeDelivery: false };
      }
      return {
        eligible: true,
        discount: 0,
        freeDelivery: false,
        cartBoost: { productId: boostLine.productId, addQty: bundle - totalQty },
      };
    }

    const discount = computeBogoBxgyDiscount(buyQty, getQty, cartItems, productIds);
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  if (kind === 'COMBO_OFFER') {
    const comboIds = getPromotedProductIdsFromRules({ comboProducts: rules.comboProducts });
    if (comboIds.size === 0) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    for (const id of comboIds) {
      const qty = cartItems
        .filter((l) => l.productId === id)
        .reduce((sum, l) => sum + l.quantity, 0);
      if (qty < 1) {
        return { eligible: false, discount: 0, freeDelivery: false };
      }
    }
    const discount = discountFromRules(
      rules,
      params.discountType,
      params.discountValue,
      params.orderTotal,
    );
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  if (kind === 'CATEGORY_OFF') {
    const categoryName = typeof rules.categoryName === 'string' ? rules.categoryName : '';
    const base = scopedSubtotal(cartItems, new Set(), categoryName);
    if (base <= 0) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    const discount = discountFromRules(rules, params.discountType, params.discountValue, base);
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  if (kind === 'GIFT_ITEM') {
    const qualifyingIds = getQualifyingProductIdsFromRules(params.promotionRules);
    if (qualifyingIds.size > 0) {
      const hasMatch = cartItems.some((l) => qualifyingIds.has(l.productId));
      if (!hasMatch) {
        return { eligible: false, discount: 0, freeDelivery: false };
      }
    }
    return { eligible: true, discount: 0, freeDelivery: false };
  }

  if (kind === 'NEW_PRODUCT') {
    if (productIds.size === 0) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    const hasMatch = cartItems.some((l) => productIds.has(l.productId));
    if (!hasMatch) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    const base = scopedSubtotal(cartItems, productIds);
    const discount = discountFromRules(rules, params.discountType, params.discountValue, base);
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  if (kind === 'BULK_ORDER') {
    const bulkMin = Number(rules.bulkMinQty ?? 0);
    if (bulkMin > 0) {
      const totalQty = cartItems.reduce((sum, l) => sum + l.quantity, 0);
      if (totalQty < bulkMin) {
        return { eligible: false, discount: 0, freeDelivery: false };
      }
    }
    const discount = discountFromRules(
      rules,
      params.discountType,
      params.discountValue,
      params.orderTotal,
    );
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  if (kind === 'MIN_ORDER' || kind === 'SPEND_OVER') {
    const discount = discountFromRules(
      rules,
      params.discountType,
      params.discountValue,
      params.orderTotal,
    );
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  // Product-targeted percentage/fixed (rules.selectedProducts without a special kind)
  if (productIds.size > 0) {
    const base = scopedSubtotal(cartItems, productIds);
    if (base <= 0) {
      return { eligible: false, discount: 0, freeDelivery: false };
    }
    const discount = discountFromRules(rules, params.discountType, params.discountValue, base);
    return { eligible: discount > 0, discount, freeDelivery: false };
  }

  // Order-wide promos (welcome, referral, generic %/fixed)
  const discount = discountFromRules(
    rules,
    params.discountType,
    params.discountValue,
    params.orderTotal,
  );
  return { eligible: discount > 0, discount, freeDelivery: false };
}

export function promoRequiresCartItems(promotionKind?: string | null, promotionRules?: unknown): boolean {
  const kind = (promotionKind || '').toUpperCase();
  if (['BOGO', 'BXGY', 'COMBO_OFFER', 'CATEGORY_OFF', 'NEW_PRODUCT', 'GIFT_ITEM', 'BULK_ORDER'].includes(kind)) {
    return true;
  }
  return getPromotedProductIdsFromRules(promotionRules).size > 0;
}
