import { addColumnIfMissing, createIndexIfMissing } from './schemaPatch';

let driverProfileReady = false;

/**
 * Idempotent equivalent of the two delivery migrations
 * (20260725120000_delivery_service_extensions and
 * 20260725190000_driver_profile_duty_status) for databases that were never
 * managed by Prisma Migrate.
 *
 * Additive only — every statement is guarded by an INFORMATION_SCHEMA check or
 * IF NOT EXISTS, so it is safe to run repeatedly and on partially migrated
 * databases. Runs at boot when RUNTIME_SCHEMA_PATCHES is not 'false'.
 */
export async function ensureDriverProfileSchema(): Promise<void> {
  if (driverProfileReady) return;

  // --- Driver profile + duty status on admin_users ---
  await addColumnIfMissing('admin_users', 'phone', 'VARCHAR(191) NULL');
  await addColumnIfMissing('admin_users', 'nicNumber', 'VARCHAR(191) NULL');
  await addColumnIfMissing('admin_users', 'vehicleNumber', 'VARCHAR(191) NULL');
  await addColumnIfMissing('admin_users', 'profilePhotoUrl', 'VARCHAR(191) NULL');
  await addColumnIfMissing('admin_users', 'licenseImageUrl', 'VARCHAR(191) NULL');
  await addColumnIfMissing(
    'admin_users',
    'dutyStatus',
    "TEXT NOT NULL DEFAULT 'OFF_DUTY'",
  );
  await addColumnIfMissing('admin_users', 'address', 'TEXT NULL');
  await addColumnIfMissing('admin_users', 'vehicleType', 'TEXT NULL');
  await addColumnIfMissing('admin_users', 'vehicleColor', 'TEXT NULL');
  await addColumnIfMissing('admin_users', 'licenseNumber', 'TEXT NULL');
  await addColumnIfMissing('admin_users', 'disabilities', 'TEXT NULL');
  await addColumnIfMissing('admin_users', 'meritPoints', 'INTEGER NOT NULL DEFAULT 100');
  await addColumnIfMissing(
    'admin_users',
    'consecutiveSuccessfulDeliveries',
    'INTEGER NOT NULL DEFAULT 0',
  );

  // --- Per-branch delivery OTP opt-in ---
  await addColumnIfMissing('stores', 'deliveryOtpRequired', 'BOOLEAN NOT NULL DEFAULT false');

  // --- Job broadcast tracking ---
  await addColumnIfMissing('delivery_jobs', 'broadcastedAt', 'DATETIME(3) NULL');

  await createIndexIfMissing(
    'orders',
    'orders_storeId_status_orderMode_idx',
    '`storeId`, `status`, `orderMode`',
  );

  driverProfileReady = true;
}
