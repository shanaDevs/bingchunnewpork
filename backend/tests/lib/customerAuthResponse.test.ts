import { describe, expect, it } from 'vitest';
import { createMockReq, createMockRes } from '../helpers/express';
import { respondWithCustomerAuth } from '../../src/lib/customerAuthResponse';
import { CUSTOMER_ACCESS_COOKIE, CUSTOMER_REFRESH_COOKIE } from '../../src/lib/customerCookies';

describe('respondWithCustomerAuth', () => {
  const issued = {
    token: 'access-jwt',
    refreshToken: 'refresh-jwt',
    user: { id: 'u1', name: 'Test' },
    accessExpiresAt: 1_700_000_000_000,
  };

  it('returns bearer tokens for mobile clients', () => {
    const req = createMockReq();
    const res = createMockRes();
    const data = respondWithCustomerAuth(res, req, issued);
    expect(data).toEqual({
      token: 'access-jwt',
      refreshToken: 'refresh-jwt',
      user: issued.user,
    });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets httpOnly cookies and omits JWTs for web cookie transport', () => {
    const req = createMockReq({ headers: { 'x-auth-transport': 'cookie' } });
    const res = createMockRes();
    const data = respondWithCustomerAuth(res, req, issued);
    expect(data).toEqual({
      user: issued.user,
      accessExpiresAt: issued.accessExpiresAt,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      CUSTOMER_ACCESS_COOKIE,
      'access-jwt',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      CUSTOMER_REFRESH_COOKIE,
      'refresh-jwt',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
  });
});
