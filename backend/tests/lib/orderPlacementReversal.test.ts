import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    promoCode: { findUnique: vi.fn(), update: vi.fn() },
    promotionUsage: { deleteMany: vi.fn() },
    spinResult: { updateMany: vi.fn() },
    loyaltyTransaction: { findMany: vi.fn(), deleteMany: vi.fn() },
    user: { update: vi.fn() },
    storeProductReservation: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import { compensateFailedPlaceOrder } from '../../src/lib/orderPlacementReversal';

describe('compensateFailedPlaceOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'order-1',
      paymentStatus: 'PENDING',
      status: 'RECEIVED',
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            paymentStatus: 'PENDING',
            status: 'RECEIVED',
          }),
          update: vi.fn(),
        },
        promoCode: { findUnique: vi.fn().mockResolvedValue(null) },
        promotionUsage: { deleteMany: vi.fn() },
        spinResult: { updateMany: vi.fn() },
        loyaltyTransaction: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        user: { update: vi.fn() },
        storeProductReservation: { deleteMany: vi.fn() },
      };
      return fn(tx as never);
    });
  });

  it('runs reversal, reservation cancel, and order cancel in one transaction', async () => {
    await compensateFailedPlaceOrder('order-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = vi.mocked(prisma.$transaction).mock.calls[0][0];
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          paymentStatus: 'PENDING',
          status: 'RECEIVED',
        }),
        update: vi.fn(),
      },
      promoCode: { findUnique: vi.fn().mockResolvedValue(null) },
      promotionUsage: { deleteMany: vi.fn() },
      spinResult: { updateMany: vi.fn() },
      loyaltyTransaction: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      user: { update: vi.fn() },
      storeProductReservation: { deleteMany: vi.fn() },
    };
    await txArg(tx as never);
    expect(tx.storeProductReservation.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', status: 'ACTIVE' },
    });
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });
});
