import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { type StoreProductRow } from '../lib/storeInventory';
import { getBranchDeactivatedProductIds } from '../lib/branchDeactivation';
import { branchStockFromRow, type BranchStockMeta, type MenuStockRow } from '../lib/menuBranchStock';
import {
  getActiveReservedQuantity,
  getActiveReservedQuantityBatch,
} from '../repositories/inventoryReservationRepository';
import { resolveProductImageFields, withProductImageUrl } from '../lib/productImages';
import { resolveCategoryIcon } from '../lib/categoryIcons';
import { sortProductsByMode, sortProductsForDisplay } from '../lib/productSort';
import { attachRatingAggregates, getProductRatingAggregates, listProductReviews } from '../lib/productRatings';
import {
  analyticsCacheKey,
  invalidateAnalyticsCacheByPrefix,
  withAnalyticsCache,
} from '../lib/analyticsResponseCache';

const MENU_CACHE_MS = 15_000;

function invalidateMenuCatalogCache(): void {
  invalidateAnalyticsCacheByPrefix('menu-products');
  invalidateAnalyticsCacheByPrefix('menu-categories');
}

function withProductCostVisibility<T extends { cost?: number }>(
  product: T,
  includeCost: boolean,
): Omit<T, 'cost'> & { cost?: number } {
  if (includeCost) return product;
  const { cost: _cost, ...rest } = product;
  return rest;
}

function shouldIncludeProductCost(req: Request): boolean {
  return req.user?.type === 'admin' && req.user?.role === 'SYSTEM_ADMIN';
}

async function imageUrlsByProductId(ids: string[]): Promise<Map<string, unknown>> {
  if (!ids.length) return new Map();
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; imageUrls: unknown }>>(
      `SELECT "id", "imageUrls" FROM "products" WHERE "id" IN (${placeholders})`,
      ...ids,
    );
    return new Map(rows.map((row) => [row.id, row.imageUrls]));
  } catch {
    return new Map();
  }
}

export async function getCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const normalized = await withAnalyticsCache(
      'menu-categories',
      async () => {
        const categories = await prisma.category.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { products: { where: { isAvailable: true } } } } },
        });
        return categories.map((cat) => ({
          ...cat,
          icon: resolveCategoryIcon(cat.slug, cat.icon),
        }));
      },
      60_000,
    );
    return success(res, normalized);
  } catch (err) { next(err); }
}

const optionalQueryBoolean = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return undefined;
  },
  z.boolean().optional(),
);

const productsQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  tag: z.string().optional(),
  available: optionalQueryBoolean,
  all: optionalQueryBoolean,
  storeId: z.string().optional(),
  searchNearby: optionalQueryBoolean,
  sort: z.enum(['name_asc', 'name_desc', 'price_asc', 'price_desc', 'rating', 'newest', 'popular']).optional(),
});

type StoreAvailabilityMeta = {
  atSelectedStore: boolean;
  branchStock?: BranchStockMeta;
  fulfillmentStore?: {
    id: string;
    name: string;
    addressLine: string;
    city: string;
    distanceKm: number;
  };
};

type StoreProductSummary = {
  storeId: string;
  isAvailable: boolean;
  stock?: number;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  weeklyTargetQty?: number;
  lowStockThreshold?: number | null;
  onlineOutOfStockThreshold?: number | null;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
};

type BatchStockMeta = {
  totalBatchCount: number;
  weeklyReceivedQty: number;
};

function toMenuStockRow(
  row: Pick<
    StoreProductRow,
    | 'stock'
    | 'weeklyBaseQty'
    | 'weeklyRemainingQty'
    | 'weeklyTargetQty'
    | 'isAvailable'
    | 'lowStockThreshold'
    | 'onlineOutOfStockThreshold'
  >,
  batchMeta?: BatchStockMeta,
): MenuStockRow {
  return {
    stock: row.stock,
    weeklyBaseQty: row.weeklyBaseQty,
    weeklyRemainingQty: row.weeklyRemainingQty,
    weeklyTargetQty: row.weeklyTargetQty ?? 0,
    isAvailable: row.isAvailable,
    lowStockThreshold: row.lowStockThreshold,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold,
    totalBatchCount: batchMeta?.totalBatchCount ?? 0,
    weeklyReceivedQty: batchMeta?.weeklyReceivedQty ?? 0,
  };
}

