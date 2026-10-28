/**
 * Adds promotion card design columns to promo_codes.
 * Safe to re-run — skips columns that already exist.
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const COLUMNS: string[] = [
  'ADD COLUMN `title` VARCHAR(191) NULL',
  'ADD COLUMN `criteria` JSON NULL',
  'ADD COLUMN `ownership` VARCHAR(191) NULL',
  'ADD COLUMN `cardDesign` JSON NULL',
  'ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0',
  'ADD COLUMN `promotionKind` VARCHAR(191) NULL',
  'ADD COLUMN `promotionRules` JSON NULL',
  'ADD COLUMN `usageLimits` JSON NULL',
  'ADD COLUMN `startsAt` DATETIME(3) NULL',
  'ADD COLUMN `deletedAt` DATETIME(3) NULL',
  'ADD COLUMN `storeIds` JSON NULL',
  'ADD COLUMN `showOnHome` TINYINT(1) NOT NULL DEFAULT 1',
  'ADD COLUMN `branchShareSplits` JSON NULL',
];

async function addPostgresBranchShareSplits(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "branchShareSplits" JSONB`,
    );
    console.log('✅ ADD COLUMN "branchShareSplits" JSONB');
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      console.log('⏭️  Already exists: branchShareSplits');
      return true;
    }
    return false;
  }
}

async function main() {
  const postgres = await addPostgresBranchShareSplits();
  if (postgres) {
    console.log('Promotion columns migration complete.');
    return;
  }

  for (const col of COLUMNS) {
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
  console.log('Promotion columns migration complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
