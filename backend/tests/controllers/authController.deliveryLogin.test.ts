import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes, createMockNext, asMockFn } from '../helpers/express';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: {
      update: vi.fn(),
    },
    driverDevice: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/adminSchema', () => ({
  ensureAdminTokenVersionColumn: vi.fn().mockResolvedValue(undefined),
  ensureAdminRoles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/socket', () => ({
  revokeDriverSockets: vi.fn(),
}));

vi.mock('../../src/lib/driverPhoneLogin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/driverPhoneLogin')>();
  return {
    ...actual,
    generateDriverOtp: vi.fn(() => '123456'),
    findDriverByPhone: vi.fn(),
  };
});

vi.mock('../../src/integrations/smsAdapter', () => ({
  sendOtp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/driverAccess', () => ({
  linkDriverBranches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@bingchun/delivery-domain', () => ({
  incrementDriverSessionVersion: vi.fn(),
}));

vi.mock('../../src/middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/middleware/auth')>();
  return {
    ...actual,
    signDeliveryToken: vi.fn(() => 'delivery-token'),
  };
});

import { incrementDriverSessionVersion } from '@bingchun/delivery-domain';
import { deliveryLogin, deliveryOtpRequest } from '../../src/controllers/authController';
import { findDriverByPhone } from '../../src/lib/driverPhoneLogin';
import { sendOtp } from '../../src/integrations/smsAdapter';
import { prisma } from '../../src/lib/prisma';
import { revokeDriverSockets } from '../../src/lib/socket';
import { AppError } from '../../src/middleware/errorHandler';
import { signDeliveryToken } from '../../src/middleware/auth';

// Each test uses its own number so the in-memory attempt lockout never leaks between tests.
let seq = 0;
const nextPhone = () => `07712${String(10000 + seq++).slice(-5)}`;

async function requestChallenge(phone: string): Promise<string> {
  const res = createMockRes();
  await deliveryOtpRequest(createMockReq({ body: { phone } }), res, createMockNext());
  return asMockFn(res.json).mock.calls[0][0].data.challenge as string;
}

const activeDriver = {
  id: 'driver-1',
  name: 'Driver One',
  storeId: 'store-1',
  isActive: true,
  role: { name: 'DELIVERY_DRIVER' },
  store: { id: 'store-1', name: 'Nugegoda', city: 'Colombo' },
  accessibleStores: [],
  matchedStoreIds: ['store-1'],
};

describe('deliveryOtpRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('texts a code and returns a challenge', async () => {
    const phone = nextPhone();
    const res = createMockRes();
    const next = createMockNext();

    await deliveryOtpRequest(createMockReq({ body: { phone } }), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sendOtp).toHaveBeenCalledWith(phone, '123456', undefined);
    const data = asMockFn(res.json).mock.calls[0][0].data;
    expect(typeof data.challenge).toBe('string');
    expect(data.expiresInSeconds).toBe(600);
  });

  it('rejects invalid mobile numbers', async () => {
    const next = createMockNext();

    await deliveryOtpRequest(createMockReq({ body: { phone: '12345' } }), createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(sendOtp).not.toHaveBeenCalled();
  });
});

describe('deliveryLogin', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.update).mockResolvedValue({} as never);
    vi.mocked(prisma.driverDevice.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(incrementDriverSessionVersion).mockResolvedValue(1);
  });

  it('logs in the rider registered with the verified number', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);
    vi.mocked(findDriverByPhone).mockResolvedValue(activeDriver as never);

    const res = createMockRes();
    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), res, next);

    expect(findDriverByPhone).toHaveBeenCalledWith(phone);
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(incrementDriverSessionVersion).toHaveBeenCalledWith('driver-1');
    expect(prisma.driverDevice.updateMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1' },
      data: { fcmToken: null, refreshTokenHash: null },
    });
    expect(revokeDriverSockets).toHaveBeenCalledWith('driver-1');
    expect(signDeliveryToken).toHaveBeenCalledWith('driver-1', 'store-1', 1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        token: 'delivery-token',
        driver: {
          id: 'driver-1',
          name: 'Driver One',
          role: 'DELIVERY_DRIVER',
          storeId: 'store-1',
          storeName: 'Nugegoda',
          storeCity: 'Colombo',
        },
      },
    });
  });

  it('rejects a wrong code without looking up the rider', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);

    await deliveryLogin(createMockReq({ body: { phone, code: '000000', challenge } }), createMockRes(), next);

    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('OTP_INVALID');
    expect(findDriverByPhone).not.toHaveBeenCalled();
  });

  it('rejects a challenge issued for another number', async () => {
    const challenge = await requestChallenge(nextPhone());

    await deliveryLogin(
      createMockReq({ body: { phone: nextPhone(), code: '123456', challenge } }),
      createMockRes(),
      next,
    );

    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('OTP_INVALID');
  });

  it('does not accept the same code twice', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);
    vi.mocked(findDriverByPhone).mockResolvedValue(activeDriver as never);

    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), createMockRes(), next);
    expect(next).not.toHaveBeenCalled();

    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), createMockRes(), next);
    expect((asMockFn(next).mock.calls[0][0] as AppError).code).toBe('OTP_INVALID');
  });

  it('reports numbers that are not registered riders', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);
    vi.mocked(findDriverByPhone).mockResolvedValue(null);

    const res = createMockRes();
    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('RIDER_NOT_FOUND');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects suspended riders with a clear message', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);
    vi.mocked(findDriverByPhone).mockResolvedValue({ ...activeDriver, isActive: false } as never);

    const res = createMockRes();
    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), res, next);

    const err = asMockFn(next).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Your account has been suspended. Please contact the administrator.');
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects riders without a linked branch', async () => {
    const phone = nextPhone();
    const challenge = await requestChallenge(phone);
    vi.mocked(findDriverByPhone).mockResolvedValue({ ...activeDriver, storeId: null } as never);

    await deliveryLogin(createMockReq({ body: { phone, code: '123456', challenge } }), createMockRes(), next);

    expect((asMockFn(next).mock.calls[0][0] as AppError).statusCode).toBe(403);
  });

  it('forwards validation errors for malformed codes', async () => {
    await deliveryLogin(
      createMockReq({ body: { phone: nextPhone(), code: '12', challenge: 'x' } }),
      createMockRes(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(findDriverByPhone).not.toHaveBeenCalled();
  });
});