async function loadBatchMetaByProduct(
  storeId: string,
  productIds: string[],
): Promise<Map<string, BatchStockMeta>> {
  const map = new Map<string, BatchStockMeta>();
  if (productIds.length === 0) return map;

  try {
    const groups = await prisma.stockBatch.groupBy({
      by: ['productId'],
      where: { storeId, productId: { in: productIds } },
      _count: { id: true },
      _sum: { receivedQty: true },
    });
    for (const group of groups) {
      map.set(group.productId, {
        totalBatchCount: group._count.id,
        weeklyReceivedQty: group._sum.receivedQty ?? 0,
      });
    }
  } catch {
    /* batch table may be unavailable in some environments */
  }

  return map;
}

function enrichStoreProducts(storeProducts: StoreProductSummary[]): StoreProductSummary[] {
  return storeProducts.map((sp) => {
    const meta = branchStockFromRow(toMenuStockRow({
      stock: sp.stock ?? sp.weeklyRemainingQty,
      weeklyBaseQty: sp.weeklyBaseQty,
      weeklyRemainingQty: sp.weeklyRemainingQty,
      weeklyTargetQty: sp.weeklyTargetQty ?? 0,
      isAvailable: sp.isAvailable,
      lowStockThreshold: sp.lowStockThreshold,
      onlineOutOfStockThreshold: sp.onlineOutOfStockThreshold,
    }));
    return {
      ...sp,
      isAvailable: sp.isAvailable && meta.inStock,
      isLowStock: meta.isLowStock,
      isOutOfStock: meta.isOutOfStock,
    };
  });
}

function resolveStoreProductRow(
  productId: string,
  storeId: string,
  rowByProductStore: Map<string, StoreProductRow>,
  storeProducts?: StoreProductSummary[],
): StoreProductRow | undefined {
  const fromQuery = rowByProductStore.get(`${productId}:${storeId}`);
  if (fromQuery) return fromQuery;

  const fromInclude = storeProducts?.find((sp) => sp.storeId === storeId);
  if (!fromInclude) return undefined;

  return {
    storeId: fromInclude.storeId,
    productId,
    stock: fromInclude.stock ?? fromInclude.weeklyRemainingQty,
    weeklyBaseQty: fromInclude.weeklyBaseQty,
    weeklyRemainingQty: fromInclude.weeklyRemainingQty,
    weeklyTargetQty: fromInclude.weeklyTargetQty ?? 0,
    isAvailable: fromInclude.isAvailable,
    lowStockThreshold: fromInclude.lowStockThreshold,
    onlineOutOfStockThreshold: fromInclude.onlineOutOfStockThreshold,
  };
}

