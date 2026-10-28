import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  assertActiveSystemAdmin,
  DELIVERY_WALLET_UNLOCK_TYPE,
  signDeliveryWalletUnlockToken,
  verifyDeliveryWalletUnlockToken,
} from '../../src/lib/deliveryWalletUnlock';

describe('delivery wallet unlock JWT', () => {
  it('signs a step-up token bound to the admin id', () => {
    const token = signDeliveryWalletUnlockToken('admin-1');
    expect(jwt.verify(token, config.jwtSecret)).toMatchObject({
      sub: 'admin-1',
      type: DELIVERY_WALLET_UNLOCK_TYPE,
    });
  });

  it('accepts a matching token and rejects a different admin', () => {
    const token = signDeliveryWalletUnlockToken('admin-1');
    expect(() => verifyDeliveryWalletUnlockToken(token, 'admin-1')).not.toThrow();
    expect(() => verifyDeliveryWalletUnlockToken(token, 'admin-2')).toThrow(AppError);
    try {
      verifyDeliveryWalletUnlockToken(token, 'admin-2');
    } catch (err) {
      expect((err as AppError).statusCode).toBe(401);
    }
  });

  it('rejects a normal admin access token used as the unlock header', () => {
    const access = jwt.sign({ sub: 'admin-1', type: 'admin' }, config.jwtSecret);
    expect(() => verifyDeliveryWalletUnlockToken(access, 'admin-1')).toThrow(AppError);
  });
});

describe('assertActiveSystemAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows an active SYSTEM_ADMIN loaded from the database', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'SYSTEM_ADMIN' },
    } as never);
    await expect(assertActiveSystemAdmin('admin-1')).resolves.toBeUndefined();
  });

  it('rejects a delivery admin even if the JWT role is stale', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: true,
      role: { name: 'DELIVERY_ADMIN' },
    } as never);
    await expect(assertActiveSystemAdmin('admin-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects an inactive system admin', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      isActive: false,
      role: { name: 'SYSTEM_ADMIN' },
    } as never);
    await expect(assertActiveSystemAdmin('admin-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});
