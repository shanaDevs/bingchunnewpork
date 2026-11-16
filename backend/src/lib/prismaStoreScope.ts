/** Prisma `where.storeId` fragment for super-admin store scoping (empty = all stores). */
export function prismaStoreIdScope(
  allowedStoreIds: string[],
): { storeId?: string | { in: string[] } } {
  if (allowedStoreIds.length === 1) {
    return { storeId: allowedStoreIds[0]! };
  }
  if (allowedStoreIds.length > 0) {
    return { storeId: { in: allowedStoreIds } };
  }
  return {};
}
