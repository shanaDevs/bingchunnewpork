import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockNext, createMockReq, createMockRes } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    refund: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    adminUser: {
      findUnique: vi.fn(),
    },
    order: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth', () => ({
  assertOrderStoreAccess: vi.fn().mockResolvedValue(undefined),
  isBranchScopedRole: vi.fn().mockReturnValue(false),
  requireBranchStoreId: vi.fn(),
}));

vi.mock('../../src/lib/cancelReasonConfig', () => ({
  getAllCancelReasons: vi.fn().mockResolvedValue([
    { value: 'CHANGED_MIND', label: 'Changed my mind' },
    { value: 'TAKING_TOO_LONG', label: 'Taking too long' },
  ]),
}));

vi.mock('../../src/lib/orderStatusRefundConfig', () => ({
  getRefundPercentageForStatus: vi.fn().mockResolvedValue(80),
  getOrderStatusRefundPercentageMap: vi.fn().mockResolvedValue(
    new Map([
      ['RECEIVED', 100],
      ['PREPARING', 80],
      ['READY', 60],
      ['OUT_FOR_DELIVERY', 40],
    ]),
  ),
}));

import { updateRefundStatus, getRefund, getRefundAnalytics, getRefundsSummary } from '../../src/controllers/refundController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';
import { getRefundPercentageForStatus } from '../../src/lib/orderStatusRefundConfig';
import { isBranchScopedRole, requireBranchStoreId } from '../../src/middleware/auth';

const partialRefund = {
  id: 'refund-1',
  orderId: 'order-1',
  submittedBy: 'CUSTOMER',
  cancelledWithinWindow: false,
  salesTotal: 1000,
  deliveryFee: 100,
  convenienceFee: 50,
  orderTotal: 1150,
  refundPercentage: 80,
  refundAmount: 800,
  cancelledAtStatus: 'PREPARING',
  configuredStatusRefundPercentage: 80,
  cancellationReason: 'CHANGED_MIND',
  status: 'RECEIVED',
  adminNotes: null,
  paymentNote: null,
  order: {
    id: 'order-1',
    storeId: 'store-1',
    paymentStatus: 'PAID',
    paymentMethod: 'PAYHERE',
    orderMode: 'DELIVERY',
    total: 1150,
    statusEvents: [{ status: 'PREPARING', createdAt: new Date() }, { status: 'CANCELLED', createdAt: new Date() }],
  },
};

describe('updateRefundStatus', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ id: 'admin-1', name: 'Admin' } as never);
  });

  it('completes partial refund using live status percentage', async () => {
    const orderUpdate = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(partialRefund as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback({
      refund: {
        update: vi.fn().mockResolvedValue({ ...partialRefund, status: 'COMPLETE' }),
      },
      order: {
        update: orderUpdate,
      },
    }));

    const req = createMockReq({
      params: { id: 'refund-1' },
      body: { status: 'COMPLETE' },
      user: { sub: 'admin-1', type: 'admin', role: 'BRANCH_ADMIN' },
    });
    const res = createMockRes();

    await updateRefundStatus(req, res, next);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'REFUNDED' },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it('rejects attempts to override live partial refund percentage', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(partialRefund as never);

    const req = createMockReq({
      params: { id: 'refund-1' },
      body: { status: 'COMPLETE', refundPercentage: 50 },
      user: { sub: 'admin-1', type: 'admin', role: 'BRANCH_ADMIN' },
    });
    const res = createMockRes();

    await updateRefundStatus(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe(
      'Refund percentage is fixed by order status and cannot be changed',
    );
  });

  it('persists full non-returning amounts on reject without refunding payment', async () => {
    const orderUpdate = vi.fn();
    const refundUpdate = vi.fn().mockResolvedValue({ ...partialRefund, status: 'REJECTED' });
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(partialRefund as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback({
      refund: { update: refundUpdate },
      order: { update: orderUpdate },
    }));

    const req = createMockReq({
      params: { id: 'refund-1' },
      body: { status: 'REJECTED', adminNotes: 'Customer already received the order' },
      user: { sub: 'admin-1', type: 'admin', role: 'BRANCH_ADMIN' },
    });
    const res = createMockRes();

    await updateRefundStatus(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(refundUpdate).toHaveBeenCalledWith({
      where: { id: 'refund-1' },
      data: expect.objectContaining({
        status: 'REJECTED',
        adminNotes: 'Customer already received the order',
        processedByAdminId: 'admin-1',
        salesTotal: 1000,
        returningSubtotal: 0,
        notReturningSubtotal: 1000,
        returningDeliveryFee: 0,
        returningConvenienceFee: 0,
        nonRefundableDeliveryFee: 100,
        nonRefundableConvenienceFee: 50,
        additionalGatewayFee: 0,
      }),
      include: expect.anything(),
    });
    expect(refundUpdate.mock.calls[0][0].data.refundAmount).toBeUndefined();
    expect(refundUpdate.mock.calls[0][0].data.refundPercentage).toBeUndefined();
  });

  it('requires a rejection reason', async () => {
    vi.mocked(prisma.refund.findUnique).mockResolvedValue(partialRefund as never);

    const req = createMockReq({
      params: { id: 'refund-1' },
      body: { status: 'REJECTED', adminNotes: '   ' },
      user: { sub: 'admin-1', type: 'admin', role: 'BRANCH_ADMIN' },
    });
    const res = createMockRes();

    await updateRefundStatus(req, res, next);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe(
      'A rejection reason is required',
    );
  });
});

