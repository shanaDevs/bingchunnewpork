import { isFreeProductPromoKind } from '@/lib/promotionAutoApply';
import type { AppliedPromoReward } from '@/store/promoStore';

/** Percentage / fixed discounts apply to item subtotal only — never delivery or convenience fees. */
export function discountFromSubtotal(
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
  subtotal: number,
  fallbackDiscount = 0,
): number {
  const cap = Math.max(0, Math.floor(subtotal));
  if (cap <= 0) return 0;
  const type = (discountType || '').toUpperCase();
  const value = discountValue ?? 0;
  if (type === 'PERCENTAGE' && value > 0) {
    return Math.min(cap, Math.floor((cap * value) / 100));
  }
  if (type === 'FIXED' && value > 0) {
    return Math.min(cap, Math.floor(value));
  }
  return Math.min(cap, Math.max(0, Math.floor(fallbackDiscount)));
}

export function rewardDiscountForSubtotal(reward: AppliedPromoReward, subtotal: number): number {
  if (reward.freeDelivery) return 0;
  // BOGO/BXGY store FIXED/1 for accounting — the real discount is cart-evaluated.
  if (isFreeProductPromoKind(reward.promotionKind)) {
    return Math.max(0, Math.floor(reward.discount));
  }
  return discountFromSubtotal(reward.discountType, reward.discountValue, subtotal, reward.discount);
}
