import { randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma, Prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { withProductImageUrl } from '../lib/productImages';
import { getProductRatingAggregates } from '../lib/productRatings';

const wishlistProductInclude = {
  product: {
    include: {
      category: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;
// d

function firstNameOnly(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || 'A friend';
}

async function readShareToken(userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ wishlistShareToken: string | null }>>(
    Prisma.sql`SELECT "wishlistShareToken" FROM users WHERE id = ${userId} LIMIT 1`,
  );
  return rows[0]?.wishlistShareToken ?? null;
}

async function writeShareToken(userId: string, token: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`UPDATE users SET "wishlistShareToken" = ${token} WHERE id = ${userId}`,
  );
}

async function findOwnerByShareToken(token: string): Promise<{ id: string; name: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; deletedAt: Date | null }>>(
    Prisma.sql`SELECT id, name, "deletedAt" FROM users WHERE "wishlistShareToken" = ${token} LIMIT 1`,
  );
  const owner = rows[0];
  if (!owner || owner.deletedAt) return null;
  return { id: owner.id, name: owner.name };
}

async function serializeWishlistItems(
  items: Array<{
    id: string;
    productId: string;
    createdAt: Date;
    product: { imageUrl?: string | null; imageUrls?: unknown };
  }>,
) {
  const aggregates = await getProductRatingAggregates(items.map((i) => i.productId));
  return items.map((item) => {
    const stats = aggregates.get(item.productId);
    return {
      id: item.id,
      productId: item.productId,
      createdAt: item.createdAt,
      product: withProductImageUrl({
        ...item.product,
        avgRating: stats?.avgRating ?? null,
        ratingCount: stats?.ratingCount ?? 0,
      }),
    };
  });
}

export async function getWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      include: wishlistProductInclude,
      orderBy: { createdAt: 'desc' },
    });

    return success(res, await serializeWishlistItems(items));
  } catch (err) {
    next(err);
  }
}

export async function getWishlistIds(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      select: { productId: true },
    });
    return success(res, items.map((i) => i.productId));
  } catch (err) {
    next(err);
  }
}

export async function createShareLink(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const existingToken = await readShareToken(userId);
    if (existingToken) {
      return success(res, { token: existingToken });
    }

    const token = randomBytes(16).toString('hex');
    await writeShareToken(userId, token);
    return success(res, { token });
  } catch (err) {
    next(err);
  }
}

export async function getSharedWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const token = String(req.params.token ?? '').trim();
    if (!token) throw new AppError('Wishlist not found', 404);

    const owner = await findOwnerByShareToken(token);
    if (!owner) throw new AppError('Wishlist not found', 404);

    const items = await prisma.wishlistItem.findMany({
      where: { userId: owner.id },
      include: wishlistProductInclude,
      orderBy: { createdAt: 'desc' },
    });

    return success(res, {
      ownerName: firstNameOnly(owner.name),
      items: await serializeWishlistItems(items),
    });
  } catch (err) {
    next(err);
  }
}

export async function addToWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const productId = req.params.productId as string;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isAvailable) {
      throw new AppError('Product not found', 404);
    }

    const item = await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    return success(res, { id: item.id, productId }, 201);
  } catch (err) {
    next(err);
  }
}

export async function removeFromWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const productId = req.params.productId as string;

    await prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });

    return success(res, { message: 'Removed from wishlist' });
  } catch (err) {
    next(err);
  }
}
