import { prisma } from './prisma';
import type { MenuStockBatchMeta } from './menuBranchStock';

export async function loadBatchMetaByProduct(
  storeId: string,
  productIds: string[],
): Promise<Map<string, MenuStockBatchMeta>> {
  const map = new Map<string, MenuStockBatchMeta>();
  if (productIds.length === 0) return map;

  try {
    const groups = await prisma.stockBatch.groupBy({
      by: ['productId'],
      where: { storeId, productId: { in: productIds } },
      _count: { id: true },
      _sum: { receivedQty: true },
    });
    for (const group of groups) {
      map.set(group.productId, {
        totalBatchCount: group._count.id,
        weeklyReceivedQty: group._sum.receivedQty ?? 0,
      });
    }
  } catch {
    /* batch table may be unavailable in some environments */
  }

  return map;
}