async function loadMenuProducts(
  query: z.infer<typeof productsQuerySchema>,
  includeCost: boolean,
) {
  const { category, search, tag, available, all, storeId, sort } = query;
  const trimmedSearch = search?.trim();
  const sortMode = sort ?? 'name_asc';

  let products = await prisma.product.findMany({
      where: {
        ...(all
          ? {}
          : available !== undefined
            ? { isAvailable: available }
            : { isAvailable: true }),
        ...(category && category !== 'all' ? { category: { slug: category } } : {}),
        ...(trimmedSearch ? {
          OR: [
            { name: { contains: trimmedSearch, mode: 'insensitive' } },
            { description: { contains: trimmedSearch, mode: 'insensitive' } },
            { tag: { contains: trimmedSearch, mode: 'insensitive' } },
          ],
        } : {}),
        ...(tag ? { tag } : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        toppings: { include: { topping: true } },
        storeProducts: {
          ...(storeId ? { where: { storeId } } : {}),
          select: {
            storeId: true,
            isAvailable: true,
            stock: true,
            weeklyBaseQty: true,
            weeklyRemainingQty: true,
            lowStockThreshold: true,
            onlineOutOfStockThreshold: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const productIds = products.map((p) => p.id);
    const [aggregates, imageUrlMap] = await Promise.all([
      getProductRatingAggregates(productIds),
      imageUrlsByProductId(productIds),
    ]);
    products = sortProductsByMode(attachRatingAggregates(products, aggregates), sortMode);

    if (!storeId) {
      const withImages = products.map((p) => withProductCostVisibility(withProductImageUrl({
        ...p,
        imageUrls: imageUrlMap.get(p.id),
        storeProducts: enrichStoreProducts(p.storeProducts),
      }), includeCost));
      return withImages;
    }

    const [
      selectedStore,
      storeProductRows,
      batchMetaByProduct,
      reservedByProduct,
      frozenRows,
      flagDeactivatedIds,
    ] = await Promise.all([
      prisma.store.findFirst({
        where: { id: storeId, isActive: true },
      }),
      prisma.storeProduct.findMany({
        where: {
          storeId,
          productId: { in: productIds },
        },
        select: {
          storeId: true,
          productId: true,
          stock: true,
          weeklyBaseQty: true,
          weeklyRemainingQty: true,
          weeklyTargetQty: true,
          isAvailable: true,
          lowStockThreshold: true,
          onlineOutOfStockThreshold: true,
        },
      }).catch(() => [] as StoreProductRow[]),
      loadBatchMetaByProduct(storeId, productIds),
      getActiveReservedQuantityBatch(storeId, productIds).catch(() => new Map<string, number>()),
      prisma.stockBatch.groupBy({
        by: ['productId'],
        where: { storeId, status: 'FROZEN' },
      }),
      getBranchDeactivatedProductIds(storeId, productIds),
    ]);
    if (!selectedStore) throw new AppError('Selected store not found', 404);

    // Build the map with .set() — `new Map(rows.map(...))` fails tsc when
    // Promise.all+.catch widens storeProductRows to any[] (tuple vs any[]).
    const rowByProductStore = new Map<string, StoreProductRow>();
    for (const r of storeProductRows as StoreProductRow[]) {
      rowByProductStore.set(`${r.productId}:${r.storeId}`, r);
    }
    const branchDeactivatedIds = new Set(frozenRows.map((row) => row.productId));
    for (const productId of flagDeactivatedIds) {
      branchDeactivatedIds.add(productId);
    }

    const enriched = products
      .filter((product) => !branchDeactivatedIds.has(product.id))
      .map((product) => {
      const row = resolveStoreProductRow(
        product.id,
        selectedStore.id,
        rowByProductStore,
        product.storeProducts,
      );
      const branchStock = branchStockFromRow(
        row ? toMenuStockRow(row, batchMetaByProduct.get(product.id)) : undefined,
        reservedByProduct.get(product.id) ?? 0,
      );
      const atSelectedStore = row != null;
      const inStock = branchStock.inStock;

      return withProductCostVisibility(withProductImageUrl({
        ...product,
        imageUrls: imageUrlMap.get(product.id),
        storeProducts: enrichStoreProducts(product.storeProducts),
        isAvailable: product.isAvailable && atSelectedStore && inStock,
        isOutOfStock: atSelectedStore ? Boolean(branchStock.isOutOfStock) : true,
        storeAvailability: {
          atSelectedStore,
          branchStock,
        } satisfies StoreAvailabilityMeta,
      }), includeCost);
    });

    return enriched;
}

export async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const query = productsQuerySchema.parse(req.query);
    const includeCost = shouldIncludeProductCost(req);
    const data = await withAnalyticsCache(
      analyticsCacheKey([
        'menu-products',
        query.category,
        query.search?.trim(),
        query.tag,
        query.available == null ? '' : String(query.available),
        query.all == null ? '' : String(query.all),
        query.storeId,
        query.sort ?? 'name_asc',
        includeCost ? 'cost' : 'public',
      ]),
      () => loadMenuProducts(query, includeCost),
      MENU_CACHE_MS,
    );
    return success(res, data);
  } catch (err) { next(err); }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId } = z.object({ storeId: z.string().optional() }).parse(req.query);
    const includeCost = shouldIncludeProductCost(req);

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: req.params.id as string }, { slug: req.params.id as string }] },
      include: {
        category: true,
        toppings: { include: { topping: true } },
      },
    });
    if (!product) throw new AppError('Product not found', 404);
    const imageUrlMap = await imageUrlsByProductId([product.id]);

    const aggregates = await getProductRatingAggregates([product.id]);
    const stats = aggregates.get(product.id);
    const wishlistCount = await prisma.wishlistItem.count({ where: { productId: product.id } });

    const withRating = {
      ...product,
      imageUrls: imageUrlMap.get(product.id),
      avgRating: stats?.avgRating ?? null,
      ratingCount: stats?.ratingCount ?? 0,
      wishlistCount,
    };

    if (!storeId) return success(res, withProductCostVisibility(withProductImageUrl(withRating), includeCost));

    const inv = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId: product.id } },
    }).catch(() => null);

    const frozenBatch = await prisma.stockBatch.findFirst({
      where: { storeId, productId: product.id, status: 'FROZEN' },
      select: { id: true },
    });
    if (frozenBatch) throw new AppError('Product not available at this branch', 404);

    let reservedQty = 0;
    if (inv) {
      try {
        reservedQty = await getActiveReservedQuantity(storeId, product.id);
      } catch {
        reservedQty = 0;
      }
    }
    const branchStock = branchStockFromRow(
      inv ? toMenuStockRow(inv, (await loadBatchMetaByProduct(storeId, [product.id])).get(product.id)) : undefined,
      reservedQty,
    );
    const atSelectedStore = inv != null;
    return success(res, withProductCostVisibility(withProductImageUrl({
      ...withRating,
      isAvailable: product.isAvailable && atSelectedStore && branchStock.inStock,
      storeAvailability: {
        atSelectedStore,
        branchStock,
      },
      isOutOfStock: atSelectedStore ? branchStock.isOutOfStock ?? false : true,
    }), includeCost));
  } catch (err) { next(err); }
}

