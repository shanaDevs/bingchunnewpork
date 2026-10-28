/**
 * Read-only audit of the delivery schema against the current DATABASE_URL.
 * Reports which columns/tables from the delivery migrations are missing.
 *
 *   cd backend && npx tsx scripts/check-delivery-schema.ts
 */
import { prisma } from '../src/lib/prisma';

const COLUMNS: Array<[table: string, column: string]> = [
  ['admin_users', 'phone'],
  ['admin_users', 'nicNumber'],
  ['admin_users', 'vehicleNumber'],
  ['admin_users', 'profilePhotoUrl'],
  ['admin_users', 'licenseImageUrl'],
  ['admin_users', 'dutyStatus'],
  ['admin_users', 'pinLookup'],
  ['stores', 'deliveryOtpRequired'],
  ['delivery_jobs', 'broadcastedAt'],
];

const TABLES = [
  'driver_locations',
  'driver_shifts',
  'driver_devices',
  'delivery_attempts',
  'delivery_otps',
  'delivery_events',
  'delivery_outbox',
  'delivery_jobs',
  'delivery_job_orders',
  'admin_user_accessible_stores',
];

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>('SELECT DATABASE() AS db');
  console.log('Database:', db[0]?.db);

  const existingTables = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tableSet = new Set(existingTables.map((r) => r.TABLE_NAME));

  console.log('\n-- Tables --');
  for (const t of TABLES) {
    console.log(`${tableSet.has(t) ? 'OK     ' : 'MISSING'} ${t}`);
  }

  const existingCols = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const colSet = new Set(existingCols.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));

  console.log('\n-- Columns --');
  for (const [table, column] of COLUMNS) {
    if (!tableSet.has(table)) {
      console.log(`SKIP    ${table}.${column} (table missing)`);
      continue;
    }
    console.log(`${colSet.has(`${table}.${column}`) ? 'OK     ' : 'MISSING'} ${table}.${column}`);
  }

  console.log('\n-- Prisma migration history --');
  if (tableSet.has('_prisma_migrations')) {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
      `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`,
    );
    if (rows.length === 0) console.log('(table exists but empty)');
    rows.forEach((r) => console.log(`${r.finished_at ? 'applied' : 'PENDING/FAILED'} ${r.migration_name}`));
  } else {
    console.log('_prisma_migrations table does not exist (DB was never managed by Prisma Migrate)');
  }
}

main()
  .catch((e) => {
    console.error('CHECK_FAILED', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
