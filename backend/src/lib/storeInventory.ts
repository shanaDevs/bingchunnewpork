import { prisma } from './prisma';
import { addColumnIfMissing } from './schemaPatch';
import { logger } from '../utils/logger';
import { ensureStockAuditLogTable, ensureWeeklyStockColumns, ensureWeeklyStockBackfilled } from './stockAuditSchema';
import { isProductOrderable, OUT_OF_STOCK_THRESHOLD } from './stockEngine';

export const DEFAULT_BRANCH_STOCK = 50;

export type StoreProductRow = {
  storeId: string;
  productId: string;
  stock: number;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  weeklyTargetQty?: number;
  weekResetAt?: Date | null;
  isAvailable: boolean;
  branchDeactivatedAt?: Date | null;
  lowStockThreshold?: number | null;
  onlineOutOfStockThreshold?: number | null;
};

export type BranchStockConfig = {
  storeId: string;
  weeklyBaseQty: number;
};

export { ensureWeeklyStockBackfilled } from './stockAuditSchema';

let storeProductsTableReady: Promise<void> | null = null;

/** Create table via raw SQL when Prisma migrate/db push is unavailable */
export async function ensureStoreProductsTable(): Promise<void> {
  if (!storeProductsTableReady) {
    storeProductsTableReady = (async () => {
      await addColumnIfMissing('store_products', 'stock', 'INT NOT NULL DEFAULT 50');
      await addColumnIfMissing(
        'store_products',
        'updatedAt',
        'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      );
      await ensureWeeklyStockColumns();
      await ensureStockAuditLogTable();
    })().catch((err) => {
      storeProductsTableReady = null;
      throw err;
    });
  }
  await storeProductsTableReady;
}

/** Branch availability uses weekly remaining quantity and manual toggle */
export function isInStock(row: Pick<StoreProductRow, 'stock' | 'isAvailable' | 'weeklyRemainingQty'>): boolean {
  if (row.weeklyRemainingQty !== undefined) {
    return isProductOrderable({
      isAvailable: row.isAvailable,
      weeklyRemainingQty: row.weeklyRemainingQty,
    });
  }
  return row.isAvailable;
}

export type SyncStoreProductsOptions = {
  stock?: number;
  isAvailable?: boolean;
};

/** Add every catalog product missing at `storeId` with the given stock and availability. Existing rows are left unchanged. */
export async function syncStoreProducts(
  storeId: string,
  options: SyncStoreProductsOptions = {},
): Promise<number> {
  await ensureStoreProductsTable();

  const stock = options.stock ?? 0;
  const isAvailable = options.isAvailable ?? false;

  const products = await prisma.product.findMany({ select: { id: true } });
  if (products.length === 0) return 0;

  const existing = await prisma.storeProduct.findMany({
    where: { storeId },
    select: { productId: true },
  });
  const existingIds = new Set(existing.map((row) => row.productId));

  const missing = products.filter((p) => !existingIds.has(p.id));
  if (missing.length === 0) return 0;

  await prisma.storeProduct.createMany({
    data: missing.map((p) => ({
      storeId,
      productId: p.id,
      stock,
      weeklyBaseQty: stock,
      weeklyRemainingQty: stock,
      isAvailable,
    })),
    skipDuplicates: true,
  });

  return missing.length;
}

export async function syncAllStoreProducts(options: SyncStoreProductsOptions = {}): Promise<number> {
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
  let total = 0;
  for (const store of stores) {
    total += await syncStoreProducts(store.id, options);
  }
  return total;
}

export async function ensureStoreInventoryReady(): Promise<void> {
  try {
    await ensureStoreProductsTable();
    // ensureStoreProductsTable already runs weekly column migration + backfill.
  } catch (err) {
    logger.warn('Branch inventory setup skipped', err);
  }
}

function branchStockCreateData(stock = DEFAULT_BRANCH_STOCK) {
  if (stock === 0) {
    return {
      stock: 0,
      weeklyBaseQty: 0,
      weeklyRemainingQty: 0,
      isAvailable: false,
    };
  }
  return {
    stock,
    weeklyBaseQty: stock,
    weeklyRemainingQty: stock,
    isAvailable: stock > OUT_OF_STOCK_THRESHOLD,
  };
}

export async function addProductToAllBranches(productId: string, stock = DEFAULT_BRANCH_STOCK) {
  await ensureStoreProductsTable();
  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
  if (!stores.length) return;

  const stockData = branchStockCreateData(stock);
  await prisma.storeProduct.createMany({
    data: stores.map((store) => ({
      storeId: store.id,
      productId,
      ...stockData,
    })),
    skipDuplicates: true,
  });
}

/** Ensure a catalog product has a store_products row at the branch (no-op if already present). */
export async function ensureProductOnBranch(
  storeId: string,
  productId: string,
  stock = DEFAULT_BRANCH_STOCK,
) {
  await ensureStoreProductsTable();
  await prisma.storeProduct.upsert({
    where: { storeId_productId: { storeId, productId } },
    create: { storeId, productId, ...branchStockCreateData(stock) },
    update: {},
  });
}

export async function addProductToSpecificBranches(
  productId: string,
  storeIds: string[],
  stock = DEFAULT_BRANCH_STOCK,
  branchStocks?: BranchStockConfig[],
) {
  await ensureStoreProductsTable();

  await prisma.storeProduct.deleteMany({
    where: { productId, storeId: { notIn: storeIds } },
  });

  const stockMap = new Map(branchStocks?.map((b) => [b.storeId, b.weeklyBaseQty]));

  for (const storeId of storeIds) {
    const weeklyBaseQty = stockMap.get(storeId) ?? stock;
    await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: {
        storeId,
        productId,
        ...branchStockCreateData(weeklyBaseQty),
      },
      update: {},
    });
  }
}

export async function updateProductBranches(
  productId: string,
  storeIds: string[],
  stock = DEFAULT_BRANCH_STOCK,
  branchStocks?: BranchStockConfig[],
) {
  await ensureStoreProductsTable();

  await prisma.storeProduct.deleteMany({
    where: { productId, storeId: { notIn: storeIds } },
  });

  const stockMap = new Map(branchStocks?.map((b) => [b.storeId, b.weeklyBaseQty]));

  for (const storeId of storeIds) {
    const weeklyBaseQty = stockMap.get(storeId) ?? stock;
    await prisma.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: {
        storeId,
        productId,
        ...branchStockCreateData(weeklyBaseQty),
      },
      update: {},
    });
  }
}
