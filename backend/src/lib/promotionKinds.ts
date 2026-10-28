/** Kinds where customers enter a checkout code (discount, delivery, payment, etc.). */
const CHECKOUT_CODE_KINDS = new Set([
  'PERCENTAGE_DISCOUNT',
  'FIXED_DISCOUNT',
  'FREE_DELIVERY',
  'REDUCED_DELIVERY',
  'DELIVERY_ZONE',
  'DELIVERY_DISTANCE',
  'MIN_ORDER',
  'SPEND_OVER',
  'WALLET_OFFER',
  'BANK_OFFER',
  'CARD_OFFER',
  'WELCOME',
  'REFERRAL',
  'WIN_BACK',
  'LOYALTY_TIER',
]);

export function promotionKindRequiresCode(kind: string | null | undefined): boolean {
  if (!kind) return true;
  return CHECKOUT_CODE_KINDS.has(kind);
}

export function generateInternalPromoCode(kind: string, title?: string | null): string {
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
