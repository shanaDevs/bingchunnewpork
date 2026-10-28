/**
 * One-shot: apply batch stock runtime schema patches.
 * Usage: npx tsx backend/src/scripts/ensure-batch-stock-schema.ts
 */
import { connectDb, disconnectDb } from '../lib/prisma';
import { ensureBatchStockSchema } from '../lib/batchStockSchema';

async function main() {
  await connectDb();
  await ensureBatchStockSchema();
  console.log('Batch stock schema patch applied.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDb();
  });
