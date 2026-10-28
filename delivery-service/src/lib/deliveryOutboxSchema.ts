import { prisma } from '@bingchun/db';

let ready = false;

/** Mirrors backend ensureDeliveryOutboxSchema — delivery service runs without backend boot patches. */
export async function ensureDeliveryOutboxSchema(): Promise<void> {
  if (ready) return;

  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'delivery_outbox'
     ) AS exists`,
  );
  if (!rows[0]?.exists) {
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
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "delivery_outbox_idempotencyKey_key" ON "delivery_outbox" ("idempotencyKey")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "delivery_outbox_deliveredAt_nextRetryAt_idx" ON "delivery_outbox" ("deliveredAt", "nextRetryAt")`,
    );
  }

  ready = true;
}
