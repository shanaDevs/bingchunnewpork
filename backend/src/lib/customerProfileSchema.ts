import { prisma } from './prisma';
import {
  addColumnIfMissing,
  createIndexIfMissing,
  createUniqueIndexIfMissing,
  tableExists,
} from './schemaPatch';

let customerProfileReady = false;

/**
 * Idempotent customer-profile patches for DBs that never ran Prisma Migrate /
 * apply-customer-profile-migration.js. Safe to re-run on every boot when
 * RUNTIME_SCHEMA_PATCHES is enabled.
 */
export async function ensureCustomerProfileSchema(): Promise<void> {
  if (customerProfileReady) return;

  await addColumnIfMissing('users', 'tokenVersion', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('users', 'bannedAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('users', 'bannedReason', 'TEXT NULL');
  await createIndexIfMissing('users', 'users_bannedAt_idx', 'bannedAt');

  // Older optional columns that some environments still lack.
  await addColumnIfMissing('users', 'referredByUserId', 'TEXT NULL');
  await createIndexIfMissing('users', 'users_referredByUserId_idx', 'referredByUserId');
  await addColumnIfMissing('users', 'wishlistShareToken', 'VARCHAR(64) NULL');
  await createUniqueIndexIfMissing('users', 'users_wishlistShareToken_key', 'wishlistShareToken');

  if (!(await tableExists('customer_audit_logs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "customer_audit_logs" (
        "id" TEXT NOT NULL,
        "adminId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "customer_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  await createIndexIfMissing(
    'customer_audit_logs',
    'customer_audit_logs_customerId_createdAt_idx',
    'customerId, createdAt',
  );

  // FKs are best-effort: skip if parents/constraints already differ.
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "customer_audit_logs"
        ADD CONSTRAINT "customer_audit_logs_adminId_fkey"
        FOREIGN KEY ("adminId") REFERENCES "admin_users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "customer_audit_logs"
        ADD CONSTRAINT "customer_audit_logs_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "users"
        ADD CONSTRAINT "users_referredByUserId_fkey"
        FOREIGN KEY ("referredByUserId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `).catch(() => undefined);

  customerProfileReady = true;
}
