import {
  addColumnIfMissing,
  columnIsNullable,
  createIndexIfMissing,
  execSql,
  tableHasColumn,
  tableHasConstraint,
  tableHasIndex,
} from './schemaPatch';
import { prisma } from './prisma';

let productRatingsReady = false;

async function commentNeedsTextWiden(): Promise<boolean> {
  if (!(await tableHasColumn('product_ratings', 'comment'))) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ data_type: string }>>(
    "SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'product_ratings' AND column_name = 'comment'",
  );
  const type = (rows[0]?.data_type || '').toLowerCase();
  return type !== 'text';
}

async function dropUniqueProductUserConstraint(): Promise<void> {
  const candidates = [
    'product_ratings_productId_userId_key',
    'product_ratings_product_id_user_id_key',
  ];
  for (const name of candidates) {
    if (await tableHasConstraint('product_ratings', name)) {
      await execSql(`ALTER TABLE "product_ratings" DROP CONSTRAINT "${name}"`);
    }
    if (await tableHasIndex('product_ratings', name)) {
      await execSql(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}

/** Ensure product_ratings supports multiple reviews per user/product. */
export async function ensureProductRatingsTables(): Promise<void> {
  if (productRatingsReady) return;
  await addColumnIfMissing('product_ratings', 'comment', 'TEXT NULL');
  await addColumnIfMissing('product_ratings', 'guestName', 'VARCHAR(100) NULL');
  if (await commentNeedsTextWiden()) {
    await execSql('ALTER TABLE "product_ratings" ALTER COLUMN "comment" TYPE TEXT');
  }
  if (!(await columnIsNullable('product_ratings', 'userId'))) {
    await execSql('ALTER TABLE "product_ratings" ALTER COLUMN "userId" DROP NOT NULL');
  }
  await dropUniqueProductUserConstraint();
  await createIndexIfMissing('product_ratings', 'product_ratings_productId_stars_idx', 'productId, stars');
  await createIndexIfMissing('product_ratings', 'product_ratings_productId_createdAt_idx', 'productId, createdAt');
  productRatingsReady = true;
}