describe('getRefundsSummary', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
  });

  it('adds rejected retained amounts to branch/delivery/platform but not customer', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        status: 'COMPLETE',
        refundAmount: 800,
        notReturningSubtotal: 200,
        nonRefundableDeliveryFee: 100,
        nonRefundableConvenienceFee: 50,
        additionalGatewayFee: 0,
      },
      {
        status: 'REJECTED',
        refundAmount: 800,
        notReturningSubtotal: 1000,
        nonRefundableDeliveryFee: 100,
        nonRefundableConvenienceFee: 50,
        additionalGatewayFee: 0,
      },
    ] as never);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await getRefundsSummary(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['COMPLETE', 'REJECTED'] },
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          customerReceiveTotalLkr: 800,
          branchReceiveTotalLkr: 1200,
          deliveryReceiveTotalLkr: 200,
          platformReceiveTotalLkr: 100,
        }),
      }),
    );
  });

  it('excludes the additional gateway fee from platform receive', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        status: 'COMPLETE',
        refundAmount: 1000,
        notReturningSubtotal: 0,
        nonRefundableDeliveryFee: 0,
        nonRefundableConvenienceFee: 50,
        additionalGatewayFee: 150,
      },
    ] as never);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await getRefundsSummary(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          customerReceiveTotalLkr: 1000,
          platformReceiveTotalLkr: 50,
        }),
      }),
    );
  });
});

describe('getRefund', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enriches legacy partial refund with computed percentage and amount', async () => {
    const legacyPartial = {
      id: 'refund-legacy',
      status: 'RECEIVED',
      submittedBy: 'CUSTOMER',
      cancelledWithinWindow: false,
      salesTotal: 1498,
      deliveryFee: 0,
      convenienceFee: 0,
      orderTotal: 1498,
      refundPercentage: null,
      refundAmount: null,
      cancelledAtStatus: null,
      configuredStatusRefundPercentage: null,
      order: {
        storeId: 'store-1',
        statusEvents: [
          { status: 'RECEIVED', createdAt: new Date('2026-08-19T10:49:00Z') },
          { status: 'PREPARING', createdAt: new Date('2026-08-19T10:55:00Z') },
          { status: 'READY', createdAt: new Date('2026-08-19T10:55:00Z') },
          { status: 'CANCELLED', createdAt: new Date('2026-08-19T10:56:00Z') },
        ],
        items: [],
      },
    };

    vi.mocked(prisma.refund.findUnique).mockResolvedValue(legacyPartial as never);
    vi.mocked(prisma.refund.update).mockResolvedValue(legacyPartial as never);
    vi.mocked(getRefundPercentageForStatus).mockResolvedValue(60);

    const req = createMockReq({ params: { id: 'refund-legacy' } });
    const res = createMockRes();

    await getRefund(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          refundPercentage: 60,
          refundAmount: 899,
          cancelledAtStatus: 'READY',
        }),
      }),
    );
    expect(prisma.refund.update).toHaveBeenCalled();
  });
});

