import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { deleteAccount, getMe, updateMe } from '../../src/controllers/authController';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('getMe', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authenticated user profile', async () => {
    const profile = {
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: 'jane@example.com',
      loyaltyPoints: 10,
      notifyEmail: true,
      notifySms: false,
      notifyPush: true,
      createdAt: new Date('2026-01-01'),
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(profile as never);

    const req = createMockReq({ user: { sub: 'user-1', type: 'user' } });
    const res = createMockRes();

    await getMe(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        loyaltyPoints: true,
        notifyEmail: true,
        notifySms: true,
        notifyPush: true,
        isPhoneVerified: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: 'user-1',
        name: 'Jane',
        phone: '0771234567',
        email: 'jane@example.com',
        loyaltyPoints: 10,
        isDeleted: false,
      }),
    });
  });

  it('returns 404 when user is missing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const req = createMockReq({ user: { sub: 'missing', type: 'user' } });
    const res = createMockRes();

    await getMe(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });

  it('forwards the error when the database lookup fails', async () => {
    const dbError = new Error('db unavailable');
    vi.mocked(prisma.user.findUnique).mockRejectedValue(dbError);

    const req = createMockReq({ user: { sub: 'user-1', type: 'user' } });
    const res = createMockRes();

    await getMe(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('updateMe', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates profile fields for the authenticated user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deletedAt: null } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-1',
      name: 'Jane Updated',
      phone: '0771234567',
      email: 'jane@example.com',
    } as never);

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      body: { name: 'Jane Updated', notifyPush: false },
    });
    const res = createMockRes();

    await updateMe(req, res, next);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Jane Updated', notifyPush: false },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: 'user-1',
        name: 'Jane Updated',
        phone: '0771234567',
        email: 'jane@example.com',
        isDeleted: false,
      }),
    });
  });

  it('updates notifyEmail alongside the email field', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deletedAt: null } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: 'jane-new@example.com',
    } as never);

    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      body: { email: 'jane-new@example.com', notifyEmail: true },
    });
    const res = createMockRes();

    await updateMe(req, res, next);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email: 'jane-new@example.com', notifyEmail: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards validation errors for an invalid email', async () => {
    const req = createMockReq({
      user: { sub: 'user-1', type: 'user' },
      body: { email: 'not-an-email' },
    });
    const res = createMockRes();

    await updateMe(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('deleteAccount', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes the authenticated account', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-1' } as never);

    const req = createMockReq({ user: { sub: 'user-1', type: 'user' } });
    const res = createMockRes();

    await deleteAccount(req, res, next);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        deletedAt: expect.any(Date),
      },
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        message: 'Account deleted successfully',
      }),
    });
  });

  it('forwards the error when the database update fails', async () => {
    const dbError = new Error('db unavailable');
    vi.mocked(prisma.user.update).mockRejectedValue(dbError);

    const req = createMockReq({ user: { sub: 'user-1', type: 'user' } });
    const res = createMockRes();

    await deleteAccount(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});
