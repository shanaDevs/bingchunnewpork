import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { isCorsAllowedOrigin } from './resolveFrontendUrl';
import { AppError } from '../middleware/errorHandler';
import { adminAccessTokenMaxAgeMs, adminRefreshTokenMaxAgeMs } from './jwtExpiry';

export const ADMIN_ACCESS_COOKIE = 'bc_admin_at';
export const ADMIN_REFRESH_COOKIE = 'bc_admin_rt';
export const ADMIN_CSRF_COOKIE = 'bc_csrf';

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

/** Sets auth cookies and returns the CSRF value (needed when the UI cannot read cross-origin cookies). */
export function setAdminAuthCookies(res: Response, accessToken: string, refreshToken: string): string {
  const shared = base();
  const csrf = randomBytes(24).toString('base64url');
  res.cookie(ADMIN_ACCESS_COOKIE, accessToken, {
    ...shared,
    httpOnly: true,
    path: '/',
    maxAge: adminAccessTokenMaxAgeMs(),
  });
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, {
    ...shared,
    httpOnly: true,
    path: '/api/auth/admin',
    maxAge: adminRefreshTokenMaxAgeMs(),
  });
  res.cookie(ADMIN_CSRF_COOKIE, csrf, {
    ...shared,
    httpOnly: false,
    path: '/',
    maxAge: adminRefreshTokenMaxAgeMs(),
  });
  return csrf;
}

export function clearAdminAuthCookies(res: Response): void {
  const shared = base();
  res.clearCookie(ADMIN_ACCESS_COOKIE, { ...shared, path: '/' });
  res.clearCookie(ADMIN_REFRESH_COOKIE, { ...shared, path: '/api/auth/admin' });
  res.clearCookie(ADMIN_CSRF_COOKIE, { ...shared, path: '/' });
}

export function readAdminAccessCookie(req: Request): string | null {
  const value = req.cookies?.[ADMIN_ACCESS_COOKIE];
  return typeof value === 'string' && value ? value : null;
}

export function readAdminRefreshCookie(req: Request): string | null {
  const value = req.cookies?.[ADMIN_REFRESH_COOKIE];
  return typeof value === 'string' && value ? value : null;
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Double-submit CSRF for cookie-authenticated unsafe requests. */
export function assertAdminCsrf(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const cookie = req.cookies?.[ADMIN_CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (typeof cookie !== 'string' || !header || !tokensEqual(cookie, header)) {
    throw new AppError('Invalid CSRF token', 403);
  }
  const origin = req.get('origin') || undefined;
  if (origin && !isCorsAllowedOrigin(origin)) {
    // Same-origin Next.js proxies sometimes omit/alter Origin; accept an allowlisted Referer.
    const referer = req.get('referer') || undefined;
    if (!referer || !isCorsAllowedOrigin(referer)) {
      throw new AppError('Origin not allowed', 403);
    }
  }
}

export function adminCsrfGuard(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!req.headers.authorization && readAdminAccessCookie(req)) {
      assertAdminCsrf(req);
    }
    next();
  } catch (err) {
    next(err);
  }
}
