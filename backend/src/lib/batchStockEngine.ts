import { randomUUID } from 'crypto';
import type { BatchType, OrderChannel, Prisma, StockChangeType } from '@prisma/client';
import { prisma } from './prisma';
import { getIo } from './socket';
import { logger } from '../utils/logger';
import { assertReceivedAtIsToday } from './datetime';
import { setBranchDeactivatedAt } from './branchDeactivation';
import { ensureEnumTypeIfMissing, ensureEnumValueIfMissing } from './schemaPatch';
import { InsufficientStockError } from '../repositories/inventoryReservationRepository';

export const LOW_STOCK_THRESHOLD = 25;
export const OUT_OF_STOCK_THRESHOLD = 5;

type Tx = Prisma.TransactionClient;

export type StoreProductThresholds = {
  lowStockThreshold: number;
  onlineOutOfStockThreshold: number;
};

export type ChannelAvailability = {
  onHand: number;
  reserved: number;
  onlineAvailable: number;
  counterAvailable: number;
  isLowStock: boolean;
  isOnlineOutOfStock: boolean;
  isCounterOutOfStock: boolean;
  thresholds: StoreProductThresholds;
};

type FifoBatchRow = {
  id: string;
  remainingQty: number;
  status: string;
};

const COLOMBO_TZ = 'Asia/Colombo';

export type BatchNumberPrefix = 'B' | 'E' | 'R';

export function batchTypeToPrefix(batchType: BatchType): BatchNumberPrefix {
  switch (batchType) {
    case 'EMERGENCY':
      return 'E';
    case 'RESET':
      return 'R';
    default:
      return 'B';
  }
}

function counterDateKey(prefix: BatchNumberPrefix, receivedAt: Date): string {
  return `${prefix}${formatDateKeyColombo(receivedAt)}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readMaxBatchSeq(
  db: Tx | typeof prisma,
  storeId: string,
  code: string,
  datePart: string,
  prefix: BatchNumberPrefix,
): Promise<number> {
  const batchPrefix = `${prefix}-${code}-${datePart}-`;
  const latest = await db.stockBatch.findFirst({
    where: { storeId, batchNumber: { startsWith: batchPrefix } },
    orderBy: { batchNumber: 'desc' },
    select: { batchNumber: true },
  });
  if (!latest) return 0;

  const pattern = new RegExp(`^${escapeRegex(batchPrefix)}(\\d{3})`);
  const match = latest.batchNumber.match(pattern);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function readCounterSeq(
  db: Tx | typeof prisma,
  storeId: string,
  dateKey: string,
): Promise<number> {
  const counter = await db.stockBatchCounter.findUnique({
    where: { storeId_dateKey: { storeId, dateKey } },
    select: { lastSeq: true },
  });
  return counter?.lastSeq ?? 0;
}

async function resolveNextBatchSeq(
  db: Tx | typeof prisma,
  storeId: string,
  receivedAt: Date,
  prefix: BatchNumberPrefix,
  code: string,
): Promise<number> {
  const datePart = formatDateKeyColombo(receivedAt);
  const dateKey = counterDateKey(prefix, receivedAt);
  const legacyDateKey = formatDateKeyColombo(receivedAt);

  const [counterSeq, legacySeq, existingMax] = await Promise.all([
    readCounterSeq(db, storeId, dateKey),
    prefix === 'B' ? readCounterSeq(db, storeId, legacyDateKey) : Promise.resolve(0),
    readMaxBatchSeq(db, storeId, code, datePart, prefix),
  ]);

  return Math.max(counterSeq, legacySeq, existingMax) + 1;
}

function formatBatchNumber(prefix: BatchNumberPrefix, code: string, receivedAt: Date, seq: number): string {
  return `${prefix}-${code}-${formatDateKeyColombo(receivedAt)}-${String(seq).padStart(3, '0')}`;
}

function formatDateKeyColombo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TZ,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const yy = parts.find((p) => p.type === 'year')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '01';
  const dd = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${yy}${mm}${dd}`;
}

export function getEffectiveThresholds(row: {
  lowStockThreshold?: number | null;
  onlineOutOfStockThreshold?: number | null;
}): StoreProductThresholds {
  return {
    lowStockThreshold: row.lowStockThreshold ?? LOW_STOCK_THRESHOLD,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold ?? OUT_OF_STOCK_THRESHOLD,
  };
}

export function isLowStockByQty(remaining: number, thresholds: StoreProductThresholds): boolean {
  return remaining <= thresholds.lowStockThreshold && remaining > thresholds.onlineOutOfStockThreshold;
}

export function isLowStockByOnlineQty(
  onlineAvailable: number,
  thresholds: StoreProductThresholds,
  isOutOfStock: boolean,
): boolean {
  if (isOutOfStock) return false;
  return onlineAvailable < thresholds.lowStockThreshold;
}

export function isOnlineOutOfStockByQty(remaining: number, thresholds: StoreProductThresholds): boolean {
  return remaining <= thresholds.onlineOutOfStockThreshold;
}

export function isOnlineOutOfStockByOnlineQty(
  onlineAvailable: number,
  _thresholds: StoreProductThresholds,
): boolean {
  // Buffer is already removed when computing onlineAvailable; OOS when nothing left to sell online.
  return onlineAvailable <= 0;
}

export function getColomboWeekBounds(reference = new Date()): { weekStart: Date; weekEnd: Date } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(reference);
  const [y, m, d] = dateStr.split('-').map(Number);
  const local = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const day = local.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(local);
  weekStart.setUTCDate(local.getUTCDate() + diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

async function getActiveReservedQuantity(storeId: string, productId: string): Promise<number> {
  const { getActiveReservedQuantity: getReserved } = await import('../repositories/inventoryReservationRepository');
  return getReserved(storeId, productId);
}

/** Active batch remaining, or null when this product has never been batch-tracked. */
async function trackedActiveBatchQty(storeId: string, productId: string): Promise<number | null> {
  const tracked = await prisma.stockBatch.count({ where: { storeId, productId } });
  if (tracked === 0) return null;
  return sumActiveBatchQty(prisma, storeId, productId);
}

async function sumActiveBatchQty(tx: Tx | typeof prisma, storeId: string, productId: string): Promise<number> {
  const result = await tx.stockBatch.aggregate({
    where: { storeId, productId, status: 'ACTIVE' },
    _sum: { remainingQty: true },
  });
  return result._sum.remainingQty ?? 0;
}

export async function computeWeeklyReceivedQty(
  storeId: string,
  productId: string,
  weekStart?: Date,
  weekEnd?: Date,
): Promise<number> {
  const bounds = weekStart && weekEnd ? { weekStart, weekEnd } : getColomboWeekBounds();
  const result = await prisma.stockBatch.aggregate({
    where: {
      storeId,
      productId,
      receivedAt: { gte: bounds.weekStart, lte: bounds.weekEnd },
    },
    _sum: { receivedQty: true },
  });
  return result._sum.receivedQty ?? 0;
}

export async function computeWeeklyReceivedQtyBatch(
  storeId: string,
  productIds: string[],
  weekStart?: Date,
  weekEnd?: Date,
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(productIds)];
  const totals = new Map<string, number>();
  for (const productId of uniqueIds) totals.set(productId, 0);
  if (uniqueIds.length === 0) return totals;

  const bounds = weekStart && weekEnd ? { weekStart, weekEnd } : getColomboWeekBounds();
  const rows = await prisma.stockBatch.groupBy({
    by: ['productId'],
    where: {
      storeId,
      productId: { in: uniqueIds },
      receivedAt: { gte: bounds.weekStart, lte: bounds.weekEnd },
    },
    _sum: { receivedQty: true },
  });

  for (const row of rows) {
    totals.set(row.productId, row._sum.receivedQty ?? 0);
  }
  return totals;
}

