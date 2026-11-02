import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction } from 'express';
import { config } from '../../src/config';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ tokenVersion: 0 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    adminUser: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/adminSchema', () => ({
  ensureAdminTokenVersionColumn: vi.fn().mockResolvedValue(undefined),
  ensureAdminRoles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    signToken: vi.fn(() => 'new-access-token'),
    signRefreshToken: vi.fn(() => 'new-refresh-token'),
    signAdminRefreshToken: vi.fn(() => 'new-admin-refresh-token'),
  };
});

import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import {
  adminLogin,
  adminRefreshToken,
  refreshToken,
} from '../../src/controllers/authController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';
import { signToken } from '../../src/middleware/auth';

describe('refreshToken', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a new access token for a valid user refresh token', async () => {
    const token = jwt.sign({ sub: 'user-1', type: 'user' }, config.jwtRefreshSecret);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      deletedAt: null,
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { token: 'new-access-token', refreshToken: 'new-refresh-token' },
    });
  });

  it('rejects admin refresh tokens', async () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin' }, config.jwtRefreshSecret);
    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid token');
  });

  it('rejects deleted users', async () => {
    const token = jwt.sign({ sub: 'user-1', type: 'user' }, config.jwtRefreshSecret);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      deletedAt: new Date(),
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('rejects cookie refresh without refresh cookie or CSRF', async () => {
    const req = createMockReq({ body: {}, method: 'POST' });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects when the referenced user no longer exists', async () => {
    const token = jwt.sign({ sub: 'missing-user', type: 'user' }, config.jwtRefreshSecret);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid token');
  });

  it('signs the new access token using the user id', async () => {
    const token = jwt.sign({ sub: 'user-9', type: 'user' }, config.jwtRefreshSecret);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-9',
      deletedAt: null,
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await refreshToken(req, res, next);

    expect(signToken).toHaveBeenCalledWith('user-9', 'user', undefined, undefined, 0);
  });
});

