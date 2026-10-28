import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  actorEventFields,
  claimProcessedBy,
  nestedOrderStatusEvent,
  orderStatusEventData,
  resolveOrderActor,
  stripStaffAttribution,
} from '../../src/lib/orderActor';

describe('orderActor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a branch cashier from the JWT, not the request body', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cashier-b',
      name: 'Cashier B',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);

    const req = createMockReq({
      body: { cashierId: 'someone-else' },
      user: { sub: 'cashier-b', type: 'admin', role: 'CASHIER', storeId: 'store-1' },
    });

    await expect(resolveOrderActor(req)).resolves.toEqual({
      adminId: 'cashier-b',
      name: 'Cashier B',
      role: 'CASHIER',
    });
  });

  it('returns null for system admins, drivers, and customers', async () => {
    await expect(
      resolveOrderActor(createMockReq({
        user: { sub: 'sys-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      })),
    ).resolves.toBeNull();
    await expect(
      resolveOrderActor(createMockReq({
        user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
      })),
    ).resolves.toBeNull();
    await expect(
      resolveOrderActor(createMockReq({
        user: { sub: 'user-1', type: 'user' },
      })),
    ).resolves.toBeNull();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('spreads actor fields onto status events', () => {
    expect(actorEventFields(null)).toEqual({});
    expect(actorEventFields({
      adminId: 'cashier-b',
      name: 'Cashier B',
      role: 'CASHIER',
    })).toEqual({
      actorAdminId: 'cashier-b',
      actorName: 'Cashier B',
      actorRole: 'CASHIER',
    });
    expect(orderStatusEventData('READY', 'Ready for pickup', {
      adminId: 'cashier-b',
      name: 'Cashier B',
      role: 'CASHIER',
    })).toEqual({
      status: 'READY',
      note: 'Ready for pickup',
      actorAdminId: 'cashier-b',
      actorName: 'Cashier B',
      actorRole: 'CASHIER',
    });
    expect(nestedOrderStatusEvent('DELIVERED', null, null)).toEqual({
      create: { status: 'DELIVERED' },
    });
  });

  it('claims processedBy only when it is still unset', async () => {
    const actor = { adminId: 'cashier-b', name: 'Cashier B', role: 'CASHIER' };
    await claimProcessedBy(prisma, 'order-1', actor);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', processedByAdminId: null },
      data: expect.objectContaining({
        processedByAdminId: 'cashier-b',
        processedByName: 'Cashier B',
      }),
    });

    vi.mocked(prisma.order.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    await claimProcessedBy(prisma, 'order-1', {
      adminId: 'cashier-c',
      name: 'Cashier C',
      role: 'CASHIER',
    });
    expect(prisma.order.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', processedByAdminId: null },
        data: expect.objectContaining({ processedByAdminId: 'cashier-c' }),
      }),
    );
  });

  it('does not claim processedBy without an actor', async () => {
    await claimProcessedBy(prisma, 'order-1', null);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('strips staff attribution from customer payloads', () => {
    const stripped = stripStaffAttribution({
      id: 'order-1',
      processedByAdminId: 'cashier-b',
      processedByName: 'Cashier B',
      processedAt: new Date(),
      statusEvents: [
        { id: 'e1', status: 'READY', actorAdminId: 'cashier-b', actorName: 'Cashier B', actorRole: 'CASHIER' },
      ],
    });
    expect(stripped).not.toHaveProperty('processedByAdminId');
    expect(stripped).not.toHaveProperty('processedByName');
    expect(stripped).not.toHaveProperty('processedAt');
    expect(stripped.statusEvents[0]).not.toHaveProperty('actorAdminId');
    expect(stripped.statusEvents[0]).not.toHaveProperty('actorName');
    expect(stripped.statusEvents[0]).toEqual({ id: 'e1', status: 'READY' });
  });
});
