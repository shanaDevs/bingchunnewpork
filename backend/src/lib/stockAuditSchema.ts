import { prisma } from './prisma';
import { addColumnIfMissing, columnIsNullable, createIndexIfMissing, tableHasColumn } from './schemaPatch';
import { logger } from '../utils/logger';

export async function ensureStockAuditLogTable(): Promise<void> {
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_storeId_productId_idx', '`storeId`, `productId`');
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_createdAt_idx', '`createdAt`');
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_changeType_idx', '`changeType`');
}

export async function ensureWeeklyStockColumns(): Promise<void> {
  await addColumnIfMissing('store_products', 'weeklyBaseQty', 'INT NULL DEFAULT 50');
  await addColumnIfMissing('store_products', 'weeklyRemainingQty', 'INT NULL DEFAULT 50');
  await addColumnIfMissing('store_products', 'weekResetAt', 'DATETIME(3) NULL');

  await backfillWeeklyStockColumns();
}

/** Fill NULL weekly qty columns from legacy stock (safe to run repeatedly). */
export async function backfillWeeklyStockColumns(): Promise<void> {
  try {
    if (!(await tableHasColumn('store_products', 'weeklyBaseQty'))) return;

    const needsBackfill = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(`
      SELECT COUNT(*) AS cnt FROM "store_products"
      WHERE "weeklyBaseQty" IS NULL OR "weeklyRemainingQty" IS NULL
    `);

    if (Number(needsBackfill[0]?.cnt ?? 0) > 0) {
      await prisma.$executeRawUnsafe(`
        UPDATE "store_products"
        SET
          "weeklyBaseQty" = COALESCE(
            "weeklyBaseQty",
            CASE WHEN "stock" > 5 THEN "stock" ELSE 50 END
          ),
          "weeklyRemainingQty" = COALESCE(
            "weeklyRemainingQty",
            CASE WHEN "stock" > 5 THEN "stock" ELSE 50 END
          )
        WHERE "weeklyBaseQty" IS NULL OR "weeklyRemainingQty" IS NULL
      `);
    }

    const baseNullable = await columnIsNullable('store_products', 'weeklyBaseQty');
    const remainingNullable = await columnIsNullable('store_products', 'weeklyRemainingQty');
    if (baseNullable || remainingNullable) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "store_products"
          ALTER COLUMN "weeklyBaseQty" SET NOT NULL,
          ALTER COLUMN "weeklyBaseQty" SET DEFAULT 50,
          ALTER COLUMN "weeklyRemainingQty" SET NOT NULL,
          ALTER COLUMN "weeklyRemainingQty" SET DEFAULT 50
      `);
    }
  } catch (err) {
    logger.warn('Weekly stock backfill skipped', err);
  }
}

let backfillPromise: Promise<void> | null = null;

/** Run NULL backfill once per process — heals legacy rows after column migration. */
export function ensureWeeklyStockBackfilled(): Promise<void> {
  if (!backfillPromise) {
    backfillPromise = backfillWeeklyStockColumns().catch((err) => {
      backfillPromise = null;
      throw err;
    });
  }
  return backfillPromise;
}
