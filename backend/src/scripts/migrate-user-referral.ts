/**
 * Adds referredByUserId to users for referral promo eligibility.
 * Safe to re-run.
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `users` ADD COLUMN `referredByUserId` VARCHAR(191) NULL',
    );
    console.log('✅ Added referredByUserId');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Duplicate column') || msg.includes('already exists')) {
      console.log('⏭️  referredByUserId already exists');
    } else {
      throw err;
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX `users_referredByUserId_idx` ON `users`(`referredByUserId`)',
    );
    console.log('✅ Index users_referredByUserId_idx');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Duplicate') || msg.includes('already exists')) {
      console.log('⏭️  Index already exists');
    } else {
      throw err;
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `users` ADD CONSTRAINT `users_referredByUserId_fkey` FOREIGN KEY (`referredByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    );
    console.log('✅ FK users_referredByUserId_fkey');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Duplicate') || msg.includes('already exists')) {
      console.log('⏭️  FK already exists');
    } else {
      throw err;
    }
  }

  console.log('User referral migration complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
