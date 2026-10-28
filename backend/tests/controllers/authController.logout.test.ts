import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import { createMockNext, createMockReq, createMockRes } from '../helpers/express';
import { ADMIN_REFRESH_COOKIE } from '../../src/lib/adminCookies';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/adminSchema', () => ({
  ensureAdminTokenVersionColumn: vi.fn().mockResolvedValue(undefined),
  ensureAdminRoles: vi.fn().mockResolvedValue(undefined),
}));

import { adminLogout } from '../../src/controllers/authController';
import { prisma } from '../../src/lib/prisma';
import { ensureAdminTokenVersionColumn } from '../../src/lib/adminSchema';

describe('adminLogout (SEC-BUG-003)', () => {
  const next = createMockNext();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.adminUser.updateMany).mockResolvedValue({ count: 1 });
  });

  it('increments tokenVersion when a valid admin refresh cookie is present', async () => {
    const token = jwt.sign(
      { sub: 'admin-1', type: 'admin', tokenVersion: 2 },
      config.jwtRefreshSecret,
    );
    const req = createMockReq({
      cookies: { [ADMIN_REFRESH_COOKIE]: token },
    });
    const res = createMockRes();

    await adminLogout(req, res, next);

    expect(ensureAdminTokenVersionColumn).toHaveBeenCalled();
    expect(prisma.adminUser.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { loggedOut: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('clears cookies and succeeds when no refresh cookie is present', async () => {
    const req = createMockReq({ cookies: {} });
    const res = createMockRes();

    await adminLogout(req, res, next);

    expect(prisma.adminUser.updateMany).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { loggedOut: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('clears cookies and succeeds when the refresh cookie is invalid', async () => {
    const req = createMockReq({
      cookies: { [ADMIN_REFRESH_COOKIE]: 'not-a-valid-jwt' },
    });
    const res = createMockRes();

    await adminLogout(req, res, next);

    expect(prisma.adminUser.updateMany).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { loggedOut: true },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not bump tokenVersion for a non-admin refresh token in the cookie', async () => {
    const token = jwt.sign({ sub: 'user-1', type: 'user' }, config.jwtRefreshSecret);
    const req = createMockReq({
      cookies: { [ADMIN_REFRESH_COOKIE]: token },
    });
    const res = createMockRes();

    await adminLogout(req, res, next);

    expect(prisma.adminUser.updateMany).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { loggedOut: true },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
