import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findUnique: vi.fn() },
    adminUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    permission: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
  };
});

vi.mock('../../src/middleware/permission', () => ({
  assertMenuAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

import { createCashier, updateCashier } from '../../src/controllers/adminUserController';
import { prisma } from '../../src/lib/prisma';
import { resolveBranchStoreId } from '../../src/middleware/auth';

describe('cashier uniqueness', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-1');
    vi.mocked(prisma.store.findUnique).mockResolvedValue({ id: 'store-1' } as never);
  });

  it('rejects a duplicate cashier name in the same branch', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({ id: 'existing-cashier' } as never);

    const req = createMockReq({
      body: { name: 'Cashier B', email: 'b@example.com', password: 'password1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await createCashier(req, res, next);

    expect(prisma.adminUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          name: { equals: 'Cashier B', mode: 'insensitive' },
        }),
      }),
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toMatch(/already exists/);
  });

  it('allows the same cashier name at a different branch', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);
    const created = { id: 'new-cashier', name: 'Cashier B' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: {
      adminUser: { create: typeof prisma.adminUser.create };
      permission: { createMany: typeof prisma.permission.createMany };
    }) => unknown) => fn({
      adminUser: { create: vi.fn().mockResolvedValue(created) as never },
      permission: { createMany: vi.fn().mockResolvedValue({ count: 0 }) as never },
    }));

    const req = createMockReq({
      body: { name: 'Cashier B', email: 'b2@example.com', password: 'password1' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await createCashier(req, res, next);

    expect(prisma.adminUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-1' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects renaming a cashier onto another cashier in the same branch', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'cashier-a',
      email: 'a@example.com',
      name: 'Cashier A',
      storeId: 'store-1',
      role: { name: 'CASHIER' },
    } as never);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({ id: 'cashier-b' } as never);

    const req = createMockReq({
      params: { id: 'cashier-a' },
      body: { name: 'Cashier B' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER', storeId: 'store-1' },
    });
    const res = createMockRes();

    await updateCashier(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
  });
});
