import { prisma } from './prisma';

/** Resolve every branch a delivery driver can see / claim jobs for. */
export async function getDriverAccessibleStoreIds(driverId: string, jwtStoreId?: string | null): Promise<string[]> {
  const driver = await prisma.adminUser.findUnique({
    where: { id: driverId },
    select: {
      storeId: true,
      accessibleStores: { select: { id: true } },
    },
  });
  if (!driver) return jwtStoreId ? [jwtStoreId] : [];

  const ids = new Set<string>();
  if (driver.storeId) ids.add(driver.storeId);
  for (const s of driver.accessibleStores) ids.add(s.id);
  if (jwtStoreId) ids.add(jwtStoreId);
  return [...ids];
}

/**
 * Grant a driver delivery access to extra branches (idempotent).
 * Used at PIN login when one rider has accounts at several branches.
 */
export async function linkDriverBranches(driverId: string, storeIds: string[]): Promise<void> {
  const extra = [...new Set(storeIds.filter(Boolean))];
  if (extra.length === 0) return;

  await prisma.adminUser.update({
    where: { id: driverId },
    data: { accessibleStores: { connect: extra.map((id) => ({ id })) } },
  });
}
