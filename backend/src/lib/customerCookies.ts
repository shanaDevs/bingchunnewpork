import type { Request, Response } from 'express';
import { config } from '../config';
import { customerAccessTokenMaxAgeMs, customerRefreshTokenMaxAgeMs } from './jwtExpiry';
import { ADMIN_CSRF_COOKIE, assertAdminCsrf } from './adminCookies';
import { randomBytes } from 'crypto';

export const CUSTOMER_ACCESS_COOKIE = 'bc_customer_at';
export const CUSTOMER_REFRESH_COOKIE = 'bc_customer_rt';

function sameSite(): 'lax' | 'none' {
  return process.env.ADMIN_COOKIE_SAMESITE === 'none' ? 'none' : 'lax';
}

function base() {
  const site = sameSite();
  return {
    secure: config.nodeEnv === 'production' || site === 'none',
    sameSite: site,
    domain: process.env.COOKIE_DOMAIN || undefined,
  } as const;
}

export function setCustomerAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const shared = base();
  const csrf = randomBytes(24).toString('base64url');
  const accessMaxAge = customerAccessTokenMaxAgeMs();
  const refreshMaxAge = customerRefreshTokenMaxAgeMs();
  res.cookie(CUSTOMER_ACCESS_COOKIE, accessToken, {
    ...shared,
    httpOnly: true,
    path: '/',
    maxAge: accessMaxAge,
  });
  res.cookie(CUSTOMER_REFRESH_COOKIE, refreshToken, {
    ...shared,
    httpOnly: true,
    path: '/api/auth',
    maxAge: refreshMaxAge,
  });
  res.cookie(ADMIN_CSRF_COOKIE, csrf, {
    ...shared,
    httpOnly: false,
    path: '/',
    maxAge: refreshMaxAge,
  });
}

export function clearCustomerAuthCookies(res: Response): void {
  const shared = base();
  res.clearCookie(CUSTOMER_ACCESS_COOKIE, { ...shared, path: '/' });
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, { ...shared, path: '/api/auth' });
  res.clearCookie(ADMIN_CSRF_COOKIE, { ...shared, path: '/' });
}

export function readCustomerAccessCookie(req: Request): string | null {
  const value = req.cookies?.[CUSTOMER_ACCESS_COOKIE];
  return typeof value === 'string' && value ? value : null;
}

export function readCustomerRefreshCookie(req: Request): string | null {
  const value = req.cookies?.[CUSTOMER_REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : null;
}

/** Double-submit CSRF for cookie-authenticated customer unsafe requests (shared bc_csrf cookie). */
export function assertCustomerCsrf(req: Request): void {
  assertAdminCsrf(req);
}
