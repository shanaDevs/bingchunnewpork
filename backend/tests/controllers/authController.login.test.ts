import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    adminUser: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ tokenVersion: 0 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../src/lib/userAccount', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/userAccount')>();
  return {
    ...actual,
    findUserByPhone: vi.fn(),
    reactivateUserIfDeleted: vi.fn(),
  };
});

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    signToken: vi.fn(() => 'access-token'),
    signRefreshToken: vi.fn(() => 'refresh-token'),
  };
});

import bcrypt from 'bcryptjs';
import { login } from '../../src/controllers/authController';
import { prisma } from '../../src/lib/prisma';
import { findUserByPhone, reactivateUserIfDeleted } from '../../src/lib/userAccount';
import { AppError } from '../../src/middleware/errorHandler';

describe('login', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects login without a password', async () => {
    const user = {
      id: 'user-1',
      name: 'Demo',
      phone: '0771234567',
      email: null,
      loyaltyPoints: 5,
      deletedAt: null,
      passwordHash: null,
    };
    vi.mocked(findUserByPhone).mockResolvedValue(user as never);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(401);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('logs in by email with password verification', async () => {
    const user = {
      id: 'user-2',
      name: 'Jane',
      phone: '0771111111',
      email: 'jane@example.com',
      loyaltyPoints: 0,
      deletedAt: null,
      passwordHash: 'hash',
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({
      body: { email: 'jane@example.com', password: 'password123' },
    });
    const res = createMockRes();

    await login(req, res, next);

    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hash');
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects active admin emails to admin login', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'STORE_MANAGER' },
    } as never);

    const req = createMockReq({ body: { email: 'branch@example.com', password: 'secret' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toContain('/admin/login');
  });

  it('rejects soft-deleted users who sign in without a password', async () => {
    const deleted = {
      id: 'user-3',
      name: 'Guest',
      phone: '0771234567',
      email: null,
      loyaltyPoints: 0,
      deletedAt: new Date(),
      passwordHash: null,
    };
    vi.mocked(findUserByPhone).mockResolvedValue(deleted as never);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(reactivateUserIfDeleted).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('ACCOUNT_DELETED');
  });

  it('rejects invalid credentials', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(401);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects wrong password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-4',
      passwordHash: 'hash',
      deletedAt: null,
      name: 'Jane',
      phone: '0771234567',
      email: 'jane@example.com',
      loyaltyPoints: 0,
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = createMockReq({
      body: { email: 'jane@example.com', password: 'wrong' },
    });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid credentials');
  });

  it('rejects login with password when the account has no password set', async () => {
    const user = {
      id: 'user-5',
      name: 'Guest',
      phone: '0771234567',
      email: null,
      loyaltyPoints: 0,
      deletedAt: null,
      passwordHash: null,
    };
    vi.mocked(findUserByPhone).mockResolvedValue(user as never);

    const req = createMockReq({ body: { phone: '0771234567', password: 'whatever' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(400);
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Password not set. Use OTP login.');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards validation errors when neither phone nor email is provided', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('logs in by phone with password verification', async () => {
    const user = {
      id: 'user-6',
      name: 'Kamal',
      phone: '0779999999',
      email: null,
      loyaltyPoints: 3,
      deletedAt: null,
      passwordHash: 'hash',
    };
    vi.mocked(findUserByPhone).mockResolvedValue(user as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const req = createMockReq({ body: { phone: '0779999999', password: 'password123' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hash');
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects email login without a password', async () => {
    const user = {
      id: 'user-7',
      name: 'Jane',
      phone: '0771111111',
      email: 'jane@example.com',
      loyaltyPoints: 0,
      deletedAt: null,
      passwordHash: 'hash',
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);

    const req = createMockReq({ body: { email: 'jane@example.com' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(401);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns Invalid credentials (not an admin-login redirect) for an inactive admin email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: false,
      role: { name: 'STORE_MANAGER' },
    } as never);

    const req = createMockReq({ body: { email: 'branch@example.com', password: 'secret' } });
    const res = createMockRes();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Invalid credentials');
    expect(err.message).not.toContain('/admin/login');
  });
});
