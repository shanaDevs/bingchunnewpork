import { prisma } from './prisma';
import { ensureProductRatingsTables } from './productRatingsSchema';
import { isPlaceholderCustomerName } from './customerName';

export type ProductRatingAggregate = {
  avgRating: number;
  ratingCount: number;
};

export type ProductReview = {
  id: string;
  rating: number;
  text: string;
  author: string;
  createdAt: string;
};

export async function getProductRatingAggregates(
  productIds: string[],
): Promise<Map<string, ProductRatingAggregate>> {
  const map = new Map<string, ProductRatingAggregate>();
  if (productIds.length === 0) return map;

  await ensureProductRatingsTables();

  const rows = await prisma.productRating.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds } },
    _avg: { stars: true },
    _count: { stars: true },
  });

  for (const row of rows) {
    map.set(row.productId, {
      avgRating: Math.round((row._avg.stars ?? 0) * 10) / 10,
      ratingCount: row._count.stars,
    });
  }

  return map;
}

export function attachRatingAggregates<T extends { id: string }>(
  products: T[],
  aggregates: Map<string, ProductRatingAggregate>,
) {
  return products.map((product) => {
    const stats = aggregates.get(product.id);
    return {
      ...product,
      avgRating: stats?.avgRating ?? null,
      ratingCount: stats?.ratingCount ?? 0,
    };
  });
}

/** Privacy-friendly display name: "First L." when a surname exists. */
export function formatReviewAuthor(name?: string | null): string {
  if (isPlaceholderCustomerName(name)) return 'Customer';
  const parts = name!.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

export async function listProductReviews(
  productId: string,
  options: {
    minStars?: number;
    maxStars?: number;
    withComment?: boolean;
    limit?: number;
  } = {},
): Promise<ProductReview[]> {
  await ensureProductRatingsTables();

  const minStars = options.minStars;
  const maxStars = options.maxStars;
  const withComment = options.withComment === true;
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const rows = await prisma.productRating.findMany({
    where: {
      productId,
      ...(minStars != null || maxStars != null
        ? {
            stars: {
              ...(minStars != null ? { gte: minStars } : {}),
              ...(maxStars != null ? { lte: maxStars } : {}),
            },
          }
        : {}),
      ...(withComment
        ? {
            AND: [
              { comment: { not: null } },
              { NOT: { comment: '' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      stars: true,
      comment: true,
      guestName: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return rows
    .map((row) => {
      const text = row.comment?.trim() ?? '';
      if (withComment && !text) return null;
      return {
        id: row.id,
        rating: row.stars,
        text,
        author: formatReviewAuthor(row.guestName || row.user?.name),
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((row): row is ProductReview => row != null);
}
