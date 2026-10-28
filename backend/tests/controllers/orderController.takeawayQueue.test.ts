import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

const emit = vi.fn();
const to = vi.fn(() => ({ emit }));

vi.mock('../../src/lib/socket', () => ({
  getIo: vi.fn(() => ({ to })),
}));

vi.mock('../../src/lib/takeawayQueue', () => ({
  getTakeawayQueue: vi.fn(),
  reorderTakeawayQueue: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    isBranchScopedRole: vi.fn(),
    requireBranchStoreId: vi.fn(),
    assertOrderStoreAccess: vi.fn(),
  };
});

import {
  listTakeawayQueue,
  reorderTakeawayQueueHandler,
} from '../../src/controllers/orderController';
import { prisma } from '../../src/lib/prisma';
import { getIo } from '../../src/lib/socket';
import { getTakeawayQueue, reorderTakeawayQueue } from '../../src/lib/takeawayQueue';
import {
  assertOrderStoreAccess,
  isBranchScopedRole,
  requireBranchStoreId,
} from '../../src/middleware/auth';
import { AppError } from '../../src/middleware/errorHandler';

describe('listTakeawayQueue', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
  });

  it('returns the takeaway queue for a branch admin scoped to their store', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-1');
    const queue = [
      {
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        queuePosition: 1,
        scheduledPickupAt: new Date('2026-07-22T10:15:00.000Z'),
      },
    ];
    vi.mocked(getTakeawayQueue).mockResolvedValue(queue as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
      query: { storeId: 'store-other' },
    });
    const res = createMockRes();

    await listTakeawayQueue(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalledWith(req);
    expect(getTakeawayQueue).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queue });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns an empty queue when there are no active takeaway orders', async () => {
    vi.mocked(getTakeawayQueue).mockResolvedValue([]);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: { storeId: 'store-1' },
    });
    const res = createMockRes();

    await listTakeawayQueue(req, res, next);

    expect(getTakeawayQueue).toHaveBeenCalledWith('store-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('forwards prisma failures from getTakeawayQueue', async () => {
    vi.mocked(getTakeawayQueue).mockRejectedValue(new Error('Queue query failed'));

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
    });
    const res = createMockRes();

    await listTakeawayQueue(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('lists the combined queue across every store for a system admin with no storeId filter', async () => {
    const queue = [
      { id: 'order-1', orderNumber: 'BC260722-1001', storeId: 'store-1' },
      { id: 'order-2', orderNumber: 'BC260722-1002', storeId: 'store-2' },
    ];
    vi.mocked(getTakeawayQueue).mockResolvedValue(queue as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      query: {},
    });
    const res = createMockRes();

    await listTakeawayQueue(req, res, next);

    expect(requireBranchStoreId).not.toHaveBeenCalled();
    expect(getTakeawayQueue).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queue });
  });
});

