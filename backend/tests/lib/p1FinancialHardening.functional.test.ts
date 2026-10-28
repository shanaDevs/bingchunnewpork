/**
 * Functionality-style tests for P1 financial hardening (security gates + atomicity).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import { verifyAdminPin } from '../../src/lib/verifyAdminPin';
import { compensateFailedPlaceOrder, reverseOrderPlacementSideEffects } from '../../src/lib/orderPlacementReversal';

vi.mock('../../src/lib/verifyAdminPin', () => ({
  verifyAdminPin: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
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
import { createDeliveryPayoutHandler, approveDeliveryPayoutHandler } from '../../src/controllers/deliveryWalletController';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/deliveryWalletUnlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/deliveryWalletUnlock')>();
  return {
    ...actual,
    requireSystemAdminFromRequest: vi.fn(async (req: { user?: { sub?: string; role?: string } }) => {
      if (req.user?.role !== 'SYSTEM_ADMIN') throw new AppError('Forbidden', 403);
      return req.user;
    }),
  };
});

vi.mock('../../src/lib/deliveryPayoutService', () => ({
  createDeliveryPayout: vi.fn().mockResolvedValue({ id: 'p1', amount: 100 }),
  approveDeliveryPayout: vi.fn().mockResolvedValue({ id: 'p1', status: 'APPROVED', amount: 100 }),
}));

vi.mock('../../src/lib/settlementProofUpload', () => ({
  optionalSettlementProofUpload: vi.fn().mockResolvedValue(null),
  withUploadedProofCleanup: vi.fn(async (_url: string | null, work: () => Promise<unknown>) => work()),
}));

describe('P1 financial hardening — functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminPin).mockResolvedValue(undefined);
  });

  describe('delivery payout PIN gate', () => {
    const admin = { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' } as const;

    it('blocks legacy create payout without PIN', async () => {
      const next = createMockNext();
      await createDeliveryPayoutHandler(
        createMockReq({ user: admin, body: { periodDays: 15 } }),
        createMockRes(),
        next,
      );
      expect(next).toHaveBeenCalled();
      expect(asMockFn(verifyAdminPin)).not.toHaveBeenCalled();
    });

    it('blocks approve payout without PIN', async () => {
      const next = createMockNext();
      await approveDeliveryPayoutHandler(
        createMockReq({ user: admin, params: { id: 'payout-1' }, body: {} }),
        createMockRes(),
        next,
      );
      expect(next).toHaveBeenCalled();
      expect(asMockFn(verifyAdminPin)).not.toHaveBeenCalled();
    });
  });

  describe('compensateFailedPlaceOrder atomic rollback', () => {
    it('skips paid or already cancelled orders', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue({
        id: 'o1',
        paymentStatus: 'PAID',
        status: 'RECEIVED',
      } as never);

      await compensateFailedPlaceOrder('o1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reverses loyalty side effects inside transaction client', async () => {
      vi.mocked(prisma.order.findUnique)
        .mockResolvedValueOnce({
          id: 'o1',
          paymentStatus: 'PENDING',
          status: 'RECEIVED',
        } as never)
        .mockResolvedValueOnce({ id: 'o1', promoCode: null } as never);

      const tx = {
        order: {
          findUnique: vi.fn().mockResolvedValue({ paymentStatus: 'PENDING', status: 'RECEIVED' }),
          update: vi.fn(),
        },
        promoCode: { findUnique: vi.fn().mockResolvedValue(null) },
        promotionUsage: { deleteMany: vi.fn() },
        spinResult: { updateMany: vi.fn() },
        loyaltyTransaction: {
          findMany: vi.fn().mockResolvedValue([{ userId: 'u1', points: -50 }]),
          deleteMany: vi.fn(),
        },
        user: { update: vi.fn() },
        storeProductReservation: { deleteMany: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(tx as never));

      await compensateFailedPlaceOrder('o1');

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { loyaltyPoints: { increment: 50 } },
      });
      expect(tx.order.update).toHaveBeenCalled();
    });
  });

  describe('reverseOrderPlacementSideEffects', () => {
    it('restores spin claims when order had redeemed spin', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: 'o1', promoCode: null } as never);
      vi.mocked(prisma.loyaltyTransaction.findMany).mockResolvedValue([]);

      await reverseOrderPlacementSideEffects('o1');

      expect(prisma.spinResult.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'o1', status: 'REDEEMED' },
        data: {
          status: 'CLAIMED',
          redeemedAt: null,
          orderId: null,
        },
      });
    });
  });
});
