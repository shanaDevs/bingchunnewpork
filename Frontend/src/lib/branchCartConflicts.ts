import { api, ApiError } from '@/lib/api';
import { isProductInStock } from '@/lib/productAvailability';
import type { LocalCartItem } from '@/store/cartStore';
import type { Product } from '@/types';

/**
 * Cart lines that can't be ordered from `storeId`: the branch doesn't stock the product, has switched it off
 * (the API answers 404), or has none left to sell online. Used by the order popup's "Switch branches?" step
 * before a different branch is saved.
 *
 * Each distinct product is looked up once with GET /menu/products/:id?storeId=…, which reports the product's
 * availability at that branch. A lookup that fails for any other reason (network, server) doesn't count as
 * unavailable, so a hiccup never empties the cart; checkout still re-checks stock.
 */
export async function findCartItemsUnavailableAt(items: LocalCartItem[], storeId: string): Promise<LocalCartItem[]> {
  if (items.length === 0) return [];
  const productIds = [...new Set(items.map((item) => item.product.id))];
  const unavailable = new Set<string>();
  await Promise.all(
    productIds.map(async (productId) => {
      try {
        const product = await api.get<Product>(
          `/menu/products/${encodeURIComponent(productId)}?storeId=${encodeURIComponent(storeId)}`,
        );
        if (!isProductInStock(product)) unavailable.add(productId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) unavailable.add(productId);
      }
    }),
  );
  return items.filter((item) => unavailable.has(item.product.id));
}
