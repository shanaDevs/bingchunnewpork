import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(async () => 0),
  },
}));

vi.mock('../../src/lib/schemaPatch', () => ({
  addColumnIfMissing: vi.fn(async () => undefined),
  createIndexIfMissing: vi.fn(async () => undefined),
  createUniqueIndexIfMissing: vi.fn(async () => undefined),
  tableExists: vi.fn(async () => false),
}));

describe('ensureCustomerProfileSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('adds ban columns, share token, referral column, and audit table', async () => {
    const { ensureCustomerProfileSchema } = await import('../../src/lib/customerProfileSchema');
    const { addColumnIfMissing, createIndexIfMissing, createUniqueIndexIfMissing, tableExists } =
      await import('../../src/lib/schemaPatch');
    const { prisma } = await import('../../src/lib/prisma');

    vi.mocked(tableExists).mockResolvedValue(false);

    await ensureCustomerProfileSchema();

    expect(addColumnIfMissing).toHaveBeenCalledWith('users', 'bannedAt', 'TIMESTAMP(3) NULL');
    expect(addColumnIfMissing).toHaveBeenCalledWith('users', 'bannedReason', 'TEXT NULL');
    expect(createIndexIfMissing).toHaveBeenCalledWith('users', 'users_bannedAt_idx', 'bannedAt');
    expect(addColumnIfMissing).toHaveBeenCalledWith('users', 'referredByUserId', 'TEXT NULL');
    expect(addColumnIfMissing).toHaveBeenCalledWith('users', 'wishlistShareToken', 'VARCHAR(64) NULL');
    expect(createUniqueIndexIfMissing).toHaveBeenCalledWith(
      'users',
      'users_wishlistShareToken_key',
      'wishlistShareToken',
    );
    expect(tableExists).toHaveBeenCalledWith('customer_audit_logs');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('is idempotent within the same process', async () => {
    const { ensureCustomerProfileSchema } = await import('../../src/lib/customerProfileSchema');
    const { addColumnIfMissing } = await import('../../src/lib/schemaPatch');

    await ensureCustomerProfileSchema();
    const calls = vi.mocked(addColumnIfMissing).mock.calls.length;
    await ensureCustomerProfileSchema();
    expect(vi.mocked(addColumnIfMissing).mock.calls.length).toBe(calls);
  });
});