async function syncStoreProductFromBatches(
  tx: Tx,
  storeId: string,
  productId: string,
): Promise<{ onHand: number; weeklyBaseQty: number }> {
  const onHand = await sumActiveBatchQty(tx, storeId, productId);
  const { weekStart, weekEnd } = getColomboWeekBounds();
  const weeklyReceived = await tx.stockBatch.aggregate({
    where: {
      storeId,
      productId,
      receivedAt: { gte: weekStart, lte: weekEnd },
    },
    _sum: { receivedQty: true },
  });
  // Returned as weeklyBaseQty for receive-batch API compat (= qty received this week).
  // Do NOT write that onto store_products.weeklyBaseQty — that field marks configured /
  // coming-soon stock and must not be zeroed mid-week when nothing was received.
  const weeklyReceivedQty = weeklyReceived._sum.receivedQty ?? 0;

  await tx.storeProduct.update({
    where: { storeId_productId: { storeId, productId } },
    data: {
      stock: onHand,
      weeklyRemainingQty: onHand,
    },
  });

  return { onHand, weeklyBaseQty: weeklyReceivedQty };
}

async function resolveAdminUserName(
  tx: Tx,
  adminUserId?: string,
  adminUserName?: string | null,
): Promise<string | null> {
  const provided = adminUserName?.trim();
  if (provided) return provided;
  if (!adminUserId) return null;
  const admin = await tx.adminUser.findUnique({
    where: { id: adminUserId },
    select: { name: true },
  });
  return admin?.name ?? null;
}

async function writeAuditLog(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
    batchId?: string;
    changeType: StockChangeType;
    qtyBefore: number;
    qtyChange: number;
    qtyAfter: number;
    orderId?: string;
    adminUserId?: string;
    adminUserName?: string | null;
    note?: string;
  },
): Promise<void> {
  const adminUserName = await resolveAdminUserName(tx, input.adminUserId, input.adminUserName);
  await tx.stockAuditLog.create({
    data: {
      id: randomUUID(),
      storeId: input.storeId,
      productId: input.productId,
      batchId: input.batchId ?? null,
      changeType: input.changeType,
      qtyBefore: input.qtyBefore,
      qtyChange: input.qtyChange,
      qtyAfter: input.qtyAfter,
      orderId: input.orderId ?? null,
      adminUserId: input.adminUserId ?? null,
      adminUserName,
      note: input.note ?? null,
    },
  });
}

async function ensureStoreCode(tx: Tx, storeId: string): Promise<string> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { code: true, name: true } });
  if (!store) throw new Error('Store not found');
  if (store.code) return store.code;

  const slug = store.name
    .replace(/Bing Chun\s*-?\s*/gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase() || 'BRANCH';
  let code = slug;
  let suffix = 1;
  while (await tx.store.findFirst({ where: { code, id: { not: storeId } } })) {
    code = `${slug}${suffix}`;
    suffix += 1;
  }
  await tx.store.update({ where: { id: storeId }, data: { code } });
  return code;
}

export async function previewBatchNumber(
  storeId: string,
  receivedAt = new Date(),
  prefix: BatchNumberPrefix = 'B',
): Promise<string> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { code: true, name: true } });
  if (!store) throw new Error('Store not found');
  const code = store.code ?? store.name.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 6).toUpperCase();
  const nextSeq = await resolveNextBatchSeq(prisma, storeId, receivedAt, prefix, code);
  return formatBatchNumber(prefix, code, receivedAt, nextSeq);
}

async function mintBatchNumber(tx: Tx, storeId: string, receivedAt: Date, prefix: BatchNumberPrefix = 'B'): Promise<string> {
  const code = await ensureStoreCode(tx, storeId);
  const dateKey = counterDateKey(prefix, receivedAt);
  const legacyDateKey = formatDateKeyColombo(receivedAt);

  await tx.$executeRaw`
    INSERT INTO stock_batch_counters ("storeId", "dateKey", "lastSeq")
    VALUES (${storeId}, ${dateKey}, 0)
    ON CONFLICT ("storeId", "dateKey") DO NOTHING
  `;

  if (prefix === 'B') {
    await tx.$executeRaw`
      INSERT INTO stock_batch_counters ("storeId", "dateKey", "lastSeq")
      VALUES (${storeId}, ${legacyDateKey}, 0)
      ON CONFLICT ("storeId", "dateKey") DO NOTHING
    `;
  }

  await tx.$queryRaw`
    SELECT "lastSeq" FROM stock_batch_counters
    WHERE "storeId" = ${storeId} AND "dateKey" = ${dateKey}
    FOR UPDATE
  `;

  if (prefix === 'B') {
    await tx.$queryRaw`
      SELECT "lastSeq" FROM stock_batch_counters
      WHERE "storeId" = ${storeId} AND "dateKey" = ${legacyDateKey}
      FOR UPDATE
    `;
  }

  const nextSeq = await resolveNextBatchSeq(tx, storeId, receivedAt, prefix, code);

  await tx.stockBatchCounter.update({
    where: { storeId_dateKey: { storeId, dateKey } },
    data: { lastSeq: nextSeq },
  });

  if (prefix === 'B') {
    await tx.stockBatchCounter.update({
      where: { storeId_dateKey: { storeId, dateKey: legacyDateKey } },
      data: { lastSeq: nextSeq },
    }).catch(() => undefined);
  }

  return formatBatchNumber(prefix, code, receivedAt, nextSeq);
}

async function lockFifoBatches(tx: Tx, storeId: string, productId: string): Promise<FifoBatchRow[]> {
  return tx.$queryRaw<FifoBatchRow[]>`
    SELECT id, "remainingQty", status
    FROM stock_batches
    WHERE "storeId" = ${storeId}
      AND "productId" = ${productId}
      AND status = 'ACTIVE'
      AND "remainingQty" > 0
    ORDER BY "receivedAt" ASC, "createdAt" ASC, id ASC
    FOR UPDATE
  `;
}

export async function getChannelAvailability(
  storeId: string,
  productId: string,
  channel: OrderChannel = 'WEB',
): Promise<ChannelAvailability | null> {
  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: {
      stock: true,
      isAvailable: true,
      lowStockThreshold: true,
      onlineOutOfStockThreshold: true,
    },
  });
  if (!row || !row.isAvailable) return null;

  const thresholds = getEffectiveThresholds(row);
  // Batch rows are what checkout actually deducts. store_products.stock can sit
  // one unit ahead of them; selling that unit fails inside consumeFifo.
  const batchOnHand = await trackedActiveBatchQty(storeId, productId);
  const onHand = batchOnHand == null ? row.stock : Math.min(row.stock, batchOnHand);
  const reserved = await getActiveReservedQuantity(storeId, productId);
  const counterAvailable = Math.max(0, onHand - reserved);
  const onlineAvailable = Math.max(0, counterAvailable - thresholds.onlineOutOfStockThreshold);
  const isOnlineOos = isOnlineOutOfStockByOnlineQty(onlineAvailable, thresholds);

  return {
    onHand,
    reserved,
    onlineAvailable,
    counterAvailable,
    isLowStock: isLowStockByOnlineQty(onlineAvailable, thresholds, isOnlineOos),
    isOnlineOutOfStock: isOnlineOos,
    isCounterOutOfStock: onHand <= 0,
    thresholds,
  };
}

