import { prisma } from './prisma';

export type TopRefundBranch = {
  storeId: string;
  branchName: string;
  amount: number;
  count: number;
};

export async function aggregateTopRefundBranches(range: {
  gte: Date;
  lte: Date;
}): Promise<TopRefundBranch[]> {
  const rows = await prisma.$queryRaw<
    Array<{ storeId: string; amount: number | bigint | null; count: bigint | number }>
  >`
    SELECT o."storeId" AS "storeId",
           COALESCE(SUM(r."refundAmount"), 0) AS amount,
           COUNT(*)::bigint AS count
    FROM "refunds" r
    INNER JOIN "orders" o ON o."id" = r."orderId"
    WHERE r."status" = 'COMPLETE'
      AND (
        (r."processedAt" >= ${range.gte} AND r."processedAt" <= ${range.lte})
        OR (r."processedAt" IS NULL AND r."createdAt" >= ${range.gte} AND r."createdAt" <= ${range.lte})
      )
    GROUP BY o."storeId"
    HAVING COALESCE(SUM(r."refundAmount"), 0) > 0
    ORDER BY amount DESC, count DESC
    LIMIT 5
  `;

  if (rows.length === 0) return [];

  const stores = await prisma.store.findMany({
    where: { id: { in: rows.map((row) => row.storeId) } },
    select: { id: true, name: true },
  });
  const storeNameById = new Map(stores.map((store) => [store.id, store.name]));

  return rows.map((row) => ({
    storeId: row.storeId,
    branchName: (storeNameById.get(row.storeId) ?? 'Unknown').replace('Bing Chun - ', ''),
    amount: Number(row.amount ?? 0),
    count: Number(row.count ?? 0),
  }));
}
