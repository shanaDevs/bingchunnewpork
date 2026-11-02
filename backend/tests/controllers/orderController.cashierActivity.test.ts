import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      groupBy: vi.fn(),
    },
    orderStatusEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    isBranchScopedRole: vi.fn(),
    requireBranchStoreId: vi.fn(),
  };
});

import { getCashierActivity } from '../../src/controllers/orderController';
import { prisma } from '../../src/lib/prisma';
import { isBranchScopedRole, requireBranchStoreId } from '../../src/middleware/auth';

describe('getCashierActivity', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      { processedByAdminId: 'cashier-b', processedByName: 'Cashier B', _count: { _all: 3 } },
    ] as never);
    vi.mocked(prisma.orderStatusEvent.findMany).mockResolvedValue([
      {
        actorAdminId: 'cashier-b',
        actorName: 'Cashier B',
        status: 'CANCELLED',
        note: 'Out of stock',
        order: { total: 1500, paymentMethod: 'CASH_AT_COUNTER' },
      },
      {
        actorAdminId: 'cashier-b',
        actorName: 'Cashier B',
        status: 'DELIVERED',
        note: 'Picked up & paid at counter (cash)',
        order: { total: 1500, paymentMethod: 'CASH_AT_COUNTER' },
      },
    ] as never);
  });

  it('returns per-cashier processed, cash, and cancel counts for the branch', async () => {
    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
      query: { from: '2026-09-01', to: '2026-09-29' },
    });
    const res = createMockRes();

    await getCashierActivity(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalledWith(req);
    expect(prisma.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-1' }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          cashiers: [
            expect.objectContaining({
              adminId: 'cashier-b',
              name: 'Cashier B',
              ordersProcessed: 3,
              cashCollectedAmount: 1500,
              cancels: 1,
            }),
          ],
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
