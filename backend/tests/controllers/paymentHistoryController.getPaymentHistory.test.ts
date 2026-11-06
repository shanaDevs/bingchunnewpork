import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext } from '../helpers/express';

const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';

vi.mock('../../src/lib/settlementSchema', () => ({
  ensureCommissionSettlementTable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', () => ({
  resolveBranchStoreId: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
    order: { findMany: vi.fn() },
    commissionSettlement: { findMany: vi.fn() },
    promotionUsage: { aggregate: vi.fn() },
    storeWithdrawal: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { getPaymentHistory } from '../../src/controllers/paymentHistoryController';

describe('getPaymentHistory payout list', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue([
      { id: STORE_A },
      { id: STORE_B },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.promotionUsage.aggregate).mockResolvedValue({
      _sum: { platformPaybackAmount: null },
    } as never);
    vi.mocked(prisma.storeWithdrawal.findMany).mockResolvedValue([] as never);
  });

  it('returns settlements whose billing period overlaps the query range', async () => {
    const overlapCalls: unknown[] = [];
    const allTimeRows = [
      { totalCommission: 10000, platformPaybackAmount: 0 },
      { totalCommission: 5000, platformPaybackAmount: 0 },
    ];

    vi.mocked(prisma.commissionSettlement.findMany).mockImplementation(async (args) => {
      const where = args?.where as {
        periodFrom?: { lte: Date };
        periodTo?: { gte: Date };
        status?: { not: string };
        OR?: Array<{ periodFrom?: { lte: Date }; periodTo?: { gte: Date } }>;
      };
      if (where?.status?.not === 'REJECTED') {
        return allTimeRows as never;
      }
      const periodOverlap =
        where?.OR?.[0]?.periodFrom && where?.OR?.[0]?.periodTo
          ? where.OR[0]
          : where?.periodFrom && where?.periodTo
            ? where
            : null;
      if (periodOverlap) {
        overlapCalls.push(periodOverlap);
        return [
          {
            id: 'settle-oct',
            storeId: STORE_A,
            statementRef: 'STMT-OCT',
            createdAt: new Date('2026-11-10T12:00:00.000Z'),
            totalCommission: 8000,
            platformPaybackAmount: 0,
            paymentMethod: 'BANK_TRANSFER',
            receiptUrl: null,
            invoiceRef: null,
            invoiceUrl: null,
            status: 'VERIFIED',
            periodFrom: new Date('2026-10-01T12:00:00.000Z'),
            periodTo: new Date('2026-10-15T12:00:00.000Z'),
            storeWithdrawalId: null,
            store: { name: 'Branch A' },
          },
        ] as never;
      }
      return [] as never;
    });

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-10-01', to: '2026-10-26' },
    });
    const res = createMockRes();

    await getPaymentHistory(req, res, next);

    expect(overlapCalls).toHaveLength(1);
    expect(overlapCalls[0]).toMatchObject({
      periodFrom: { lte: new Date('2026-10-26T23:59:59.999Z') },
      periodTo: { gte: new Date('2026-10-01T00:00:00.000Z') },
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          payouts: [
            expect.objectContaining({
              id: 'settle-oct',
              periodFrom: '2026-10-01',
              periodTo: '2026-10-15',
            }),
          ],
          totalSettled: 150,
          pendingDues: 0,
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('does not cap all-time totalSettled to the period payout query', async () => {
    vi.mocked(prisma.commissionSettlement.findMany).mockImplementation(async (args) => {
      const where = args?.where as {
        periodFrom?: { lte: Date };
        status?: { not: string };
      };
      if (where?.status?.not === 'REJECTED') {
        return Array.from({ length: 120 }, (_, i) => ({
          totalCommission: 100,
          platformPaybackAmount: 0,
        })) as never;
      }
      if (where?.periodFrom) {
        return [] as never;
      }
      return [] as never;
    });

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { from: '2026-10-01', to: '2026-10-26' },
    });
    const res = createMockRes();

    await getPaymentHistory(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payouts: [],
          totalSettled: 120,
        }),
      }),
    );
  });
});
