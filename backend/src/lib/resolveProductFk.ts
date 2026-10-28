import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';

/** Resolve a menu product id or slug to the canonical products.id (must be available). */
export async function resolveAvailableProductId(input: string): Promise<string> {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: input }, { slug: input }],
      isAvailable: true,
    },
    select: { id: true },
  });
  if (!product) {
    throw new AppError('Invalid or unavailable gift product', 400);
  }
  return product.id;
}
