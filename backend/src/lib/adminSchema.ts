import { addColumnIfMissing, createUniqueIndexIfMissing, execSql } from './schemaPatch';

let adminRoleEnumReady = false;

/** Ensure admin_users.role enum includes all AdminRole values (MySQL/MariaDB). */
export async function ensureDeliveryDriverRole(): Promise<void> {
  // Removed raw SQL modification as role is now a separate table
  adminRoleEnumReady = true;
}

let driverPinColumnReady = false;

/** Add pinLookup for driver PIN auth. */
export async function ensureDriverPinColumn(): Promise<void> {
  if (driverPinColumnReady) return;

  await addColumnIfMissing('admin_users', 'pinLookup', 'VARCHAR(191) NULL');
  await createUniqueIndexIfMissing(
    'admin_users',
    'admin_users_storeId_pinLookup_key',
    '`storeId`, `pinLookup`',
  );

  driverPinColumnReady = true;
}

let adminAuthVersionColumnsReady = false;

/**
 * Ensure auth version columns used by Prisma AdminUser queries.
 * - tokenVersion: invalidate admin refresh tokens after password change/deactivation
 * - sessionVersion: invalidate prior rider JWTs after each PIN login
 */
export async function ensureAdminTokenVersionColumn(): Promise<void> {
  if (adminAuthVersionColumnsReady) return;

  await addColumnIfMissing('admin_users', 'tokenVersion', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('admin_users', 'sessionVersion', 'INTEGER NOT NULL DEFAULT 0');

  adminAuthVersionColumnsReady = true;
}

const DEFAULT_ADMIN_ROLES = [
  'SYSTEM_ADMIN',
  'STORE_MANAGER',
  'CASHIER',
  'DELIVERY_ADMIN',
  'REPORT_VIEWER',
  'DELIVERY_DRIVER',
] as const;

let adminRolesReady = false;

/** Ensure the roles table exists and contains the standard role rows. */
export async function ensureAdminRoles(): Promise<void> {
  if (adminRolesReady) return;

  await execSql(`
    CREATE TABLE IF NOT EXISTS "roles" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE
    )
  `);

  for (const name of DEFAULT_ADMIN_ROLES) {
    await execSql(
      `INSERT INTO "roles" ("id", "name")
       VALUES (gen_random_uuid()::text, $1)
       ON CONFLICT ("name") DO NOTHING`,
      name,
    );
  }

  adminRolesReady = true;
}
