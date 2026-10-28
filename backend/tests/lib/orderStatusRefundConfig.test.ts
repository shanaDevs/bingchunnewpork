import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../src/lib/schemaPatch', () => ({
  addColumnIfMissing: vi.fn().mockResolvedValue(undefined),
  tableExists: vi.fn().mockResolvedValue(true),
  columnUdtName: vi.fn().mockResolvedValue('OrderStatus'),
}));

import { prisma } from '../../src/lib/prisma';
import {
  assertCancellableOrderStatus,
  DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES,
  getRefundPercentageForStatus,
} from '../../src/lib/orderStatusRefundConfig';

describe('orderStatusRefundConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assertCancellableOrderStatus accepts cancellable statuses', () => {
    expect(assertCancellableOrderStatus('PREPARING')).toBe('PREPARING');
  });

  it('assertCancellableOrderStatus rejects delivered status', () => {
    expect(() => assertCancellableOrderStatus('DELIVERED')).toThrow(
      'Invalid order status for refund configuration',
    );
  });

  it('returns configured percentage for an active status', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockImplementation(async (query: string) => {
      if (query.includes('COUNT(*)')) {
        return [{ n: 1 }] as never;
      }
      if (query.includes('WHERE "orderStatus"')) {
        return [{
          id: 'cfg-1',
          orderStatus: 'PREPARING',
          refundPercentage: 75,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }] as never;
      }
      return [] as never;
    });

    await expect(getRefundPercentageForStatus('PREPARING')).resolves.toBe(75);
  });

  it('falls back to default percentage when config is missing', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([] as never);

    await expect(getRefundPercentageForStatus('READY')).resolves.toBe(
      DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES.find((entry) => entry.orderStatus === 'READY')!.refundPercentage,
    );
  });
});
