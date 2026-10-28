import { formatSpinOffer, type SpinClaim } from '@/lib/spinStorage';
import type { AppliedPromoReward } from '@/store/promoStore';

export function rewardFromSpinClaim(
  claim: SpinClaim,
  orderTotal: number,
  orderMode: 'DELIVERY' | 'TAKEAWAY' | null,
): AppliedPromoReward {
  const offer = claim.offer;
  let discount = 0;
  let freeDelivery = false;
  let giftLabel: string | null = null;
  let giftProduct: AppliedPromoReward['giftProduct'] = null;

  if (offer.offerType === 'PERCENTAGE') {
    discount = Math.min(orderTotal, Math.floor((orderTotal * offer.discountValue) / 100));
  } else if (offer.offerType === 'FIXED') {
    discount = Math.min(orderTotal, offer.discountValue);
  } else if (offer.offerType === 'FREE_DELIVERY') {
    freeDelivery = orderMode !== 'TAKEAWAY';
  } else if (offer.offerType === 'GIFT') {
    giftLabel = offer.giftProduct
      ? `Free ${offer.giftProduct.name}`
      : offer.description || offer.label;
    giftProduct = offer.giftProduct
      ? {
          id: offer.giftProduct.id,
          name: offer.giftProduct.name,
          basePrice: offer.giftProduct.basePrice,
          imageUrl: offer.giftProduct.imageUrl,
        }
      : null;
  }

  return {
    code: claim.claimCode,
    discount: freeDelivery ? 0 : discount,
    freeDelivery,
    giftLabel,
    giftProduct,
    label: formatSpinOffer(offer),
    discountType: offer.offerType === 'PERCENTAGE' ? 'PERCENTAGE' : offer.offerType === 'FIXED' ? 'FIXED' : null,
    discountValue: offer.offerType === 'PERCENTAGE' || offer.offerType === 'FIXED' ? offer.discountValue : null,
    locked: false,
    hideCode: false,
    source: 'spin',
  };
}

export function isSpinRewardCode(code?: string | null): boolean {
  return Boolean(code && code.toUpperCase().startsWith('SPIN-'));
}
