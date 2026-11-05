import toast from 'react-hot-toast';
import type { HomeOffer } from '@/components/home/homeOffers';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { api } from '@/lib/api';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';
import { cartItemsToPromoPayload } from '@/lib/promoCartLines';
import { calcUnitPrice, useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { usePromoStore } from '@/store/promoStore';
import { getNearbyFulfillmentStore } from '@/lib/productAvailability';
import type { Product } from '@/types';

function requiredOfferQty(offer: HomeOffer): number {
  const kind = (offer.promotionKind || '').toUpperCase();
  if (kind === 'BOGO' || kind === 'BXGY') {
    const buy = Math.max(1, offer.buyQty ?? (kind === 'BXGY' ? 2 : 1));
    const get = Math.max(1, offer.getQty ?? 1);
    return buy + get;
  }
  return 1;
}

export async function applyHomeOfferToCart(offer: HomeOffer): Promise<{ shouldGoToCart: boolean }> {
  const cart = useCartStore.getState();
  const promo = usePromoStore.getState();

  if (promo.reward?.locked && promo.reward.code.toUpperCase() !== offer.code.toUpperCase()) {
    toast.error('Turn off the applied offer first to use a different one.');
    return { shouldGoToCart: false };
  }

  const setupDone = hasCompletedOrderSetup({
    orderMode: cart.orderMode,
    deliveryInfo: cart.deliveryInfo,
    takeawayInfo: cart.takeawayInfo,
  });

  if (offer.productIds.length > 0 && !setupDone) {
    openOrderModal({ allowSkip: true });
  }

  let added = 0;
  if (offer.productIds.length > 0) {
    const storeId = cart.getActiveStoreId();
    const needQty = requiredOfferQty(offer);
    // Prefer one eligible product with the full BOGO qty so eligibility can pass.
    const primaryProductId = offer.productIds[0];

    try {
      const product = await api.get<Product>(
        `/menu/products/${primaryProductId}${storeId ? `?storeId=${storeId}` : ''}`,
      );
      const unitPrice = calcUnitPrice(product, 'REGULAR', []);
      const result = useCartStore.getState().addItem({
        product,
        size: 'REGULAR',
        toppings: [],
        quantity: needQty,
        unitPrice,
        fulfillmentStore: getNearbyFulfillmentStore(product, storeId),
      });
      if (result.ok) {
        added += needQty;
      } else if (result.reason === 'ordering_closed') {
        openOrderModal({ allowSkip: true });
        toast.error('Online ordering is closed. Save this item to your wishlist instead.');
      } else {
        toast.error(
          result.maxQty === Number.MAX_SAFE_INTEGER
            ? 'Unable to add this item to your cup.'
            : 'Not enough stock at your branch for that quantity.',
        );
      }
    } catch {
      toast.error('Could not add the offer item to your cup.');
    }

    // If multi-product offer and primary failed, try remaining IDs one each as fallback.
    if (added === 0 && offer.productIds.length > 1) {
      for (const productId of offer.productIds.slice(1)) {
        try {
          const product = await api.get<Product>(
            `/menu/products/${productId}${storeId ? `?storeId=${storeId}` : ''}`,
          );
          const unitPrice = calcUnitPrice(product, 'REGULAR', []);
          const result = useCartStore.getState().addItem({
            product,
            size: 'REGULAR',
            toppings: [],
            quantity: 1,
            unitPrice,
            fulfillmentStore: getNearbyFulfillmentStore(product, storeId),
          });
          if (result.ok) added += 1;
        } catch {
          /* try next */
        }
      }
    }
  }

  const latest = useCartStore.getState();
  const mode = latest.orderMode === 'DELIVERY' || latest.orderMode === 'TAKEAWAY' ? latest.orderMode : undefined;
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  const storeId = latest.getFulfillmentStoreId() ?? latest.getActiveStoreId();
  const payload: Record<string, unknown> = {
    code: offer.code,
    orderTotal: Math.floor(latest.subtotal()),
    ...(latest.items.length ? { cartItems: cartItemsToPromoPayload(latest.items) } : {}),
  };
  if (mode) payload.orderMode = mode;
  if (storeId) payload.storeId = storeId;

  try {
    const res = await api.post<{
      discount: number;
      freeDelivery?: boolean;
      description?: string;
      code?: string;
      promotionKind?: string | null;
      discountType?: string | null;
      discountValue?: number | null;
      giftLabel?: string | null;
      giftProduct?: {
        id: string;
        name: string;
        basePrice: number;
        imageUrl?: string | null;
      } | null;
    }>('/promos/validate', payload, isAuthenticated);

    const giftProduct = res.giftProduct ?? offer.giftProduct ?? null;
    const giftLabel = res.giftLabel ?? (giftProduct ? `Free ${giftProduct.name}` : null);

    usePromoStore.getState().setReward({
      code: res.code || offer.code,
      discount: res.freeDelivery ? 0 : res.discount,
      freeDelivery: Boolean(res.freeDelivery) && mode !== 'TAKEAWAY',
      giftLabel,
      giftProduct,
      label: res.description || offer.title,
      promotionKind: res.promotionKind ?? offer.promotionKind,
      discountType: res.discountType ?? null,
      discountValue: res.discountValue ?? null,
      locked: false,
      hideCode: false,
      source: 'carousel',
    });
    toast.success(
      added > 0
        ? `Added to your cup with ${offer.title || offer.code}`
        : `${offer.title || offer.code} applied to your cup`,
    );
  } catch (err: unknown) {
    const fallbackGift = offer.giftProduct ?? null;
    usePromoStore.getState().setReward({
      code: offer.code,
      discount: 0,
      freeDelivery: false,
      giftLabel: fallbackGift ? `Free ${fallbackGift.name}` : null,
      giftProduct: fallbackGift,
      label: offer.title,
      promotionKind: offer.promotionKind,
      discountType: null,
      discountValue: null,
      locked: false,
      hideCode: false,
      source: 'carousel',
    });
    toast.error(err instanceof Error ? err.message : `${offer.code} saved on your cup — add items to unlock it.`);
  }

  return { shouldGoToCart: setupDone };
}
