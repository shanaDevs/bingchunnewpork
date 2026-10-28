import { prisma } from './prisma';
import { addColumnIfMissing, createIndexIfMissing, ensureEnumTypeIfMissing } from './schemaPatch';
import { cancelReservationsForOrder } from '../repositories/inventoryReservationRepository';
import { generateTrackToken } from './orderAccess';
import { reverseOrderPlacementSideEffects } from './orderPlacementReversal';

let orderDeliveryColumnsReady = false;

/** Add delivery snapshot columns when prisma db push is unavailable (MariaDB). Boot-only. */
export async function ensureOrderDeliveryColumns(): Promise<void> {
  if (orderDeliveryColumnsReady) return;

  await addColumnIfMissing('orders', 'deliveryAddressLine', 'VARCHAR(191) NULL');
  await addColumnIfMissing('orders', 'deliveryCity', 'VARCHAR(191) NULL');
  await addColumnIfMissing('orders', 'deliveryDistrict', 'VARCHAR(191) NULL');
  await addColumnIfMissing('orders', 'deliveryLat', 'DOUBLE NULL');
  await addColumnIfMissing('orders', 'deliveryLng', 'DOUBLE NULL');
  await addColumnIfMissing('orders', 'onlineChargeAmount', 'INT NULL');
  await addColumnIfMissing('orders', 'cashReceivedAmount', 'INT NULL');
  await addColumnIfMissing('orders', 'changeGivenAmount', 'INT NULL');
  await addColumnIfMissing('orders', 'paymentFailureReason', 'TEXT NULL');
  await ensureEnumTypeIfMissing('PaymentGateway', ['PAYHERE', 'WEBXPAY']);
  await addColumnIfMissing('orders', 'paymentGateway', '"PaymentGateway" NULL');
  await addColumnIfMissing('orders', 'cancelWindowStartsAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('orders', 'cancelledAtStatus', '"OrderStatus" NULL');
  // Backfill cancel-status snapshot (same logic as migration 20260910140000).
  await prisma.$executeRawUnsafe(`
    UPDATE "orders" o
    SET "cancelledAtStatus" = r."cancelledAtStatus"
    FROM "refunds" r
    WHERE r."orderId" = o.id
      AND o.status = 'CANCELLED'
      AND o."cancelledAtStatus" IS NULL
      AND r."cancelledAtStatus" IS NOT NULL
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "orders" o
    SET "cancelledAtStatus" = 'OUT_FOR_DELIVERY'
    WHERE o.status = 'CANCELLED'
      AND o."cancelledAtStatus" IS NULL
      AND EXISTS (
        SELECT 1 FROM "order_status_events" e
        WHERE e."orderId" = o.id AND e.status = 'OUT_FOR_DELIVERY'
      )
  `);
  await addColumnIfMissing('orders', 'trackToken', 'VARCHAR(64) NULL');
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "orders_trackToken_key" ON "orders" ("trackToken") WHERE "trackToken" IS NOT NULL`,
  );
  await addColumnIfMissing('orders', 'idempotencyKey', 'VARCHAR(128) NULL');
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotencyKey_key" ON "orders" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "orders_paymentRef_key" ON "orders" ("paymentRef") WHERE "paymentRef" IS NOT NULL`,
  );
  await addColumnIfMissing('orders', 'processedByAdminId', 'TEXT NULL');
  await addColumnIfMissing('orders', 'processedByName', 'TEXT NULL');
  await addColumnIfMissing('orders', 'processedAt', 'TIMESTAMP(3) NULL');
  await addColumnIfMissing('order_status_events', 'actorAdminId', 'TEXT NULL');
  await addColumnIfMissing('order_status_events', 'actorName', 'TEXT NULL');
  await addColumnIfMissing('order_status_events', 'actorRole', 'TEXT NULL');
  await createIndexIfMissing(
    'orders',
    'orders_storeId_processedByAdminId_createdAt_idx',
    'storeId, processedByAdminId, createdAt',
  );
  await createIndexIfMissing(
    'order_status_events',
    'order_status_events_actorAdminId_idx',
    'actorAdminId',
  );

  // Backfill track tokens for legacy orders missing one (loop until complete).
  for (;;) {
    const missing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "orders" WHERE "trackToken" IS NULL LIMIT 500`,
    );
    if (!missing.length) break;
    for (const row of missing) {
      const token = generateTrackToken();
      await prisma.$executeRawUnsafe(
        `UPDATE "orders" SET "trackToken" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "trackToken" IS NULL`,
        token,
        row.id,
      );
    }
  }

  orderDeliveryColumnsReady = true;
}

/** Stamp cancel-window start when an order is first confirmed (paid online or cash at counter). */
export async function stampCancelWindowStart(orderId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "orders"
     SET "cancelWindowStartsAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $1 AND "cancelWindowStartsAt" IS NULL`,
    orderId,
  );
}

export async function getCancelWindowStartsAt(orderId: string): Promise<Date | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cancelWindowStartsAt: Date | null }>>(
    `SELECT "cancelWindowStartsAt" FROM "orders" WHERE "id" = $1 LIMIT 1`,
    orderId,
  );
  return rows[0]?.cancelWindowStartsAt ?? null;
}

export async function getCancelWindowStartsAtMap(orderIds: string[]): Promise<Map<string, Date | null>> {
  if (orderIds.length === 0) return new Map();
  const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; cancelWindowStartsAt: Date | null }>>(
    `SELECT "id", "cancelWindowStartsAt" FROM "orders" WHERE "id" IN (${placeholders})`,
    ...orderIds,
  );
  return new Map(rows.map((row) => [row.id, row.cancelWindowStartsAt]));
}

export async function setOrderPaymentFailed(orderId: string, reason: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "orders" SET "paymentStatus" = 'FAILED', "paymentFailureReason" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`,
    reason,
    orderId,
  );
}

/** Cancel unpaid online orders after gateway payment failure — order was never confirmed. */
export async function cancelOrderOnPaymentFailure(orderId: string, reason: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "orders"
     SET "paymentStatus" = 'FAILED',
         "paymentFailureReason" = $1,
         "status" = 'CANCELLED',
         "cancelReason" = 'PAYMENT_OR_SYSTEM_ISSUE',
         "cancelledBy" = 'payment-gateway',
         "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $2 AND "paymentStatus" <> 'PAID'`,
    reason,
    orderId,
  );
  await cancelReservationsForOrder(orderId).catch(() => undefined);
  await reverseOrderPlacementSideEffects(orderId).catch(() => undefined);
}

export async function clearOrderPaymentFailure(orderId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "orders" SET "paymentFailureReason" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
    orderId,
  );
}

export async function getOrderPaymentFailureReason(orderIdOrNumber: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ paymentFailureReason: string | null }>>(
    `SELECT "paymentFailureReason" FROM "orders" WHERE "id" = $1 OR "orderNumber" = $2 LIMIT 1`,
    orderIdOrNumber,
    orderIdOrNumber,
  );
  const reason = rows[0]?.paymentFailureReason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}
