import type { Product } from '@/types';

export const OUT_OF_STOCK_THRESHOLD = 5;
export const LOW_STOCK_THRESHOLD = 25;

/** True when the product has not yet received stock at the customer's selected branch. */
export function isProductComingSoon(product: Product): boolean {
  const branch = product.storeAvailability?.branchStock;
  return Boolean(branch?.isComingSoon && !branch.isOutOfStock);
}

/** Customer-facing label when the product cannot be ordered. */
export function getProductUnavailableLabel(product: Product): 'Coming Soon' | 'Out of Stock' {
  return isProductComingSoon(product) ? 'Coming Soon' : 'Out of Stock';
}

/** Short badge copy on menu cards and product detail (redesign menu). */
export function getMenuUnavailableBadgeLabel(product: Product): string {
  return isProductComingSoon(product) ? 'Coming soon' : 'Sold out';
}

/** Tag badge shown to customers — overrides when unavailable at branch. */
export function getProductDisplayTag(product: Product): string | undefined {
  if (!isProductInStock(product)) return getProductUnavailableLabel(product);
  return product.tag || undefined;
}

/** True when the product can be ordered from the customer's selected branch. */
export function isProductInStock(product: Product): boolean {
  if (product.isAvailable === false) return false;
  if (isProductComingSoon(product)) return false;
  return getProductOrderableQty(product) > 0;
}

/** True when online-available qty is low (≤25) but still orderable. */
export function isProductLowStock(product: Product): boolean {
  if (!isProductInStock(product)) return false;
  return Boolean(product.storeAvailability?.branchStock?.isLowStock);
}

/**
 * Max units a customer may order at the selected branch.
 * `branchStock.quantity` is already online-available (on-hand minus the branch OOS buffer).
 */
export function getProductOrderableQty(product: Product): number {
  if (product.isAvailable === false) return 0;

  const availability = product.storeAvailability;
  if (availability) {
    if (isProductComingSoon(product)) return 0;
    if (!availability.atSelectedStore) return 0;
    if (availability.branchStock?.isOutOfStock) return 0;
    if (availability.branchStock?.inStock === false) return 0;

    const qty = availability.branchStock?.quantity;
    if (qty === undefined) return Number.MAX_SAFE_INTEGER;
    if (qty <= 0) return 0;
    return Math.max(0, qty);
  }

  if (product.isOutOfStock) return 0;
  return Number.MAX_SAFE_INTEGER;
}

export function getCartProductQty(
  items: Array<{ id?: string; product: { id: string }; quantity: number }>,
  productId: string,
  excludeLineId?: string,
): number {
  return items.reduce((sum, item) => {
    if (item.product.id !== productId) return sum;
    if (excludeLineId && item.id === excludeLineId) return sum;
    return sum + item.quantity;
  }, 0);
}

/** How many more units of this product can be added to the cart. */
export function getRemainingOrderQty(
  product: Product,
  items: Array<{ id?: string; product: { id: string }; quantity: number }>,
  excludeLineId?: string,
): number {
  const orderableQty = getProductOrderableQty(product);
  if (orderableQty === Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  const inCart = getCartProductQty(items, product.id, excludeLineId);
  return Math.max(0, orderableQty - inCart);
}

/** Nearby-branch fulfillment only — never the customer's selected store. */
export function getNearbyFulfillmentStore(
  product: Product,
  activeStoreId?: string | null,
): { id: string; name: string; distanceKm?: number } | undefined {
  const nearby = product.storeAvailability?.fulfillmentStore;
  if (!nearby) return undefined;
  if (activeStoreId && nearby.id === activeStoreId) return undefined;
  return {
    id: nearby.id,
    name: nearby.name,
    distanceKm: nearby.distanceKm,
  };
}

/** Max quantity allowed for a single cart line (including its current qty). */
export function getMaxLineQty(
  product: Product,
  items: Array<{ id?: string; product: { id: string }; quantity: number }>,
  lineId?: string,
): number {
  const orderableQty = getProductOrderableQty(product);
  if (orderableQty === Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  const otherLinesQty = getCartProductQty(items, product.id, lineId);
  return Math.max(0, orderableQty - otherLinesQty);
}

export function isPopularTagged(product: Product): boolean {
  return product.tag?.trim().toLowerCase() === 'popular';
}

/** In stock → coming soon → out of stock / unavailable. */
export function sortProductsByStock<T extends Product>(products: T[]): T[] {
  return [...products].sort((a, b) => {
    const rank = (p: Product) => {
      if (isProductInStock(p)) return 0;
      if (isProductComingSoon(p)) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}
