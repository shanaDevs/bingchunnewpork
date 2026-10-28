import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { addColumnIfMissing, tableExists } from './schemaPatch';

export type CancelReasonConfigRow = {
  id: string;
  label: string;
  value: string;
  minRefundPercentage: number;
  maxRefundPercentage: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export const DEFAULT_CANCEL_REASONS = [
  { label: 'Changed my mind', value: 'CHANGED_MIND', minRefundPercentage: 80, maxRefundPercentage: 100, sortOrder: 1 },
  { label: 'Ordered by mistake', value: 'ORDERED_BY_MISTAKE', minRefundPercentage: 80, maxRefundPercentage: 100, sortOrder: 2 },
  { label: 'Taking too long', value: 'TAKING_TOO_LONG', minRefundPercentage: 70, maxRefundPercentage: 90, sortOrder: 3 },
  { label: 'Found a better price elsewhere', value: 'FOUND_CHEAPER_ELSEWHERE', minRefundPercentage: 70, maxRefundPercentage: 90, sortOrder: 4 },
  { label: 'Payment issues', value: 'PAYMENT_ISSUES', minRefundPercentage: 80, maxRefundPercentage: 100, sortOrder: 5 },
  { label: 'Other (please specify)', value: 'OTHER', minRefundPercentage: 60, maxRefundPercentage: 100, sortOrder: 6 },
] as const;

export const OTHER_CANCEL_REASON_VALUE = 'OTHER';

let cancelReasonSchemaReady = false;

type CancelReasonDelegate = {
  count: () => Promise<number>;
  create: (args: { data: Record<string, unknown> }) => Promise<CancelReasonConfigRow>;
  findMany: (args?: Record<string, unknown>) => Promise<CancelReasonConfigRow[]>;
  findUnique: (args: { where: { id?: string; value?: string } }) => Promise<CancelReasonConfigRow | null>;
  findFirst: (args: Record<string, unknown>) => Promise<CancelReasonConfigRow | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<CancelReasonConfigRow>;
};

function cancelReasonDelegate(): CancelReasonDelegate | undefined {
  return (prisma as unknown as { cancelReasonConfig?: CancelReasonDelegate }).cancelReasonConfig;
}

function mapCancelReasonRow(row: Record<string, unknown>): CancelReasonConfigRow {
  return {
    id: String(row.id),
    label: String(row.label),
    value: String(row.value),
    minRefundPercentage: Number(row.minRefundPercentage),
    maxRefundPercentage: Number(row.maxRefundPercentage),
    isActive: Boolean(row.isActive),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(String(row.updatedAt)),
  };
}

async function ensureRefundCancellationReasonIsText(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ udt_name: string }>>(
    `SELECT udt_name FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'refunds'
       AND column_name = 'cancellationReason'
     LIMIT 1`,
  );
  if (rows[0]?.udt_name === 'CancellationReason') {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "refunds" ALTER COLUMN "cancellationReason" TYPE TEXT USING "cancellationReason"::TEXT`,
    );
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "CancellationReason"`);
  }
}

export async function ensureCancelReasonSchema(): Promise<void> {
  if (cancelReasonSchemaReady) return;

  await addColumnIfMissing('app_settings', 'cancelWindowMinutes', 'INT NOT NULL DEFAULT 10');
  await addColumnIfMissing('refunds', 'cancelReasonConfigId', 'TEXT NULL');
  await addColumnIfMissing('refunds', 'configuredMinPercentage', 'DOUBLE NULL');
  await addColumnIfMissing('refunds', 'configuredMaxPercentage', 'DOUBLE NULL');
  await addColumnIfMissing('refunds', 'exceededRange', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfMissing('refunds', 'exceededRangeReason', 'TEXT NULL');
  await ensureRefundCancellationReasonIsText();

  if (!(await tableExists('cancel_reason_configs'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "cancel_reason_configs" (
        "id" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "minRefundPercentage" DOUBLE PRECISION NOT NULL,
        "maxRefundPercentage" DOUBLE PRECISION NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "cancel_reason_configs_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "cancel_reason_configs_value_key"
      ON "cancel_reason_configs"("value")
    `);
  }

  await seedDefaultCancelReasons();
  cancelReasonSchemaReady = true;
}

export async function seedDefaultCancelReasons(): Promise<void> {
  const delegate = cancelReasonDelegate();
  if (delegate) {
    const count = await delegate.count();
    if (count > 0) return;
    for (const reason of DEFAULT_CANCEL_REASONS) {
      await delegate.create({
        data: {
          id: randomUUID(),
          label: reason.label,
          value: reason.value,
          minRefundPercentage: reason.minRefundPercentage,
          maxRefundPercentage: reason.maxRefundPercentage,
          sortOrder: reason.sortOrder,
          isActive: true,
        },
      });
    }
    return;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
    `SELECT COUNT(*)::int AS n FROM "cancel_reason_configs"`,
  );
  if (Number(rows[0]?.n ?? 0) > 0) return;

  for (const reason of DEFAULT_CANCEL_REASONS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "cancel_reason_configs"
        ("id", "label", "value", "minRefundPercentage", "maxRefundPercentage", "isActive", "sortOrder", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
       ON CONFLICT ("value") DO NOTHING`,
      randomUUID(),
      reason.label,
      reason.value,
      reason.minRefundPercentage,
      reason.maxRefundPercentage,
      reason.sortOrder,
    );
  }
}

export async function getActiveCancelReasons(): Promise<CancelReasonConfigRow[]> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "cancel_reason_configs" WHERE "isActive" = true ORDER BY "sortOrder" ASC, "label" ASC`,
  );
  return rows.map(mapCancelReasonRow);
}

export async function getAllCancelReasons(): Promise<CancelReasonConfigRow[]> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "cancel_reason_configs" ORDER BY "sortOrder" ASC, "label" ASC`,
  );
  return rows.map(mapCancelReasonRow);
}

export async function getCancelReasonByValue(value: string): Promise<CancelReasonConfigRow | null> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.findUnique({ where: { value } });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "cancel_reason_configs" WHERE "value" = $1 LIMIT 1`,
    value,
  );
  return rows[0] ? mapCancelReasonRow(rows[0]) : null;
}

export async function getCancelReasonById(id: string): Promise<CancelReasonConfigRow | null> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.findUnique({ where: { id } });
  }
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "cancel_reason_configs" WHERE "id" = $1 LIMIT 1`,
    id,
  );
  return rows[0] ? mapCancelReasonRow(rows[0]) : null;
}

