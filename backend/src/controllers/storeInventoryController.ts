import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { normalizeProductImageUrl } from '../lib/productImages';
import { syncStoreProducts } from '../lib/storeInventory';
import { requireBranchStoreId } from '../middleware/auth';
import {
  getEffectiveThresholds,
  isOnlineOutOfStockByQty,
  setBranchProductAvailability,
} from '../lib/batchStockEngine';
import { getBranchDeactivatedAtByProductId } from '../lib/branchDeactivation';
import { ensureWeeklyStockBackfilled } from '../lib/stockAuditSchema';
import { enrichStockRowsForList } from './batchStockController';
import { isNeverStockedAtBranch } from '../lib/menuBranchStock';

async function resolveStoreId(req: Request, queryStoreId?: string): Promise<string> {
  if (req.user?.role === 'STORE_MANAGER') {
    return requireBranchStoreId(req);
  }
  if (!queryStoreId) throw new AppError('storeId is required', 400);
  return queryStoreId;
}

export async function listBranchStock(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureWeeklyStockBackfilled();

    const { storeId: queryStoreId, search, category } = z.object({
      storeId: z.string().optional(),
      search: z.string().optional(),
      category: z.string().optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, city: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const products = await prisma.product.findMany({
      where: {
        storeProducts: { some: { storeId } },
        ...(category && category !== 'all' ? { category: { slug: category } } : {}),
        ...(search?.trim()
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' } },
                { tag: { contains: search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { category: { select: { name: true, slug: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const inventory = await prisma.storeProduct.findMany({
      where: { storeId, productId: { in: products.map((p) => p.id) } },
    });
    const invMap = new Map(inventory.map((r) => [r.productId, r]));
    const branchDeactivatedAtMap = await getBranchDeactivatedAtByProductId(
      storeId,
      products.map((p) => p.id),
    );
    const enrichedMap = await enrichStockRowsForList(
      storeId,
      inventory.map((inv) => ({
        productId: inv.productId,
        ...inv,
        branchDeactivatedAt: branchDeactivatedAtMap.get(inv.productId) ?? null,
      })),
    );

    const rows = products.map((p) => {
      const inv = invMap.get(p.id);
      const weeklyBaseQty = inv?.weeklyBaseQty ?? 0;
      const weeklyRemainingQty = inv?.weeklyRemainingQty ?? 0;
      const enriched = inv ? enrichedMap.get(p.id) ?? null : null;

      const isAvailable = inv?.isAvailable ?? p.isAvailable;
      const isBranchDeactivated =
        enriched?.isBranchDeactivated ?? branchDeactivatedAtMap.has(p.id);
      const onHandQty = enriched?.onHandQty ?? weeklyRemainingQty;
      const weeklyTargetQty = inv?.weeklyTargetQty ?? 0;
      const weeklyReceivedQty = enriched?.weeklyReceivedQty ?? 0;
      const totalBatchCount = enriched?.totalBatchCount ?? 0;

      // Catalog seed / sync uses isAvailable=false with no branchDeactivatedAt.
      // Match customer Coming Soon: never-stocked + not branch-inactive → New Product.
      const isNewProduct =
        !isBranchDeactivated &&
        isNeverStockedAtBranch({
          stock: onHandQty,
          weeklyBaseQty,
          weeklyRemainingQty,
          isAvailable,
          weeklyTargetQty,
          weeklyReceivedQty,
          totalBatchCount,
        });

      const catalogAvailable = p.isAvailable;
      // Global menu deactivation (super admin) or branch power-off — not sellable depletion.
      const franchiserInactive = !catalogAvailable && !isBranchDeactivated && !isNewProduct;
      const outOfStock = isNewProduct || franchiserInactive || isBranchDeactivated
        ? false
        : (enriched?.isOutOfStock ?? true);
      const lowStock = isNewProduct || franchiserInactive || isBranchDeactivated
        ? false
        : (enriched?.isLowStock ?? false);
      const orderable = catalogAvailable && isAvailable && !outOfStock;

      return {
        productId: p.id,
        name: p.name,
        imageUrl: normalizeProductImageUrl(p.imageUrl),
        basePrice: p.basePrice,
        cost: p.cost,
        tag: p.tag,
        category: p.category,
        catalogAvailable,
        productCreatedAt: p.createdAt.toISOString(),
        isAvailable,
        visibleToCustomers: orderable,
        inStock: orderable,
        weeklyBaseQty,
        weeklyRemainingQty,
        weeklyTargetQty,
        weeklyReceivedQty,
        onHandQty,
        onlineAvailableQty: enriched?.onlineAvailableQty ?? 0,
        counterAvailableQty: enriched?.counterAvailableQty ?? 0,
        batchCount: enriched?.batchCount ?? 0,
        totalBatchCount,
        oldestBatchReceivedAt: enriched?.oldestBatchReceivedAt ?? null,
        frozenBatchCount: enriched?.frozenBatchCount ?? 0,
        frozenQty: enriched?.frozenQty ?? 0,
        isBranchDeactivated,
        isLowStock: lowStock,
        isOutOfStock: outOfStock,
        lowStockThreshold: enriched?.lowStockThreshold ?? 25,
        onlineOutOfStockThreshold: enriched?.onlineOutOfStockThreshold ?? 5,
        outOfStockThreshold: enriched?.onlineOutOfStockThreshold ?? 5,
        stockPercent: enriched?.stockPercent ?? 0,
        updatedAt: inv?.updatedAt ?? null,
        isNewProduct,
        isComingSoon: isNewProduct,
      };
    });

    return success(res, { store, items: rows });
  } catch (err) {
    next(err);
  }
}

export async function updateBranchStock(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const { isAvailable, storeId: bodyStoreId, weeklyBaseQty, overrideQty } = z.object({
      isAvailable: z.boolean(),
      storeId: z.string().optional(),
      weeklyBaseQty: z.number().int().positive().optional(),
      overrideQty: z.number().int().min(0).optional(),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, bodyStoreId);
    const adminUserId = req.user?.sub;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);

    const row = await setBranchProductAvailability({
      storeId,
      productId,
      isAvailable,
      overrideQty,
      adminUserId,
      weeklyBaseQty,
    });

    const storeProduct = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    const thresholds = getEffectiveThresholds(storeProduct ?? {});
    const branchDeactivatedAtMap = await getBranchDeactivatedAtByProductId(storeId, [productId]);

    return success(res, {
      productId,
      storeId,
      isAvailable: row.isAvailable,
      stock: row.stock,
      onHandQty: row.stock,
      weeklyBaseQty: row.weeklyBaseQty,
      weeklyRemainingQty: row.weeklyRemainingQty,
      frozenQty: row.frozenQty,
      restoredQty: row.restoredQty,
      isBranchDeactivated: branchDeactivatedAtMap.has(productId) || row.frozenQty > 0,
      visibleToCustomers: row.isAvailable && !isOnlineOutOfStockByQty(row.stock, thresholds),
      inStock: row.isAvailable && !isOnlineOutOfStockByQty(row.stock, thresholds),
    });
  } catch (err) {
    next(err);
  }
}

export async function syncBranchInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: bodyStoreId } = z.object({
      storeId: z.string().optional(),
    }).parse(req.body ?? {});

    const storeId = await resolveStoreId(req, bodyStoreId);

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });
    if (!store) throw new AppError('Store not found', 404);

    const rowsCreated = await syncStoreProducts(storeId, { stock: 0, isAvailable: false });

    return success(res, {
      message: rowsCreated > 0
        ? `Added ${rowsCreated} product${rowsCreated === 1 ? '' : 's'} to ${store.name}`
        : 'All catalog products are already assigned to this branch',
      storeId,
      storeName: store.name,
      rowsCreated,
    });
  } catch (err) {
    next(err);
  }
}
