import type { Product } from '@/types';
import { isProductComingSoon, isProductInStock, isPopularTagged } from '@/lib/productAvailability';

export function isSignatureTagged(product: Product): boolean {
  return product.tag?.trim().toLowerCase() === 'signature';
}

export interface MenuUserSignals {
  wishlistIds?: Set<string>;
  recentlyViewedIds?: string[];
  orderedProductIds?: string[];
  cartProductIds?: Set<string>;
}

/** 0 = in stock, 1 = coming soon, 2 = out of stock / unavailable. */
function getAvailabilityTier(product: Product): number {
  if (isProductInStock(product)) return 0;
  if (isProductComingSoon(product)) return 1;
  return 2;
}

function getMenuTier(product: Product): number {
  if (isPopularTagged(product)) return 0;
  if (isSignatureTagged(product)) return 1;
  return 2;
}

function getUserAffinityScore(productId: string, signals: MenuUserSignals): number {
  let score = 0;

  if (signals.wishlistIds?.has(productId)) score += 1_000;
  if (signals.cartProductIds?.has(productId)) score += 500;

  const recent = signals.recentlyViewedIds ?? [];
  const recentIdx = recent.indexOf(productId);
  if (recentIdx >= 0) score += (recent.length - recentIdx) * 10;

  const ordered = signals.orderedProductIds ?? [];
  const orderedIdx = ordered.indexOf(productId);
  if (orderedIdx >= 0) score += (ordered.length - orderedIdx) * 25;

  return score;
}

/** In stock first, then coming soon, then others — within each group: Popular, Signature, affinity. */
export function sortProductsForMenu<T extends Product>(
  products: T[],
  signals: MenuUserSignals = {},
): T[] {
  return [...products].sort((a, b) => {
    const availA = getAvailabilityTier(a);
    const availB = getAvailabilityTier(b);
    if (availA !== availB) return availA - availB;

    const tierA = getMenuTier(a);
    const tierB = getMenuTier(b);
    if (tierA !== tierB) return tierA - tierB;

    if (tierA === 2) {
      const scoreA = getUserAffinityScore(a.id, signals);
      const scoreB = getUserAffinityScore(b.id, signals);
      if (scoreA !== scoreB) return scoreB - scoreA;
    }

    return 0;
  });
}
