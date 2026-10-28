/**
 * Backward-compatible stock engine facade.
 * Quantity mutations are delegated to batchStockEngine (FIFO batch model).
 */
import type { OrderChannel } from '@prisma/client';
import {
  LOW_STOCK_THRESHOLD,
  OUT_OF_STOCK_THRESHOLD,
  getEffectiveThresholds,
  isLowStockByQty,
  isOnlineOutOfStockByQty,
  receiveBatch,
  validateOrderStock as validateOrderStockBatch,
  deductOrderItems,
  deductOrderItemsOnce,
  restoreOrderItems,
  orderStockWasDeducted,
  checkAndEmitThresholds,
  adjustBatch,
} from './batchStockEngine';

export {
  LOW_STOCK_THRESHOLD,
  OUT_OF_STOCK_THRESHOLD,
  getEffectiveThresholds,
  checkAndEmitThresholds,
  deductOrderItems,
  deductOrderItemsOnce,
  restoreOrderItems,
  orderStockWasDeducted,
};

export type WeeklyStockRow = {
  isAvailable: boolean;
  weeklyRemainingQty: number;
};

export function isProductOrderable(row: WeeklyStockRow, onlineOutOfStockThreshold = OUT_OF_STOCK_THRESHOLD): boolean {
  return row.isAvailable && row.weeklyRemainingQty > onlineOutOfStockThreshold;
}

export function isLowStock(remaining: number, lowStockThreshold = LOW_STOCK_THRESHOLD): boolean {
  return isLowStockByQty(remaining, {
    lowStockThreshold,
    onlineOutOfStockThreshold: OUT_OF_STOCK_THRESHOLD,
  });
}

export function isOutOfStockByQty(remaining: number, onlineOutOfStockThreshold = OUT_OF_STOCK_THRESHOLD): boolean {
  return isOnlineOutOfStockByQty(remaining, {
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    onlineOutOfStockThreshold,
  });
}

export async function validateOrderStock(
  storeId: string,
  items: Array<{ productId: string; quantity: number; productName?: string }>,
  channel: OrderChannel = 'WEB',
): Promise<void> {
  return validateOrderStockBatch(storeId, items, channel);
}

export async function manualTopUp(
  storeId: string,
  productId: string,
  delta: number,
  adminUserId: string,
  note?: string,
): Promise<{ weeklyBaseQty: number; weeklyRemainingQty: number }> {
  if (delta === 0) {
    const row = await import('./prisma').then(({ prisma }) =>
      prisma.storeProduct.findUnique({
        where: { storeId_productId: { storeId, productId } },
        select: { weeklyBaseQty: true, weeklyRemainingQty: true },
      }),
    );
    if (!row) throw new Error('Branch stock row not found');
    return row;
  }

  if (delta > 0) {
    const result = await receiveBatch({
      storeId,
      productId,
      receivedQty: delta,
      note: note ?? 'Manual top-up',
      adminUserId,
    });
    return { weeklyBaseQty: result.weeklyBaseQty, weeklyRemainingQty: result.onHand };
  }

  const batches = await import('./prisma').then(({ prisma }) =>
    prisma.stockBatch.findMany({
      where: { storeId, productId, status: 'ACTIVE', remainingQty: { gt: 0 } },
      orderBy: [{ receivedAt: 'desc' }],
      take: 1,
    }),
  );
  if (batches.length === 0) throw new Error('No active batch to reduce');

  const result = await adjustBatch({
    batchId: batches[0].id,
    delta,
    reason: note ?? 'Manual reduction',
    adminUserId,
    changeType: 'BATCH_ADJUSTMENT',
  });

  const row = await import('./prisma').then(({ prisma }) =>
    prisma.storeProduct.findUnique({
      where: { storeId_productId: { storeId, productId } },
      select: { weeklyBaseQty: true },
    }),
  );

  return { weeklyBaseQty: row?.weeklyBaseQty ?? 0, weeklyRemainingQty: result.onHand };
}

export async function setWeeklyBaseQty(
  storeId: string,
  productId: string,
  weeklyTargetQty: number,
  adminUserId?: string,
): Promise<void> {
  const { prisma } = await import('./prisma');
  const row = await prisma.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  if (!row) return;

  await prisma.storeProduct.update({
    where: { storeId_productId: { storeId, productId } },
    data: { weeklyTargetQty },
  });

  if (adminUserId) {
    const { randomUUID } = await import('crypto');
    await prisma.stockAuditLog.create({
      data: {
        id: randomUUID(),
        storeId,
        productId,
        changeType: 'MANUAL_ADJUSTMENT',
        qtyBefore: row.weeklyTargetQty,
        qtyChange: weeklyTargetQty - row.weeklyTargetQty,
        qtyAfter: weeklyTargetQty,
        adminUserId,
        note: `Weekly target set to ${weeklyTargetQty}`,
      },
    }).catch(() => undefined);
  }
}
