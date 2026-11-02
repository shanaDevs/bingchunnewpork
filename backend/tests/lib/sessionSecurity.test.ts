import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(),
    user: { findFirst: vi.fn(), update: vi.fn() },
    adminUser: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../../src/integrations/emailAdapter', () => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../../src/lib/userSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/userSession')>();
  return actual;
});

vi.mock('../../src/middleware/auth', () => ({
  signToken: vi.fn(() => 'access-token'),
  signRefreshToken: vi.fn((_sub: string, _tv: number, jti: string) => `refresh:${jti}`),
}));

import { prisma } from '../../src/lib/prisma';
import { sendPasswordResetEmail } from '../../src/integrations/emailAdapter';
import { rotateCustomerRefresh } from '../../src/lib/userSession';
import { completePasswordReset, requestPasswordReset } from '../../src/lib/passwordReset';

function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

describe('customer refresh rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ tokenVersion: 0 }] as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0 as never);
  });

  it('rotates the family when the presented jti is current', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ tokenVersion: 0 }] as never)
      .mockResolvedValueOnce([{ currentJtiHash: hashJti('current-jti'), revokedAt: null }] as never);

    const rotated = await rotateCustomerRefresh({
      sub: 'user-1',
      tv: 0,
      jti: 'current-jti',
      fam: 'family-1',
    });

    expect(rotated.token).toBe('access-token');
    expect(rotated.refreshToken.startsWith('refresh:')).toBe(true);
    expect(rotated.refreshToken).not.toContain('current-jti');
  });

  it('revokes the family when an old jti is reused', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ tokenVersion: 0 }] as never)
      .mockResolvedValueOnce([{ currentJtiHash: hashJti('current-jti'), revokedAt: null }] as never);

    await expect(
      rotateCustomerRefresh({ sub: 'user-1', tv: 0, jti: 'stolen-jti', fam: 'family-1' }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});

describe('password reset tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0 as never);
  });

  it('does not send mail when no customer account exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await requestPasswordReset('missing@example.com', 'user');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects an expired or already used token', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'row-1', subjectId: 'user-1', expiresAt: new Date(Date.now() - 1000), usedAt: null },
    ] as never);
    await expect(completePasswordReset('a'.repeat(32), 'new-password-1', 'user')).rejects.toBeInstanceOf(AppError);

    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'row-1', subjectId: 'user-1', expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
    ] as never);
    await expect(completePasswordReset('b'.repeat(32), 'new-password-1', 'user')).rejects.toBeInstanceOf(AppError);
  });

  it('rejects a second consume when the token row was already marked used', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: 'row-1', subjectId: 'user-1', expiresAt: new Date(Date.now() + 60_000), usedAt: null },
    ] as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0 as never);
    await expect(completePasswordReset('c'.repeat(32), 'new-password-1', 'user')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
