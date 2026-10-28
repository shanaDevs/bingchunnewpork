/**
 * Ensures products.cost exists, then backfills cost from basePrice:
 * - basePrice = 200 → cost = 150 (200 - 50)
 * - otherwise → cost = max(basePrice - 200, 0)
 * Safe to re-run.
 *
 * Run: npx ts-node --transpile-only src/scripts/backfill-product-cost.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const rawUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
if (!rawUrl || !rawUrl.startsWith('mysql://')) {
  console.error('DATABASE_URL missing or invalid (must start with mysql://)');
  process.exit(1);
}
process.env.DATABASE_URL = rawUrl;

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function ensureCostColumn() {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'products'
       AND COLUMN_NAME = 'cost'`,
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) {
    console.log('products.cost column already exists');
    return;
  }
  await prisma.$executeRawUnsafe(
    'ALTER TABLE `products` ADD COLUMN `cost` INT NOT NULL DEFAULT 0',
  );
  console.log('Added products.cost column');
}

async function main() {
  await ensureCostColumn();

  const result = await prisma.$executeRawUnsafe(`
    UPDATE \`products\`
    SET \`cost\` = CASE
      WHEN \`basePrice\` = 200 THEN 150
      ELSE GREATEST(\`basePrice\` - 200, 0)
    END
  `);

  console.log(`Updated cost (200 → 150, else basePrice - 200) for products (rows affected: ${result})`);

  const sample = await prisma.$queryRawUnsafe<
    Array<{ name: string; basePrice: number; cost: number }>
  >(
    `SELECT name, basePrice, cost FROM products ORDER BY name ASC LIMIT 10`,
  );

  console.log('Sample (first 10 by name):');
  for (const p of sample) {
    console.log(`  ${p.name}: basePrice=${p.basePrice}, cost=${p.cost}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
