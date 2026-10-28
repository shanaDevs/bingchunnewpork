import type { Prisma } from '@prisma/client';
import { execSql, querySql, toPg } from './schemaPatch';

type Tx = Prisma.TransactionClient;

/** Raw SQL helpers — work before Prisma client is regenerated with branchDeactivatedAt. */

export async function setBranchDeactivatedAt(
  storeId: string,
  productId: string,
  at: Date | null,
  tx?: Tx,
): Promise<void> {
  const sql =
    'UPDATE store_products SET "branchDeactivatedAt" = ? WHERE "storeId" = ? AND "productId" = ?';
  if (tx) {
    await tx.$executeRawUnsafe(toPg(sql), at, storeId, productId);
  } else {
    await execSql(sql, at, storeId, productId);
  }
}

export async function getBranchDeactivatedAtByProductId(
  storeId: string,
  productIds: string[],
): Promise<Map<string, Date>> {
  if (productIds.length === 0) return new Map();

  const placeholders = productIds.map(() => '?').join(', ');
  const rows = await querySql<Array<{ productId: string; branchDeactivatedAt: Date }>>(
    `SELECT "productId", "branchDeactivatedAt" FROM store_products
     WHERE "storeId" = ? AND "productId" IN (${placeholders}) AND "branchDeactivatedAt" IS NOT NULL`,
    storeId,
    ...productIds,
  );

  return new Map(rows.map((row) => [row.productId, row.branchDeactivatedAt]));
}

export async function getBranchDeactivatedProductIds(
  storeId: string,
  productIds: string[],
): Promise<Set<string>> {
  const map = await getBranchDeactivatedAtByProductId(storeId, productIds);
  return new Set(map.keys());
}
