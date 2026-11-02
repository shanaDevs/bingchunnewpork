import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    storeProduct: { findUnique: vi.fn(), findMany: vi.fn() },
    storeProductReservation: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  getAvailableStock,
  InsufficientStockError,
} from '../../src/repositories/inventoryReservationRepository';

describe('inventoryReservationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes online available stock as physical minus reservations minus buffer', async () => {
    vi.mocked(prisma.storeProduct.findUnique).mockResolvedValue({
      stock: 50,
      isAvailable: true,
      onlineOutOfStockThreshold: null,
    } as never);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ total: 15 }] as never);

    const available = await getAvailableStock('store-1', 'prod-1');
    expect(available).toBe(30);
  });

  it('returns zero when product is unavailable', async () => {
    vi.mocked(prisma.storeProduct.findUnique).mockResolvedValue({
      stock: 50,
      isAvailable: false,
    } as never);

    const available = await getAvailableStock('store-1', 'prod-1');
    expect(available).toBe(0);
  });
});

describe('InsufficientStockError', () => {
  it('carries product context', () => {
    const err = new InsufficientStockError('Insufficient stock', 'prod-1', 2);
    expect(err.productId).toBe('prod-1');
    expect(err.available).toBe(2);
  });
});
