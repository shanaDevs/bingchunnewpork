import { AppError } from '../middleware/errorHandler';
import { prisma } from './prisma';
import { ensureDeliveryPayoutSchema } from './deliveryPayoutSchema';
import { deliverySchemaTableSql } from './deliveryPg';
import { listDeliveryPayoutsDue } from './deliveryPayoutService';
import { DATE_RE, toUtcDateStr } from './deliveryPayoutMath';

export type DeliveryPayoutDueReviewMark = {
  periodFrom: string;
  periodTo: string;
};

function reviewsTableSql(): string {
  return deliverySchemaTableSql('delivery_payout_due_reviews');
}

export async function ensureDeliveryPayoutDueReviewsSchema(): Promise<void> {
  await ensureDeliveryPayoutSchema();
  const table = reviewsTableSql();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${table} (
      "periodFrom" DATE NOT NULL,
      "periodTo" DATE NOT NULL,
      "markedById" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "delivery_payout_due_reviews_pkey" PRIMARY KEY ("periodFrom", "periodTo")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "delivery_payout_due_reviews_periodTo_idx"
    ON ${table} ("periodTo")
  `);
}

function normalizeYmd(value: string | Date): string {
  const ymd = typeof value === 'string' ? value.slice(0, 10) : toUtcDateStr(value);
  if (!DATE_RE.test(ymd)) {
    throw new AppError('Invalid payout period date', 400);
  }
  return ymd;
}

async function findDueRow(periodFrom: string, periodTo: string) {
  const from = normalizeYmd(periodFrom);
  const to = normalizeYmd(periodTo);
  const due = await listDeliveryPayoutsDue();
  return due.find((row) => row.periodFrom === from && row.periodTo === to) ?? null;
}

export async function listDeliveryPayoutDueReviews(): Promise<DeliveryPayoutDueReviewMark[]> {
  await ensureDeliveryPayoutDueReviewsSchema();
  const table = reviewsTableSql();
  const rows = await prisma.$queryRawUnsafe<Array<{ periodFrom: Date; periodTo: Date }>>(
    `SELECT "periodFrom", "periodTo" FROM ${table} ORDER BY "periodFrom" ASC`,
  );
  return rows.map((row) => ({
    periodFrom: toUtcDateStr(row.periodFrom),
    periodTo: toUtcDateStr(row.periodTo),
  }));
}

export async function isDeliveryPayoutDueInReview(
  periodFrom: string,
  periodTo: string,
): Promise<boolean> {
  await ensureDeliveryPayoutDueReviewsSchema();
  const from = normalizeYmd(periodFrom);
  const to = normalizeYmd(periodTo);
  const table = reviewsTableSql();
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT 1::int AS n FROM ${table} WHERE "periodFrom" = $1::date AND "periodTo" = $2::date LIMIT 1`,
    from,
    to,
  );
  return (rows[0]?.n ?? 0) > 0;
}

export async function setDeliveryPayoutDueReview(params: {
  periodFrom: string;
  periodTo: string;
  inReview: boolean;
  adminId: string;
}): Promise<void> {
  await ensureDeliveryPayoutDueReviewsSchema();
  const from = normalizeYmd(params.periodFrom);
  const to = normalizeYmd(params.periodTo);
  const dueRow = await findDueRow(from, to);
  if (!dueRow) {
    throw new AppError('This delivery payout period is not in the due list', 400);
  }
  if (params.inReview && !dueRow.payable) {
    throw new AppError(
      'Only the earliest due delivery period can be saved as draft. Pay earlier periods first.',
      400,
    );
  }

  const table = reviewsTableSql();
  if (!params.inReview) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM ${table} WHERE "periodFrom" = $1::date AND "periodTo" = $2::date`,
      from,
      to,
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${table} ("periodFrom", "periodTo", "markedById", "createdAt")
     VALUES ($1::date, $2::date, $3, NOW())
     ON CONFLICT ("periodFrom", "periodTo")
     DO UPDATE SET "markedById" = EXCLUDED."markedById", "createdAt" = NOW()`,
    from,
    to,
    params.adminId,
  );
}

export async function clearDeliveryPayoutDueReview(periodFrom: string, periodTo: string): Promise<void> {
  await ensureDeliveryPayoutDueReviewsSchema();
  const from = normalizeYmd(periodFrom);
  const to = normalizeYmd(periodTo);
  const table = reviewsTableSql();
  await prisma.$executeRawUnsafe(
    `DELETE FROM ${table} WHERE "periodFrom" = $1::date AND "periodTo" = $2::date`,
    from,
    to,
  );
}

export async function assertDeliveryPayoutDueInReview(periodFrom: string, periodTo: string): Promise<void> {
  const ok = await isDeliveryPayoutDueInReview(periodFrom, periodTo);
  if (!ok) {
    throw new AppError('Save this payout period as draft before continuing', 400);
  }
}