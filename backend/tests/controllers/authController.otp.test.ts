import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction } from 'express';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      updateMany: vi.fn(),
    },
    otpRecord: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
    archiveDeletedUserPhone: vi.fn(),
    createFreshUserForPhone: vi.fn(),
  };
});

vi.mock('../../src/integrations/smsAdapter', () => ({
  sendOtp: vi.fn(),
}));

vi.mock('../../src/lib/referral', () => ({
  applyReferralCodeToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    signToken: vi.fn(() => 'access-token'),
    signRefreshToken: vi.fn(() => 'refresh-token'),
  };
});

import { phoneLogin, requestOtp, verifyOtp } from '../../src/controllers/authController';
import {
  expectedBearerOtpAuthJson,
  stubSuccessfulCustomerOtpVerify,
} from '../helpers/customerOtpVerifyFixtures';
import { clearOtpAttemptsMemoryForTests } from '../../src/lib/otpAttempts';
import { hashLoginOtp } from '../../src/lib/otpHash';
import { sendOtp } from '../../src/integrations/smsAdapter';
import { findUserByPhone, reactivateUserIfDeleted, archiveDeletedUserPhone, createFreshUserForPhone } from '../../src/lib/userAccount';
import { prisma } from '../../src/lib/prisma';
import { AppError } from '../../src/middleware/errorHandler';

