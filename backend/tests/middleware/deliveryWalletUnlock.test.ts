import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';
import { signDeliveryWalletUnlockToken } from '../../src/lib/deliveryWalletUnlock';
import { requireDeliveryWalletUnlock } from '../../src/middleware/deliveryWalletUnlock';
import { createMockNext, createMockReq, createMockRes, asMockFn } from '../helpers/express';

function thrownError(next: ReturnType<typeof createMockNext>) {
  return asMockFn(next).mock.calls[0][0] as AppError;
}

describe('requireDeliveryWalletUnlock', () => {
  it('returns 401 when the unlock header is missing', () => {
    const next = createMockNext();
    requireDeliveryWalletUnlock(
      createMockReq({ user: { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' } }),
      createMockRes(),
      next,
    );
    expect(thrownError(next).statusCode).toBe(401);
  });

  it('returns 401 when the unlock token belongs to another admin', () => {
    const next = createMockNext();
    const token = signDeliveryWalletUnlockToken('admin-other');
    requireDeliveryWalletUnlock(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
        headers: { 'x-delivery-wallet-unlock': token },
      }),
      createMockRes(),
      next,
    );
    expect(thrownError(next).statusCode).toBe(401);
  });

  it('allows a matching step-up token', () => {
    const next = createMockNext();
    const token = signDeliveryWalletUnlockToken('admin-1');
    requireDeliveryWalletUnlock(
      createMockReq({
        user: { sub: 'admin-1', type: 'admin', role: 'DELIVERY_ADMIN' },
        headers: { 'x-delivery-wallet-unlock': token },
      }),
      createMockRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });
});
