import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WALLET_CREDIT_METHODS } from '../../src/lib/orderPayment';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    walletTransaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      groupBy: vi.fn(),
    },
    store: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/walletService', () => ({
  refreshWalletCaches: vi.fn().mockResolvedValue({ balance: 0 }),
}));

import { prisma } from '../../src/lib/prisma';
import { refreshWalletCaches } from '../../src/lib/walletService';
import { syncMissingWalletPayments } from '../../src/lib/walletSync';
import { centsToDecimal } from '../helpers/moneyExpect';

const storeId = 'store-sync-1';

function paidOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'BC-100',
    storeId,
    total: 100,
    subtotal: 100,
    deliveryFee: 0,
    discount: 0,
    loyaltyDiscount: 0,
    paymentMethod: 'CARD',
    paymentRef: null,
    orderMode: 'DELIVERY',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('syncMissingWalletPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([]);
    vi.mocked(prisma.walletTransaction.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.walletTransaction.groupBy).mockResolvedValue([]);
  });

  it('queries LOYALTY_POINTS paid orders for wallet recovery (FIN-005)', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      paidOrder({
        id: 'order-loyalty-1',
        paymentMethod: 'LOYALTY_POINTS',
        total: 120,
        subtotal: 120,
      }),
    ] as never);

    const result = await syncMissingWalletPayments(storeId);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentMethod: { in: [...WALLET_CREDIT_METHODS] },
        }),
      }),
    );
    expect(prisma.walletTransaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['storeId'],
        where: { storeId: { in: [storeId] } },
      }),
    );
    expect(prisma.walletTransaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            orderId: 'order-loyalty-1',
            type: 'ORDER_PAYMENT',
            amount: centsToDecimal(12_000),
            paymentMethod: 'LOYALTY_POINTS',
          }),
        ],
      }),
    );
    expect(result.ordersAdded).toBe(1);
    expect(refreshWalletCaches).toHaveBeenCalledWith(storeId);
  });

  it('uses createMany with skipDuplicates instead of per-order create (FIN-007)', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      paidOrder({
        id: 'order-card-1',
        orderNumber: 'BC-200',
        total: 80,
        subtotal: 80,
        paymentRef: 'WX-1',
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      }),
    ] as never);

    await syncMissingWalletPayments(storeId);

    expect(prisma.walletTransaction.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.walletTransaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('skips orders that already have ORDER_PAYMENT rows', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      paidOrder({
        id: 'order-existing',
        orderNumber: 'BC-300',
        total: 50,
        subtotal: 50,
        paymentMethod: 'PAYHERE',
        paymentRef: 'PH-1',
        createdAt: new Date('2026-01-03T10:00:00.000Z'),
      }),
    ] as never);
    vi.mocked(prisma.walletTransaction.findMany).mockResolvedValue([
      { orderId: 'order-existing' },
    ] as never);

    const result = await syncMissingWalletPayments(storeId);

    expect(prisma.walletTransaction.createMany).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.groupBy).not.toHaveBeenCalled();
    expect(result.ordersAdded).toBe(0);
    expect(result.ordersSkipped).toBe(1);
  });
});
