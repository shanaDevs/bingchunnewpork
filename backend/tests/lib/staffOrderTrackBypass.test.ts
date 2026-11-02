import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../../src/config';
import { isVerifiedAdminStaffRequest } from '../../src/lib/staffOrderTrackBypass';
import { ADMIN_ACCESS_COOKIE } from '../../src/lib/adminCookies';

function mockReq(partial: {
  authorization?: string;
  cookies?: Record<string, string>;
}): Request {
  return {
    headers: { authorization: partial.authorization },
    cookies: partial.cookies,
  } as Request;
}

describe('isVerifiedAdminStaffRequest', () => {
  it('returns true for a valid admin Bearer token', () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', role: 'CASHIER' }, config.jwtSecret);
    expect(isVerifiedAdminStaffRequest(mockReq({ authorization: `Bearer ${token}` }))).toBe(true);
  });

  it('returns true for a valid admin access cookie', () => {
    const token = jwt.sign({ sub: 'admin-1', type: 'admin', role: 'STORE_MANAGER' }, config.jwtSecret);
    expect(
      isVerifiedAdminStaffRequest(mockReq({ cookies: { [ADMIN_ACCESS_COOKIE]: token } })),
    ).toBe(true);
  });

  it('returns false for customer tokens and missing auth', () => {
    const userToken = jwt.sign({ sub: 'u-1', type: 'user' }, config.jwtSecret);
    expect(isVerifiedAdminStaffRequest(mockReq({ authorization: `Bearer ${userToken}` }))).toBe(false);
    expect(isVerifiedAdminStaffRequest(mockReq({}))).toBe(false);
  });
});
