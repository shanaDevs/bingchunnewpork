/**
 * Adds users.wishlistShareToken for public wishlist share links.
 * Safe to re-run. PostgreSQL.
 */
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wishlistShareToken" VARCHAR(64)',
  );
  console.log('wishlistShareToken column ready');

  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "users_wishlistShareToken_key" ON "users"("wishlistShareToken")',
  );
  console.log('users_wishlistShareToken_key index ready');

  console.log('Wishlist share token migration complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