export async function checkAndEmitThresholds(
  storeId: string,
  productId: string,
  remaining: number,
  thresholds?: StoreProductThresholds,
): Promise<void> {
  let io;
  try {
    io = getIo();
  } catch {
    return;
  }

  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { lowStockThreshold: true, onlineOutOfStockThreshold: true, isAvailable: true },
  });
  const effective = thresholds ?? getEffectiveThresholds(row ?? {});

  const [product, store] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { name: true, imageUrl: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
  ]);

  const reserved = await getActiveReservedQuantity(storeId, productId);
  const onlineAvailable = Math.max(
    0,
    Math.max(0, remaining - reserved) - effective.onlineOutOfStockThreshold,
  );
  const isOnlineOos = isOnlineOutOfStockByOnlineQty(onlineAvailable, effective);

  const payload = {
    storeId,
    productId,
    productName: product?.name ?? 'Product',
    imageUrl: product?.imageUrl ?? null,
    storeName: store?.name ?? 'Branch',
    weeklyRemainingQty: remaining,
    onHandQty: remaining,
    onlineAvailableQty: onlineAvailable,
    timestamp: new Date().toISOString(),
  };

  if (isLowStockByOnlineQty(onlineAvailable, effective, isOnlineOos)) {
    io.to(`store:${storeId}`).emit('stock:low-warning', payload);
    io.to('admin:*').emit('stock:low-warning', payload);
  }

  if (isOnlineOos) {
    io.to(`store:${storeId}`).emit('stock:out-of-stock', payload);
    io.to('admin:*').emit('stock:out-of-stock', payload);
  }
}

async function emitStockUpdated(storeId: string, productId: string): Promise<void> {
  let io;
  try {
    io = getIo();
  } catch {
    return;
  }

  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  if (!row) return;

  const [product, store, batchMeta] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { name: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    prisma.stockBatch.aggregate({
      where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
      _count: { id: true },
      _min: { receivedAt: true },
    }),
  ]);

  const thresholds = getEffectiveThresholds(row);
  const remaining = row.stock;
  const onlineAvail = await getChannelAvailability(storeId, productId, 'WEB');
  const onlineAvailable = onlineAvail?.onlineAvailable ?? 0;
  const isOnlineOos =
    isOnlineOutOfStockByOnlineQty(onlineAvailable, thresholds) || !row.isAvailable;
  const lowStock = isLowStockByOnlineQty(onlineAvailable, thresholds, isOnlineOos);

  const payload = {
    storeId,
    productId,
    productName: product?.name ?? 'Product',
    storeName: store?.name ?? 'Branch',
    weeklyBaseQty: row.weeklyBaseQty,
    weeklyTargetQty: row.weeklyTargetQty,
    weeklyRemainingQty: remaining,
    onHandQty: remaining,
    onlineAvailableQty: onlineAvailable,
    batchCount: batchMeta._count.id,
    oldestBatchReceivedAt: batchMeta._min.receivedAt?.toISOString() ?? null,
    isAvailable: row.isAvailable,
    isLowStock: lowStock,
    isOutOfStock: isOnlineOos,
    stockPercent: row.weeklyTargetQty > 0
      ? Math.round((remaining / row.weeklyTargetQty) * 100)
      : row.weeklyBaseQty > 0
        ? Math.round((remaining / row.weeklyBaseQty) * 100)
        : 0,
    timestamp: new Date().toISOString(),
  };

  io.to(`store:${storeId}`).emit('stock:updated', payload);
  io.to('admin:*').emit('stock:updated', payload);
}

export async function receiveBatch(input: {
  storeId: string;
  productId: string;
  receivedQty: number;
  receivedAt?: Date;
  unitCost?: number;
  expiryDate?: Date;
  note?: string;
  adminUserId?: string;
  batchType?: BatchType;
}): Promise<{
  batchId: string;
  batchNumber: string;
  batchType: BatchType;
  onHand: number;
  weeklyBaseQty: number;
}> {
  if (input.receivedQty <= 0) throw new Error('Received quantity must be positive');

  let batchType = input.batchType ?? 'RESET';
  const receivedAt = input.receivedAt ?? new Date();
  if (input.receivedAt) assertReceivedAtIsToday(receivedAt);
  let unitCost = input.unitCost;
  if (unitCost === undefined) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { cost: true },
    });
    unitCost = product?.cost ?? 0;
  }

  const existing = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
  });
  if (!existing) throw new Error('Branch stock row not found');

  const isFirstReceive = !(await prisma.stockBatch.findFirst({
    where: { storeId: input.storeId, productId: input.productId },
    select: { id: true },
  }));
  const prefix = batchTypeToPrefix(batchType);
  const onHandBefore = existing.stock;
  const weeklyTarget = existing.weeklyTargetQty;
  const thresholds = getEffectiveThresholds(existing);
  const reserved = await getActiveReservedQuantity(input.storeId, input.productId);
  const onlineAvailableBefore = Math.max(
    0,
    Math.max(0, onHandBefore - reserved) - thresholds.onlineOutOfStockThreshold,
  );
  const isLowStockRestock =
    !isFirstReceive && onlineAvailableBefore < thresholds.lowStockThreshold;
  const qualifiesEmergencyRestock =
    isLowStockRestock || (weeklyTarget > 0 && onHandBefore >= weeklyTarget);

  if (batchType === 'RESET' && !isFirstReceive && weeklyTarget > 0) {
    if (isLowStockRestock && existing.isAvailable) {
      throw new Error(
        'This product is low or out of stock online. Restock will be recorded as emergency stock.',
      );
    }
    if (onHandBefore >= weeklyTarget) {
      throw new Error(
        'On-hand quantity is already at or above the weekly target. Use emergency stock instead.',
      );
    }
    if (onHandBefore + input.receivedQty > weeklyTarget) {
      const remaining = weeklyTarget - onHandBefore;
      throw new Error(
        remaining > 0
          ? `Reset receive cannot exceed the weekly target (${weeklyTarget}). You can receive up to ${remaining} units, or use emergency stock.`
          : 'Use emergency stock when you need more than the weekly target.',
      );
    }
  }

  if (batchType === 'EMERGENCY') {
    if (isFirstReceive) {
      throw new Error('First receive for a new product should use Reset stock.');
    }
    if (!qualifiesEmergencyRestock) {
      throw new Error(
        'Emergency stock applies when the product is low/out of stock online or on-hand is at/above the weekly target.',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const batchNumber = await mintBatchNumber(tx, input.storeId, receivedAt, prefix);
    const qtyBefore = existing.stock;

    const batch = await tx.stockBatch.create({
      data: {
        id: randomUUID(),
        batchNumber,
        batchType,
        storeId: input.storeId,
        productId: input.productId,
        receivedQty: input.receivedQty,
        remainingQty: input.receivedQty,
        receivedAt,
        unitCost,
        expiryDate: input.expiryDate ?? null,
        status: 'ACTIVE',
        note: input.note ?? null,
        createdByAdminId: input.adminUserId ?? null,
      },
    });

    const { onHand, weeklyBaseQty } = await syncStoreProductFromBatches(tx, input.storeId, input.productId);

    if (onHand > getEffectiveThresholds(existing).onlineOutOfStockThreshold) {
      await tx.storeProduct.update({
        where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
        data: { isAvailable: true },
      });
    }

    await writeAuditLog(tx, {
      storeId: input.storeId,
      productId: input.productId,
      batchId: batch.id,
      changeType: 'BATCH_RECEIVED',
      qtyBefore,
      qtyChange: input.receivedQty,
      qtyAfter: onHand,
      adminUserId: input.adminUserId,
      note: input.note ?? `Batch ${batchNumber} (${batchType})`,
    });

    return { batchId: batch.id, batchNumber, batchType, onHand, weeklyBaseQty };
  }, { maxWait: 10_000, timeout: 30_000 }).then(async (result) => {
    await checkAndEmitThresholds(input.storeId, input.productId, result.onHand);
    await emitStockUpdated(input.storeId, input.productId);
    return result;
  });
}

