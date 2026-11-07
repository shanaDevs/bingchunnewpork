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
  if (!rules || typeof rules !== 'object') {
    return { giftLabel: null, giftProduct: null };
  }
  const r = rules as Record<string, unknown>;
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

export function hasPromoGift(reward: {
  giftProduct?: PromoGiftProduct | null;
  giftLabel?: string | null;
} | null | undefined): boolean {
  return Boolean(reward?.giftProduct || reward?.giftLabel);
}
