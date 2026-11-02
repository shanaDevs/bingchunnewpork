import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { ZodError } from 'zod';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ tokenVersion: 0 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
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
import { register } from '../../src/controllers/authController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('register', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user and returns tokens', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-1',
      name: 'Jane Doe',
      phone: '0771234567',
      email: 'jane@example.com',
    } as never);

    const req = createMockReq({
      body: {
        name: 'Jane Doe',
        phone: '0771234567',
        email: 'jane@example.com',
        password: 'password123',
      },
    });
    const res = createMockRes();

    await register(req, res, next);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'Jane Doe',
        phone: '0771234567',
        email: 'jane@example.com',
        passwordHash: 'hashed-password',
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.objectContaining({
          id: 'user-1',
          name: 'Jane Doe',
          phone: '0771234567',
          email: 'jane@example.com',
          isDeleted: false,
        }),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects duplicate phone numbers', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as never);

    const req = createMockReq({
      body: { name: 'Jane Doe', phone: '0771234567' },
    });
    const res = createMockRes();

    await register(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Phone number already registered');
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(409);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects duplicate email addresses', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-email' } as never);

    const req = createMockReq({
      body: { name: 'Jane Doe', phone: '0771234567', email: 'jane@example.com' },
    });
    const res = createMockRes();

    await register(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Email already registered');
  });

  it('forwards validation errors', async () => {
    const req = createMockReq({ body: { name: 'J', phone: 'bad' } });
    const res = createMockRes();

    await register(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('creates a user without a password when none is provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-2',
      name: 'No Password',
      phone: '0779999999',
      email: undefined,
    } as never);

    const req = createMockReq({
      body: { name: 'No Password', phone: '0779999999' },
    });
    const res = createMockRes();

    await register(req, res, next);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: 'No Password',
        phone: '0779999999',
        email: undefined,
        passwordHash: undefined,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('skips the email-uniqueness lookup when email is omitted', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-3',
      name: 'No Email',
      phone: '0778888888',
      email: undefined,
    } as never);

    const req = createMockReq({ body: { name: 'No Email', phone: '0778888888' } });
    const res = createMockRes();

    await register(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '0778888888' } });
    expect(next).not.toHaveBeenCalled();
  });
});
