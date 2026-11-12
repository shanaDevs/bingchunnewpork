/**
 * One-shot local patch when RUNTIME_SCHEMA_PATCHES=false.
 * Sugar: FIFTY | HUNDRED. Ice: LESS_ICE | NORMAL_ICE.
 *
 *   npx ts-node -r dotenv/config src/scripts/patch-drink-options-schema.ts
 */
import path from 'path';
import dotenv from 'dotenv';
import { prisma } from '../lib/prisma';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run(sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log('[ok]', sql.replace(/\s+/g, ' ').slice(0, 110));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[skip]', message.split('\n')[0]);
  }
}

async function main() {
  await run(`ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "cupStickerPrinterName" VARCHAR(256) NULL`);

  await run(`ALTER TABLE "cart_items" ALTER COLUMN "sugarLevel" DROP DEFAULT`);
  await run(`ALTER TABLE "order_items" ALTER COLUMN "sugarLevel" DROP DEFAULT`);
  await run(`
    ALTER TABLE "cart_items"
    ALTER COLUMN "sugarLevel" TYPE TEXT
    USING CASE
      WHEN "sugarLevel"::text IN ('FIFTY', 'LESS_SUGAR') THEN 'FIFTY'
      WHEN "sugarLevel"::text IN ('HUNDRED', 'NORMAL_SUGAR', 'MORE_SUGAR') THEN 'HUNDRED'
      ELSE NULL
    END
  `);
  await run(`
    ALTER TABLE "order_items"
    ALTER COLUMN "sugarLevel" TYPE TEXT
    USING CASE
      WHEN "sugarLevel"::text IN ('FIFTY', 'LESS_SUGAR') THEN 'FIFTY'
      WHEN "sugarLevel"::text IN ('HUNDRED', 'NORMAL_SUGAR', 'MORE_SUGAR') THEN 'HUNDRED'
      ELSE NULL
    END
  `);
  await run(`DROP TYPE IF EXISTS "SugarLevel" CASCADE`);
  await run(`CREATE TYPE "SugarLevel" AS ENUM ('FIFTY', 'HUNDRED')`);
  await run(`ALTER TABLE "cart_items" ALTER COLUMN "sugarLevel" TYPE "SugarLevel" USING "sugarLevel"::"SugarLevel"`);
  await run(`ALTER TABLE "order_items" ALTER COLUMN "sugarLevel" TYPE "SugarLevel" USING "sugarLevel"::"SugarLevel"`);

  await run(`ALTER TABLE "cart_items" ALTER COLUMN "iceLevel" DROP DEFAULT`);
  await run(`ALTER TABLE "order_items" ALTER COLUMN "iceLevel" DROP DEFAULT`);
  await run(`
    ALTER TABLE "cart_items"
    ALTER COLUMN "iceLevel" TYPE TEXT
    USING CASE
      WHEN "iceLevel"::text = 'LESS_ICE' THEN 'LESS_ICE'
      WHEN "iceLevel"::text IN ('NORMAL_ICE', 'MORE_ICE', 'REGULAR') THEN 'NORMAL_ICE'
      ELSE NULL
    END
  `);
  await run(`
    ALTER TABLE "order_items"
    ALTER COLUMN "iceLevel" TYPE TEXT
    USING CASE
      WHEN "iceLevel"::text = 'LESS_ICE' THEN 'LESS_ICE'
      WHEN "iceLevel"::text IN ('NORMAL_ICE', 'MORE_ICE', 'REGULAR') THEN 'NORMAL_ICE'
      ELSE NULL
    END
  `);
  await run(`DROP TYPE IF EXISTS "IceLevel" CASCADE`);
  await run(`CREATE TYPE "IceLevel" AS ENUM ('LESS_ICE', 'NORMAL_ICE')`);
  await run(`ALTER TABLE "cart_items" ALTER COLUMN "iceLevel" TYPE "IceLevel" USING "iceLevel"::"IceLevel"`);
  await run(`ALTER TABLE "order_items" ALTER COLUMN "iceLevel" TYPE "IceLevel" USING "iceLevel"::"IceLevel"`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Done.');
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
