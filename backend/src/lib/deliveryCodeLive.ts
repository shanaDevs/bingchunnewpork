import { deliveryTableSql } from '@bingchun/db';
import { prisma } from './prisma';
import { qualifiedPhysicalTable } from './deliveryPg';

let ensured = false;
let codeLiveTableRef: string | null = null;

async function codeLiveTable(): Promise<string> {
  if (!codeLiveTableRef) {
    codeLiveTableRef = await qualifiedPhysicalTable('delivery_code_live');
  }
  return codeLiveTableRef;
}

/** Short-lived plaintext cache so the public track page can show the code even if the socket event was missed. */
export async function ensureDeliveryCodeLiveTable(): Promise<void> {
  if (ensured) return;
  const table = await codeLiveTable();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${table} (
      "orderId" VARCHAR(191) PRIMARY KEY,
      "orderNumber" VARCHAR(191) NOT NULL,
      "code" VARCHAR(8) NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS delivery_code_live_orderNumber_idx
    ON ${table} ("orderNumber")
  `);
  ensured = true;
}

export async function upsertDeliveryCodeLive(input: {
  orderId: string;
  orderNumber: string;
  code: string;
  expiresAt: Date;
}): Promise<void> {
  await ensureDeliveryCodeLiveTable();
  const table = await codeLiveTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${table} ("orderId", "orderNumber", "code", "expiresAt")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("orderId") DO UPDATE SET
       "code" = EXCLUDED."code",
       "orderNumber" = EXCLUDED."orderNumber",
       "expiresAt" = EXCLUDED."expiresAt",
       "updatedAt" = CURRENT_TIMESTAMP`,
    input.orderId,
    input.orderNumber,
    input.code,
    input.expiresAt,
  );
}

export async function getLiveDeliveryCode(orderId: string): Promise<string | null> {
  await ensureDeliveryCodeLiveTable();
  const table = await codeLiveTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM ${table}
     WHERE "orderId" = $1 AND "expiresAt" > $2
     LIMIT 1`,
    orderId,
    new Date(),
  );
  return rows[0]?.code ?? null;
}

export async function clearLiveDeliveryCode(orderId: string): Promise<void> {
  await ensureDeliveryCodeLiveTable();
  const table = await codeLiveTable();
  await prisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE "orderId" = $1`, orderId);
}

/** Target schema for new installs (post delivery-schema migration). */
export function deliveryCodeLiveTableForMigration(): string {
  return deliveryTableSql('delivery_code_live');
}
