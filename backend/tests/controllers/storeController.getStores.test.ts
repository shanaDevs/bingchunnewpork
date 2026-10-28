import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/storeOrderingSchema', () => ({
  fetchOrderingHoursMap: vi.fn(async () => new Map()),
  fetchStoreOrderingHours: vi.fn(),
  updateStoreOrderingHours: vi.fn(),
}));

import { getStores } from '../../src/controllers/storeController';
import { prisma } from '../../src/lib/prisma';
import { fetchOrderingHoursMap } from '../../src/lib/storeOrderingSchema';

const STORES = [
  { id: 'store-home', name: 'Nugegoda', city: 'Colombo', lat: 6.87, lng: 79.89 },
  { id: 'store-other', name: 'Kandy', city: 'Kandy', lat: 7.29, lng: 80.63 },
];

describe('getStores', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.store.findMany).mockResolvedValue(STORES as never);
    vi.mocked(fetchOrderingHoursMap).mockResolvedValue(new Map());
  });

  it('returns all active stores for a delivery driver (no accessibleByAdmins filter)', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' },
    });
    const res = createMockRes();

    await getStores(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'store-home' }),
        expect.objectContaining({ id: 'store-other' }),
      ]),
    });
  });

  it('scopes store managers to their accessible branches', async () => {
    const req = createMockReq({
      query: {},
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await getStores(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        accessibleByAdmins: { some: { id: 'mgr-1' } },
      },
      orderBy: { name: 'asc' },
    });
  });

  it('returns all active stores when unauthenticated', async () => {
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await getStores(req, res, next);

    expect(asMockFn(next)).not.toHaveBeenCalled();
    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });
});