export async function createResetBatchGroup(input: {
  storeId: string;
  resetDate: Date;
  items: Array<{ productId: string; qty: number }>;
  note?: string;
  adminUserId?: string;
}): Promise<{
  groupId: string;
  batchNumber: string;
  results: Array<{ productId: string; batchId: string; onHand: number }>;
}> {
  const activeItems = input.items.filter((item) => item.qty > 0);
  if (activeItems.length === 0) throw new Error('At least one product must have a quantity greater than zero');

  const productIds = [...new Set(activeItems.map((item) => item.productId))];
  const [products, storeProducts] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, cost: true, name: true },
    }),
    prisma.storeProduct.findMany({
      where: { storeId: input.storeId, productId: { in: productIds } },
      select: { productId: true, stock: true, weeklyTargetQty: true },
    }),
  ]);
  const costMap = new Map(products.map((p) => [p.id, p.cost]));
  const nameMap = new Map(products.map((p) => [p.id, p.name]));
  const storeProductMap = new Map(storeProducts.map((row) => [row.productId, row]));

  for (const item of activeItems) {
    const row = storeProductMap.get(item.productId);
    if (!row) throw new Error(`Branch stock row not found for product ${item.productId}`);
    if (row.weeklyTargetQty <= 0) {
      throw new Error(`"${nameMap.get(item.productId) ?? 'Product'}" has no weekly reset amount configured`);
    }
    if (row.stock >= row.weeklyTargetQty) {
      throw new Error(
        `"${nameMap.get(item.productId) ?? 'Product'}" is already at or above the weekly reset amount (${row.stock} on hand, target ${row.weeklyTargetQty})`,
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const groupNumber = await mintBatchNumber(tx, input.storeId, input.resetDate, 'R');

    const group = await tx.stockBatchGroup.create({
      data: {
        id: randomUUID(),
        storeId: input.storeId,
        batchNumber: groupNumber,
        resetDate: input.resetDate,
        note: input.note ?? null,
        createdByAdminId: input.adminUserId ?? null,
      },
    });

    const results: Array<{ productId: string; batchId: string; onHand: number }> = [];

    for (let i = 0; i < activeItems.length; i += 1) {
      const item = activeItems[i];
      const existing = await tx.storeProduct.findUnique({
        where: { storeId_productId: { storeId: input.storeId, productId: item.productId } },
      });
      if (!existing) throw new Error(`Branch stock row not found for product ${item.productId}`);

      const rowBatchNumber = `${groupNumber}-P${i + 1}`;
      const qtyBefore = existing.stock;
      const unitCost = costMap.get(item.productId) ?? 0;

      const batch = await tx.stockBatch.create({
        data: {
          id: randomUUID(),
          batchNumber: rowBatchNumber,
          batchType: 'RESET',
          batchGroupId: group.id,
          storeId: input.storeId,
          productId: item.productId,
          receivedQty: item.qty,
          remainingQty: item.qty,
          receivedAt: input.resetDate,
          unitCost,
          status: 'ACTIVE',
          note: input.note ?? `Reset batch ${groupNumber}`,
          createdByAdminId: input.adminUserId ?? null,
        },
      });

      const { onHand } = await syncStoreProductFromBatches(tx, input.storeId, item.productId);

      if (onHand > getEffectiveThresholds(existing).onlineOutOfStockThreshold) {
        await tx.storeProduct.update({
          where: { storeId_productId: { storeId: input.storeId, productId: item.productId } },
          data: { isAvailable: true },
        });
      }

      await writeAuditLog(tx, {
        storeId: input.storeId,
        productId: item.productId,
        batchId: batch.id,
        changeType: 'WEEKLY_RESET',
        qtyBefore,
        qtyChange: item.qty,
        qtyAfter: onHand,
        adminUserId: input.adminUserId,
        note: input.note ?? `Reset batch ${groupNumber}`,
      });

      results.push({ productId: item.productId, batchId: batch.id, onHand });
    }

    return { groupId: group.id, batchNumber: groupNumber, results };
  }, { maxWait: 10_000, timeout: 30_000 });

  for (const row of result.results) {
    await checkAndEmitThresholds(input.storeId, row.productId, row.onHand);
    await emitStockUpdated(input.storeId, row.productId);
  }

  return result;
}

/**
 * First-time bulk restock for never-stocked branch products:
 * set weeklyTargetQty then create a RESET batch group in one flow.
 */