export async function createCancelReasonRow(data: {
  label: string;
  value: string;
  minRefundPercentage: number;
  maxRefundPercentage: number;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<CancelReasonConfigRow> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.create({
      data: {
        label: data.label,
        value: data.value,
        minRefundPercentage: data.minRefundPercentage,
        maxRefundPercentage: data.maxRefundPercentage,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "cancel_reason_configs"
      ("id", "label", "value", "minRefundPercentage", "maxRefundPercentage", "isActive", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    id,
    data.label,
    data.value,
    data.minRefundPercentage,
    data.maxRefundPercentage,
    data.isActive ?? true,
    data.sortOrder ?? 0,
  );
  const created = await getCancelReasonById(id);
  if (!created) throw new Error('Failed to create cancellation reason');
  return created;
}

export async function updateCancelReasonRow(
  id: string,
  data: Partial<{
    label: string;
    value: string;
    minRefundPercentage: number;
    maxRefundPercentage: number;
    isActive: boolean;
    sortOrder: number;
  }>,
): Promise<CancelReasonConfigRow> {
  await ensureCancelReasonSchema();
  const delegate = cancelReasonDelegate();
  if (delegate) {
    return delegate.update({ where: { id }, data });
  }
  const sets: string[] = ['"updatedAt" = NOW()'];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`"${column}" = $${params.length}`);
  };
  if (data.label != null) push('label', data.label);
  if (data.value != null) push('value', data.value);
  if (data.minRefundPercentage != null) push('minRefundPercentage', data.minRefundPercentage);
  if (data.maxRefundPercentage != null) push('maxRefundPercentage', data.maxRefundPercentage);
  if (data.isActive != null) push('isActive', data.isActive);
  if (data.sortOrder != null) push('sortOrder', data.sortOrder);
  params.push(id);
  await prisma.$executeRawUnsafe(
    `UPDATE "cancel_reason_configs" SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
    ...params,
  );
  const updated = await getCancelReasonById(id);
  if (!updated) throw new Error('Cancellation reason not found');
  return updated;
}

export function isRefundPercentageWithinRange(
  percentage: number,
  minRefundPercentage: number,
  maxRefundPercentage: number,
): boolean {
  return percentage >= minRefundPercentage && percentage <= maxRefundPercentage;
}

export function evaluateRefundRangeExceedance(params: {
  refundPercentage: number;
  minRefundPercentage: number;
  maxRefundPercentage: number;
}): { exceededRange: boolean; configuredMinPercentage: number; configuredMaxPercentage: number } {
  return {
    configuredMinPercentage: params.minRefundPercentage,
    configuredMaxPercentage: params.maxRefundPercentage,
    exceededRange: !isRefundPercentageWithinRange(
      params.refundPercentage,
      params.minRefundPercentage,
      params.maxRefundPercentage,
    ),
  };
}

export async function validateActiveCancellationReason(value: string): Promise<CancelReasonConfigRow> {
  const reason = await getCancelReasonByValue(value);
  if (!reason || !reason.isActive) {
    throw new Error('Invalid cancellation reason');
  }
  return reason;
}

export function normalizeCancelReasonValue(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}
