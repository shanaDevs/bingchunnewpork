import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction } from 'express';
import { config } from '../../src/config';
import { AppError } from '../../src/middleware/errorHandler';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ tokenVersion: 0 }]),
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  SESSION_SUPERSEDED,
  assertDriverSession,
  assertOrderStoreAccess,
  authenticate,
  blockCashier,
  isBranchScopedRole,
  isKnownRole,
  optionalAuth,
  requireAdmin,
  requireBranchAdminOnly,
  requireBranchOrderWrite,
  requireBranchStoreId,
  requireDeliveryDriver,
  requireStoreManager,
  requireSystemAdmin,
  resolveBranchStoreId,
  signAdminRefreshToken,
  signDeliveryToken,
  signRefreshToken,
  signToken,
} from '../../src/middleware/auth';

describe('isBranchScopedRole', () => {
  it('returns true for branch staff roles', () => {
    expect(isBranchScopedRole('STORE_MANAGER')).toBe(true);
    expect(isBranchScopedRole('CASHIER')).toBe(true);
  });

  it('returns false for other roles', () => {
    expect(isBranchScopedRole('SYSTEM_ADMIN')).toBe(false);
    expect(isBranchScopedRole(undefined)).toBe(false);
  });
});

describe('token helpers', () => {
  it('signs user, admin, delivery, and refresh tokens', () => {
    const userToken = signToken('user-1', 'user');
    const adminToken = signToken('admin-1', 'admin', 'STORE_MANAGER', 'store-1');
    const deliveryToken = signDeliveryToken('driver-1', 'store-1');
    const refresh = signRefreshToken('user-1');
    const adminRefresh = signAdminRefreshToken('admin-1');

    expect(jwt.verify(userToken, config.jwtSecret)).toMatchObject({ sub: 'user-1', type: 'user' });
    expect(jwt.verify(adminToken, config.jwtSecret)).toMatchObject({
      sub: 'admin-1',
      type: 'admin',
      role: 'STORE_MANAGER',
      storeId: 'store-1',
    });
    expect(jwt.verify(deliveryToken, config.jwtSecret)).toMatchObject({
      sub: 'driver-1',
      role: 'DELIVERY_DRIVER',
      storeId: 'store-1',
      sv: 0,
    });
    const versioned = signDeliveryToken('driver-1', 'store-1', 4);
    expect(jwt.verify(versioned, config.jwtSecret)).toMatchObject({ sv: 4 });
    expect(jwt.verify(refresh, config.jwtRefreshSecret)).toMatchObject({ sub: 'user-1', type: 'user' });
    expect(jwt.verify(adminRefresh, config.jwtRefreshSecret)).toMatchObject({
      sub: 'admin-1',
      type: 'admin',
      tokenVersion: 0,
    });
    expect(jwt.verify(signAdminRefreshToken('admin-2', 3), config.jwtRefreshSecret)).toMatchObject({
      sub: 'admin-2',
      type: 'admin',
      tokenVersion: 3,
    });
  });
});

describe('authenticate', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches user payload for a valid bearer token', async () => {
    const token = signToken('user-1', 'user');
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });

    await authenticate(req, createMockRes(), next);

    expect(req.user).toMatchObject({ sub: 'user-1', type: 'user' });
    expect(next).toHaveBeenCalled();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when authorization header is missing', async () => {
    await authenticate(createMockReq(), createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.message).toBe('Unauthorised');
    expect(err.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an invalid token', async () => {
    const req = createMockReq({ headers: { authorization: 'Bearer invalid' } });
    await authenticate(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid or expired token');
  });

  it('rejects a non-Bearer authorization scheme', async () => {
    const token = signToken('user-1', 'user');
    const req = createMockReq({ headers: { authorization: `Basic ${token}` } });
    await authenticate(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Unauthorised');
  });

  it('rejects an empty token after the Bearer prefix', async () => {
    const req = createMockReq({ headers: { authorization: 'Bearer ' } });
    await authenticate(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid or expired token');
  });

  it('rejects with the expired-token message for an expired token', async () => {
    const expired = jwt.sign(
      { sub: 'user-1', type: 'user', exp: Math.floor(Date.now() / 1000) - 10 },
      config.jwtSecret,
    );
    const req = createMockReq({ headers: { authorization: `Bearer ${expired}` } });
    await authenticate(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.message).toBe('Invalid or expired token');
    expect(err.code).toBe('TOKEN_EXPIRED');
  });

  it('allows a delivery token whose session version matches', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ sessionVersion: 3 } as never);
    const token = signDeliveryToken('driver-1', 'store-1', 3);
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });

    await authenticate(req, createMockRes(), next);

    expect(req.user).toMatchObject({ sub: 'driver-1', sv: 3 });
    expect(next).toHaveBeenCalledTimes(1);
    expect(asMockFn(next).mock.calls[0][0]).toBeUndefined();
  });

  it('rejects a stale delivery token with SESSION_SUPERSEDED', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ sessionVersion: 2 } as never);
    const token = signDeliveryToken('driver-1', 'store-1', 1);
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });

    await authenticate(req, createMockRes(), next);

    expect(req.user).toBeUndefined();
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe(SESSION_SUPERSEDED);
    expect(err.message).toBe('Signed in on another device');
  });

  it('skips the session lookup for admin tokens', async () => {
    const token = signToken('admin-1', 'admin', 'STORE_MANAGER', 'store-1');
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });

    await authenticate(req, createMockRes(), next);

    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ sub: 'admin-1', role: 'STORE_MANAGER' });
  });
});

