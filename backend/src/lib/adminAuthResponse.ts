import type { Response } from 'express';
import { setAdminAuthCookies } from './adminCookies';

export type AdminAuthCookiePayload = {
  token: string;
  refreshToken: string;
  admin: Record<string, unknown>;
  accessExpiresAt: number | null;
};

/** HttpOnly cookies carry JWTs; JSON body must not expose bearer tokens. */
export function toPublicAdminAuthData(issued: Pick<AdminAuthCookiePayload, 'admin' | 'accessExpiresAt'>) {
  return {
    admin: issued.admin,
    accessExpiresAt: issued.accessExpiresAt,
  };
}

export function respondWithAdminAuthCookies(res: Response, issued: AdminAuthCookiePayload) {
  setAdminAuthCookies(res, issued.token, issued.refreshToken);
  return toPublicAdminAuthData(issued);
}
