/**
 * Adds shared promotion columns and promotion_usages table.
 * Safe to re-run — skips existing columns/tables.
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const PROMO_COLUMNS: string[] = [
  'ADD COLUMN `branchSharePct` INT NULL',
  'ADD COLUMN `platformSharePct` INT NULL',
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function getColumnType(table: string, column: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return rows[0]?.COLUMN_TYPE ?? 'varchar(191)';
}

async function main() {
  for (const col of PROMO_COLUMNS) {
    const colName = col.match(/`(\w+)`/)?.[1];
    if (colName && (await columnExists('promo_codes', colName))) {
      console.log(`⏭️  Column already exists: ${colName}`);
      continue;
    }
    const sql = `ALTER TABLE \`promo_codes\` ${col}`;
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`✅ ${col}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Duplicate column') || msg.includes('already exists')) {
        console.log(`⏭️  Already exists: ${col}`);
        continue;
      }
      throw err;
    }
  }

  if (await tableExists('promotion_usages')) {
    console.log('⏭️  Table promotion_usages already exists');
  } else {
    const idType = await getColumnType('orders', 'id');
    const storeIdType = await getColumnType('stores', 'id');
    const userIdType = await getColumnType('users', 'id');
    const promoIdType = await getColumnType('promo_codes', 'id');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`promotion_usages\` (
        \`id\` ${idType} NOT NULL,
        \`orderId\` ${idType} NOT NULL,
        \`promoCodeId\` ${promoIdType} NULL,
        \`promoCode\` VARCHAR(191) NOT NULL,
        \`storeId\` ${storeIdType} NOT NULL,
        \`userId\` ${userIdType} NULL,
        \`ownership\` VARCHAR(191) NOT NULL,
        \`branchSharePct\` INT NOT NULL DEFAULT 0,
        \`platformSharePct\` INT NOT NULL DEFAULT 100,
        \`promotionKind\` VARCHAR(191) NULL,
        \`promotionRules\` JSON NULL,
        \`orderSubtotal\` INT NOT NULL,
        \`totalDiscountAmount\` INT NOT NULL,
        \`branchShareAmount\` INT NOT NULL DEFAULT 0,
        \`platformShareAmount\` INT NOT NULL DEFAULT 0,
        \`offerDetails\` JSON NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`promotion_usages_orderId_idx\` (\`orderId\`),
        INDEX \`promotion_usages_promoCodeId_idx\` (\`promoCodeId\`),
        INDEX \`promotion_usages_storeId_createdAt_idx\` (\`storeId\`, \`createdAt\`),
        INDEX \`promotion_usages_promoCode_createdAt_idx\` (\`promoCode\`, \`createdAt\`),
        CONSTRAINT \`promotion_usages_orderId_fkey\` FOREIGN KEY (\`orderId\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`promotion_usages_storeId_fkey\` FOREIGN KEY (\`storeId\`) REFERENCES \`stores\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`promotion_usages_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('✅ Created table promotion_usages');
  }

  console.log('Shared promotion migration complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
