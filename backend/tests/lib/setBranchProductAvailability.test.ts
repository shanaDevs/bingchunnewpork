import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/schemaPatch', () => ({
  ensureEnumTypeIfMissing: vi.fn().mockResolvedValue(undefined),
  ensureEnumValueIfMissing: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/branchDeactivation', () => ({
  setBranchDeactivatedAt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/socket', () => ({
  getIo: vi.fn(() => {
    throw new Error('no socket');
  }),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    storeProduct: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    stockBatch: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { setBranchDeactivatedAt } from '../../src/lib/branchDeactivation';
import { setBranchProductAvailability } from '../../src/lib/batchStockEngine';

describe('setBranchProductAvailability branchDeactivatedAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets branchDeactivatedAt when deactivating a product with no batches', async () => {
    const tx = {
      storeProduct: {
        findUnique: vi.fn().mockResolvedValue({
          storeId: 'store-1',
          productId: 'prod-1',
          stock: 0,
          weeklyBaseQty: 50,
          weeklyRemainingQty: 0,
          isAvailable: true,
        }),
        upsert: vi.fn().mockResolvedValue({
          isAvailable: false,
          stock: 0,
          weeklyBaseQty: 50,
          weeklyRemainingQty: 0,
        }),
      },
      stockBatch: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },
      stockAuditLog: {
        create: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    const result = await setBranchProductAvailability({
      storeId: 'store-1',
      productId: 'prod-1',
      isAvailable: false,
    });

    expect(result.isAvailable).toBe(false);
    expect(setBranchDeactivatedAt).toHaveBeenCalledWith(
      'store-1',
      'prod-1',
      expect.any(Date),
      tx,
    );
  });

  it('clears branchDeactivatedAt when reactivating a product with no frozen batches', async () => {
    const tx = {
      storeProduct: {
        findUnique: vi.fn().mockResolvedValue({
          storeId: 'store-1',
          productId: 'prod-1',
          stock: 0,
          weeklyBaseQty: 50,
          weeklyRemainingQty: 0,
          isAvailable: false,
        }),
        upsert: vi.fn().mockResolvedValue({
          isAvailable: true,
          stock: 0,
          weeklyBaseQty: 50,
          weeklyRemainingQty: 0,
        }),
        update: vi.fn(),
      },
      stockBatch: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { remainingQty: 0 } }),
      },
      stockAuditLog: {
        create: vi.fn(),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    vi.mocked(prisma.storeProduct.findUnique).mockResolvedValue({
      storeId: 'store-1',
      productId: 'prod-1',
      stock: 0,
      weeklyBaseQty: 50,
      weeklyRemainingQty: 0,
      isAvailable: true,
      lowStockThreshold: null,
      onlineOutOfStockThreshold: null,
    } as never);

    const result = await setBranchProductAvailability({
      storeId: 'store-1',
      productId: 'prod-1',
      isAvailable: true,
    });

    expect(result.isAvailable).toBe(true);
    expect(setBranchDeactivatedAt).toHaveBeenCalledWith('store-1', 'prod-1', null, tx);
  });
});
