import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { gatewayAmountMatchesOrder } from '../../src/lib/onlineOrderPayment';
import { assertAdminCsrf } from '../../src/lib/adminCookies';
import { AppError } from '../../src/middleware/errorHandler';
import { config } from '../../src/config';
import { authenticate } from '../../src/middleware/auth';

describe('gateway amount reconciliation', () => {
  it('matches the order total to two decimal places', () => {
    expect(gatewayAmountMatchesOrder('1500.00', 1500)).toBe(true);
    expect(gatewayAmountMatchesOrder(1500, 1500)).toBe(true);
    expect(gatewayAmountMatchesOrder('1499.00', 1500)).toBe(false);
    expect(gatewayAmountMatchesOrder(undefined, 1500)).toBe(false);
  });
});

describe('admin CSRF', () => {
  it('rejects a missing or mismatched CSRF token on cookie-authenticated writes', () => {
    const req = {
      method: 'POST',
      cookies: { bc_csrf: 'expected-token' },
      get: (name: string) => (name === 'x-csrf-token' ? 'other-token' : undefined),
    };
    expect(() => assertAdminCsrf(req as never)).toThrow(AppError);
  });

  it('accepts a matching double-submit token', () => {
    const req = {
      method: 'POST',
      cookies: { bc_csrf: 'expected-token' },
      get: (name: string) => {
        if (name === 'x-csrf-token') return 'expected-token';
        if (name === 'origin') return undefined;
        return undefined;
      },
    };
    expect(() => assertAdminCsrf(req as never)).not.toThrow();
  });

  describe('origin allowlist (split admin web host)', () => {
    const envBackup = { ...process.env };

    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      process.env = { ...envBackup };
    });

    it('accepts CSRF when Origin is ADMIN_WEB_URL in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.LIVE_SHOP_URL = 'https://bing-chun.bc.dartcodes.com';
      process.env.FRONTEND_URL = 'https://bing-chun.bc.dartcodes.com';
      process.env.ADMIN_URL = 'https://bing-chun.bc.dartcodes.com/admin';
      process.env.ADMIN_WEB_URL = 'https://bing-chun-admin-web.bc.dartcodes.com';
      process.env.API_BASE_URL = 'https://bing-chun-admin.bc.dartcodes.com';

      const { assertAdminCsrf: assertCsrf } = await import('../../src/lib/adminCookies');
      const req = {
        method: 'PUT',
        cookies: { bc_csrf: 'expected-token' },
        get: (name: string) => {
          const key = name.toLowerCase();
          if (key === 'x-csrf-token') return 'expected-token';
          if (key === 'origin') return 'https://bing-chun-admin-web.bc.dartcodes.com';
          return undefined;
        },
      };
      expect(() => assertCsrf(req as never)).not.toThrow();
    });
  });
});

describe('admin cookie authentication', () => {
  it('accepts an HttpOnly access cookie when the CSRF token matches', async () => {
    const token = jwt.sign(
      { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      config.jwtSecret,
    );
    const next = vi.fn();
    const req = {
      method: 'POST',
      headers: {},
      cookies: { bc_admin_at: token, bc_csrf: 'csrf-value' },
      get: (name: string) => (name.toLowerCase() === 'x-csrf-token' ? 'csrf-value' : undefined),
    };

    await authenticate(req as never, {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toEqual([]);
    expect((req as { user?: { sub: string } }).user?.sub).toBe('admin-1');
  });

  it('rejects a cookie session when the CSRF token does not match', async () => {
    const token = jwt.sign(
      { sub: 'admin-1', type: 'admin', role: 'SYSTEM_ADMIN' },
      config.jwtSecret,
    );
    const next = vi.fn();
    const req = {
      method: 'POST',
      headers: {},
      cookies: { bc_admin_at: token, bc_csrf: 'csrf-value' },
      get: () => 'wrong',
    };

    await authenticate(req as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next.mock.calls[0][0] as AppError).statusCode).toBe(403);
  });
});
