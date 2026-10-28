/**
 * Applies the delivery schema (driver profile, duty status, OTP, GPS, devices)
 * to the database in DATABASE_URL. Additive and idempotent — every statement is
 * guarded, so re-running is a no-op.
 *
 * Use this on databases that were never managed by Prisma Migrate, instead of
 * `prisma migrate deploy` (which would fail on already-present objects).
 *
 *   cd backend && npx tsx scripts/apply-delivery-schema.ts
 *
 * Verify before/after with scripts/check-delivery-schema.ts.
 */
import { prisma } from '../src/lib/prisma';
import { ensureDeliveryJobsTables, ensureDeliveryOutboxSchema } from '../src/lib/deliverySchema';
import { ensureDeliveryPayoutSchema } from '../src/lib/deliveryPayoutSchema';
import { ensureDriverProfileSchema } from '../src/lib/driverProfileSchema';
import { ensureAdminUserAccessibleStoresTable } from '../src/lib/adminUserStoresSchema';
import { ensureDriverPinColumn } from '../src/lib/adminSchema';

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>('SELECT current_database() AS db');
  console.log('Applying delivery schema to:', db[0]?.db);

  await ensureDeliveryJobsTables();
  console.log('  delivery job tables ok');
  await ensureDeliveryOutboxSchema();
  console.log('  delivery outbox ok');
  await ensureDeliveryPayoutSchema();
  console.log('  delivery payouts ok');
  await ensureDriverPinColumn();
  console.log('  driver PIN column ok');
  await ensureDriverProfileSchema();
  console.log('  driver profile / duty / OTP / GPS schema ok');
  await ensureAdminUserAccessibleStoresTable();
  console.log('  admin_user_accessible_stores ok');

  console.log('\nAPPLY_OK');
}

main()
  .catch((e) => {
    console.error('APPLY_FAILED', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