describe('getRefundAnalytics', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
  });

  it('returns empty analytics when no refunds match', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);

    const req = createMockReq({ query: { startDate: '2026-08-01', endDate: '2026-08-31' } });
    const res = createMockRes();

    await getRefundAnalytics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          summary: expect.objectContaining({
            totalCount: 0,
            totalRefundAmountLkr: 0,
            completeRatePercent: 0,
            rejectionRatePercent: 0,
          }),
          byCancelAtStatus: [],
          byReason: [],
          byRequestType: [],
          topProducts: [],
          dailyTrend: [],
        }),
      }),
    );
  });

  it('aggregates percentages, request types, products, and daily trend', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      {
        id: 'refund-1',
        status: 'COMPLETE',
        cancellationReason: 'CHANGED_MIND',
        cancelledAtStatus: 'PREPARING',
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: true,
        refundAmount: 1000,
        refundPercentage: 100,
        createdAt: new Date('2026-08-10T10:00:00Z'),
        processedAt: new Date('2026-08-10T14:00:00Z'),
        order: {
          orderMode: 'DELIVERY',
          items: [
            { productId: 'prod-1', productName: 'Milk Tea', product: { name: 'Milk Tea', imageUrl: null } },
          ],
        },
      },
      {
        id: 'refund-2',
        status: 'REJECTED',
        cancellationReason: 'TAKING_TOO_LONG',
        cancelledAtStatus: 'READY',
        submittedBy: 'BRANCH_ADMIN',
        cancelledWithinWindow: false,
        refundAmount: 500,
        refundPercentage: 60,
        createdAt: new Date('2026-08-10T15:00:00Z'),
        processedAt: new Date('2026-08-10T16:00:00Z'),
        order: {
          orderMode: 'TAKEAWAY',
          items: [
            { productId: 'prod-1', productName: 'Milk Tea', product: { name: 'Milk Tea', imageUrl: null } },
            { productId: 'prod-2', productName: 'Coffee', product: { name: 'Coffee', imageUrl: null } },
          ],
        },
      },
    ] as never);

    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await getRefundAnalytics(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          summary: expect.objectContaining({
            totalCount: 2,
            totalRefundAmountLkr: 1500,
            avgRefundAmountLkr: 750,
            completeCount: 1,
            rejectedCount: 1,
            completeRatePercent: 50,
            rejectionRatePercent: 50,
          }),
          byCancelAtStatus: expect.arrayContaining([
            expect.objectContaining({ status: 'PREPARING', count: 1, percent: 50 }),
            expect.objectContaining({ status: 'READY', count: 1, percent: 50 }),
          ]),
          byReason: expect.arrayContaining([
            expect.objectContaining({ reason: 'CHANGED_MIND', count: 1, percent: 50 }),
            expect.objectContaining({ reason: 'TAKING_TOO_LONG', count: 1, percent: 50 }),
          ]),
          byRequestType: expect.arrayContaining([
            expect.objectContaining({ type: 'within_window', count: 1, percent: 50 }),
            expect.objectContaining({ type: 'cashier', count: 1, percent: 50 }),
          ]),
          topProducts: expect.arrayContaining([
            expect.objectContaining({ productId: 'prod-1', refundCount: 2, percent: 100 }),
          ]),
          dailyTrend: expect.arrayContaining([
            expect.objectContaining({ count: 2, amountLkr: 1500 }),
          ]),
          byOrderMode: expect.arrayContaining([
            expect.objectContaining({ mode: 'DELIVERY', count: 1, percent: 50 }),
            expect.objectContaining({ mode: 'TAKEAWAY', count: 1, percent: 50 }),
          ]),
          avgProcessingHours: 2.5,
        }),
      }),
    );
  });

  it('scopes branch admins to their store', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-branch-1');
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as never);

    const req = createMockReq({
      query: { storeId: 'store-other' },
      user: { sub: 'admin-1', type: 'admin', role: 'BRANCH_ADMIN' },
    });
    const res = createMockRes();

    await getRefundAnalytics(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalled();
    expect(prisma.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({
            is: expect.objectContaining({ storeId: 'store-branch-1' }),
          }),
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});