export async function getProductRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.id as string;
    const query = z.object({
      minStars: z.coerce.number().int().min(1).max(5).optional(),
      maxStars: z.coerce.number().int().min(1).max(5).optional(),
      withComment: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .optional()
        .transform((v) => v === true || v === 'true'),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.query);

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: productId }, { slug: productId }] },
      select: { id: true },
    });
    if (!product) throw new AppError('Product not found', 404);

    const reviews = await listProductReviews(product.id, {
      minStars: query.minStars,
      maxStars: query.maxStars,
      withComment: query.withComment,
      limit: query.limit ?? 20,
    });

    return success(res, reviews);
  } catch (err) { next(err); }
}

export async function submitProductRating(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.id as string;
    const body = z.object({
      stars: z.number().int().min(1).max(5),
      comment: z.string().min(1, 'Review is required'),
      name: z.string().trim().min(4, 'Name must be more than 3 characters').max(100),
    }).parse(req.body);

    // Keep emoji / unicode; only strip surrounding whitespace.
    const trimmedComment = body.comment.trim();
    if (!trimmedComment) {
      throw new AppError('Review is required', 400);
    }
    const trimmedName = body.name.trim();
    const userId = req.user?.type === 'user' ? req.user.sub : null;

    const product = await prisma.product.findFirst({
      where: { OR: [{ id: productId }, { slug: productId }] },
      select: { id: true },
    });
    if (!product) throw new AppError('Product not found', 404);

    // Always create a new review so the carousel can show multiple submissions.
    await prisma.productRating.create({
      data: {
        productId: product.id,
        userId,
        guestName: trimmedName,
        stars: body.stars,
        comment: trimmedComment,
      },
    });

    const aggregates = await getProductRatingAggregates([product.id]);
    const stats = aggregates.get(product.id);

    return success(res, {
      productId: product.id,
      avgRating: stats?.avgRating ?? body.stars,
      ratingCount: stats?.ratingCount ?? 1,
      userStars: body.stars,
      comment: trimmedComment,
      author: trimmedName,
    });
  } catch (err) { next(err); }
}

// Admin CRUD
const productSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  ingredients: z.string().optional().nullable(),
  basePrice: z.number().int().positive(),
  cost: z.number().int().min(0),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string()).optional(),
  tag: z.string().optional().nullable(),
  isAvailable: z.boolean().optional(),
  isDeliveryAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  toppingIds: z.array(z.string()).optional(),
});

import { uploadToSpaces } from '../lib/spaces';
import { assertAllowedImageUpload } from '../middleware/upload';
import { notifyBranchNewProduct } from '../lib/branchNotifications';

