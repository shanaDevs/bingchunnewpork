import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/schemaPatch', () => ({
  addColumnIfMissing: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  assignTakeawayQueueSlot,
  getTakeawayQueue,
  reorderTakeawayQueue,
  TAKEAWAY_SLOT_MINUTES,
} from '../../src/lib/takeawayQueue';

describe('assignTakeawayQueueSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns position 1 when the queue is empty', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    // Token number is today's takeaway count + 1 (not max active queuePosition).
    vi.mocked(prisma.order.count).mockResolvedValue(0);
    vi.mocked(prisma.order.update).mockResolvedValue({ id: 'order-1' } as never);

    const result = await assignTakeawayQueueSlot('store-1', 'order-1');

    expect(result.queuePosition).toBe(1);
    expect(result.scheduledPickupAt).toEqual(new Date('2026-07-22T10:15:00.000Z'));
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          orderMode: 'TAKEAWAY',
          id: { not: 'order-1' },
          createdAt: expect.any(Object),
        }),
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        queuePosition: 1,
        scheduledPickupAt: result.scheduledPickupAt,
      },
    });
  });

  it('increments queue position after the highest active slot', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { queuePosition: 2, scheduledPickupAt: new Date('2026-07-22T10:30:00.000Z') },
      { queuePosition: 1, scheduledPickupAt: new Date('2026-07-22T10:15:00.000Z') },
    ] as never);
    // Position comes from today's order count, not max(queuePosition).
    vi.mocked(prisma.order.count).mockResolvedValue(2);
    vi.mocked(prisma.order.update).mockResolvedValue({ id: 'order-2' } as never);

    const result = await assignTakeawayQueueSlot('store-1', 'order-2');

    expect(result.queuePosition).toBe(3);
    // Pickup time still advances from the latest active scheduledPickupAt + slot.
    expect(result.scheduledPickupAt).toEqual(new Date('2026-07-22T10:45:00.000Z'));
  });

  it('queries only active takeaway orders for the same store', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
    vi.mocked(prisma.order.update).mockResolvedValue({ id: 'order-1' } as never);

    await assignTakeawayQueueSlot('store-1', 'order-1');

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: 'store-1',
          orderMode: 'TAKEAWAY',
          status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
          id: { not: 'order-1' },
        },
      }),
    );
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          orderMode: 'TAKEAWAY',
          id: { not: 'order-1' },
        }),
      }),
    );
  });

  it('propagates prisma findMany failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('DB read failed'));

    await expect(assignTakeawayQueueSlot('store-1', 'order-1')).rejects.toThrow('DB read failed');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('propagates prisma update failures', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);
    vi.mocked(prisma.order.count).mockResolvedValue(0);
    vi.mocked(prisma.order.update).mockRejectedValue(new Error('DB write failed'));

    await expect(assignTakeawayQueueSlot('store-1', 'order-1')).rejects.toThrow('DB write failed');
  });
});

describe('reorderTakeawayQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately for an empty order list', async () => {
    await reorderTakeawayQueue('store-1', []);

    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates queue positions and pickup times in a transaction', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([]);

    await reorderTakeawayQueue('store-1', ['order-2', 'order-1']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const updates = vi.mocked(prisma.$transaction).mock.calls[0][0];
    expect(updates).toHaveLength(2);
  });

  it('throws when some orders are not active takeaway orders for the store', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([{ id: 'order-1' }] as never);

    await expect(reorderTakeawayQueue('store-1', ['order-1', 'order-2'])).rejects.toThrow(
      'Some orders are not active takeaway orders for this store',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates prisma transaction failures', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' },
    ] as never);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Transaction failed'));

    await expect(reorderTakeawayQueue('store-1', ['order-1', 'order-2'])).rejects.toThrow(
      'Transaction failed',
    );
  });
});

describe('getTakeawayQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active takeaway orders for a specific store', async () => {
    const queue = [{ id: 'order-1', queuePosition: 1 }];
    vi.mocked(prisma.order.findMany).mockResolvedValue(queue as never);

    await expect(getTakeawayQueue('store-1')).resolves.toEqual(queue);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderMode: 'TAKEAWAY',
          status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
          storeId: 'store-1',
        },
      }),
    );
  });

  it('returns all-store queue when storeId is omitted', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([]);

    await getTakeawayQueue();

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderMode: 'TAKEAWAY',
          status: { in: ['RECEIVED', 'PREPARING', 'READY'] },
        },
      }),
    );
  });

  it('propagates prisma failures', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('Queue query failed'));

    await expect(getTakeawayQueue('store-1')).rejects.toThrow('Queue query failed');
  });
});

describe('TAKEAWAY_SLOT_MINUTES', () => {
  it('is 15 minutes', () => {
    expect(TAKEAWAY_SLOT_MINUTES).toBe(15);
  });
});