describe('reorderTakeawayQueueHandler', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBranchScopedRole).mockReturnValue(false);
    vi.mocked(assertOrderStoreAccess).mockResolvedValue(undefined);
    vi.mocked(getIo).mockImplementation(() => ({ to }) as never);
    emit.mockClear();
    to.mockClear();
  });

  it('reorders the queue, emits socket updates, and returns the updated queue', async () => {
    const queue = [
      {
        id: 'order-2',
        orderNumber: 'BC260722-1002',
        queuePosition: 1,
        scheduledPickupAt: new Date('2026-07-22T10:15:00.000Z'),
      },
      {
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        queuePosition: 2,
        scheduledPickupAt: new Date('2026-07-22T10:30:00.000Z'),
      },
    ];
    vi.mocked(reorderTakeawayQueue).mockResolvedValue(undefined);
    vi.mocked(getTakeawayQueue).mockResolvedValue(queue as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-2', 'order-1'], storeId: 'store-1' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(assertOrderStoreAccess).toHaveBeenCalledWith(req, 'store-1');
    expect(reorderTakeawayQueue).toHaveBeenCalledWith('store-1', ['order-2', 'order-1']);
    expect(to).toHaveBeenCalledWith('order:order-2');
    expect(to).toHaveBeenCalledWith('order:BC260722-1002');
    expect(to).toHaveBeenCalledWith('store:store-1');
    expect(emit).toHaveBeenCalledWith('takeawayQueueUpdated', { storeId: 'store-1' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queue });
  });

  it('forces branch admins to reorder only their own store queue', async () => {
    vi.mocked(isBranchScopedRole).mockReturnValue(true);
    vi.mocked(requireBranchStoreId).mockResolvedValue('store-branch');
    vi.mocked(reorderTakeawayQueue).mockResolvedValue(undefined);
    vi.mocked(getTakeawayQueue).mockResolvedValue([]);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' },
      body: { orderIds: ['order-1'], storeId: 'store-other' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(requireBranchStoreId).toHaveBeenCalledWith(req);
    expect(reorderTakeawayQueue).toHaveBeenCalledWith('store-branch', ['order-1']);
  });

  it('rejects an empty orderIds payload', async () => {
    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: [] },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(reorderTakeawayQueue).not.toHaveBeenCalled();
  });

  it('requires storeId when it cannot be inferred', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-1'] },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('storeId is required');
    expect(reorderTakeawayQueue).not.toHaveBeenCalled();
  });

  it('blocks cross-branch queue reordering', async () => {
    vi.mocked(assertOrderStoreAccess).mockRejectedValue(
      new AppError('You can only manage orders for your branch', 403),
    );

    const req = createMockReq({
      user: { sub: 'admin-2', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-2' },
      body: { orderIds: ['order-1'], storeId: 'store-1' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
    expect(reorderTakeawayQueue).not.toHaveBeenCalled();
  });

  it('propagates reorderTakeawayQueue failures', async () => {
    vi.mocked(reorderTakeawayQueue).mockRejectedValue(
      new Error('Some orders are not active takeaway orders for this store'),
    );

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-1'], storeId: 'store-1' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('infers storeId from the first order when the caller omits it', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ storeId: 'store-inferred' } as never);
    vi.mocked(reorderTakeawayQueue).mockResolvedValue(undefined);
    vi.mocked(getTakeawayQueue).mockResolvedValue([]);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-1', 'order-2'] },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: { storeId: true },
    });
    expect(assertOrderStoreAccess).toHaveBeenCalledWith(req, 'store-inferred');
    expect(reorderTakeawayQueue).toHaveBeenCalledWith('store-inferred', ['order-1', 'order-2']);
    expect(next).not.toHaveBeenCalled();
  });

  it('swallows socket emit failures and still returns the reordered queue', async () => {
    vi.mocked(getIo).mockImplementation(() => {
      throw new Error('socket server not initialised');
    });
    vi.mocked(reorderTakeawayQueue).mockResolvedValue(undefined);
    const queue = [
      {
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        queuePosition: 1,
        scheduledPickupAt: new Date('2026-07-22T10:15:00.000Z'),
      },
    ];
    vi.mocked(getTakeawayQueue).mockResolvedValue(queue as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-1'], storeId: 'store-1' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: queue });
  });

  it('emits queueUpdate with the exact expected payload fields for each order', async () => {
    vi.mocked(reorderTakeawayQueue).mockResolvedValue(undefined);
    const queue = [
      {
        id: 'order-1',
        orderNumber: 'BC260722-1001',
        queuePosition: 1,
        scheduledPickupAt: new Date('2026-07-22T10:15:00.000Z'),
      },
    ];
    vi.mocked(getTakeawayQueue).mockResolvedValue(queue as never);

    const req = createMockReq({
      user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      body: { orderIds: ['order-1'], storeId: 'store-1' },
    });
    const res = createMockRes();

    await reorderTakeawayQueueHandler(req, res, next);

    expect(emit).toHaveBeenCalledWith('queueUpdate', {
      orderId: 'order-1',
      orderNumber: 'BC260722-1001',
      queuePosition: 1,
      scheduledPickupAt: '2026-07-22T10:15:00.000Z',
    });
  });
});