async function persistProductImageUrls(
  productId: string,
  images: { imageUrl: string | null; imageUrls: string[] },
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "products" SET "imageUrl" = $1, "imageUrls" = $2::jsonb, "updatedAt" = NOW() WHERE "id" = $3`,
    images.imageUrl,
    JSON.stringify(images.imageUrls),
    productId,
  );
}

export async function uploadProductImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }
    assertAllowedImageUpload(req.file);
    const imageUrl = await uploadToSpaces(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    return success(res, { imageUrl });
  } catch (err) { next(err); }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = productSchema.parse(req.body);
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const images = resolveProductImageFields({ imageUrl: data.imageUrl, imageUrls: data.imageUrls });

    const product = await prisma.product.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        slug: `${slug}-${Date.now()}`,
        description: data.description,
        ingredients: data.ingredients,
        basePrice: data.basePrice,
        cost: data.cost,
        imageUrl: images.imageUrl,
        tag: data.tag,
        isAvailable: data.isAvailable ?? true,
        isDeliveryAvailable: data.isDeliveryAvailable ?? true,
        sortOrder: data.sortOrder ?? 0,
        toppings: data.toppingIds ? {
          create: data.toppingIds.map((toppingId) => ({ toppingId }))
        } : undefined,
      } as never,
    });

    await persistProductImageUrls(product.id, images);

    // New products are added to all active branches at 0 weekly stock (Coming Soon)
    const { addProductToAllBranches } = await import('../lib/storeInventory');
    await addProductToAllBranches(product.id, 0);

    void notifyBranchNewProduct({
      productId: product.id,
      productName: product.name,
    }).catch(() => undefined);

    invalidateMenuCatalogCache();
    return success(res, withProductImageUrl({ ...product, ...images }), 201);
  } catch (err) { next(err); }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = productSchema.partial().parse(req.body);
    const { toppingIds, imageUrl, imageUrls, ...rest } = data;
    const hasImagePatch = imageUrl !== undefined || imageUrls !== undefined;
    const images = hasImagePatch
      ? resolveProductImageFields({ imageUrl: imageUrl ?? null, imageUrls: imageUrls ?? [] })
      : null;

    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: {
        ...rest,
        ...(images ? { imageUrl: images.imageUrl } : {}),
        ...(toppingIds !== undefined ? {
          toppings: {
            deleteMany: {},
            create: toppingIds.map((toppingId) => ({ toppingId })),
          }
        } : {}),
      } as never,
    });

    if (images) {
      await persistProductImageUrls(product.id, images);
    }

    // Catalog availability only — never overwrite on-hand stock (that comes from batches).
    // Previously setting stock to 1/0 desynced branch qty from batches and falsely marked items OOS online.
    if (rest.isAvailable !== undefined) {
      await prisma.storeProduct.updateMany({
        where: { productId: product.id },
        data: { isAvailable: rest.isAvailable },
      }).catch(() => undefined);
    }

    invalidateMenuCatalogCache();
    return success(res, withProductImageUrl({ ...product, ...(images ?? {}) }));
  } catch (err) { next(err); }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.product.update({ where: { id: req.params.id as string }, data: { isAvailable: false } });
    invalidateMenuCatalogCache();
    return success(res, { message: 'Product deactivated' });
  } catch (err) { next(err); }
}

export async function getToppings(req: Request, res: Response, next: NextFunction) {
  try {
    const all = req.query.all === 'true';
    const toppings = await prisma.topping.findMany({
      where: all ? {} : { isAvailable: true },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
    return success(res, toppings);
  } catch (err) { next(err); }
}

const toppingSchema = z.object({
  name: z.string().min(1).max(100),
  extraPrice: z.number().int().min(0),
  isAvailable: z.boolean().optional(),
});

export async function createTopping(req: Request, res: Response, next: NextFunction) {
  try {
    const data = toppingSchema.parse(req.body);
    const topping = await prisma.topping.create({ data: { ...data, isAvailable: data.isAvailable ?? true } });
    return success(res, topping, 201);
  } catch (err) { next(err); }
}

export async function updateTopping(req: Request, res: Response, next: NextFunction) {
  try {
    const data = toppingSchema.partial().parse(req.body);
    const topping = await prisma.topping.update({
      where: { id: req.params.id as string },
      data,
    });
    return success(res, topping);
  } catch (err) { next(err); }
}

export async function deleteTopping(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.topping.delete({ where: { id: req.params.id as string } });
    return success(res, { message: 'Addon deleted' });
  } catch (err) { next(err); }
}

const bulkAssignSchema = z.object({
  toppingIds: z.array(z.string()).min(1),
  productIds: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
}).refine((d) => d.productIds?.length || d.categoryId, 'productIds or categoryId required');

export async function bulkAssignToppings(req: Request, res: Response, next: NextFunction) {
  try {
    const data = bulkAssignSchema.parse(req.body);

    let productIds = data.productIds ?? [];
    if (data.categoryId) {
      const products = await prisma.product.findMany({
        where: { categoryId: data.categoryId },
        select: { id: true },
      });
      productIds = products.map((p) => p.id);
    }

    if (!productIds.length) throw new AppError('No products found', 400);

    for (const productId of productIds) {
      for (const toppingId of data.toppingIds) {
        await prisma.productTopping.upsert({
          where: { productId_toppingId: { productId, toppingId } },
          update: {},
          create: { productId, toppingId },
        });
      }
    }

    invalidateMenuCatalogCache();
    return success(res, { message: `Assigned addons to ${productIds.length} product(s)` });
  } catch (err) { next(err); }
}

// Category admin
export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = z.object({ name: z.string(), icon: z.string().optional(), sortOrder: z.number().int().optional() }).parse(req.body);
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cat = await prisma.category.create({ data: { name: data.name, slug, icon: data.icon, sortOrder: data.sortOrder ?? 0 } });
    invalidateMenuCatalogCache();
    return success(res, cat, 201);
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = z.object({ name: z.string().optional(), icon: z.string().optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() }).parse(req.body);
    const cat = await prisma.category.update({ where: { id: req.params.id as string }, data });
    invalidateMenuCatalogCache();
    return success(res, cat);
  } catch (err) { next(err); }
}
