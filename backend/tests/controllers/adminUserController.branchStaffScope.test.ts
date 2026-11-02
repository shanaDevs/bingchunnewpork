import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findUnique: vi.fn() },
    adminUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    resolveBranchStoreId: vi.fn(),
  };
});

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed') },
}));

import {
  getUser,
  listBranchManagers,
  listUsers,
  updateBranchManager,
} from '../../src/controllers/adminUserController';
import { prisma } from '../../src/lib/prisma';
import { resolveBranchStoreId } from '../../src/middleware/auth';

describe('SEC-BUG-001 branch staff scope', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0 as never);
  });

  it('listUsers filters by caller branch store', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');
    const req = createMockReq({
      query: {},
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await listUsers(req, res, next);

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-a' }),
      }),
    );
  });

  it('getUser scopes lookup to caller branch store', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);
    const req = createMockReq({
      params: { id: 'user-other' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await getUser(req, res, next);

    expect(prisma.adminUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-other', storeId: 'store-a' },
      }),
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('listBranchManagers filters by caller branch store', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');
    const req = createMockReq({
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await listBranchManagers(req, res, next);

    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { name: 'STORE_MANAGER' },
          storeId: 'store-a',
        }),
      }),
    );
  });

  it('updateBranchManager rejects cross-branch target with 404', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'bm-other',
      storeId: 'store-b',
      role: { name: 'STORE_MANAGER' },
    } as never);
    const req = createMockReq({
      params: { id: 'bm-other' },
      body: { name: 'Updated' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await updateBranchManager(req, res, next);

    expect(prisma.adminUser.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('updateBranchManager rejects reassigning manager to another branch', async () => {
    vi.mocked(resolveBranchStoreId).mockResolvedValue('store-a');
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'bm-1',
      storeId: 'store-a',
      email: 'm@example.com',
      role: { name: 'STORE_MANAGER' },
    } as never);
    const req = createMockReq({
      params: { id: 'bm-1' },
      body: { storeId: 'store-b' },
      user: { sub: 'mgr-1', type: 'admin', role: 'STORE_MANAGER' },
    });
    const res = createMockRes();

    await updateBranchManager(req, res, next);

    expect(prisma.adminUser.update).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });
});
