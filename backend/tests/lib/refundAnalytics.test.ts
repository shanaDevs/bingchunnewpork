import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    store: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { aggregateTopRefundBranches } from '../../src/lib/refundAnalytics';

describe('aggregateTopRefundBranches', () => {
  const range = {
    gte: new Date('2026-09-01T00:00:00.000Z'),
    lte: new Date('2026-09-22T23:59:59.999Z'),
  };

  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockReset();
    vi.mocked(prisma.store.findMany).mockReset();
  });

  it('returns an empty list when no completed refunds have a store', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await expect(aggregateTopRefundBranches(range)).resolves.toEqual([]);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('ranks the top 5 stores by refund amount and strips the brand prefix', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { storeId: 'store-maha', amount: 4320, count: 1 },
      { storeId: 'store-nuge', amount: 3210, count: 2 },
      { storeId: 'store-kott', amount: 2480, count: 1 },
      { storeId: 'store-mala', amount: 1960, count: 1 },
      { storeId: 'store-batta', amount: 1430, count: 1 },
    ] as never);
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: 'store-maha', name: 'Bing Chun - Maharagama' },
      { id: 'store-nuge', name: 'Bing Chun - Nugegoda' },
      { id: 'store-kott', name: 'Bing Chun - Kottawa' },
      { id: 'store-mala', name: 'Bing Chun - Malabe' },
      { id: 'store-batta', name: 'Bing Chun - Battaramulla' },
    ] as never);

    await expect(aggregateTopRefundBranches(range)).resolves.toEqual([
      { storeId: 'store-maha', branchName: 'Maharagama', amount: 4320, count: 1 },
      { storeId: 'store-nuge', branchName: 'Nugegoda', amount: 3210, count: 2 },
      { storeId: 'store-kott', branchName: 'Kottawa', amount: 2480, count: 1 },
      { storeId: 'store-mala', branchName: 'Malabe', amount: 1960, count: 1 },
      { storeId: 'store-batta', branchName: 'Battaramulla', amount: 1430, count: 1 },
    ]);
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['store-maha', 'store-nuge', 'store-kott', 'store-mala', 'store-batta'],
        },
      },
      select: { id: true, name: true },
    });
  });
});
