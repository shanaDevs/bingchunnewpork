import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { isBranchScopedRole, requireBranchStoreId } from '../middleware/auth';
import {
  receiveBatch,
  adjustBatch,
  writeOffBatch,
  previewBatchNumber,
  batchTypeToPrefix,
  createResetBatchGroup,
  bulkInitialRestock,
  getBatchSummary,
  getBatchSummariesBatch,
  checkStockInvariant,
  repairStockFromBatches,
  channelAvailabilityFromOnHand,
  getEffectiveThresholds,
  computeWeeklyReceivedQty,
  computeWeeklyReceivedQtyBatch,
  getProductPricingInRange,
  type BatchListSummary,
  type BatchNumberPrefix,
  type BatchSummaryStats,
} from '../lib/batchStockEngine';
import { getActiveReservedQuantitiesBatch, getActiveReservedQuantity } from '../repositories/inventoryReservationRepository';
import { normalizeProductImageUrl } from '../lib/productImages';
import { assertReceivedAtIsToday } from '../lib/datetime';

async function resolveStoreId(req: Request, queryStoreId?: string): Promise<string> {
  if (isBranchScopedRole(req.user?.role)) {
    return requireBranchStoreId(req);
  }
  if (!queryStoreId) throw new AppError('storeId is required', 400);
  return queryStoreId;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw new AppError('Invalid date format', 400);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateRangeEnd(dateStr: string): Date {
  const date = parseLocalDate(dateStr);
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseBatchTypeParam(value?: string): 'RESET' | 'EMERGENCY' {
  if (value === 'EMERGENCY') return 'EMERGENCY';
  return 'RESET';
}

function prefixFromBatchTypeParam(value?: string): BatchNumberPrefix {
  return batchTypeToPrefix(parseBatchTypeParam(value));
}

export async function previewNextBatchNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, receivedAt, batchType } = z.object({
      storeId: z.string().optional(),
      receivedAt: z.string().datetime().optional(),
      batchType: z.enum(['RESET', 'EMERGENCY']).optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const prefix = prefixFromBatchTypeParam(batchType);
    const resolvedReceivedAt = receivedAt ? new Date(receivedAt) : new Date();
    assertReceivedAtIsToday(resolvedReceivedAt);
    const batchNumber = await previewBatchNumber(
      storeId,
      resolvedReceivedAt,
      prefix,
    );

    return success(res, { batchNumber, batchType: parseBatchTypeParam(batchType) });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof Error) {
      next(new AppError(err.message, 400));
      return;
    }
    next(err);
  }
}

export async function receiveStockBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const body = z.object({
      storeId: z.string().optional(),
      receivedQty: z.number().int().positive(),
      receivedAt: z.string().datetime().optional(),
      expiryDate: z.string().datetime().optional(),
      note: z.string().optional(),
      batchType: z.enum(['RESET', 'EMERGENCY']).optional(),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, body.storeId);
    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);

    const storeProduct = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { weeklyTargetQty: true },
    });
    if (!storeProduct) throw new AppError('Branch stock row not found', 404);
    if (isBranchScopedRole(req.user?.role) && storeProduct.weeklyTargetQty <= 0) {
      throw new AppError('Set a weekly target before receiving stock', 400);
    }

    const resolvedReceivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
    assertReceivedAtIsToday(resolvedReceivedAt);

    const result = await receiveBatch({
      storeId,
      productId,
      receivedQty: body.receivedQty,
      receivedAt: resolvedReceivedAt,
      unitCost: product.cost,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      note: body.note,
      adminUserId,
      batchType: body.batchType ?? 'RESET',
    });

    return success(res, { productId, storeId, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof Error) {
      next(new AppError(err.message, 400));
      return;
    }
    next(err);
  }
}

