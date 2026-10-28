import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { withProductImageUrl } from '../lib/productImages';
import { getProductRatingAggregates } from '../lib/productRatings';

const specialSchema = z.object({
  productId: z.string(),
  specialPrice: z.number().int().positive(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime(),
  isActive: z.boolean().optional(),
});

function activeSpecialWhere(now = new Date()) {
  return {
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gt: now },
  };
}

export async function getTodaySpecial(_req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const special = await prisma.dailySpecial.findFirst({
      where: activeSpecialWhere(now),
      include: {
        product: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { endsAt: 'asc' },
    });

    if (!special) return success(res, null);

    const aggregates = await getProductRatingAggregates([special.productId]);
    const stats = aggregates.get(special.productId);

    return success(res, {
      id: special.id,
      specialPrice: special.specialPrice,
      startsAt: special.startsAt,
      endsAt: special.endsAt,
      product: withProductImageUrl({
        ...special.product,
        avgRating: stats?.avgRating ?? null,
        ratingCount: stats?.ratingCount ?? 0,
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function listSpecials(_req: Request, res: Response, next: NextFunction) {
  try {
    const specials = await prisma.dailySpecial.findMany({
      include: {
        product: { select: { id: true, name: true, basePrice: true, imageUrl: true } },
      },
      orderBy: { endsAt: 'desc' },
      take: 50,
    });
    return success(res, specials);
  } catch (err) {
    next(err);
  }
}

export async function createSpecial(req: Request, res: Response, next: NextFunction) {
  try {
    const data = specialSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new AppError('Product not found', 404);

    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const endsAt = new Date(data.endsAt);
    if (endsAt <= startsAt) throw new AppError('End time must be after start time', 400);
    if (data.specialPrice >= product.basePrice) {
      throw new AppError('Special price must be lower than base price', 400);
    }

    await prisma.dailySpecial.updateMany({
      where: activeSpecialWhere(),
      data: { isActive: false },
    });

    const special = await prisma.dailySpecial.create({
      data: {
        productId: data.productId,
        specialPrice: data.specialPrice,
        startsAt,
        endsAt,
        isActive: data.isActive ?? true,
      },
      include: { product: true },
    });

    return success(res, special, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSpecial(req: Request, res: Response, next: NextFunction) {
  try {
    const data = specialSchema.partial().parse(req.body);
    const id = req.params.id as string;

    const existing = await prisma.dailySpecial.findUnique({ where: { id } });
    if (!existing) throw new AppError('Special not found', 404);

    const special = await prisma.dailySpecial.update({
      where: { id },
      data: {
        ...(data.productId !== undefined ? { productId: data.productId } : {}),
        ...(data.specialPrice !== undefined ? { specialPrice: data.specialPrice } : {}),
        ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
        ...(data.endsAt !== undefined ? { endsAt: new Date(data.endsAt) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: { product: true },
    });

    return success(res, special);
  } catch (err) {
    next(err);
  }
}

export async function deleteSpecial(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const existing = await prisma.dailySpecial.findUnique({ where: { id } });
    if (!existing) throw new AppError('Special not found', 404);
    await prisma.dailySpecial.update({
      where: { id },
      data: { isActive: false },
    });
    return success(res, { message: 'Special deactivated' });
  } catch (err) {
    next(err);
  }
}
