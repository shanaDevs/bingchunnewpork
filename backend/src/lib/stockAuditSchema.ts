import { prisma } from './prisma';
import { qualifiedPhysicalTable } from './deliveryPg';
import {
  addColumnIfMissing,
  columnIsNullable,
  createIndexIfMissing,
  tableExists,
  tableHasColumn,
} from './schemaPatch';
import { logger } from '../utils/logger';

/**
 * Required for stock batch receive / audit writes. Runs even when RUNTIME_SCHEMA_PATCHES=false
 * (core-only boot patches), because admin stock APIs must self-heal legacy DBs.
 */
export async function ensureStockAuditAdminUserNameColumn(): Promise<void> {
  if (!(await tableExists('stock_audit_logs'))) return;
  if (await tableHasColumn('stock_audit_logs', 'adminUserName')) return;

  const tableRef = await qualifiedPhysicalTable('stock_audit_logs');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS "adminUserName" TEXT`,
  );

  if (!(await tableHasColumn('stock_audit_logs', 'adminUserName'))) {
    throw new Error(
      'Could not add stock_audit_logs.adminUserName. Apply migration 20261107190000_stock_audit_admin_user_name.',
    );
  }
}

export async function ensureStockAuditLogTable(): Promise<void> {
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_storeId_productId_idx', '`storeId`, `productId`');
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_createdAt_idx', '`createdAt`');
  await createIndexIfMissing('stock_audit_logs', 'stock_audit_logs_changeType_idx', '`changeType`');
  await ensureStockAuditAdminUserNameColumn();
  await backfillStockAuditAdminUserNames();
}

async function backfillStockAuditAdminUserNames(): Promise<void> {
  try {
    if (!(await tableHasColumn('stock_audit_logs', 'adminUserName'))) return;
    await prisma.$executeRawUnsafe(`
      UPDATE "stock_audit_logs" AS sal
      SET "adminUserName" = au.name
      FROM "admin_users" AS au
      WHERE sal."adminUserId" = au.id
        AND sal."adminUserName" IS NULL
    `);
  } catch (err) {
    logger.warn('Stock audit admin name backfill skipped', err);
  }
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
