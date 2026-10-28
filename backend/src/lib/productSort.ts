export type ProductSortMode = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popular';

type SortableProduct = {
  tag?: string | null;
  sortOrder: number;
  name: string;
  basePrice?: number;
  createdAt?: Date | string;
  avgRating?: number | null;
  ratingCount?: number;
};

/** Tagged items first, then sortOrder, then name. */
export function sortProductsForDisplay<T extends SortableProduct>(products: T[]): T[] {
  return [...products].sort((a, b) => {
    const aTagged = Boolean(a.tag?.trim());
    const bTagged = Boolean(b.tag?.trim());
    if (aTagged !== bTagged) return aTagged ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export function sortProductsByMode<T extends SortableProduct>(
  products: T[],
  mode: ProductSortMode,
): T[] {
  const list = [...products];

  switch (mode) {
    case 'name_asc':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'name_desc':
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case 'price_asc':
      return list.sort((a, b) => (a.basePrice ?? 0) - (b.basePrice ?? 0));
    case 'price_desc':
      return list.sort((a, b) => (b.basePrice ?? 0) - (a.basePrice ?? 0));
    case 'rating':
      return list.sort((a, b) => {
        const aAvg = a.avgRating ?? 0;
        const bAvg = b.avgRating ?? 0;
        if (bAvg !== aAvg) return bAvg - aAvg;
        return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
      });
    case 'newest':
      return list.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    case 'popular':
    default:
      return sortProductsForDisplay(list);
  }
}