describe('requestOtp', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    vi.mocked(prisma.otpRecord.updateMany).mockResolvedValue({ count: 0 } as never);
  });

  it('creates a guest user and sends an otp for unknown phones', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);
    vi.mocked(createFreshUserForPhone).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.otpRecord.create).mockResolvedValue({ id: 'otp-1' } as never);
    vi.mocked(sendOtp).mockResolvedValue(undefined);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(createFreshUserForPhone).toHaveBeenCalledWith('0771234567');
    expect(prisma.otpRecord.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', used: false },
      data: { used: true },
    });
    expect(prisma.otpRecord.create).toHaveBeenCalled();
    expect(sendOtp).toHaveBeenCalledWith('0771234567', expect.any(String), undefined);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { message: 'OTP sent successfully' },
    });
  });

  it('reuses an existing user without creating a new one', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: 'user-existing', deletedAt: null } as never);
    vi.mocked(prisma.otpRecord.create).mockResolvedValue({ id: 'otp-1' } as never);
    vi.mocked(sendOtp).mockResolvedValue(undefined);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.otpRecord.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-existing', used: false },
      data: { used: true },
    });
    expect(prisma.otpRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-existing', phone: '0771234567' }),
    });
    expect(res.json).toHaveBeenCalled();
  });

  it('rejects otp request for deleted users without an intent', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({
      id: 'user-deleted',
      deletedAt: new Date(),
    } as never);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('ACCOUNT_DELETED');
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('sends otp for deleted users when intent is recover', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({
      id: 'user-deleted',
      deletedAt: new Date(),
    } as never);
    vi.mocked(prisma.otpRecord.create).mockResolvedValue({ id: 'otp-1' } as never);
    vi.mocked(sendOtp).mockResolvedValue(undefined);

    const req = createMockReq({ body: { phone: '0771234567', intent: 'recover' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(archiveDeletedUserPhone).not.toHaveBeenCalled();
    expect(prisma.otpRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-deleted', phone: '0771234567' }),
    });
    expect(res.json).toHaveBeenCalled();
  });

  it('archives deleted users and creates a fresh account when intent is create_new', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({
      id: 'user-deleted',
      deletedAt: new Date(),
    } as never);
    vi.mocked(archiveDeletedUserPhone).mockResolvedValue({ id: 'user-deleted' } as never);
    vi.mocked(createFreshUserForPhone).mockResolvedValue({ id: 'user-new' } as never);
    vi.mocked(prisma.otpRecord.create).mockResolvedValue({ id: 'otp-1' } as never);
    vi.mocked(sendOtp).mockResolvedValue(undefined);

    const req = createMockReq({ body: { phone: '0771234567', intent: 'create_new' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(archiveDeletedUserPhone).toHaveBeenCalledWith('user-deleted');
    expect(createFreshUserForPhone).toHaveBeenCalledWith('0771234567');
    expect(prisma.otpRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-new', phone: '0771234567' }),
    });
    expect(res.json).toHaveBeenCalled();
  });

  it('forwards the error when creating the OTP record fails', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: 'user-existing' } as never);
    const dbError = new Error('db unavailable');
    vi.mocked(prisma.otpRecord.create).mockRejectedValue(dbError);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(sendOtp).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('forwards the error when sending the OTP fails', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: 'user-existing' } as never);
    vi.mocked(prisma.otpRecord.create).mockResolvedValue({ id: 'otp-1' } as never);
    const smsError = new Error('sms provider down');
    vi.mocked(sendOtp).mockRejectedValue(smsError);

    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await requestOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(smsError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('verifyOtp', () => {
  const next = createMockNext();

  beforeEach(() => {
    clearOtpAttemptsMemoryForTests();
    vi.clearAllMocks();
    vi.mocked(prisma.otpRecord.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 } as never);
  });

  it('verifies a valid otp and returns tokens', async () => {
    stubSuccessfulCustomerOtpVerify();

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();

    await verifyOtp(req, res, next);

    expect(prisma.otpRecord.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        used: false,
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.otpRecord.update).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { used: true },
    });
    expect(prisma.otpRecord.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', used: false, id: { not: 'otp-1' } },
      data: { used: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isPhoneVerified: true },
    });
    expect(res.json).toHaveBeenCalledWith(expectedBearerOtpAuthJson());
  });

  it('reactivates deleted users when intent is recover', async () => {
    const deleted = {
      id: 'user-1',
      name: 'Guest',
      phone: '0771234567',
      email: null,
      deletedAt: new Date(),
    };
    const reactivated = {
      id: 'user-1',
      name: 'Jane',
      phone: '0771234567',
      email: null,
      deletedAt: null,
    };
    vi.mocked(findUserByPhone).mockResolvedValue(deleted as never);
    vi.mocked(prisma.otpRecord.findFirst).mockResolvedValue({
      id: 'otp-1',
      code: hashLoginOtp('123456', '0771234567'),
    } as never);
    vi.mocked(prisma.otpRecord.update).mockResolvedValue({ id: 'otp-1' } as never);
    vi.mocked(reactivateUserIfDeleted).mockResolvedValue(reactivated as never);
    vi.mocked(prisma.user.update).mockResolvedValue(reactivated as never);

    const req = createMockReq({
      body: { phone: '0771234567', code: '123456', intent: 'recover', name: 'Jane' },
    });
    const res = createMockRes();

    await verifyOtp(req, res, next);

    expect(reactivateUserIfDeleted).toHaveBeenCalledWith(deleted, { name: 'Jane' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.objectContaining({
          id: 'user-1',
          name: 'Jane',
          phone: '0771234567',
          isDeleted: false,
        }),
      },
    });
  });

  it('rejects verify for deleted users without recover intent', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({
      id: 'user-1',
      deletedAt: new Date(),
    } as never);
    vi.mocked(prisma.otpRecord.findFirst).mockResolvedValue({
      id: 'otp-1',
      code: hashLoginOtp('123456', '0771234567'),
    } as never);
    vi.mocked(prisma.otpRecord.update).mockResolvedValue({ id: 'otp-1' } as never);

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();

    await verifyOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('ACCOUNT_DELETED');
  });

  it('rejects invalid or expired otp codes', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.otpRecord.findFirst).mockResolvedValue(null);

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();

    await verifyOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).message).toBe('Invalid or expired OTP');
  });

  it('returns 429 after five failed verify attempts for the same phone', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.otpRecord.findFirst).mockResolvedValue({
      id: 'otp-1',
      code: hashLoginOtp('999999', '0771234567'),
    } as never);

    for (let i = 0; i < 5; i += 1) {
      const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
      const res = createMockRes();
      const attemptNext = createMockNext();
      await verifyOtp(req, res, attemptNext);
      expect(attemptNext).toHaveBeenCalledWith(expect.any(AppError));
      expect((asMockFn(attemptNext).mock.calls[0][0] as AppError).message).toBe('Invalid or expired OTP');
    }

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();
    await verifyOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain('Too many failed OTP attempts');
  });

  it('returns 404 when user does not exist', async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();

    await verifyOtp(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(404);
  });
});

describe('phoneLogin (deprecated wrapper)', () => {
  const next = createMockNext();

  beforeEach(() => {
    clearOtpAttemptsMemoryForTests();
    vi.clearAllMocks();
    vi.mocked(prisma.otpRecord.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 } as never);
  });

  it('delegates a valid OTP to the same verify flow', async () => {
    stubSuccessfulCustomerOtpVerify();

    const req = createMockReq({ body: { phone: '0771234567', code: '123456' } });
    const res = createMockRes();

    await phoneLogin(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expectedBearerOtpAuthJson());
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects phone login without an OTP code', async () => {
    const req = createMockReq({ body: { phone: '0771234567' } });
    const res = createMockRes();

    await phoneLogin(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('forwards validation errors for an invalid phone number', async () => {
    const req = createMockReq({ body: { phone: '123', code: '123456' } });
    const res = createMockRes();

    await phoneLogin(req, res, next);

    expect(findUserByPhone).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
