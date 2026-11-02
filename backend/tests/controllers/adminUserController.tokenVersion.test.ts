import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockNext, createMockReq, createMockRes } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    store: { findUnique: vi.fn() },
    adminUser: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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

vi.mock('../../src/middleware/permission', () => ({
  assertMenuAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed') },
}));

import { updateBranchManager, updateCashier } from '../../src/controllers/adminUserController';
import { prisma } from '../../src/lib/prisma';
import { resolveBranchStoreId } from '../../src/middleware/auth';

const existingManager = {
  id: 'bm-1',
  storeId: 'store-a',
  email: 'm@example.com',
  name: 'Manager',
  role: { name: 'STORE_MANAGER' },
};

const existingCashier = {
  id: 'cash-1',
  storeId: 'store-a',
  email: 'c@example.com',
  name: 'Cashier',
  role: { name: 'CASHIER' },
};

describe('SEC-BUG-002 tokenVersion on staff updates', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBranchStoreId).mockResolvedValue(null);
    vi.mocked(prisma.adminUser.update).mockResolvedValue({} as never);
  });

  describe('updateBranchManager', () => {
    beforeEach(() => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(existingManager as never);
    });

    it('increments tokenVersion on password change', async () => {
      const req = createMockReq({
        params: { id: 'bm-1' },
        body: { password: 'newpassword1' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateBranchManager(req, res, next);

      expect(prisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('increments tokenVersion on deactivation', async () => {
      const req = createMockReq({
        params: { id: 'bm-1' },
        body: { isActive: false },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateBranchManager(req, res, next);

      expect(prisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('does not increment tokenVersion when only name changes', async () => {
      const req = createMockReq({
        params: { id: 'bm-1' },
        body: { name: 'Renamed' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateBranchManager(req, res, next);

      const updateArg = vi.mocked(prisma.adminUser.update).mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('tokenVersion');
    });
  });

  describe('updateCashier', () => {
    beforeEach(() => {
      vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(existingCashier as never);
    });

    it('increments tokenVersion on password change', async () => {
      const req = createMockReq({
        params: { id: 'cash-1' },
        body: { password: 'newpassword1' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateCashier(req, res, next);

      expect(prisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed',
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('increments tokenVersion on deactivation', async () => {
      const req = createMockReq({
        params: { id: 'cash-1' },
        body: { isActive: false },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateCashier(req, res, next);

      expect(prisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            tokenVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('does not increment tokenVersion when only name changes', async () => {
      const req = createMockReq({
        params: { id: 'cash-1' },
        body: { name: 'Renamed' },
        user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      });
      const res = createMockRes();

      await updateCashier(req, res, next);

      const updateArg = vi.mocked(prisma.adminUser.update).mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('tokenVersion');
    });
  });
});
