import type { Product } from '@/types';

const BUBBLE_TEA_SLUGS = new Set([
  'bubble-tea',
  'milk-tea',
  'fruit-tea',
  'specialty-tea',
  'boba',
  'tea',
  'drinks',
]);

function isBubbleTea(product: Product): boolean {
  const slug = product.category?.slug?.toLowerCase() ?? '';
  const name = product.category?.name?.toLowerCase() ?? '';
  if (BUBBLE_TEA_SLUGS.has(slug)) return true;
  return /tea|boba|bubble|milk/i.test(name) || /tea|boba|bubble/i.test(product.name);
}

export interface WishlistStats {
  savedItems: number;
  bubbleTeaCount: number;
  estimatedSavings: number;
  favouriteDrink: string;
  totalValue: number;
}

export function computeWishlistStats(products: Product[]): WishlistStats {
  const savedItems = products.length;
  const bubbleTeaCount = products.filter(isBubbleTea).length;
  const totalValue = products.reduce((sum, p) => sum + p.basePrice, 0);
  const estimatedSavings = Math.round(totalValue * 0.12);

  const favourite = [...products].sort((a, b) => {
    const ra = a.avgRating ?? 0;
    const rb = b.avgRating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
  })[0];

  return {
    savedItems,
    bubbleTeaCount,
    estimatedSavings,
    favouriteDrink: favourite?.name ?? '—',
    totalValue,
  };
}

export function groupWishlistCategories(products: Product[]): { id: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const p of products) {
    const id = p.category?.id ?? 'other';
    const name = p.category?.name ?? 'Other';
    const existing = map.get(id);
    if (existing) existing.count += 1;
    else map.set(id, { id, name, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