export async function bulkInitialRestock(input: {
  storeId: string;
  items: Array<{ productId: string; weeklyTargetQty: number; qty: number }>;
  note?: string;
  adminUserId?: string;
  receivedAt?: Date;
}): Promise<{
  groupId: string;
  batchNumber: string;
  results: Array<{ productId: string; batchId: string; onHand: number }>;
}> {
  const activeItems = input.items.filter((item) => item.qty > 0 && item.weeklyTargetQty > 0);
  if (activeItems.length === 0) {
    throw new Error('Select at least one product with weekly target and quantity greater than zero');
  }

  for (const item of activeItems) {
    if (!Number.isInteger(item.weeklyTargetQty) || item.weeklyTargetQty <= 0) {
      throw new Error('Weekly target must be a positive integer');
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new Error('Receive quantity must be a positive integer');
    }
  }

  const productIds = [...new Set(activeItems.map((item) => item.productId))];
  if (productIds.length !== activeItems.length) {
    throw new Error('Duplicate products in bulk restock request');
  }

  const receivedAt = input.receivedAt ?? new Date();

  // Only newly registered branches (never received any stock) may use bulk restock.
  const [priorStockRow, priorBatch] = await Promise.all([
    prisma.storeProduct.findFirst({
      where: {
        storeId: input.storeId,
        OR: [{ stock: { gt: 0 } }, { weeklyBaseQty: { gt: 0 } }],
      },
      select: { productId: true },
    }),
    prisma.stockBatch.findFirst({
      where: { storeId: input.storeId },
      select: { id: true },
    }),
  ]);
  if (priorStockRow || priorBatch) {
    throw new Error(
      'Bulk Restock is only available for newly registered branches that have never received stock. Use Reset Stock or Receive Stock instead.',
    );
  }

  const [products, storeProducts, batchCounts] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, cost: true, name: true },
    }),
    prisma.storeProduct.findMany({
      where: { storeId: input.storeId, productId: { in: productIds } },
      select: {
        productId: true,
        stock: true,
        weeklyTargetQty: true,
        weeklyBaseQty: true,
        weeklyRemainingQty: true,
        branchDeactivatedAt: true,
        onlineOutOfStockThreshold: true,
        lowStockThreshold: true,
      },
    }),
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: { storeId: input.storeId, productId: { in: productIds } },
      _count: { id: true },
    }),
  ]);

  const costMap = new Map(products.map((p) => [p.id, p.cost]));
  const nameMap = new Map(products.map((p) => [p.id, p.name]));
  const storeProductMap = new Map(storeProducts.map((row) => [row.productId, row]));
  const batchCountMap = new Map(batchCounts.map((row) => [row.productId, row._count.id]));

  for (const item of activeItems) {
    const name = nameMap.get(item.productId) ?? 'Product';
    const row = storeProductMap.get(item.productId);
    if (!row) {
      throw new Error(
        `"${name}" is not on this branch yet. Sync products to the branch first.`,
      );
    }
    if (row.branchDeactivatedAt != null) {
      throw new Error(`"${name}" is branch-inactive and cannot be bulk restocked`);
    }
    const totalBatches = batchCountMap.get(item.productId) ?? 0;
    if (row.stock > 0 || (row.weeklyBaseQty ?? 0) > 0 || totalBatches > 0) {
      throw new Error(
        `"${name}" already has stock history. Use Reset Stock or Receive Stock instead.`,
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const groupNumber = await mintBatchNumber(tx, input.storeId, receivedAt, 'R');

    const group = await tx.stockBatchGroup.create({
      data: {
        id: randomUUID(),
        storeId: input.storeId,
        batchNumber: groupNumber,
        resetDate: receivedAt,
        note: input.note ?? null,
        createdByAdminId: input.adminUserId ?? null,
      },
    });

    const results: Array<{ productId: string; batchId: string; onHand: number }> = [];

    for (let i = 0; i < activeItems.length; i += 1) {
      const item = activeItems[i];
      const existing = await tx.storeProduct.findUnique({
        where: { storeId_productId: { storeId: input.storeId, productId: item.productId } },
      });
      if (!existing) throw new Error(`Branch stock row not found for product ${item.productId}`);

      await tx.storeProduct.update({
        where: { storeId_productId: { storeId: input.storeId, productId: item.productId } },
        data: { weeklyTargetQty: item.weeklyTargetQty },
      });

      const rowBatchNumber = `${groupNumber}-P${i + 1}`;
      const qtyBefore = existing.stock;
      const unitCost = costMap.get(item.productId) ?? 0;

      const batch = await tx.stockBatch.create({
        data: {
          id: randomUUID(),
          batchNumber: rowBatchNumber,
          batchType: 'RESET',
          batchGroupId: group.id,
          storeId: input.storeId,
          productId: item.productId,
          receivedQty: item.qty,
          remainingQty: item.qty,
          receivedAt,
          unitCost,
          status: 'ACTIVE',
          note: input.note ?? `Bulk restock ${groupNumber}`,
          createdByAdminId: input.adminUserId ?? null,
        },
      });

      const onHand = qtyBefore + item.qty;
      const thresholds = getEffectiveThresholds(existing);

      if (onHand > thresholds.onlineOutOfStockThreshold) {
        await tx.storeProduct.update({
          where: { storeId_productId: { storeId: input.storeId, productId: item.productId } },
          data: { isAvailable: true },
        });
      }

      await writeAuditLog(tx, {
        storeId: input.storeId,
        productId: item.productId,
        batchId: batch.id,
        changeType: 'WEEKLY_RESET',
        qtyBefore,
        qtyChange: item.qty,
        qtyAfter: onHand,
        adminUserId: input.adminUserId,
        note: input.note ?? `Bulk restock ${groupNumber}`,
      });

      results.push({ productId: item.productId, batchId: batch.id, onHand });
    }

    return { groupId: group.id, batchNumber: groupNumber, results };
  }, { maxWait: 10_000, timeout: 60_000 });

  const syncedOnHand = new Map<string, number>();
  for (const productId of [...new Set(result.results.map((row) => row.productId))]) {
    const { onHand } = await prisma.$transaction(async (tx) =>
      syncStoreProductFromBatches(tx, input.storeId, productId),
    );
    syncedOnHand.set(productId, onHand);
  }

  for (const row of result.results) {
    const onHand = syncedOnHand.get(row.productId) ?? row.onHand;
    await checkAndEmitThresholds(input.storeId, row.productId, onHand);
    await emitStockUpdated(input.storeId, row.productId);
  }

  return {
    groupId: result.groupId,
    batchNumber: result.batchNumber,
    results: result.results.map((row) => ({
      ...row,
      onHand: syncedOnHand.get(row.productId) ?? row.onHand,
    })),
  };
}

export async function consumeFifo(
  tx: Tx,
  storeId: string,
  productId: string,
  qty: number,
  orderId: string,
  orderItemId?: string,
): Promise<void> {
  if (qty <= 0) return;

  const row = await tx.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  if (!row) {
    throw new InsufficientStockError('Product not available at this branch', productId, 0);
  }

  let remaining = qty;
  const batches = await lockFifoBatches(tx, storeId, productId);

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.remainingQty, remaining);
    if (take <= 0) continue;

    const newRemaining = batch.remainingQty - take;
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        remainingQty: newRemaining,
        status: newRemaining <= 0 ? 'DEPLETED' : 'ACTIVE',
      },
    });

    await tx.stockBatchAllocation.create({
      data: {
        id: randomUUID(),
        batchId: batch.id,
        orderId,
        orderItemId: orderItemId ?? null,
        storeId,
        productId,
        quantity: take,
      },
    });

    remaining -= take;
  }

  if (remaining > 0) {
    throw new InsufficientStockError(
      `Insufficient stock for product ${productId}. Short by ${remaining}.`,
      productId,
      qty - remaining,
    );
  }

  const qtyBefore = row.stock;
  const { onHand } = await syncStoreProductFromBatches(tx, storeId, productId);

  await writeAuditLog(tx, {
    storeId,
    productId,
    changeType: 'ORDER_DEDUCTION',
    qtyBefore,
    qtyChange: -qty,
    qtyAfter: onHand,
    orderId,
  });
}

export async function reverseFifo(tx: Tx, orderId: string): Promise<void> {
  const allocations = await tx.stockBatchAllocation.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
  });

  for (const alloc of allocations) {
    const toRestore = alloc.quantity - alloc.reversedQty;
    if (toRestore <= 0) continue;

    const batch = await tx.stockBatch.findUnique({ where: { id: alloc.batchId } });
    if (!batch) continue;

    const row = await tx.storeProduct.findUnique({
      where: { storeId_productId: { storeId: alloc.storeId, productId: alloc.productId } },
    });
    const qtyBefore = row?.stock ?? 0;

    const newBatchRemaining = batch.remainingQty + toRestore;
    const mayReactivate =
      batch.status === 'ACTIVE' || batch.status === 'DEPLETED';
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        remainingQty: newBatchRemaining,
        ...(mayReactivate ? { status: 'ACTIVE' as const } : {}),
      },
    });

    await tx.stockBatchAllocation.update({
      where: { id: alloc.id },
      data: { reversedQty: alloc.quantity },
    });

    const { onHand } = await syncStoreProductFromBatches(tx, alloc.storeId, alloc.productId);

    await writeAuditLog(tx, {
      storeId: alloc.storeId,
      productId: alloc.productId,
      batchId: batch.id,
      changeType: 'ORDER_RESTORATION',
      qtyBefore,
      qtyChange: toRestore,
      qtyAfter: onHand,
      orderId,
    });
  }
}

