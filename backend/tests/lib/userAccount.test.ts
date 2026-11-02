import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { findUserByPhone, reactivateUserIfDeleted, archiveDeletedUserPhone, archivedPhonePlaceholder } from '../../src/lib/userAccount';
import { prisma } from '../../src/lib/prisma';

describe('findUserByPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user matched by normalized phone', async () => {
    const user = { id: 'u1', phone: '0771234567' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);

    await expect(findUserByPhone('+94771234567')).resolves.toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '0771234567' } });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to variant lookup when exact phone is missing', async () => {
    const user = { id: 'u2', phone: '0771234567' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(user as never);

    await expect(findUserByPhone('0771234567')).resolves.toEqual(user);
    expect(prisma.user.findFirst).toHaveBeenCalled();
  });
});

describe('archiveDeletedUserPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves phone to deleted placeholder for archived accounts', async () => {
    const deleted = {
      id: 'u1',
      name: 'Guest',
      phone: '0771234567',
      deletedAt: new Date(),
    };
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(deleted as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...deleted,
      phone: archivedPhonePlaceholder('u1'),
      name: '[Deleted]',
    } as never);

    await expect(archiveDeletedUserPhone('u1')).resolves.toEqual(
      expect.objectContaining({ phone: 'deleted:u1' }),
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        phone: 'deleted:u1',
        name: '[Deleted]',
      },
    });
  });
});

describe('reactivateUserIfDeleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing user when not deleted', async () => {
    const active = { id: 'u1', name: 'Demo', deletedAt: null };
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(active as never);

    await expect(reactivateUserIfDeleted(active)).resolves.toEqual(active);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reactivates a soft-deleted user with profile overrides', async () => {
    const deleted = { id: 'u1', name: '[Deleted]', deletedAt: new Date() };
    const reactivated = { id: 'u1', name: 'Jane', deletedAt: null, isPhoneVerified: true };
    vi.mocked(prisma.user.update).mockResolvedValue(reactivated as never);

    await expect(
      reactivateUserIfDeleted(deleted, { name: 'Jane', email: 'jane@example.com' }),
    ).resolves.toEqual(reactivated);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        deletedAt: null,
        isPhoneVerified: true,
        name: 'Jane',
        email: 'jane@example.com',
      },
    });
  });

  it('defaults reactivated name to Guest when prior name was [Deleted]', async () => {
    const deleted = { id: 'u1', name: '[Deleted]', deletedAt: new Date() };
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as never);

    await reactivateUserIfDeleted(deleted);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Guest' }),
      }),
    );
  });
});