function resolveRestockToTargetBatchType(input: {
  isAvailable: boolean;
  isFirstReceive: boolean;
  onlineAvailableBefore: number;
  thresholds: ReturnType<typeof getEffectiveThresholds>;
}): 'RESET' | 'EMERGENCY' {
  const { isAvailable, isFirstReceive, onlineAvailableBefore, thresholds } = input;
  if (isFirstReceive) return 'RESET';

  const isLowStockOnline = onlineAvailableBefore < thresholds.lowStockThreshold;
  if (isLowStockOnline && isAvailable) return 'EMERGENCY';
  if (isLowStockOnline) return 'EMERGENCY';
  return 'RESET';
}

export async function restockToWeeklyTarget(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const body = z
      .object({
        storeId: z.string().optional(),
      })
      .parse(req.body ?? {});

    const storeId = await resolveStoreId(req, body.storeId);
    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Product not found', 404);

    const storeProduct = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    if (!storeProduct) throw new AppError('Branch stock row not found', 404);
    if (storeProduct.weeklyTargetQty <= 0) {
      throw new AppError('Set a weekly target before restocking to order level', 400);
    }

    const onHand = storeProduct.stock;
    const weeklyTarget = storeProduct.weeklyTargetQty;
    const receivedQty = weeklyTarget - onHand;
    if (receivedQty <= 0) {
      throw new AppError('On-hand quantity is already at or above the weekly target', 400);
    }

    const isFirstReceive = !(await prisma.stockBatch.findFirst({
      where: { storeId, productId },
      select: { id: true },
    }));

    const thresholds = getEffectiveThresholds(storeProduct);
    const reserved = await getActiveReservedQuantity(storeId, productId);
    const onlineAvailableBefore = Math.max(
      0,
      Math.max(0, onHand - reserved) - thresholds.onlineOutOfStockThreshold,
    );

    const batchType = resolveRestockToTargetBatchType({
      isAvailable: storeProduct.isAvailable,
      isFirstReceive,
      onlineAvailableBefore,
      thresholds,
    });

    const result = await receiveBatch({
      storeId,
      productId,
      receivedQty,
      unitCost: product.cost,
      note: `Restock to order level (weekly target ${weeklyTarget})`,
      adminUserId,
      batchType,
    });

    return success(res, {
      productId,
      storeId,
      receivedQty,
      weeklyTargetQty: weeklyTarget,
      ...result,
    });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof Error) {
      next(new AppError(err.message, 400));
      return;
    }
    next(err);
  }
}

