import jwt from 'jsonwebtoken';
import { config } from '../config';

/** Parse JWT `expiresIn` strings like `15m`, `7d` into milliseconds. */
export function jwtDurationToMs(expiresIn: string): number {
  const trimmed = expiresIn.trim();
  const match = /^(\d+)([smhd])$/i.exec(trimmed);
  if (!match) return 15 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

export function adminAccessTokenMaxAgeMs(): number {
  return jwtDurationToMs(config.jwtExpiresIn);
}

export function adminRefreshTokenMaxAgeMs(): number {
  return jwtDurationToMs(config.jwtRefreshExpiresIn);
}

export function customerAccessTokenMaxAgeMs(): number {
  return jwtDurationToMs(config.jwtUserExpiresIn);
}

export function customerRefreshTokenMaxAgeMs(): number {
  return jwtDurationToMs(config.jwtUserRefreshExpiresIn);
}

/** Epoch ms when a signed access JWT expires (from `exp` claim). */
export function accessExpiresAtMsFromToken(token: string): number | null {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) return null;
  return decoded.exp * 1000;
}
