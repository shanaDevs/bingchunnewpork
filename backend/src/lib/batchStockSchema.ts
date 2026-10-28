import {
  addColumnIfMissing,
  createIndexIfMissing,
  createUniqueIndexIfMissing,
  ensureEnumTypeIfMissing,
  ensureEnumValueIfMissing,
} from './schemaPatch';
import { logger } from '../utils/logger';

let ensured = false;

/** Runtime bootstrap for batch FIFO stock tables/columns when Prisma migrate has not run yet. */
export async function ensureBatchStockSchema(): Promise<void> {
  if (ensured) return;

  try {
    await ensureEnumTypeIfMissing('BatchStatus', ['ACTIVE', 'DEPLETED', 'WRITTEN_OFF', 'FROZEN']);
    await ensureEnumValueIfMissing('BatchStatus', 'FROZEN');

    await addColumnIfMissing('stores', 'code', 'VARCHAR(191) NULL');
    await createUniqueIndexIfMissing('stores', 'stores_code_key', '`code`');

    await addColumnIfMissing('store_products', 'weeklyTargetQty', 'INT NOT NULL DEFAULT 0');
    await addColumnIfMissing('store_products', 'lowStockThreshold', 'INT NULL');
    await addColumnIfMissing('store_products', 'onlineOutOfStockThreshold', 'INT NULL');
    await addColumnIfMissing('store_products', 'branchDeactivatedAt', 'TIMESTAMP(3) NULL');

    await addColumnIfMissing('orders', 'channel', "TEXT NOT NULL DEFAULT 'WEB'");

    await addColumnIfMissing('stock_audit_logs', 'batchId', 'VARCHAR(191) NULL');
    await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_batchId_idx', '`batchId`');
    await createUniqueIndexIfMissing(
      'stock_batches',
      'stock_batches_storeId_batchNumber_key',
      '`storeId`, `batchNumber`',
    );
    await createIndexIfMissing(
      'stock_batches',
      'stock_batches_storeId_productId_status_receivedAt_idx',
      '`storeId`, `productId`, `status`, `receivedAt`',
    );

    await createIndexIfMissing('stock_batch_allocations', 'stock_batch_allocations_orderId_idx', '`orderId`');
    await createIndexIfMissing('stock_batch_allocations', 'stock_batch_allocations_batchId_idx', '`batchId`');
    await createIndexIfMissing(
      'stock_batch_allocations',
      'stock_batch_allocations_storeId_productId_idx',
      '`storeId`, `productId`',
    );

    ensured = true;
  } catch (err) {
    logger.warn('Batch stock schema patch failed', err);
    throw err;
  }
}