export async function adjustBatch(input: {
  batchId: string;
  delta: number;
  reason: string;
  adminUserId: string;
  changeType?: 'BATCH_ADJUSTMENT' | 'WASTAGE';
}): Promise<{ remainingQty: number; onHand: number }> {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.stockBatch.findUnique({ where: { id: input.batchId } });
    if (!batch) throw new Error('Batch not found');
    if (batch.status === 'WRITTEN_OFF') throw new Error('Cannot adjust a written-off batch');
    if (batch.status === 'FROZEN') throw new Error('Cannot adjust a frozen batch');
    if (input.delta > 0) throw new Error('Use receiveBatch to add stock');

    const row = await tx.storeProduct.findUnique({
      where: { storeId_productId: { storeId: batch.storeId, productId: batch.productId } },
    });
    const qtyBefore = row?.stock ?? 0;

    const newRemaining = Math.max(0, batch.remainingQty + input.delta);
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        remainingQty: newRemaining,
        status: newRemaining <= 0 ? 'DEPLETED' : 'ACTIVE',
      },
    });

    const { onHand } = await syncStoreProductFromBatches(tx, batch.storeId, batch.productId);

    await writeAuditLog(tx, {
      storeId: batch.storeId,
      productId: batch.productId,
      batchId: batch.id,
      changeType: input.changeType ?? 'BATCH_ADJUSTMENT',
      qtyBefore,
      qtyChange: input.delta,
      qtyAfter: onHand,
      adminUserId: input.adminUserId,
      note: input.reason,
    });

    return { remainingQty: newRemaining, onHand };
  }).then(async (result) => {
    const batch = await prisma.stockBatch.findUnique({ where: { id: input.batchId } });
    if (batch) {
      await checkAndEmitThresholds(batch.storeId, batch.productId, result.onHand);
      await emitStockUpdated(batch.storeId, batch.productId);
    }
    return result;
  });
}

export async function writeOffBatch(batchId: string, reason: string, adminUserId: string): Promise<void> {
  const batch = await prisma.stockBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch not found');
  if (batch.remainingQty <= 0) throw new Error('Batch has no remaining quantity');

  await adjustBatch({
    batchId,
    delta: -batch.remainingQty,
    reason,
    adminUserId,
    changeType: 'WASTAGE',
  });

  await prisma.stockBatch.update({
    where: { id: batchId },
    data: { status: 'WRITTEN_OFF', remainingQty: 0 },
  });
}

export function resolveSellableQty(
  avail: Pick<ChannelAvailability, 'onlineAvailable' | 'counterAvailable'>,
  channel: OrderChannel,
): number {
  return channel === 'POS' ? avail.counterAvailable : avail.onlineAvailable;
}

export async function validateOrderStock(
  storeId: string,
  items: Array<{ productId: string; quantity: number; productName?: string }>,
  channel: OrderChannel = 'WEB',
): Promise<void> {
  const totals = new Map<string, { quantity: number; productName?: string }>();
  for (const item of items) {
    const existing = totals.get(item.productId);
    totals.set(item.productId, {
      quantity: (existing?.quantity ?? 0) + item.quantity,
      productName: item.productName ?? existing?.productName,
    });
  }

  for (const [productId, { quantity, productName }] of totals) {
    const avail = await getChannelAvailability(storeId, productId, channel);
    if (!avail) {
      throw new Error(`Product "${productName ?? productId}" is not available at this branch`);
    }

    const sellable = resolveSellableQty(avail, channel);

    if (sellable <= 0) {
      throw new Error(`"${productName ?? 'Product'}" is out of stock at this branch`);
    }

    if (sellable < quantity) {
      throw new Error(
        `Insufficient stock for "${productName ?? 'Product'}". Only ${sellable} available.`,
      );
    }
  }
}

export async function deductOrderItems(
  storeId: string,
  items: Array<{ productId: string; quantity: number; orderItemId?: string }>,
  orderId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await consumeFifo(tx, storeId, item.productId, item.quantity, orderId, item.orderItemId);
    }
  });

  const productIds = [...new Set(items.map((i) => i.productId))];
  for (const productId of productIds) {
    const row = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { stock: true, lowStockThreshold: true, onlineOutOfStockThreshold: true },
    });
    if (row) {
      await checkAndEmitThresholds(storeId, productId, row.stock, getEffectiveThresholds(row));
      await emitStockUpdated(storeId, productId);
    }
  }
}

export async function orderStockWasDeducted(orderId: string): Promise<boolean> {
  const count = await prisma.stockBatchAllocation.count({ where: { orderId } });
  return count > 0;
}

