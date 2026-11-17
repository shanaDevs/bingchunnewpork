import { prisma } from './prisma';
import {
  addColumnIfMissing,
  createIndexIfMissing,
  createUniqueIndexIfMissing,
  ensureEnumTypeIfMissing,
  ensureEnumValueIfMissing,
  runtimeSchemaPatchesAllowed,
  tableExists,
} from './schemaPatch';
import { AppError } from '../middleware/errorHandler';
import { deliverySchemaTableSql, primeDeliverySqlRefs, qualifiedPhysicalTable } from './deliveryPg';
import { DELIVERY_PG_SCHEMA } from '@bingchun/db';

let deliveryJobsReady = false;
let driverComplaintsReady = false;
let driverLocationsReady = false;
let adminJobCancellationsReady = false;
let vehicleBreakdownsReady = false;

async function ensureDeliveryJobsBaseTables(): Promise<void> {
  await ensureEnumTypeIfMissing('DeliveryJobStatus', [
    'SCHEDULED',
    'ASSIGNED',
    'QUEUED',
    'IN_PROGRESS',
    'RETURNING',
    'COMPLETED',
    'CANCELLED',
    'VEHICLE_FAILURE',
  ]);

  if (!(await tableExists('delivery_jobs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "delivery_jobs" (
        "id" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "driverId" TEXT,
        "title" TEXT NOT NULL,
        "rideCode" TEXT,
        "status" "DeliveryJobStatus" NOT NULL DEFAULT 'SCHEDULED',
        "scheduledAt" TIMESTAMP(3) NOT NULL,
        "assignedAt" TIMESTAMP(3),
        "startedAt" TIMESTAMP(3),
        "returnStartedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "totalCups" INTEGER,
        "estimatedDistanceKm" DOUBLE PRECISION,
        "estimatedMinutes" INTEGER,
        "totalDistanceKm" DOUBLE PRECISION,
        "totalDeliveryFees" DECIMAL(20,4),
        "actualDistanceKm" DOUBLE PRECISION,
        "actualRoute" TEXT,
        "completedLat" DOUBLE PRECISION,
        "completedLng" DOUBLE PRECISION,
        "pickupLat" DOUBLE PRECISION,
        "pickupLng" DOUBLE PRECISION,
        "pickupLabel" TEXT,
        "riderRatingSum" INTEGER NOT NULL DEFAULT 0,
        "riderRatingCount" INTEGER NOT NULL DEFAULT 0,
        "broadcastedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "delivery_jobs_storeId_fkey"
          FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "delivery_jobs_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await createIndexIfMissing('delivery_jobs', 'delivery_jobs_storeId_status_idx', 'storeId, status');
    await createIndexIfMissing('delivery_jobs', 'delivery_jobs_driverId_status_idx', 'driverId, status');
    await createIndexIfMissing('delivery_jobs', 'delivery_jobs_status_completedAt_idx', 'status, completedAt');
  }

  if (!(await tableExists('delivery_job_orders'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "delivery_job_orders" (
        "jobId" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "sequence" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "delivery_job_orders_pkey" PRIMARY KEY ("jobId", "orderId"),
        CONSTRAINT "delivery_job_orders_jobId_fkey"
          FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "delivery_job_orders_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }
}

/** ADR 0003 / delivery-service GPS retention */
export async function ensureDriverLocationsSchema(): Promise<void> {
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
    await createIndexIfMissing(
      'driver_locations',
      'driver_locations_driverId_recordedAt_idx',
      'driverId, recordedAt',
    );
    await createIndexIfMissing(
      'driver_locations',
      'driver_locations_jobId_recordedAt_idx',
      'jobId, recordedAt',
    );
  }

  driverLocationsReady = true;
}

/** Create delivery job tables when prisma migrate/db push is unavailable. */
export async function ensureDeliveryJobsTables(): Promise<void> {
  if (deliveryJobsReady) return;

  await primeDeliverySqlRefs();
  await ensureDeliveryJobsBaseTables();

  await ensureEnumValueIfMissing('DeliveryJobStatus', 'QUEUED');
  await ensureEnumValueIfMissing('DeliveryJobStatus', 'RETURNING');
  await ensureEnumValueIfMissing('DeliveryJobStatus', 'VEHICLE_FAILURE');
  await ensureEnumValueIfMissing('DeliveryAttemptOutcome', 'VEHICLE_FAILURE');

  await addColumnIfMissing('delivery_jobs', 'totalDistanceKm', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'totalDeliveryFees', 'DECIMAL(20,4) NULL');
  await addColumnIfMissing('delivery_jobs', 'riderRatingSum', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('delivery_jobs', 'riderRatingCount', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('delivery_jobs', 'rideCode', 'TEXT NULL');
  await addColumnIfMissing('delivery_jobs', 'totalCups', 'INT NULL');
  await addColumnIfMissing('delivery_jobs', 'estimatedDistanceKm', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'estimatedMinutes', 'INT NULL');
  await addColumnIfMissing('delivery_jobs', 'returnStartedAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('delivery_jobs', 'actualDistanceKm', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'actualRoute', 'TEXT NULL');
  await addColumnIfMissing('delivery_jobs', 'completedLat', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'completedLng', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'pickupLat', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'pickupLng', 'DOUBLE PRECISION NULL');
  await addColumnIfMissing('delivery_jobs', 'pickupLabel', 'TEXT NULL');
  await addColumnIfMissing('stores', 'completionRadiusM', 'INT NULL');

  await createUniqueIndexIfMissing('delivery_jobs', 'delivery_jobs_rideCode_key', 'rideCode');

  await ensureVehicleBreakdownSchema();

  deliveryJobsReady = true;
}

export async function ensureVehicleBreakdownSchema(): Promise<void> {
  if (vehicleBreakdownsReady) return;

  const jobsRef = await deliverySchemaTableSql('delivery_jobs');
  if (!(await tableExists('vehicle_breakdowns'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${await qualifiedPhysicalTable('vehicle_breakdowns')} (
        "id" TEXT NOT NULL,
        "driverId" TEXT NOT NULL,
        "jobId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "reportedLat" DOUBLE PRECISION NOT NULL,
        "reportedLng" DOUBLE PRECISION NOT NULL,
        "note" TEXT,
        "fixedAt" TIMESTAMP(3),
        "fixedById" TEXT,
        "fixedByRole" TEXT,
        "fixedComment" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vehicle_breakdowns_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "vehicle_breakdowns_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "vehicle_breakdowns_jobId_fkey"
          FOREIGN KEY ("jobId") REFERENCES ${jobsRef}("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await createIndexIfMissing(
      'vehicle_breakdowns',
      'vehicle_breakdowns_driverId_fixedAt_idx',
      'driverId, fixedAt',
    );
    await createIndexIfMissing(
      'vehicle_breakdowns',
      'vehicle_breakdowns_storeId_reportedAt_idx',
      'storeId, reportedAt',
    );
  }

  vehicleBreakdownsReady = true;
}

async function deliveryJobStatusTypeSqlRef(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ schema: string }>>(
    `SELECT n.nspname AS schema
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'DeliveryJobStatus'
     ORDER BY CASE n.nspname WHEN $1 THEN 0 WHEN 'public' THEN 1 ELSE 2 END
     LIMIT 1`,
    DELIVERY_PG_SCHEMA,
  );
  const schema = rows[0]?.schema ?? DELIVERY_PG_SCHEMA;
  return `"${schema.replace(/"/g, '""')}"."DeliveryJobStatus"`;
}

/** HQ audit rows for admin-closed delivery jobs (migration 20261107150000). */
export async function ensureDeliveryJobAdminCancellationsSchema(): Promise<void> {
  if (adminJobCancellationsReady) return;

  if (await tableExists('delivery_job_admin_cancellations')) {
    adminJobCancellationsReady = true;
    return;
  }

  if (!runtimeSchemaPatchesAllowed()) {
    throw new AppError(
      'delivery_job_admin_cancellations table is missing. Apply Prisma migration 20261107150000.',
      503,
    );
  }

  await primeDeliverySqlRefs();
  await ensureDeliveryJobsTables();

  if (await tableExists('delivery_job_admin_cancellations')) {
    adminJobCancellationsReady = true;
    return;
  }

  const jobsRef = await qualifiedPhysicalTable('delivery_jobs');
  const tableRef = deliverySchemaTableSql('delivery_job_admin_cancellations');
  const statusTypeRef = await deliveryJobStatusTypeSqlRef();
  const deliverySchema = DELIVERY_PG_SCHEMA.replace(/"/g, '""');

  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${deliverySchema}"`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${tableRef} (
      "id" TEXT PRIMARY KEY,
      "jobId" TEXT NOT NULL,
      "cancelledByAdminId" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "meritDelta" INTEGER,
      "previousJobStatus" ${statusTypeRef} NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "delivery_job_admin_cancellations_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES ${jobsRef}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "delivery_job_admin_cancellations_cancelledByAdminId_fkey"
        FOREIGN KEY ("cancelledByAdminId") REFERENCES public."admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await createIndexIfMissing(
    'delivery_job_admin_cancellations',
    'delivery_job_admin_cancellations_jobId_createdAt_idx',
    'jobId, createdAt',
  );
  await createIndexIfMissing(
    'delivery_job_admin_cancellations',
    'delivery_job_admin_cancellations_cancelledByAdminId_createdAt_idx',
    'cancelledByAdminId, createdAt',
  );

  adminJobCancellationsReady = true;
}

/** Driver complaint table from migration 20260822010000_driver_hardening. */
export async function ensureDriverComplaintsSchema(): Promise<void> {
  if (driverComplaintsReady) return;

  await ensureEnumTypeIfMissing('DriverComplaintStatus', ['OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED']);

  if (!(await tableExists('driver_complaints'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "driver_complaints" (
        "id" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "driverId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "status" "DriverComplaintStatus" NOT NULL DEFAULT 'OPEN',
        "resolvedAt" TIMESTAMP(3),
        "resolvedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "driver_complaints_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "driver_complaints_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "driver_complaints_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }

  await createIndexIfMissing('driver_complaints', 'driver_complaints_orderId_idx', 'orderId');
  await createIndexIfMissing('driver_complaints', 'driver_complaints_driverId_createdAt_idx', 'driverId, createdAt');
  await createIndexIfMissing('driver_complaints', 'driver_complaints_storeId_status_createdAt_idx', 'storeId, status, createdAt');

  driverComplaintsReady = true;
}

let driverBranchRequestsReady = false;
let deliveryOutboxReady = false;

/** ADR 0003 — transactional outbox for delivery → core order status updates. */
export async function ensureDeliveryOutboxSchema(): Promise<void> {
  if (deliveryOutboxReady) return;

  if (!(await tableExists('delivery_outbox'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "delivery_outbox" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "idempotencyKey" TEXT NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deliveredAt" TIMESTAMP(3),
        "lastError" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "delivery_outbox_pkey" PRIMARY KEY ("id")
      )
    `);
  }

  await createUniqueIndexIfMissing(
    'delivery_outbox',
    'delivery_outbox_idempotencyKey_key',
    'idempotencyKey',
  );
  await createIndexIfMissing(
    'delivery_outbox',
    'delivery_outbox_deliveredAt_nextRetryAt_idx',
    'deliveredAt, nextRetryAt',
  );

  deliveryOutboxReady = true;
}

/** Driver branch request table + REMOVE_BRANCH enum (QA #12). */
export async function ensureDriverBranchRequestsSchema(): Promise<void> {
  if (driverBranchRequestsReady) return;

  await ensureEnumTypeIfMissing('DriverBranchRequestType', ['ADD_BRANCH', 'CHANGE_BRANCH', 'REMOVE_BRANCH']);
  await ensureEnumValueIfMissing('DriverBranchRequestType', 'REMOVE_BRANCH');
  await ensureEnumTypeIfMissing('DriverBranchRequestStatus', ['PENDING', 'APPROVED', 'REJECTED']);

  if (!(await tableExists('driver_branch_requests'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "driver_branch_requests" (
        "id" TEXT NOT NULL,
        "driverId" TEXT NOT NULL,
        "type" "DriverBranchRequestType" NOT NULL,
        "fromStoreId" TEXT,
        "toStoreId" TEXT NOT NULL,
        "reason" TEXT,
        "status" "DriverBranchRequestStatus" NOT NULL DEFAULT 'PENDING',
        "reviewedById" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "reviewNote" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "driver_branch_requests_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "driver_branch_requests_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }

  await createIndexIfMissing(
    'driver_branch_requests',
    'driver_branch_requests_driverId_status_idx',
    'driverId, status',
  );
  await createIndexIfMissing(
    'driver_branch_requests',
    'driver_branch_requests_status_createdAt_idx',
    'status, createdAt',
  );

  driverBranchRequestsReady = true;
}

let riderRatingsReady = false;

/** Per-order rider ratings (Prisma `RiderRating` / `rider_ratings`). */
export async function ensureRiderRatingsSchema(): Promise<void> {
  if (riderRatingsReady) return;

  if (!(await tableExists('rider_ratings'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "rider_ratings" (
        "id" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "driverId" TEXT NOT NULL,
        "userId" TEXT,
        "stars" INTEGER NOT NULL,
        "comment" VARCHAR(500),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "rider_ratings_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "rider_ratings_orderId_fkey"
          FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "rider_ratings_driverId_fkey"
          FOREIGN KEY ("driverId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "rider_ratings_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
  }

  await createUniqueIndexIfMissing('rider_ratings', 'rider_ratings_orderId_key', 'orderId');
  await createIndexIfMissing('rider_ratings', 'rider_ratings_driverId_idx', 'driverId');

  riderRatingsReady = true;
}