export async function getProductPricing(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const { storeId: queryStoreId, from, to } = z.object({
      storeId: z.string().optional(),
      from: z.string(),
      to: z.string(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const fromDate = parseLocalDate(from);
    const toDate = parseDateRangeEnd(to);
    if (fromDate > toDate) throw new AppError('from must be on or before to', 400);

    const pricing = await getProductPricingInRange(storeId, productId, fromDate, toDate);

    return success(res, {
      storeId,
      productId,
      from,
      to,
      ...pricing,
    });
  } catch (err) {
    next(err);
  }
}

export async function listProductBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const { storeId: queryStoreId } = z.object({
      storeId: z.string().optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const summary = await getBatchSummary(storeId, productId);

    return success(res, { storeId, productId, ...summary });
  } catch (err) {
    next(err);
  }
}

export async function listBranchBatches(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, status, productId, batchType } = z.object({
      storeId: z.string().optional(),
      status: z.enum(['ACTIVE', 'DEPLETED', 'WRITTEN_OFF', 'FROZEN']).optional(),
      productId: z.string().optional(),
      batchType: z.enum(['EMERGENCY', 'RESET']).optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);

    const batches = await prisma.stockBatch.findMany({
      where: {
        storeId,
        ...(status ? { status } : {}),
        ...(productId ? { productId } : {}),
        ...(batchType ? { batchType } : {}),
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: {
        batchGroup: {
          select: { batchNumber: true },
        },
      },
    });

    const productIds = [...new Set(batches.map((b) => b.productId))];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, imageUrl: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    return success(res, {
      storeId,
      batches: batches.map((b) => {
        const product = productMap.get(b.productId);
        return {
          ...b,
          batchGroupNumber: b.batchGroup?.batchNumber ?? null,
          product: product
            ? {
                ...product,
                imageUrl: normalizeProductImageUrl(product.imageUrl),
              }
            : {
                id: b.productId,
                name: 'Unknown product',
                imageUrl: null,
              },
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function patchBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const batchId = req.params.batchId as string;
    const body = z.object({
      delta: z.number().int().optional(),
      writeOff: z.boolean().optional(),
      reason: z.string().min(1),
    }).parse(req.body);

    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const batch = await prisma.stockBatch.findUnique({
      where: { id: batchId },
      select: { storeId: true },
    });
    if (!batch) throw new AppError('Batch not found', 404);

    if (isBranchScopedRole(req.user?.role)) {
      const storeId = await requireBranchStoreId(req);
      if (batch.storeId !== storeId) {
        throw new AppError('Forbidden', 403);
      }
    }

    if (body.writeOff) {
      await writeOffBatch(batchId, body.reason, adminUserId);
      return success(res, { batchId, writtenOff: true });
    }

    if (body.delta === undefined || body.delta === 0) {
      throw new AppError('Provide delta or writeOff', 400);
    }

    const result = await adjustBatch({
      batchId,
      delta: body.delta,
      reason: body.reason,
      adminUserId,
    });

    return success(res, { batchId, ...result });
  } catch (err) {
    next(err);
  }
}

export async function updateProductStockSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = req.params.productId as string;
    const body = z.object({
      storeId: z.string().optional(),
      weeklyTargetQty: z.number().int().nonnegative().optional(),
      lowStockThreshold: z.number().int().positive().nullable().optional(),
      onlineOutOfStockThreshold: z.number().int().nonnegative().nullable().optional(),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, body.storeId);

    const row = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    if (!row) throw new AppError('Branch stock row not found', 404);

    if (
      isBranchScopedRole(req.user?.role) &&
      row.weeklyTargetQty <= 0 &&
      body.weeklyTargetQty !== undefined &&
      body.weeklyTargetQty <= 0
    ) {
      throw new AppError('Weekly target must be greater than 0 before receiving stock', 400);
    }

    const updated = await prisma.storeProduct.update({
      where: { storeId_productId: { storeId, productId } },
      data: {
        ...(body.weeklyTargetQty !== undefined ? { weeklyTargetQty: body.weeklyTargetQty } : {}),
        ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        ...(body.onlineOutOfStockThreshold !== undefined
          ? { onlineOutOfStockThreshold: body.onlineOutOfStockThreshold }
          : {}),
      },
    });

    const thresholds = getEffectiveThresholds(updated);

    return success(res, {
      productId,
      storeId,
      weeklyTargetQty: updated.weeklyTargetQty,
      weeklyReceivedQty: await computeWeeklyReceivedQty(storeId, productId),
      lowStockThreshold: thresholds.lowStockThreshold,
      onlineOutOfStockThreshold: thresholds.onlineOutOfStockThreshold,
    });
  } catch (err) {
    next(err);
  }
}

export async function stockInvariantCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, repair, confirm } = z.object({
      storeId: z.string().optional(),
      repair: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .optional()
        .transform((v) => v === true || v === 'true'),
      confirm: z
        .union([z.literal('true'), z.literal('false'), z.boolean()])
        .optional()
        .transform((v) => v === true || v === 'true'),
    }).parse(req.query);

    const storeId = queryStoreId ? await resolveStoreId(req, queryStoreId) : undefined;

    if (repair && !storeId && !confirm) {
      throw new AppError('storeId is required when repair=true unless confirm=true is provided', 400);
    }

    if (repair) {
      const result = await repairStockFromBatches(storeId);
      return success(res, {
        ok: true,
        repaired: result.repaired,
        mismatchCount: result.mismatches.length,
        mismatches: result.mismatches,
      });
    }

    const mismatches = await checkStockInvariant(storeId);

    return success(res, {
      ok: mismatches.length === 0,
      mismatchCount: mismatches.length,
      mismatches,
    });
  } catch (err) {
    next(err);
  }
}

export async function previewResetBatchNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, resetDate } = z.object({
      storeId: z.string().optional(),
      resetDate: z.string().datetime().optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);
    const batchNumber = await previewBatchNumber(
      storeId,
      resetDate ? new Date(resetDate) : new Date(),
      'R',
    );

    return success(res, { batchNumber });
  } catch (err) {
    next(err);
  }
}

export async function createStockReset(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      storeId: z.string().optional(),
      resetDate: z.string().datetime().optional(),
      note: z.string().optional(),
      items: z.array(z.object({
        productId: z.string(),
        qty: z.number().int().nonnegative(),
      })).min(1),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, body.storeId);
    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const resetDate = body.resetDate ? new Date(body.resetDate) : new Date();
    assertReceivedAtIsToday(resetDate);
    const result = await createResetBatchGroup({
      storeId,
      resetDate,
      items: body.items,
      note: body.note,
      adminUserId,
    });

    return success(res, { storeId, resetDate, ...result });
  } catch (err) {
    next(err);
  }
}