describe('assertDriverSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a missing sv claim as version 0', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ sessionVersion: 0 } as never);
    await expect(
      assertDriverSession({ sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER' }),
    ).resolves.toBeUndefined();
  });

  it('rejects when the stored session version has moved on', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ sessionVersion: 5 } as never);
    await expect(
      assertDriverSession({ sub: 'driver-1', type: 'admin', role: 'DELIVERY_DRIVER', sv: 4 }),
    ).rejects.toMatchObject({ code: SESSION_SUPERSEDED, statusCode: 401 });
  });

  it('is a no-op for non-driver payloads', async () => {
    await expect(
      assertDriverSession({ sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' }),
    ).resolves.toBeUndefined();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues without user when no bearer token is present', async () => {
    const req = createMockReq();
    await optionalAuth(req, createMockRes(), next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('ignores invalid tokens', async () => {
    const req = createMockReq({ headers: { authorization: 'Bearer bad-token' } });
    await optionalAuth(req, createMockRes(), next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('attaches req.user for a valid bearer token', async () => {
    const token = signToken('user-1', 'user');
    const req = createMockReq({ headers: { authorization: `Bearer ${token}` } });
    await optionalAuth(req, createMockRes(), next);
    expect(req.user).toMatchObject({ sub: 'user-1', type: 'user' });
    expect(next).toHaveBeenCalled();
  });
});

describe('role guards', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requireAdmin allows active admin users from DB', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    await requireAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('requireAdmin rejects non-admin users', async () => {
    const req = createMockReq({ user: { sub: 'u1', type: 'user' } });
    await requireAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('blockCashier rejects cashier role', () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'CASHIER' } });
    expect(() => blockCashier(req, createMockRes(), next)).toThrow('Forbidden');
  });

  it('blockCashier allows non-cashier roles', () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    blockCashier(req, createMockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('requireAdmin rejects when req.user is missing', async () => {
    const req = createMockReq({ user: undefined });
    await requireAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireAdmin rejects unknown role names', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'CUSTOM_ROLE' } });
    await requireAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireAdmin rejects delivery driver tokens', async () => {
    const req = createMockReq({
      user: { sub: 'd1', type: 'admin', role: 'DELIVERY_DRIVER', storeId: 'store-1' },
    });
    await requireAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireAdmin rejects deactivated admin even with valid JWT role', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: false,
      role: { name: 'STORE_MANAGER' },
    } as never);

    await requireAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireAdmin rejects missing admin row', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);

    await requireAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'CASHIER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireAdmin rejects role drift from DB', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'CASHIER' },
    } as never);

    await requireAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('isKnownRole returns false for unknown roles', () => {
    expect(isKnownRole('CUSTOM_ROLE')).toBe(false);
    expect(isKnownRole('SYSTEM_ADMIN')).toBe(true);
  });

  it('requireSystemAdmin allows only active system admin from DB', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    await requireSystemAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('requireSystemAdmin rejects non-system-admin roles', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    await requireSystemAdmin(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireSystemAdmin rejects deactivated super admin even with valid JWT role', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: false,
      role: { name: 'SYSTEM_ADMIN' },
    } as never);

    await requireSystemAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireSystemAdmin rejects demoted super admin from DB', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'STORE_MANAGER' },
    } as never);

    await requireSystemAdmin(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('requireSystemAdmin rejects delivery admin (cannot approve payouts)', async () => {
    const nextFn = vi.fn();
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'DELIVERY_ADMIN' } });
    await requireSystemAdmin(req, createMockRes(), nextFn);
    expect(nextFn).toHaveBeenCalledWith(expect.any(AppError));
    expect(nextFn.mock.calls[0][0].message).toBe('Forbidden');
  });

  it('requireStoreManager allows store manager and system admin', () => {
    requireStoreManager(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );
    requireStoreManager(
      createMockReq({ user: { sub: 'a2', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('requireStoreManager rejects other admin roles', () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'CASHIER' } });
    expect(() => requireStoreManager(req, createMockRes(), next)).toThrow('Forbidden');
  });

  it('requireBranchAdminOnly allows only store manager', () => {
    requireBranchAdminOnly(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('requireBranchAdminOnly rejects system admin', () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } });
    expect(() => requireBranchAdminOnly(req, createMockRes(), next)).toThrow('Forbidden');
  });

  it('requireDeliveryDriver allows delivery drivers', () => {
    requireDeliveryDriver(
      createMockReq({ user: { sub: 'd1', type: 'admin', role: 'DELIVERY_DRIVER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('requireDeliveryDriver rejects other admin roles', () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    requireDeliveryDriver(req, createMockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe(
      'Delivery driver access only',
    );
  });

  it('requireBranchOrderWrite allows branch staff only', () => {
    requireBranchOrderWrite(
      createMockReq({ user: { sub: 'a1', type: 'admin', role: 'CASHIER' } }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalled();

    expect(() =>
      requireBranchOrderWrite(
        createMockReq({ user: { sub: 'a2', type: 'admin', role: 'SYSTEM_ADMIN' } }),
        createMockRes(),
        next,
      ),
    ).toThrow('Only branch staff can modify orders');
  });
});

describe('resolveBranchStoreId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for non-branch roles', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } });
    await expect(resolveBranchStoreId(req)).resolves.toBeNull();
  });

  it('returns store id from admin record and updates req.user', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(resolveBranchStoreId(req)).resolves.toBe('store-1');
    expect(req.user?.storeId).toBe('store-1');
  });

  it('returns null for an inactive admin', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      isActive: false,
    } as never);

    await expect(resolveBranchStoreId(req)).resolves.toBeNull();
    expect(req.user?.storeId).toBeUndefined();
  });

  it('returns null when the admin record role has drifted away from branch scope', async () => {
    // JWT still says STORE_MANAGER, but the admin record now shows SYSTEM_ADMIN.
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'SYSTEM_ADMIN' },
      isActive: true,
    } as never);

    await expect(resolveBranchStoreId(req)).resolves.toBeNull();
    expect(req.user?.storeId).toBeUndefined();
  });

  it('returns null and skips the lookup when sub is missing', async () => {
    const req = createMockReq({ user: { sub: '', type: 'admin', role: 'STORE_MANAGER' } });

    await expect(resolveBranchStoreId(req)).resolves.toBeNull();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('returns null without updating req.user when storeId is null', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: null,
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(resolveBranchStoreId(req)).resolves.toBeNull();
    expect(req.user?.storeId).toBeUndefined();
  });
});

describe('requireBranchStoreId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when branch store cannot be resolved', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: null,
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(requireBranchStoreId(req)).rejects.toThrow('Branch not linked to your account');
  });

  it('resolves the store id when the branch account is properly linked', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(requireBranchStoreId(req)).resolves.toBe('store-1');
  });
});

describe('assertOrderStoreAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows access when order belongs to the branch', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(assertOrderStoreAccess(req, 'store-1')).resolves.toBeUndefined();
  });

  it('rejects cross-branch order access', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(assertOrderStoreAccess(req, 'store-2')).rejects.toThrow(
      'You can only manage orders for your branch',
    );
  });

  it('is a no-op for non-branch-scoped roles and skips the store lookup', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'SYSTEM_ADMIN' } });

    await expect(assertOrderStoreAccess(req, 'store-1')).resolves.toBeUndefined();
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects access when the resolved store id is null', async () => {
    const req = createMockReq({ user: { sub: 'a1', type: 'admin', role: 'STORE_MANAGER' } });
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: null,
      role: { name: 'STORE_MANAGER' },
      isActive: true,
    } as never);

    await expect(assertOrderStoreAccess(req, 'store-1')).rejects.toThrow('Branch not linked to your account');
  });
});
