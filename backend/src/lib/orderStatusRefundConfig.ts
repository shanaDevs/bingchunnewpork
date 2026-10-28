import { randomUUID } from 'crypto';
import type { OrderStatus } from '@prisma/client';
import { prisma } from './prisma';
import { addColumnIfMissing, columnUdtName, tableExists } from './schemaPatch';

export type OrderStatusRefundConfigRow = {
  id: string;
  orderStatus: OrderStatus;
  refundPercentage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  'RECEIVED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export const DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES: Array<{
  orderStatus: OrderStatus;
  refundPercentage: number;
}> = [
  { orderStatus: 'RECEIVED', refundPercentage: 100 },
  { orderStatus: 'PREPARING', refundPercentage: 80 },
  { orderStatus: 'READY', refundPercentage: 60 },
  { orderStatus: 'OUT_FOR_DELIVERY', refundPercentage: 40 },
];

let orderStatusRefundSchemaReady = false;
let orderStatusRefundUsesRawSql = false;
let orderStatusColumnUdt: string | null = null;

function orderStatusSqlParam(index: number): string {
  if (orderStatusColumnUdt === 'text') return `$${index}`;
  return `$${index}::"OrderStatus"`;
}

async function ensureOrderStatusEnumColumns(): Promise<void> {
  try {
    if (await tableExists('order_status_refund_configs')) {
      const orderStatusType = await columnUdtName('order_status_refund_configs', 'orderStatus');
      if (orderStatusType === 'text') {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "order_status_refund_configs"
          ALTER COLUMN "orderStatus" TYPE "OrderStatus"
          USING "orderStatus"::"OrderStatus"
        `);
      }
    }

    if (await tableExists('refunds')) {
      const cancelledAtStatusType = await columnUdtName('refunds', 'cancelledAtStatus');
      if (cancelledAtStatusType === 'text') {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "refunds"
          ALTER COLUMN "cancelledAtStatus" TYPE "OrderStatus"
          USING NULLIF("cancelledAtStatus", '')::"OrderStatus"
        `);
      }
    }
  } catch (err) {
    console.warn('[orderStatusRefundConfig] Could not migrate OrderStatus columns; using raw SQL fallback.', err);
  }
}

async function refreshOrderStatusRefundStorageMode(): Promise<void> {
  const delegate = orderStatusRefundDelegate();
  if (!delegate || !(await tableExists('order_status_refund_configs'))) {
    orderStatusRefundUsesRawSql = true;
    return;
  }

  const orderStatusType = await columnUdtName('order_status_refund_configs', 'orderStatus');
  orderStatusColumnUdt = orderStatusType;
  orderStatusRefundUsesRawSql = orderStatusType === 'text';
}

function shouldUseOrderStatusRefundRawSql(): boolean {
  return orderStatusRefundUsesRawSql || !orderStatusRefundDelegate();
}

type OrderStatusRefundDelegate = {
  count: () => Promise<number>;
  create: (args: { data: Record<string, unknown> }) => Promise<OrderStatusRefundConfigRow>;
  findMany: (args?: Record<string, unknown>) => Promise<OrderStatusRefundConfigRow[]>;
  findUnique: (args: { where: { id?: string; orderStatus?: OrderStatus } }) => Promise<OrderStatusRefundConfigRow | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<OrderStatusRefundConfigRow>;
};

function orderStatusRefundDelegate(): OrderStatusRefundDelegate | undefined {
  return (prisma as unknown as { orderStatusRefundConfig?: OrderStatusRefundDelegate }).orderStatusRefundConfig;
}

function mapOrderStatusRefundRow(row: Record<string, unknown>): OrderStatusRefundConfigRow {
  return {
    id: String(row.id),
    orderStatus: String(row.orderStatus) as OrderStatus,
    refundPercentage: Number(row.refundPercentage),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(String(row.updatedAt)),
  };
}