describe('adminLogin', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.update).mockResolvedValue({} as never);
  });

  it('logs in an active branch admin', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      name: 'Branch Admin',
      email: 'branch@example.com',
      passwordHash: 'hash',
      isActive: true,
      storeId: 'store-1',
      role: { name: 'STORE_MANAGER' },
      store: { id: 'store-1', name: 'Nugegoda', city: 'Colombo', deliveryEnabled: false },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({
      body: { email: 'branch@example.com', password: 'Branch@123' },
    });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(prisma.adminUser.update).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        accessExpiresAt: null,
        admin: {
          id: 'admin-1',
          name: 'Branch Admin',
          email: 'branch@example.com',
          role: 'STORE_MANAGER',
          storeId: 'store-1',
          storeName: 'Nugegoda',
          storeCity: 'Colombo',
          deliveryEnabled: false,
        },
      },
    });
  });

  it('rejects delivery driver accounts', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      passwordHash: 'hash',
      role: { name: 'DELIVERY_DRIVER' },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({
      body: { email: 'driver@example.com', password: 'secret' },
    });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toContain('delivery driver');
  });

  it('rejects branch accounts without a linked store', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-2',
      isActive: true,
      passwordHash: 'hash',
      storeId: null,
      role: { name: 'STORE_MANAGER' },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({
      body: { email: 'branch@example.com', password: 'secret' },
    });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('rejects an unknown admin email', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);

    const req = createMockReq({ body: { email: 'nobody@example.com', password: 'secret' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid credentials');
  });

  it('rejects an inactive admin', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-3',
      isActive: false,
      passwordHash: 'hash',
      role: { name: 'STORE_MANAGER' },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({ body: { email: 'branch@example.com', password: 'secret' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('deactivated');
  });

  it('rejects a wrong password for an active admin', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-4',
      isActive: true,
      passwordHash: 'hash',
      role: { name: 'SYSTEM_ADMIN' },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = createMockReq({ body: { email: 'admin@example.com', password: 'wrong' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid credentials');
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it('logs in a system admin with email and password only', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-5',
      name: 'Super Admin',
      email: 'super@example.com',
      passwordHash: 'hash',
      isActive: true,
      storeId: null,
      tokenVersion: 0,
      role: { name: 'SYSTEM_ADMIN' },
      store: null,
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({ body: { email: 'super@example.com', password: 'Super@123' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(signToken).toHaveBeenCalledWith('admin-5', 'admin', 'SYSTEM_ADMIN', undefined);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          admin: expect.objectContaining({ id: 'admin-5', role: 'SYSTEM_ADMIN' }),
        }),
      }),
    );
  });

  it('logs in a delivery admin with email and password only', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-delivery',
      name: 'Delivery Admin',
      email: 'delivery-admin@example.com',
      passwordHash: 'hash',
      isActive: true,
      storeId: null,
      tokenVersion: 0,
      role: { name: 'DELIVERY_ADMIN' },
      store: null,
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({ body: { email: 'delivery-admin@example.com', password: 'Delivery@123' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(signToken).toHaveBeenCalledWith('admin-delivery', 'admin', 'DELIVERY_ADMIN', undefined);
  });

  it('logs in a cashier with a linked store', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-6',
      name: 'Cashier One',
      email: 'cashier@example.com',
      passwordHash: 'hash',
      isActive: true,
      storeId: 'store-9',
      role: { name: 'CASHIER' },
      store: { id: 'store-9', name: 'Kandy', city: 'Kandy' },
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({ body: { email: 'cashier@example.com', password: 'Cashier@123' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          admin: expect.objectContaining({ id: 'admin-6', role: 'CASHIER', storeId: 'store-9' }),
        }),
      }),
    );
  });

  it('forwards validation errors when the password field is missing', async () => {
    const req = createMockReq({ body: { email: 'admin@example.com' } });
    const res = createMockRes();

    await adminLogin(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
  });

});

describe('adminRefreshToken', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes admin session for a valid admin refresh token', async () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', tokenVersion: 2 }, config.jwtRefreshSecret);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      name: 'Branch Admin',
      email: 'branch@example.com',
      isActive: true,
      storeId: 'store-1',
      tokenVersion: 2,
      role: { name: 'STORE_MANAGER' },
      store: { id: 'store-1', name: 'Nugegoda', city: 'Colombo' },
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        accessExpiresAt: null,
        admin: expect.objectContaining({
          id: 'admin-1',
          role: 'STORE_MANAGER',
        }),
      },
    });
  });

  it('rejects stale refresh tokens after tokenVersion bump', async () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', tokenVersion: 1 }, config.jwtRefreshSecret);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      isActive: true,
      tokenVersion: 2,
      role: { name: 'STORE_MANAGER' },
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid token');
  });

  it('rejects non-admin refresh tokens', async () => {
    const token = jwt.sign({ sub: 'user-1', type: 'user' }, config.jwtRefreshSecret);
    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('rejects refresh for an inactive admin', async () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', tokenVersion: 0 }, config.jwtRefreshSecret);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      isActive: false,
      tokenVersion: 0,
      role: { name: 'STORE_MANAGER' },
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toContain('deactivated');
  });

  it('rejects refresh for delivery driver accounts', async () => {
    const token = jwt.sign({ sub: 'driver-1', type: 'admin', tokenVersion: 0 }, config.jwtRefreshSecret);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'driver-1',
      isActive: true,
      tokenVersion: 0,
      role: { name: 'DELIVERY_DRIVER' },
    } as never);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid token');
  });

  it('requires CSRF when refreshing via cookie without body token', async () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', tokenVersion: 0 }, config.jwtRefreshSecret);
    const req = createMockReq({
      method: 'POST',
      body: {},
      cookies: { bc_admin_rt: token },
      get: (name: string) => (name.toLowerCase() === 'x-csrf-token' ? undefined : undefined),
    });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid CSRF token');
  });

  it('rejects refresh when the admin no longer exists', async () => {
    const token = jwt.sign({ sub: 'missing-admin', type: 'admin' }, config.jwtRefreshSecret);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);

    const req = createMockReq({ body: { refreshToken: token } });
    const res = createMockRes();

    await adminRefreshToken(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid token');
  });
});
