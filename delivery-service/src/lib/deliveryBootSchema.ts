import { prisma } from '@bingchun/db';
import { ensureDeliveryOutboxSchema } from './deliveryOutboxSchema';

let driverLocationsReady = false;

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = '${name.replace(/'/g, "''")}'
     ) AS exists`,
  );
  return Boolean(rows[0]?.exists);
}

async function ensureDriverLocationsSchema(): Promise<void> {
  if (driverLocationsReady) return;
  if (!(await tableExists('driver_locations'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "driver_locations" (
        "id" TEXT NOT NULL,
        "driverId" TEXT NOT NULL,
        "jobId" TEXT,
        "lat" DOUBLE PRECISION NOT NULL,
        "lng" DOUBLE PRECISION NOT NULL,
        "accuracyM" DOUBLE PRECISION,
        "speedKph" DOUBLE PRECISION,
        "heading" DOUBLE PRECISION,
        "batteryPct" INTEGER,
        "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "driver_locations_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "driver_locations_driverId_recordedAt_idx" ON "driver_locations" ("driverId", "recordedAt")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "driver_locations_jobId_recordedAt_idx" ON "driver_locations" ("jobId", "recordedAt")`,
    );
  }
  driverLocationsReady = true;
}

/** Tables the delivery service reads/writes that may be missing on unmigrated dev DBs. */
export async function ensureDeliveryBootSchema(): Promise<void> {
  await ensureDeliveryOutboxSchema();
  await ensureDriverLocationsSchema();
}
