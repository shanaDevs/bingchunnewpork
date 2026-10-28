import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: vi.fn(),
    },
  },
}));

import { getDriverAccessibleStoreIds } from '../../src/lib/driverAccess';
import { prisma } from '../../src/lib/prisma';

/**
 * Branch scoping for drivers — every driver-facing query filters on this, so a driver
 * must never see or claim a job outside the branches they are linked to.
 */
describe('getDriverAccessibleStoreIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unions the home branch, the extra accessible branches and the JWT branch', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-home',
      accessibleStores: [{ id: 'store-extra-1' }, { id: 'store-extra-2' }],
    } as never);

    const ids = await getDriverAccessibleStoreIds('driver-1', 'store-jwt');

    expect(ids.sort()).toEqual(
      ['store-home', 'store-extra-1', 'store-extra-2', 'store-jwt'].sort(),
    );
  });

  it('de-duplicates when the JWT branch is also the home branch', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: 'store-home',
      accessibleStores: [{ id: 'store-home' }],
    } as never);

    expect(await getDriverAccessibleStoreIds('driver-1', 'store-home')).toEqual(['store-home']);
  });

  it('returns only the accessible branches when the driver has no home branch', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      storeId: null,
      accessibleStores: [{ id: 'store-extra' }],
    } as never);

    expect(await getDriverAccessibleStoreIds('driver-1', null)).toEqual(['store-extra']);
  });

  it('falls back to the JWT branch for an unknown driver', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null as never);

    expect(await getDriverAccessibleStoreIds('ghost', 'store-jwt')).toEqual(['store-jwt']);
  });

  it('returns nothing for an unknown driver with no JWT branch — callers then 403', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null as never);

    expect(await getDriverAccessibleStoreIds('ghost', null)).toEqual([]);
  });
});
