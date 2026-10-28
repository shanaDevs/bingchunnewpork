import { tableExists } from './schemaPatch';

let accessibleStoresReady = false;

/**
 * Ensure the Prisma implicit M2M join table exists as `_adminuseraccessiblestores`.
 * Schema is created by Prisma db push on PostgreSQL.
 */
export async function ensureAdminUserAccessibleStoresTable(): Promise<void> {
  if (accessibleStoresReady) return;
  await tableExists('_adminuseraccessiblestores');
  accessibleStoresReady = true;
}