export async function deductOrderItemsOnce(
  storeId: string,
  items: Array<{ productId: string; quantity: number; orderItemId?: string }>,
  orderId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT "id" FROM "orders" WHERE "id" = $1 FOR UPDATE`, orderId);

    const allocCount = await tx.stockBatchAllocation.count({ where: { orderId } });
    if (allocCount > 0) return;

    for (const item of items) {
      await consumeFifo(tx, storeId, item.productId, item.quantity, orderId, item.orderItemId);
    }
  });

  const productIds = [...new Set(items.map((i) => i.productId))];
  for (const productId of productIds) {
    const row = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { stock: true, lowStockThreshold: true, onlineOutOfStockThreshold: true },
    });
    if (row) {
      await checkAndEmitThresholds(storeId, productId, row.stock, getEffectiveThresholds(row));
      await emitStockUpdated(storeId, productId);
    }
  }
}

export async function restoreOrderItems(storeId: string, orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await reverseFifo(tx, orderId);
  });

  const allocations = await prisma.stockBatchAllocation.findMany({
    where: { orderId },
    select: { productId: true },
  });
  const productIds = [...new Set(allocations.map((a) => a.productId))];
  for (const productId of productIds) {
    const row = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { stock: true, lowStockThreshold: true, onlineOutOfStockThreshold: true, isAvailable: true },
    });
    if (row && row.stock > getEffectiveThresholds(row).onlineOutOfStockThreshold && !row.isAvailable) {
      await prisma.storeProduct.update({
        where: { storeId_productId: { storeId, productId } },
        data: { isAvailable: true },
      });
    }
    if (row) {
      await checkAndEmitThresholds(storeId, productId, row.stock, getEffectiveThresholds(row));
      await emitStockUpdated(storeId, productId);
    }
  }
}


export async function checkStockInvariant(storeId?: string): Promise<Array<{ storeId: string; productId: string; cached: number; actual: number }>> {
  const rows = await prisma.storeProduct.findMany({
    where: storeId ? { storeId } : undefined,
    select: { storeId: true, productId: true, stock: true },
  });

  const mismatches: Array<{ storeId: string; productId: string; cached: number; actual: number }> = [];
  for (const row of rows) {
    const actual = await sumActiveBatchQty(prisma, row.storeId, row.productId);
    if (actual !== row.stock) {
      mismatches.push({ storeId: row.storeId, productId: row.productId, cached: row.stock, actual });
    }
  }
  return mismatches;
}

/** Re-sync store_products.stock / weeklyRemainingQty from ACTIVE batch remaining qty. */
export async function repairStockFromBatches(storeId?: string): Promise<{
  repaired: number;
  mismatches: Array<{ storeId: string; productId: string; cached: number; actual: number }>;
}> {
  const mismatches = await checkStockInvariant(storeId);
  for (const row of mismatches) {
    await prisma.$transaction(async (tx) => {
      await syncStoreProductFromBatches(tx, row.storeId, row.productId);
    });
    const after = await prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId: row.storeId, productId: row.productId } },
      select: { stock: true, isAvailable: true, onlineOutOfStockThreshold: true, lowStockThreshold: true },
    });
    if (
      after &&
      !after.isAvailable &&
      after.stock > getEffectiveThresholds(after).onlineOutOfStockThreshold
    ) {
      await prisma.storeProduct.update({
        where: { storeId_productId: { storeId: row.storeId, productId: row.productId } },
        data: { isAvailable: true },
      });
    }
    await emitStockUpdated(row.storeId, row.productId).catch(() => undefined);
  }
  return { repaired: mismatches.length, mismatches };
}

export async function getBatchSummary(storeId: string, productId: string) {
  const [batches, count, oldest, frozenCount, frozenQtyAgg] = await Promise.all([
    prisma.stockBatch.findMany({
      where: { storeId, productId },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        batchNumber: true,
        batchType: true,
        batchGroupId: true,
        receivedQty: true,
        remainingQty: true,
        receivedAt: true,
        status: true,
        unitCost: true,
        note: true,
        createdAt: true,
        batchGroup: {
          select: { batchNumber: true },
        },
      },
    }),
    prisma.stockBatch.count({ where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } } }),
    prisma.stockBatch.findFirst({
      where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
      orderBy: { receivedAt: 'asc' },
      select: { receivedAt: true },
    }),
    prisma.stockBatch.count({ where: { storeId, productId, status: 'FROZEN' } }),
    prisma.stockBatch.aggregate({
      where: { storeId, productId, status: 'FROZEN' },
      _sum: { remainingQty: true },
    }),
  ]);

  return {
    batches: batches.map(({ batchGroup, ...batch }) => ({
      ...batch,
      batchGroupNumber: batchGroup?.batchNumber ?? null,
    })),
    batchCount: count,
    totalBatchCount: batches.length,
    oldestBatchReceivedAt: oldest?.receivedAt ?? null,
    frozenBatchCount: frozenCount,
    frozenQty: frozenQtyAgg._sum.remainingQty ?? 0,
  };
}

export type BatchSummaryStats = {
  batchCount: number;
  totalBatchCount: number;
  oldestBatchReceivedAt: Date | null;
};

export type BatchListSummary = BatchSummaryStats & {
  frozenBatchCount: number;
  frozenQty: number;
};

export async function getBatchSummariesBatch(
  storeId: string,
  productIds: string[],
): Promise<Map<string, BatchListSummary>> {
  const uniqueIds = [...new Set(productIds)];
  const summaries = new Map<string, BatchListSummary>();
  for (const productId of uniqueIds) {
    summaries.set(productId, {
      batchCount: 0,
      totalBatchCount: 0,
      oldestBatchReceivedAt: null,
      frozenBatchCount: 0,
      frozenQty: 0,
    });
  }
  if (uniqueIds.length === 0) return summaries;

  const activeWhere = {
    storeId,
    productId: { in: uniqueIds },
    status: 'ACTIVE' as const,
    remainingQty: { gt: 0 },
  };

  const frozenWhere = {
    storeId,
    productId: { in: uniqueIds },
    status: 'FROZEN' as const,
  };

  const [totalCounts, activeCounts, oldestBatches, frozenCounts, frozenQtyRows] = await Promise.all([
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: { storeId, productId: { in: uniqueIds } },
      _count: { _all: true },
    }),
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: activeWhere,
      _count: { _all: true },
    }),
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: activeWhere,
      _min: { receivedAt: true },
    }),
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: frozenWhere,
      _count: { _all: true },
    }),
    prisma.stockBatch.groupBy({
      by: ['productId'],
      where: frozenWhere,
      _sum: { remainingQty: true },
    }),
  ]);

  for (const row of totalCounts) {
    const entry = summaries.get(row.productId);
    if (entry) entry.totalBatchCount = row._count._all;
  }
  for (const row of activeCounts) {
    const entry = summaries.get(row.productId);
    if (entry) entry.batchCount = row._count._all;
  }
  for (const row of oldestBatches) {
    const entry = summaries.get(row.productId);
    if (entry) entry.oldestBatchReceivedAt = row._min.receivedAt;
  }
  for (const row of frozenCounts) {
    const entry = summaries.get(row.productId);
    if (entry) entry.frozenBatchCount = row._count._all;
  }
  for (const row of frozenQtyRows) {
    const entry = summaries.get(row.productId);
    if (entry) entry.frozenQty = row._sum.remainingQty ?? 0;
  }

  return summaries;
}

export async function getBatchSummaryStatsBatch(
  storeId: string,
  productIds: string[],
): Promise<Map<string, BatchSummaryStats>> {
  const summaries = await getBatchSummariesBatch(storeId, productIds);
  const stats = new Map<string, BatchSummaryStats>();
  for (const [productId, summary] of summaries) {
    stats.set(productId, {
      batchCount: summary.batchCount,
      totalBatchCount: summary.totalBatchCount,
      oldestBatchReceivedAt: summary.oldestBatchReceivedAt,
    });
  }
  return stats;
}

export async function loadStockListEnrichment(storeId: string, productIds: string[]) {
  const { getActiveReservedQuantityBatch } = await import('../repositories/inventoryReservationRepository');
  const uniqueIds = [...new Set(productIds)];
  const [reservedByProduct, summaryByProduct, weeklyReceivedByProduct] = await Promise.all([
    getActiveReservedQuantityBatch(storeId, uniqueIds),
    getBatchSummariesBatch(storeId, uniqueIds),
    computeWeeklyReceivedQtyBatch(storeId, uniqueIds),
  ]);
  return { reservedByProduct, summaryByProduct, weeklyReceivedByProduct };
}

export async function getProductPricingInRange(
  storeId: string,
  productId: string,
  fromDate: Date,
  toDate: Date,
): Promise<{
  productName: string;
  unitCost: number;
  sellingPrice: number;
  catalogUnitCost: number;
  catalogSellingPrice: number;
  batchesInRange: number;
  receivedQtyInRange: number;
}> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, cost: true, basePrice: true },
  });
  if (!product) throw new Error('Product not found');

  const batches = await prisma.stockBatch.findMany({
    where: {
      storeId,
      productId,
      receivedAt: { gte: fromDate, lte: toDate },
    },
    select: { receivedQty: true, unitCost: true },
  });

  let unitCost = product.cost;
  if (batches.length > 0) {
    let totalQty = 0;
    let totalCost = 0;
    for (const batch of batches) {
      totalQty += batch.receivedQty;
      totalCost += batch.receivedQty * (batch.unitCost ?? product.cost);
    }
    if (totalQty > 0) unitCost = Math.round(totalCost / totalQty);
  }

  const receivedQtyInRange = batches.reduce((sum, batch) => sum + batch.receivedQty, 0);

  return {
    productName: product.name,
    unitCost,
    sellingPrice: product.basePrice,
    catalogUnitCost: product.cost,
    catalogSellingPrice: product.basePrice,
    batchesInRange: batches.length,
    receivedQtyInRange,
  };
}

export type BranchAvailabilityResult = {
  isAvailable: boolean;
  stock: number;
  weeklyBaseQty: number;
  weeklyRemainingQty: number;
  frozenQty: number;
  restoredQty: number;
};

export async function setBranchProductAvailability(input: {
  storeId: string;
  productId: string;
  isAvailable: boolean;
  overrideQty?: number;
  adminUserId?: string;
  weeklyBaseQty?: number;
}): Promise<BranchAvailabilityResult> {
  await ensureEnumTypeIfMissing('BatchStatus', ['ACTIVE', 'DEPLETED', 'WRITTEN_OFF', 'FROZEN']);
  await ensureEnumValueIfMissing('BatchStatus', 'FROZEN');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.storeProduct.findUnique({
      where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
    });

    const baseQty = input.weeklyBaseQty ?? existing?.weeklyBaseQty ?? 50;

    if (!input.isAvailable) {
      const activeBatches = await tx.stockBatch.findMany({
        where: { storeId: input.storeId, productId: input.productId, status: 'ACTIVE' },
        select: { remainingQty: true },
      });
      const frozenQty = activeBatches.reduce((sum, batch) => sum + batch.remainingQty, 0);
      const qtyBefore = existing?.stock ?? 0;

      if (activeBatches.length > 0) {
        await tx.stockBatch.updateMany({
          where: { storeId: input.storeId, productId: input.productId, status: 'ACTIVE' },
          data: { status: 'FROZEN' },
        });
      }

      const row = await tx.storeProduct.upsert({
        where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
        create: {
          storeId: input.storeId,
          productId: input.productId,
          stock: 0,
          weeklyBaseQty: baseQty,
          weeklyRemainingQty: 0,
          isAvailable: false,
        },
        update: {
          isAvailable: false,
          stock: 0,
          weeklyRemainingQty: 0,
          ...(input.weeklyBaseQty !== undefined ? { weeklyBaseQty: baseQty } : {}),
        },
      });

      await setBranchDeactivatedAt(input.storeId, input.productId, new Date(), tx);

      if (qtyBefore > 0) {
        await writeAuditLog(tx, {
          storeId: input.storeId,
          productId: input.productId,
          changeType: 'MANUAL_ADJUSTMENT',
          qtyBefore,
          qtyChange: -qtyBefore,
          qtyAfter: 0,
          adminUserId: input.adminUserId,
          note: 'Product deactivated — batches frozen',
        });
      }

      return {
        isAvailable: row.isAvailable,
        stock: row.stock,
        weeklyBaseQty: row.weeklyBaseQty,
        weeklyRemainingQty: row.weeklyRemainingQty,
        frozenQty,
        restoredQty: 0,
      };
    }

    const frozenBatches = await tx.stockBatch.findMany({
      where: { storeId: input.storeId, productId: input.productId, status: 'FROZEN' },
      select: { id: true, remainingQty: true },
    });
    const frozenQty = frozenBatches.reduce((sum, batch) => sum + batch.remainingQty, 0);

    if (frozenBatches.length > 0) {
      const finalQty = input.overrideQty ?? frozenQty;
      if (finalQty > frozenQty) {
        throw new Error(`Stock to restore cannot exceed frozen quantity (${frozenQty})`);
      }

      await tx.stockBatch.updateMany({
        where: { storeId: input.storeId, productId: input.productId, status: 'FROZEN' },
        data: { status: 'ACTIVE' },
      });

      let toWriteOff = frozenQty - finalQty;
      if (toWriteOff > 0) {
        const activeBatches = await tx.stockBatch.findMany({
          where: {
            storeId: input.storeId,
            productId: input.productId,
            status: 'ACTIVE',
            remainingQty: { gt: 0 },
          },
          orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });

        for (const batch of activeBatches) {
          if (toWriteOff <= 0) break;
          const take = Math.min(batch.remainingQty, toWriteOff);
          const newRemaining = batch.remainingQty - take;
          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              remainingQty: newRemaining,
              status: newRemaining <= 0 ? 'DEPLETED' : 'ACTIVE',
            },
          });
          toWriteOff -= take;
        }
      }
    } else if (input.overrideQty !== undefined && input.overrideQty > 0) {
      const activeSum = await sumActiveBatchQty(tx, input.storeId, input.productId);
      if (input.overrideQty > activeSum) {
        throw new Error(`Stock to restore cannot exceed available quantity (${activeSum})`);
      }

      let toWriteOff = activeSum - input.overrideQty;
      if (toWriteOff > 0) {
        const activeBatches = await tx.stockBatch.findMany({
          where: {
            storeId: input.storeId,
            productId: input.productId,
            status: 'ACTIVE',
            remainingQty: { gt: 0 },
          },
          orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });

        for (const batch of activeBatches) {
          if (toWriteOff <= 0) break;
          const take = Math.min(batch.remainingQty, toWriteOff);
          const newRemaining = batch.remainingQty - take;
          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              remainingQty: newRemaining,
              status: newRemaining <= 0 ? 'DEPLETED' : 'ACTIVE',
            },
          });
          toWriteOff -= take;
        }
      }
    }

    await tx.storeProduct.upsert({
      where: { storeId_productId: { storeId: input.storeId, productId: input.productId } },
      create: {
        storeId: input.storeId,
        productId: input.productId,
        stock: 0,
        weeklyBaseQty: baseQty,
        weeklyRemainingQty: 0,
        isAvailable: true,
      },
      update: {
        isAvailable: true,
        ...(input.weeklyBaseQty !== undefined ? { weeklyBaseQty: baseQty } : {}),
      },
    });

    await setBranchDeactivatedAt(input.storeId, input.productId, null, tx);

    const qtyBefore = existing?.stock ?? 0;
    const { onHand, weeklyBaseQty } = await syncStoreProductFromBatches(tx, input.storeId, input.productId);

    if (onHand !== qtyBefore) {
      await writeAuditLog(tx, {
        storeId: input.storeId,
        productId: input.productId,
        changeType: 'MANUAL_ADJUSTMENT',
        qtyBefore,
        qtyChange: onHand - qtyBefore,
        qtyAfter: onHand,
        adminUserId: input.adminUserId,
        note:
          frozenQty > 0
            ? `Product reactivated — ${onHand} units restored from frozen batches`
            : 'Product reactivated',
      });
    }

    return {
      isAvailable: true,
      stock: onHand,
      weeklyBaseQty,
      weeklyRemainingQty: onHand,
      frozenQty,
      restoredQty: onHand,
    };
  }).then(async (result) => {
    await checkAndEmitThresholds(input.storeId, input.productId, result.stock);
    await emitStockUpdated(input.storeId, input.productId);
    return result;
  });
}
