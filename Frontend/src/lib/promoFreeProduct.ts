import { isFreeProductPromoKind } from '@/lib/promotionAutoApply';
import type { AppliedPromoReward } from '@/store/promoStore';

export function freeProductBenefitLabel(
  reward: Pick<AppliedPromoReward, 'promotionKind' | 'giftLabel' | 'giftProduct' | 'discount'> | null | undefined,
): string | null {
  if (!reward) return null;
  if (reward.giftLabel) return reward.giftLabel;
  if (reward.giftProduct?.name) return `Free ${reward.giftProduct.name}`;
  if (isFreeProductPromoKind(reward.promotionKind)) {
    if (reward.discount > 0) return 'Buy 1 Get 1 free';
    return 'Buy 1 Get 1';
  }
  return null;
}

/** Cart line from either the cup store (`product.id`) or promo API payload (`productId`). */
export type CartLineForBogo = {
  quantity: number;
  unitPrice: number;
  productId?: string;
  product?: { id?: string } | null;
};

function lineProductId(item: CartLineForBogo | null | undefined): string | null {
  if (!item) return null;
  if (typeof item.productId === 'string' && item.productId) return item.productId;
  const id = item.product?.id;
  return typeof id === 'string' && id ? id : null;
}

/** Default B1G1 bundle (buy 1 + get 1). */
const DEFAULT_BOGO_BUNDLE = 2;
const DEFAULT_BOGO_GET_QTY = 1;

export function getBogoFreeUnitsForCartLine(
  reward: AppliedPromoReward | null | undefined,
  item: CartLineForBogo | null | undefined,
): number {
  if (!reward || !item || !isFreeProductPromoKind(reward.promotionKind)) return 0;
  const giftId = reward.giftProduct?.id;
  const productId = lineProductId(item);
  if (!giftId || !productId || giftId !== productId) return 0;
  const qty = Number(item.quantity) || 0;
  const sets = Math.floor(qty / DEFAULT_BOGO_BUNDLE);
  if (sets <= 0) return 0;
  return sets * DEFAULT_BOGO_GET_QTY;
}

export function getBogoPaidUnitsForCartLine(
  reward: AppliedPromoReward | null | undefined,
  item: CartLineForBogo | null | undefined,
): number {
  if (!item) return 0;
  const freeQty = getBogoFreeUnitsForCartLine(reward, item);
  return Math.max(0, (Number(item.quantity) || 0) - freeQty);
}

export function countBogoFreeUnitsInCart(
  reward: AppliedPromoReward | null | undefined,
  items: CartLineForBogo[] | null | undefined,
): number {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => sum + getBogoFreeUnitsForCartLine(reward, item), 0);
}

/** True when the cup still has at least one complete BOGO/BXGY bundle unlocked. */
export function bogoOfferActiveInCart(
  reward: AppliedPromoReward | null | undefined,
  items: CartLineForBogo[] | null | undefined,
): boolean {
  return countBogoFreeUnitsInCart(reward, items) > 0;
}

export function showsFreeProductSummaryLine(
  reward: Pick<AppliedPromoReward, 'promotionKind' | 'giftLabel' | 'giftProduct' | 'discount'> | null | undefined,
  items: CartLineForBogo[] = [],
): boolean {
  if (!freeProductBenefitLabel(reward)) return false;
  if (items.length > 0 && isFreeProductPromoKind(reward?.promotionKind)) {
    return bogoOfferActiveInCart(reward as AppliedPromoReward, items);
  }
  return Boolean((reward?.discount ?? 0) > 0);
}

/**
 * Subtotal shown in order summary when B1G1 is active — paid units only
 * (gross cart subtotal minus free-product discount).
 */
export function displayPaidSubtotal(
  grossSubtotal: number,
  reward: Pick<AppliedPromoReward, 'promotionKind' | 'giftLabel' | 'giftProduct' | 'discount'> | null | undefined,
  items: CartLineForBogo[] = [],
): number {
  const gross = Math.max(0, Math.floor(grossSubtotal));
  if (!showsFreeProductSummaryLine(reward, items)) return gross;
  const freeDiscount = Math.max(0, Math.floor(reward?.discount ?? 0));
  return Math.max(0, gross - freeDiscount);
}
