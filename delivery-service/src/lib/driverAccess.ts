import { prisma } from '@bingchun/db';

/** Resolve every branch a delivery driver can see / claim jobs for. */
export async function getDriverAccessibleStoreIds(
  driverId: string,
  jwtStoreId?: string | null,
): Promise<string[]> {
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
