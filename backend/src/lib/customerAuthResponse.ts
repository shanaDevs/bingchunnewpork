import type { Request, Response } from 'express';
import { setCustomerAuthCookies } from './customerCookies';

export type CustomerAuthIssued = {
  token: string;
  refreshToken: string;
  user: Record<string, unknown>;
  accessExpiresAt: number | null;
};

export function wantsCustomerCookieAuth(req: Request): boolean {
  const raw =
    (typeof req.get === 'function' ? req.get('x-auth-transport') : undefined) ??
    req.headers['x-auth-transport'];
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  return value === 'cookie';
}

/** HttpOnly cookies carry JWTs for web; JSON body must not expose bearer tokens in cookie mode. */
export function toPublicCustomerAuthData(
  issued: Pick<CustomerAuthIssued, 'user' | 'accessExpiresAt'>,
) {
  return {
    user: issued.user,
    accessExpiresAt: issued.accessExpiresAt,
  };
}

export function toBearerCustomerAuthData(issued: CustomerAuthIssued) {
  return {
    token: issued.token,
    refreshToken: issued.refreshToken,
    user: issued.user,
  };
}

export function respondWithCustomerAuth(res: Response, req: Request, issued: CustomerAuthIssued) {
  if (wantsCustomerCookieAuth(req)) {
    setCustomerAuthCookies(res, issued.token, issued.refreshToken);
    return toPublicCustomerAuthData(issued);
  }
  return toBearerCustomerAuthData(issued);
}

export function respondWithCustomerRefresh(
  res: Response,
  req: Request,
  rotated: { token: string; refreshToken: string },
  accessExpiresAt: number | null,
) {
  if (wantsCustomerCookieAuth(req)) {
    setCustomerAuthCookies(res, rotated.token, rotated.refreshToken);
    return { accessExpiresAt };
  }
  return { token: rotated.token, refreshToken: rotated.refreshToken };
}
