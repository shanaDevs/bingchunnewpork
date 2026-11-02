import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import {
  accessExpiresAtMsFromToken,
  adminAccessTokenMaxAgeMs,
  jwtDurationToMs,
} from '../../src/lib/jwtExpiry';
import { signToken } from '../../src/middleware/auth';

describe('jwtExpiry', () => {
  it('parses common duration strings', () => {
    expect(jwtDurationToMs('15m')).toBe(15 * 60 * 1000);
    expect(jwtDurationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('reads access expiry from a signed JWT', () => {
    const token = signToken('admin-1', 'admin', 'SYSTEM_ADMIN');
    const decoded = jwt.decode(token) as { exp: number };
    expect(accessExpiresAtMsFromToken(token)).toBe(decoded.exp * 1000);
  });

  it('aligns cookie max age with configured JWT expiry', () => {
    expect(adminAccessTokenMaxAgeMs()).toBe(jwtDurationToMs(config.jwtExpiresIn));
  });
});
