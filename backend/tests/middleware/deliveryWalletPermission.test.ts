import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    permission: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { requirePermission } from '../../src/middleware/permission';

function thrownError(next: ReturnType<typeof createMockNext>) {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

describe('DELIVERY_WALLET menu permission', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    next.mockReset();
  });

  it('returns 403 when a store manager has no delivery-wallet menu', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'mgr-1',
      isActive: true,
      role: { name: 'STORE_MANAGER' },
    } as never);
    vi.mocked(prisma.permission.findUnique).mockResolvedValue(null);

    await requirePermission('DELIVERY_WALLET', 'read')(
      createMockReq({ user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );

    expect(thrownError(next).statusCode).toBe(403);
  });
});

describe('WALLET menu permission', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    next.mockReset();
  });

  it('returns 403 when a cashier has no WALLET menu (default RBAC)', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cash-1',
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.permission.findUnique).mockResolvedValue(null);

    await requirePermission('WALLET', 'read')(
      createMockReq({ user: { sub: 'cash-1', type: 'admin', role: 'CASHIER' } }),
      createMockRes(),
      next,
    );

    expect(thrownError(next).statusCode).toBe(403);
    expect(thrownError(next).message).toContain('WALLET');
  });

  it('allows WALLET read for branch managers with read-only wallet access', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'mgr-1',
      isActive: true,
      role: { name: 'STORE_MANAGER' },
    } as never);
    vi.mocked(prisma.permission.findUnique).mockResolvedValue({
      adminUserId: 'mgr-1',
      menu: 'WALLET',
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    } as never);

    await requirePermission('WALLET', 'read')(
      createMockReq({ user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(asMockFn(next).mock.calls[0]).toEqual([]);
  });

  it('denies WALLET update for branch managers with read-only wallet access', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'mgr-1',
      isActive: true,
      role: { name: 'STORE_MANAGER' },
    } as never);
    vi.mocked(prisma.permission.findUnique).mockResolvedValue({
      adminUserId: 'mgr-1',
      menu: 'WALLET',
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    } as never);

    await requirePermission('WALLET', 'update')(
      createMockReq({ user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );

    expect(thrownError(next).statusCode).toBe(403);
    expect(thrownError(next).message).toBe('Permission denied: Cannot update WALLET');
  });
});