export async function ensureOrderStatusRefundSchema(): Promise<void> {
  if (orderStatusRefundSchemaReady) return;

  await addColumnIfMissing('refunds', 'cancelledAtStatus', '"OrderStatus" NULL');
  await addColumnIfMissing('refunds', 'configuredStatusRefundPercentage', 'DOUBLE PRECISION NULL');

  if (!(await tableExists('order_status_refund_configs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "order_status_refund_configs" (
        "id" TEXT NOT NULL,
        "orderStatus" "OrderStatus" NOT NULL,
        "refundPercentage" DOUBLE PRECISION NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "order_status_refund_configs_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "order_status_refund_configs_orderStatus_key"
      ON "order_status_refund_configs"("orderStatus")
    `);
  }

  await ensureOrderStatusEnumColumns();
  await refreshOrderStatusRefundStorageMode();

  await seedDefaultOrderStatusRefundConfigs();
  orderStatusRefundSchemaReady = true;
}

export async function seedDefaultOrderStatusRefundConfigs(): Promise<void> {
  const delegate = orderStatusRefundDelegate();
  if (delegate && !shouldUseOrderStatusRefundRawSql()) {
    const count = await delegate.count();
    if (count > 0) return;
    for (const config of DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES) {
      await delegate.create({
        data: {
          id: randomUUID(),
          orderStatus: config.orderStatus,
          refundPercentage: config.refundPercentage,
          isActive: true,
        },
      });
    }
    return;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT COUNT(*)::int AS n FROM "order_status_refund_configs"`,
  );
  if (Number(rows[0]?.n ?? 0) > 0) return;

  for (const config of DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "order_status_refund_configs"
        ("id", "orderStatus", "refundPercentage", "isActive", "createdAt", "updatedAt")
       VALUES ($1, ${orderStatusSqlParam(2)}, $3, true, NOW(), NOW())
       ON CONFLICT ("orderStatus") DO NOTHING`,
      randomUUID(),
      config.orderStatus,
      config.refundPercentage,
    );
  }
}

export async function getAllOrderStatusRefundConfigs(): Promise<OrderStatusRefundConfigRow[]> {
  await ensureOrderStatusRefundSchema();
  const delegate = orderStatusRefundDelegate();
  if (delegate && !shouldUseOrderStatusRefundRawSql()) {
    return delegate.findMany({
      orderBy: [{ orderStatus: 'asc' }],
    });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "order_status_refund_configs" ORDER BY "orderStatus" ASC`,
  );
  return rows.map(mapOrderStatusRefundRow);
}

export async function getOrderStatusRefundConfigByStatus(
  orderStatus: OrderStatus,
): Promise<OrderStatusRefundConfigRow | null> {
  await ensureOrderStatusRefundSchema();
  const delegate = orderStatusRefundDelegate();
  if (delegate && !shouldUseOrderStatusRefundRawSql()) {
    return delegate.findUnique({ where: { orderStatus } });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "order_status_refund_configs" WHERE "orderStatus" = ${orderStatusSqlParam(1)} LIMIT 1`,
    orderStatus,
  );
  return rows[0] ? mapOrderStatusRefundRow(rows[0]) : null;
}

export async function getRefundPercentageForStatus(orderStatus: string): Promise<number> {
  const normalized = orderStatus as OrderStatus;
  const config = await getOrderStatusRefundConfigByStatus(normalized);
  if (config?.isActive) return config.refundPercentage;

  const fallback = DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES.find(
    (entry) => entry.orderStatus === normalized,
  );
  return fallback?.refundPercentage ?? 100;
}

export async function getOrderStatusRefundPercentageMap(): Promise<Map<OrderStatus, number>> {
  const configs = await getAllOrderStatusRefundConfigs();
  const map = new Map<OrderStatus, number>();

  for (const config of configs) {
    if (config.isActive) {
      map.set(config.orderStatus, config.refundPercentage);
    }
  }

  for (const fallback of DEFAULT_ORDER_STATUS_REFUND_PERCENTAGES) {
    if (!map.has(fallback.orderStatus)) {
      map.set(fallback.orderStatus, fallback.refundPercentage);
    }
  }

  return map;
}

export function assertCancellableOrderStatus(orderStatus: string): OrderStatus {
  if (!CANCELLABLE_ORDER_STATUSES.includes(orderStatus as OrderStatus)) {
    throw new Error('Invalid order status for refund configuration');
  }
  return orderStatus as OrderStatus;
}

export async function upsertOrderStatusRefundConfig(
  orderStatus: OrderStatus,
  data: { refundPercentage: number; isActive?: boolean },
): Promise<OrderStatusRefundConfigRow> {
  await ensureOrderStatusRefundSchema();
  assertCancellableOrderStatus(orderStatus);

  if (data.refundPercentage < 0 || data.refundPercentage > 100) {
    throw new Error('Refund percentage must be between 0 and 100');
  }

  const existing = await getOrderStatusRefundConfigByStatus(orderStatus);
  const delegate = orderStatusRefundDelegate();

  if (existing) {
    if (delegate && !shouldUseOrderStatusRefundRawSql()) {
      return delegate.update({
        where: { id: existing.id },
        data: {
          refundPercentage: data.refundPercentage,
          ...(data.isActive != null ? { isActive: data.isActive } : {}),
        },
      });
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "order_status_refund_configs"
       SET "refundPercentage" = $1,
           "isActive" = COALESCE($2, "isActive"),
           "updatedAt" = NOW()
       WHERE "id" = $3`,
      data.refundPercentage,
      data.isActive ?? null,
      existing.id,
    );
    const updated = await getOrderStatusRefundConfigByStatus(orderStatus);
    if (!updated) throw new Error('Failed to update order status refund config');
    return updated;
  }

  if (delegate && !shouldUseOrderStatusRefundRawSql()) {
    return delegate.create({
      data: {
        orderStatus,
        refundPercentage: data.refundPercentage,
        isActive: data.isActive ?? true,
      },
    });
  }

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "order_status_refund_configs"
      ("id", "orderStatus", "refundPercentage", "isActive", "createdAt", "updatedAt")
     VALUES ($1, ${orderStatusSqlParam(2)}, $3, $4, NOW(), NOW())`,
    id,
    orderStatus,
    data.refundPercentage,
    data.isActive ?? true,
  );
  const created = await getOrderStatusRefundConfigByStatus(orderStatus);
  if (!created) throw new Error('Failed to create order status refund config');
  return created;
}