export async function createBulkRestock(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      storeId: z.string().optional(),
      note: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().min(1),
        weeklyTargetQty: z.number().int().positive(),
        qty: z.number().int().positive(),
      })).min(1),
    }).parse(req.body);

    const storeId = await resolveStoreId(req, body.storeId);
    const adminUserId = req.user?.sub;
    if (!adminUserId) throw new AppError('Unauthorized', 401);

    const result = await bulkInitialRestock({
      storeId,
      items: body.items,
      note: body.note,
      adminUserId,
    });

    return success(res, { storeId, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof Error) {
      next(new AppError(err.message, 400));
      return;
    }
    next(err);
  }
}

export async function listStockBatchGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId: queryStoreId, limit } = z.object({
      storeId: z.string().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
    }).parse(req.query);

    const storeId = await resolveStoreId(req, queryStoreId);

    const groups = await prisma.stockBatchGroup.findMany({
      where: { storeId },
      orderBy: [{ resetDate: 'desc' }, { createdAt: 'desc' }],
      take: limit ?? 50,
      include: {
        batches: {
          select: {
            id: true,
            productId: true,
            receivedQty: true,
            remainingQty: true,
            status: true,
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    const productIds = [...new Set(groups.flatMap((g) => g.batches.map((b) => b.productId)))];
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    return success(res, {
      storeId,
      groups: groups.map((group) => ({
        id: group.id,
        batchNumber: group.batchNumber,
        resetDate: group.resetDate,
        note: group.note,
        createdAt: group.createdAt,
        createdBy: group.createdBy,
        productCount: group.batches.length,
        totalReceivedQty: group.batches.reduce((sum, batch) => sum + batch.receivedQty, 0),
        batches: group.batches.map((batch) => ({
          ...batch,
          productName: productMap.get(batch.productId) ?? 'Unknown product',
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

type StockRowInventory = {
  stock: number;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  weeklyTargetQty: number;
  lowStockThreshold: number | null;
  onlineOutOfStockThreshold: number | null;
  isAvailable: boolean;
  branchDeactivatedAt: Date | null;
  updatedAt: Date;
};

function buildEnrichedStockRow(
  inv: StockRowInventory,
  reservedQty: number,
  summary: Pick<
    BatchListSummary,
    'batchCount' | 'totalBatchCount' | 'oldestBatchReceivedAt' | 'frozenBatchCount' | 'frozenQty'
  >,
  weeklyReceivedQty: number,
) {
  const thresholds = getEffectiveThresholds(inv);
  const onHand = inv.stock;
  const {
    counterAvailable,
    onlineAvailable,
    isOnlineOutOfStock: isOnlineOos,
    isLowStock: lowStock,
  } = channelAvailabilityFromOnHand(onHand, reservedQty, inv.isAvailable, thresholds);

  return {
    onHandQty: onHand,
    onlineAvailableQty: onlineAvailable,
    counterAvailableQty: counterAvailable,
    weeklyTargetQty: inv.weeklyTargetQty,
    weeklyReceivedQty,
    weeklyBaseQty: inv.weeklyBaseQty,
    weeklyRemainingQty: inv.weeklyRemainingQty,
    batchCount: summary.batchCount,
    totalBatchCount: summary.totalBatchCount,
    oldestBatchReceivedAt: summary.oldestBatchReceivedAt,
    frozenBatchCount: summary.frozenBatchCount,
    frozenQty: summary.frozenQty,
    isBranchDeactivated: inv.branchDeactivatedAt != null || summary.frozenBatchCount > 0,
    lowStockThreshold: thresholds.lowStockThreshold,
    onlineOutOfStockThreshold: thresholds.onlineOutOfStockThreshold,
    outOfStockThreshold: thresholds.onlineOutOfStockThreshold,
    isLowStock: lowStock,
    isOutOfStock: isOnlineOos || !inv.isAvailable,
    stockPercent: inv.weeklyTargetQty > 0
      ? Math.round((onHand / inv.weeklyTargetQty) * 100)
      : inv.weeklyBaseQty > 0
        ? Math.round((onHand / inv.weeklyBaseQty) * 100)
        : 0,
    updatedAt: inv.updatedAt,
  };
}

export function enrichStockRowFromData(
  inv: StockRowInventory,
  reservedQty: number,
  summary: BatchListSummary | BatchSummaryStats,
  weeklyReceivedQty: number,
) {
  return buildEnrichedStockRow(
    inv,
    reservedQty,
    {
      batchCount: summary.batchCount,
      totalBatchCount: summary.totalBatchCount,
      oldestBatchReceivedAt: summary.oldestBatchReceivedAt,
      frozenBatchCount: 'frozenBatchCount' in summary ? summary.frozenBatchCount : 0,
      frozenQty: 'frozenQty' in summary ? summary.frozenQty : 0,
    },
    weeklyReceivedQty,
  );
}

export async function enrichStockRowsForList(
  storeId: string,
  inventory: Array<{ productId: string } & StockRowInventory>,
): Promise<Map<string, ReturnType<typeof buildEnrichedStockRow>>> {
  const productIds = inventory.map((row) => row.productId);
  const emptySummary = {
    batchCount: 0,
    totalBatchCount: 0,
    oldestBatchReceivedAt: null,
    frozenBatchCount: 0,
    frozenQty: 0,
  };

  const [reservedMap, summaryMap, weeklyReceivedMap] = await Promise.all([
    getActiveReservedQuantitiesBatch(storeId, productIds),
    getBatchSummariesBatch(storeId, productIds),
    computeWeeklyReceivedQtyBatch(storeId, productIds),
  ]);

  const enriched = new Map<string, ReturnType<typeof buildEnrichedStockRow>>();
  for (const inv of inventory) {
    enriched.set(
      inv.productId,
      buildEnrichedStockRow(
        inv,
        reservedMap.get(inv.productId) ?? 0,
        summaryMap.get(inv.productId) ?? emptySummary,
        weeklyReceivedMap.get(inv.productId) ?? 0,
      ),
    );
  }
  return enriched;
}

export async function enrichStockRow(
  storeId: string,
  productId: string,
  inv: StockRowInventory,
) {
  const [summary, weeklyReceivedQty, reserved] = await Promise.all([
    getBatchSummary(storeId, productId),
    computeWeeklyReceivedQty(storeId, productId),
    inv.isAvailable ? getActiveReservedQuantity(storeId, productId) : Promise.resolve(0),
  ]);

  return buildEnrichedStockRow(inv, reserved, summary, weeklyReceivedQty);
}
