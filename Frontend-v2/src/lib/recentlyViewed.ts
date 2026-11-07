import type { Product } from '@/types';

const STORAGE_KEY = 'bc-recently-viewed';
const MAX_ITEMS = 12;

export function getRecentlyViewedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function trackRecentlyViewed(productId: string): void {
  if (typeof window === 'undefined' || !productId) return;
  try {
    const prev = getRecentlyViewedIds().filter((id) => id !== productId);
    const next = [productId, ...prev].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function filterRecentlyViewedProducts(products: Product[], excludeIds: Set<string>): Product[] {
  const ids = getRecentlyViewedIds().filter((id) => !excludeIds.has(id));
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => p != null);
}
