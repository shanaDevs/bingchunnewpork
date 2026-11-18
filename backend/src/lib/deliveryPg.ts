import { DELIVERY_PG_SCHEMA, deliveryTableSql } from '@bingchun/db';
import { prisma } from './prisma';

/** Physical tables that may live in `public` (pre-migration) or `delivery` (post-migration). */
export const DELIVERY_PHYSICAL_TABLES = new Set([
  'delivery_zones',
  'rider_ratings',
  'delivery_jobs',
  'delivery_job_orders',
  'delivery_payouts',
  'delivery_payout_due_reviews',
  'delivery_access_logs',
  'driver_locations',
  'driver_shifts',
  'driver_devices',
  'delivery_attempts',
  'delivery_otps',
  'delivery_events',
  'delivery_outbox',
  'delivery_job_rejections',
  'delivery_job_admin_cancellations',
  'driver_complaints',
  'driver_branch_requests',
  'merit_point_history',
  'delivery_code_live',
  'rider_profiles',
  'vehicle_breakdowns',
]);

const tableRefCache = new Map<string, string>();

let payoutsSqlRef = '"delivery_payouts"';
let jobsSqlRef = '"delivery_jobs"';
let zonesSqlRef = '"delivery_zones"';

export function getDeliveryPayoutsSqlRef(): string {
  return payoutsSqlRef;
}

export function getDeliveryJobsSqlRef(): string {
  return jobsSqlRef;
}

export function getDeliveryZonesSqlRef(): string {
  return zonesSqlRef;
}

/** Resolve physical table names for raw SQL (safe before/after schema migration). */
export async function primeDeliverySqlRefs(): Promise<void> {
  payoutsSqlRef = await qualifiedPhysicalTable('delivery_payouts');
  jobsSqlRef = await qualifiedPhysicalTable('delivery_jobs');
  zonesSqlRef = await qualifiedPhysicalTable('delivery_zones');
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Resolve schema-qualified table for raw SQL (works before and after schema migration). */
export async function qualifiedPhysicalTable(tableName: string): Promise<string> {
  const cached = tableRefCache.get(tableName);
  if (cached) return cached;

  if (!DELIVERY_PHYSICAL_TABLES.has(tableName)) {
    const ref = quoteIdent(tableName);
    tableRefCache.set(tableName, ref);
    return ref;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ table_schema: string }>>(
    `SELECT table_schema FROM information_schema.tables
     WHERE table_name = $1
       AND table_schema IN ('public', $2)
     ORDER BY CASE table_schema WHEN $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    tableName,
    DELIVERY_PG_SCHEMA,
  );

  const schema = rows[0]?.table_schema ?? DELIVERY_PG_SCHEMA;
  const ref = `"${schema.replace(/"/g, '""')}"."${tableName.replace(/"/g, '""')}"`;
  tableRefCache.set(tableName, ref);
  return ref;
}

export function invalidatePhysicalTableCache(tableName: string): void {
  tableRefCache.delete(tableName);
}

/** Post-migration target schema (for CREATE TABLE when table does not exist yet). */
export function deliverySchemaTableSql(tableName: string): string {
  return deliveryTableSql(tableName);
}
