import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import {
  centsToLkr,
  decimalFieldToCentsNumber,
  decimalFieldToLkrNumber,
  lkrToCents,
  parseDecimalFromDb,
} from './moneyDecimal';
import { ensureDeliveryPayoutSchema } from './deliveryPayoutSchema';
import { getDeliveryPayoutsSqlRef } from './deliveryPg';
import { getDeliveryWalletSummary, type DeliveryWalletSummary } from './deliveryWalletService';
import {
  addDaysToDateStr,
  DELIVERY_PAYOUT_ELAPSED_DAYS,
  DELIVERY_PAYOUT_PERIOD_DAYS,
  isDeliveryPayoutPeriodDays,
  minDateStr,
  nextPeriodStartFromPeriodTo,
  resolveDeliveryPayoutPeriodWindow,
  resolveLiveDeliveryWalletRange,
  resolveOpenDeliveryPayoutWindow,
  toBusinessDateStr,
  todayUtcDateStr,
  toUtcDateStr,
  validateDeliveryPayoutRange,
  yesterdayUtcDateStr,
  type DeliveryPayoutPeriodDays,
  type ResolvedDeliveryPayoutPeriod,
} from './deliveryPayoutMath';
import { analyticsCacheKey, invalidateAnalyticsCache, withAnalyticsCache } from './analyticsResponseCache';

export type DeliveryPayoutSnapshot = DeliveryWalletSummary & {
  periodDays: DeliveryPayoutPeriodDays;
  from: string;
  to: string;
  snapshotAt: string;
};

export type DeliveryPayoutRow = {
  id: string;
  amount: number;
  amountLkr: number;
  status: string;
  remarks: string | null;
  periodFrom: string;
  periodTo: string;
  requestedById: string;
  breakdown: unknown;
  rejectionReason: string | null;
  paymentMethod: string | null;
  /** Always null in API responses; use hasProof + proof-url endpoint. */
  proofUrl: string | null;
  hasProof: boolean;
  checkNumber: string | null;
  checkDate: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryPayoutDueItem = {
  periodFrom: string;
  periodTo: string;
  days: DeliveryPayoutPeriodDays;
  orderCount: number;
  grossDeliveryFee: number;
  netForDelivery: number;
  payable: boolean;
};

export type DeliveryCurrentPayoutCycle = {
  from: string;
  cycleTo: string;
  through: string;
  days: DeliveryPayoutPeriodDays;
};

export type DeliveryPayoutDbRow = {
  id: string;
  amount: number | bigint | string;
  status: string;
  remarks: string | null;
  periodFrom: Date;
  periodTo: Date;
  requestedById: string;
  breakdown: unknown;
  rejectionReason?: string | null;
  paymentMethod?: string | null;
  proofUrl?: string | null;
  checkNumber?: string | null;
  checkDate?: Date | null;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const DELIVERY_PAYOUTS_DUE_CACHE_TTL_MS = 45_000;

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapPayoutRow(row: DeliveryPayoutDbRow): DeliveryPayoutRow {
  const amountLkr = centsToLkr(decimalFieldToCentsNumber(parseDecimalFromDb(row.amount)));
  return {
    id: row.id,
    amount: amountLkr,
    amountLkr,
    status: row.status,
    remarks: row.remarks,
    periodFrom: row.periodFrom.toISOString(),
    periodTo: row.periodTo.toISOString(),
    requestedById: row.requestedById,
    breakdown: row.breakdown,
    rejectionReason: row.rejectionReason ?? null,
    paymentMethod: row.paymentMethod ?? null,
    hasProof: Boolean(row.proofUrl),
    proofUrl: null,
    checkNumber: row.checkNumber ?? null,
    checkDate: isoOrNull(row.checkDate),
    reviewedById: row.reviewedById ?? null,
    reviewedAt: isoOrNull(row.reviewedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isOverlapConflict(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e.code === '23P01' || /exclusion|overlap|23P01/i.test(e.message ?? '');
}

export async function getDeliveryPayoutById(id: string): Promise<DeliveryPayoutDbRow | null> {
  const rows = await prisma.$queryRawUnsafe<DeliveryPayoutDbRow[]>(
    `SELECT * FROM ${getDeliveryPayoutsSqlRef()} WHERE "id" = $1 LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}

export async function getNextDeliveryPayoutStartDate(): Promise<string | null> {
  await ensureDeliveryPayoutSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ periodTo: Date }>>(
    `SELECT "periodTo" FROM ${getDeliveryPayoutsSqlRef()}
     WHERE status = 'APPROVED'
     ORDER BY "periodTo" DESC
     LIMIT 1`,
  );
  const latest = rows[0]?.periodTo;
  if (!latest) return null;
  return nextPeriodStartFromPeriodTo(latest);
}

async function getLastApprovedDeliveryPayoutPeriodTo(): Promise<Date | null> {
  await ensureDeliveryPayoutSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ periodTo: Date }>>(
    `SELECT "periodTo" FROM ${getDeliveryPayoutsSqlRef()}
     WHERE status = 'APPROVED'
     ORDER BY "periodTo" DESC
     LIMIT 1`,
  );
  return rows[0]?.periodTo ?? null;
}

async function getNextDeliveryPayoutStartDateForOpenRequests(): Promise<string | null> {
  await ensureDeliveryPayoutSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ periodTo: Date }>>(
    `SELECT "periodTo" FROM ${getDeliveryPayoutsSqlRef()}
     WHERE status IN ('PENDING', 'APPROVED')
     ORDER BY "periodTo" DESC
     LIMIT 1`,
  );
  const latest = rows[0]?.periodTo;
  if (!latest) return null;
  return nextPeriodStartFromPeriodTo(latest);
}

export async function getLiveDeliveryWalletRange(): Promise<{
  from: string;
  to: string;
  afterApproved: boolean;
} | null> {
  const today = todayUtcDateStr();
  const lastApprovedPeriodTo = await getLastApprovedDeliveryPayoutPeriodTo();
  const earliestFeeDate = lastApprovedPeriodTo ? null : await getEarliestDeliveryFeeDate();
  const range = resolveLiveDeliveryWalletRange({
    lastApprovedPeriodTo,
    earliestFeeDate,
    today,
  });
  if (!range) return null;
  return { ...range, afterApproved: Boolean(lastApprovedPeriodTo) };
}

async function getEarliestDeliveryFeeDate(): Promise<string | null> {
  const [earliestOrder, earliestLateCancel, earliestRejectedRetain] = await Promise.all([
    prisma.order.findFirst({
      where: {
        orderMode: 'DELIVERY',
        status: { not: 'CANCELLED' },
        paymentStatus: 'PAID',
        deliveryFee: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.refund.findFirst({
      where: {
        status: { in: ['COMPLETE', 'REJECTED'] },
        submittedBy: 'CUSTOMER',
        cancelledWithinWindow: false,
        processedAt: { not: null },
      },
      orderBy: { processedAt: 'asc' },
      select: { processedAt: true },
    }),
    prisma.refund.findFirst({
      where: {
        status: 'REJECTED',
        processedAt: { not: null },
        nonRefundableDeliveryFee: { gt: 0 },
        NOT: {
          AND: [{ submittedBy: 'CUSTOMER' }, { cancelledWithinWindow: false }],
        },
        order: { status: 'CANCELLED' },
      },
      orderBy: { processedAt: 'asc' },
      select: { processedAt: true },
    }),
  ]);

  return minDateStr([
    earliestOrder ? toBusinessDateStr(earliestOrder.createdAt) : null,
    earliestLateCancel?.processedAt ? toBusinessDateStr(earliestLateCancel.processedAt) : null,
    earliestRejectedRetain?.processedAt ? toBusinessDateStr(earliestRejectedRetain.processedAt) : null,
  ]);
}

async function resolveDeliveryPayoutPeriodStart(): Promise<string | null> {
  const nextStart = await getNextDeliveryPayoutStartDateForOpenRequests();
  if (nextStart) return nextStart;
  return getEarliestDeliveryFeeDate();
}

export async function getCurrentDeliveryPayoutCycle(): Promise<DeliveryCurrentPayoutCycle | null> {
  const periodStart = await resolveDeliveryPayoutPeriodStart();
  if (!periodStart) return null;
  const today = todayUtcDateStr();
  const open = resolveOpenDeliveryPayoutWindow({
    periodStart,
    days: DELIVERY_PAYOUT_ELAPSED_DAYS,
    today,
  });
  if (!open) return null;
  return {
    from: open.from,
    cycleTo: open.cycleTo,
    through: open.through,
    days: open.days,
  };
}

export async function resolveDeliveryPayoutPeriod(
  days: DeliveryPayoutPeriodDays,
): Promise<ResolvedDeliveryPayoutPeriod | null> {
  const today = todayUtcDateStr();
  const from = await resolveDeliveryPayoutPeriodStart();
  if (!from || from >= today) return null;
  return resolveDeliveryPayoutPeriodWindow({ from, days, today });
}

export async function resolveDeliveryPayoutPeriodOptions(): Promise<ResolvedDeliveryPayoutPeriod[]> {
  const today = todayUtcDateStr();
  const from = await resolveDeliveryPayoutPeriodStart();
  if (!from || from >= today) return [];
  return DELIVERY_PAYOUT_PERIOD_DAYS.map((days) =>
    resolveDeliveryPayoutPeriodWindow({ from, days, today }),
  );
}

/**
 * Successive fully-elapsed 15-day windows from last approved payout (or first fee).
 * Skips zero-net windows but advances the cursor past them.
 */
export async function listElapsedDeliveryPayoutWindows(
  max = 12,
): Promise<
  Array<
    ResolvedDeliveryPayoutPeriod & {
      orderCount: number;
      grossDeliveryFee: number;
      netForDelivery: number;
      summary: DeliveryWalletSummary;
    }
  >
> {
  await ensureDeliveryPayoutSchema();
  const nextStart = await getNextDeliveryPayoutStartDate();
  const earliestOrder = nextStart ? null : await getEarliestDeliveryFeeDate();
  let from = nextStart ?? earliestOrder;
  if (!from) return [];

  const today = todayUtcDateStr();
  const days = DELIVERY_PAYOUT_ELAPSED_DAYS;
  const results: Array<
    ResolvedDeliveryPayoutPeriod & {
      orderCount: number;
      grossDeliveryFee: number;
      netForDelivery: number;
      summary: DeliveryWalletSummary;
    }
  > = [];

  let cursor = from;
  let safety = 0;
  const maxIterations = max * 4;

  while (results.length < max && safety < maxIterations) {
    safety += 1;
    const idealTo = addDaysToDateStr(cursor, days - 1);
    if (idealTo >= today) break;

    const summary = await getDeliveryWalletSummary(cursor, idealTo);
    if (summary.netForDelivery > 0) {
      results.push({
        days,
        from: cursor,
        to: idealTo,
        orderCount: summary.orderCount,
        grossDeliveryFee: summary.grossDeliveryFee,
        netForDelivery: summary.netForDelivery,
        summary,
      });
    }
    cursor = addDaysToDateStr(idealTo, 1);
  }

  return results;
}

export async function listDeliveryPayoutsDue(): Promise<DeliveryPayoutDueItem[]> {
  return withAnalyticsCache(
    analyticsCacheKey(['delivery-payouts-due']),
    async () => {
      const windows = await listElapsedDeliveryPayoutWindows();
      return windows.map((window, index) => ({
        periodFrom: window.from,
        periodTo: window.to,
        days: window.days,
        orderCount: window.orderCount,
        grossDeliveryFee: window.grossDeliveryFee,
        netForDelivery: window.netForDelivery,
        payable: index === 0,
      }));
    },
    DELIVERY_PAYOUTS_DUE_CACHE_TTL_MS,
  );
}

function buildStoredDeliveryPayoutBreakdown(
  summary: DeliveryWalletSummary,
  period: ResolvedDeliveryPayoutPeriod,
): DeliveryPayoutSnapshot {
  return {
    ...summary,
    periodDays: period.days,
    from: period.from,
    to: period.to,
    snapshotAt: new Date().toISOString(),
  };
}

export async function listDeliveryPayouts(opts?: {
  page?: number;
  limit?: number;
}) {
  await ensureDeliveryPayoutSchema();
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 10));
  const skip = (page - 1) * limit;

  const [items, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<DeliveryPayoutDbRow[]>(
      `SELECT * FROM ${getDeliveryPayoutsSqlRef()}
       ORDER BY "createdAt" DESC
       LIMIT $1 OFFSET $2`,
      limit,
      skip,
    ),
    prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT COUNT(*)::int AS n FROM ${getDeliveryPayoutsSqlRef()}`,
    ),
  ]);

  const total = Number(countRows[0]?.n ?? 0);
  return {
    items: items.map((row) => mapPayoutRow(row)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getDeliveryPayoutPreview(from?: string, to?: string, periodDays?: number) {
  await ensureDeliveryPayoutSchema();
  const today = todayUtcDateStr();
  const [nextPeriodStart, liveRange, currentPayoutCycle] = await Promise.all([
    getNextDeliveryPayoutStartDateForOpenRequests(),
    getLiveDeliveryWalletRange(),
    getCurrentDeliveryPayoutCycle(),
  ]);
  const liveFrom = liveRange?.from ?? null;
  const liveTo = liveRange?.to ?? null;
  const liveAfterApproved = liveRange?.afterApproved ?? false;
  const maxEndDate = yesterdayUtcDateStr(today);
  const options = await resolveDeliveryPayoutPeriodOptions();

  let resolvedFrom = from;
  let resolvedTo = to;
  let selectedPeriod: ResolvedDeliveryPayoutPeriod | null = null;

  if (periodDays != null) {
    if (!isDeliveryPayoutPeriodDays(periodDays)) {
      throw new AppError(
        `Invalid payout period. Choose one of: ${DELIVERY_PAYOUT_PERIOD_DAYS.join(', ')} days`,
        400,
      );
    }
    selectedPeriod = await resolveDeliveryPayoutPeriod(periodDays);
    if (!selectedPeriod) {
      return {
        today,
        maxEndDate,
        nextPeriodStart,
        liveFrom,
        liveTo,
        liveAfterApproved,
        currentPayoutCycle,
        options,
        periodDays,
        from: null,
        to: null,
        capped: false,
        rangeValid: false,
        rangeError: 'No delivery fees available to request yet',
        canSubmit: false,
        summary: null,
      };
    }
    resolvedFrom = selectedPeriod.from;
    resolvedTo = selectedPeriod.to;
  }

  let summary: DeliveryWalletSummary | null = null;
  let rangeValid = false;
  let rangeError: string | null = null;

  if (resolvedFrom && resolvedTo) {
    const check = validateDeliveryPayoutRange({
      from: resolvedFrom,
      to: resolvedTo,
      today,
      nextPeriodStart,
    });
    if (check.ok === false) {
      rangeError = check.message;
    } else {
      rangeValid = true;
      summary = await getDeliveryWalletSummary(resolvedFrom, resolvedTo);
    }
  }

  const netForDelivery = summary?.netForDelivery ?? 0;
  const capped = selectedPeriod?.capped ?? false;
  return {
    today,
    maxEndDate,
    nextPeriodStart,
    liveFrom,
    liveTo,
    liveAfterApproved,
    currentPayoutCycle,
    options,
    periodDays: selectedPeriod?.days ?? null,
    from: resolvedFrom ?? null,
    to: resolvedTo ?? null,
    capped,
    rangeValid,
    rangeError,
    canSubmit: rangeValid && !capped && netForDelivery > 0,
    summary,
  };
}

export async function payDeliveryPayout(params: {
  periodFrom: string;
  paymentMethod: string;
  proofUrl: string;
  adminId: string;
  remarks?: string;
  checkNumber?: string | null;
  checkDate?: Date | null;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();

  const windows = await listElapsedDeliveryPayoutWindows(1);
  const payable = windows[0];
  if (!payable) {
    throw new AppError('No completed delivery payout period is due', 400);
  }
  if (payable.from !== params.periodFrom) {
    throw new AppError(
      'Pay the earliest due delivery period first, or refresh the list',
      400,
    );
  }

  const summary = payable.summary;
  if (summary.netForDelivery <= 0) {
    throw new AppError('No delivery amount available for this period', 400);
  }

  const snapshot = buildStoredDeliveryPayoutBreakdown(summary, payable);
  const id = randomUUID();
  const remarks = params.remarks?.trim() || null;
  const periodFromDate = new Date(`${payable.from}T00:00:00.000Z`);
  const periodToDate = new Date(`${payable.to}T23:59:59.999Z`);
  const checkNum =
    params.paymentMethod === 'CHECK' ? params.checkNumber?.trim() || null : null;
  const checkDt = params.paymentMethod === 'CHECK' ? params.checkDate ?? null : null;

  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(872314001)`);

      const today = todayUtcDateStr();
      const latestRows = await tx.$queryRawUnsafe<Array<{ periodTo: Date }>>(
        `SELECT "periodTo" FROM ${getDeliveryPayoutsSqlRef()}
         WHERE status = 'APPROVED'
         ORDER BY "periodTo" DESC
         LIMIT 1`,
      );
      const nextPeriodStart = latestRows[0]?.periodTo
        ? nextPeriodStartFromPeriodTo(latestRows[0].periodTo)
        : null;
      if (nextPeriodStart && nextPeriodStart !== payable.from) {
        throw new AppError(
          'Pay the earliest due delivery period first, or refresh the list',
          400,
        );
      }

      const check = validateDeliveryPayoutRange({
        from: payable.from,
        to: payable.to,
        today,
        nextPeriodStart,
      });
      if (check.ok === false) throw new AppError(check.message, 400);

      await tx.$executeRawUnsafe(
        `INSERT INTO ${getDeliveryPayoutsSqlRef()}
          ("id", "amount", "status", "remarks", "periodFrom", "periodTo", "requestedById", "breakdown",
           "paymentMethod", "proofUrl", "checkNumber", "checkDate", "reviewedById", "reviewedAt",
           "createdAt", "updatedAt")
         VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7::jsonb, $8::"SettlementPaymentMethod", $9, $10, $11, $6, NOW(), NOW(), NOW())`,
        id,
        lkrToCents(summary.netForDelivery),
        remarks,
        periodFromDate,
        periodToDate,
        params.adminId,
        JSON.stringify(snapshot),
        params.paymentMethod,
        params.proofUrl,
        checkNum,
        checkDt,
      );

      const createdRows = await tx.$queryRawUnsafe<DeliveryPayoutDbRow[]>(
        `SELECT * FROM ${getDeliveryPayoutsSqlRef()} WHERE "id" = $1 LIMIT 1`,
        id,
      );
      const created = createdRows[0];
      if (!created) throw new AppError('Failed to record delivery payout', 500);
      return mapPayoutRow(created);
    });

    invalidateAnalyticsCache(analyticsCacheKey(['delivery-payouts-due']));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isOverlapConflict(err)) {
      throw new AppError('A payout for this period already exists', 409);
    }
    throw err;
  }
}

export async function createDeliveryPayout(params: {
  periodDays: number;
  remarks?: string;
  requestedById: string;
  proofUrl?: string | null;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();
  const periodDays = params.periodDays;
  if (!isDeliveryPayoutPeriodDays(periodDays)) {
    throw new AppError(
      `Invalid payout period. Choose one of: ${DELIVERY_PAYOUT_PERIOD_DAYS.join(', ')} days`,
      400,
    );
  }

  const period = await resolveDeliveryPayoutPeriod(periodDays);
  if (!period) {
    throw new AppError('No delivery fees available to request yet', 400);
  }
  if (period.capped) {
    const completeOn = addDaysToDateStr(period.from, period.days - 1);
    throw new AppError(
      `The full ${period.days}-day period is not complete yet. You can request after ${completeOn}.`,
      400,
    );
  }

  const summary = await getDeliveryWalletSummary(period.from, period.to);
  if (summary.netForDelivery <= 0) {
    throw new AppError('No delivery amount available for this period', 400);
  }

  const snapshot = buildStoredDeliveryPayoutBreakdown(summary, period);
  const id = randomUUID();
  const remarks = params.remarks?.trim() || null;
  const periodFrom = new Date(`${period.from}T00:00:00.000Z`);
  const periodTo = new Date(`${period.to}T23:59:59.999Z`);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(872314001)`);

      const today = todayUtcDateStr();
      const latestRows = await tx.$queryRawUnsafe<Array<{ periodTo: Date }>>(
        `SELECT "periodTo" FROM ${getDeliveryPayoutsSqlRef()}
         WHERE status IN ('PENDING', 'APPROVED')
         ORDER BY "periodTo" DESC
         LIMIT 1`,
      );
      const nextPeriodStart = latestRows[0]?.periodTo
        ? nextPeriodStartFromPeriodTo(latestRows[0].periodTo)
        : null;
      if (nextPeriodStart && nextPeriodStart !== period.from) {
        throw new AppError(
          'Pay the earliest due delivery period first, or refresh the list',
          400,
        );
      }

      const check = validateDeliveryPayoutRange({
        from: period.from,
        to: period.to,
        today,
        nextPeriodStart,
      });
      if (check.ok === false) throw new AppError(check.message, 400);

      await tx.$executeRawUnsafe(
        `INSERT INTO ${getDeliveryPayoutsSqlRef()}
          ("id", "amount", "status", "remarks", "periodFrom", "periodTo", "requestedById", "breakdown",
           "reviewedById", "reviewedAt", "proofUrl", "createdAt", "updatedAt")
         VALUES ($1, $2, 'APPROVED', $3, $4, $5, $6, $7::jsonb, $6, NOW(), $8, NOW(), NOW())`,
        id,
        lkrToCents(summary.netForDelivery),
        remarks,
        periodFrom,
        periodTo,
        params.requestedById,
        JSON.stringify(snapshot),
        params.proofUrl ?? null,
      );

      const createdRows = await tx.$queryRawUnsafe<DeliveryPayoutDbRow[]>(
        `SELECT * FROM ${getDeliveryPayoutsSqlRef()} WHERE "id" = $1 LIMIT 1`,
        id,
      );
      const created = createdRows[0];
      if (!created) throw new AppError('Failed to create delivery payout', 500);
      return mapPayoutRow(created);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isOverlapConflict(err)) {
      throw new AppError('A payout for this period already exists', 409);
    }
    throw err;
  }
}

export async function approveDeliveryPayout(params: {
  payoutId: string;
  reviewerId: string;
  /** Optional; can be uploaded later with `attachDeliveryPayoutProof`. */
  proofUrl?: string | null;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();
  const payout = await getDeliveryPayoutById(params.payoutId);
  if (!payout) throw new AppError('Delivery payout not found', 404);
  if (payout.status !== 'PENDING') {
    throw new AppError('Only pending delivery payouts can be approved', 400);
  }
  if (payout.requestedById === params.reviewerId) {
    throw new AppError('You cannot approve a payout you requested', 403);
  }

  const storedAmountLkr = decimalFieldToLkrNumber(parseDecimalFromDb(payout.amount));
  if (!Number.isFinite(storedAmountLkr) || storedAmountLkr <= 0) {
    throw new AppError('Stored payout amount is invalid', 400);
  }

  const periodFrom = toUtcDateStr(payout.periodFrom);
  const periodTo = toUtcDateStr(payout.periodTo);
  const live = await getDeliveryWalletSummary(periodFrom, periodTo);
  if (live.netForDelivery < storedAmountLkr) {
    throw new AppError(
      'Live net for this period is lower than the requested amount. Reject and request again.',
      400,
    );
  }

  await prisma.$executeRawUnsafe(
    `UPDATE ${getDeliveryPayoutsSqlRef()}
     SET "status" = 'APPROVED',
         "reviewedById" = $1,
         "reviewedAt" = NOW(),
         "proofUrl" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $3 AND "status" = 'PENDING'`,
    params.reviewerId,
    params.proofUrl ?? null,
    params.payoutId,
  );

  const updated = await getDeliveryPayoutById(params.payoutId);
  if (!updated || updated.status !== 'APPROVED') {
    throw new AppError('Failed to approve delivery payout', 500);
  }
  return mapPayoutRow(updated);
}

/** Add a payment slip to an already-paid delivery payout that was saved without one. */
export async function attachDeliveryPayoutProof(params: {
  payoutId: string;
  proofUrl: string;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();
  const payout = await getDeliveryPayoutById(params.payoutId);
  if (!payout) throw new AppError('Delivery payout not found', 404);
  if (payout.status !== 'APPROVED') {
    throw new AppError('Proof can only be added to paid delivery payouts', 400);
  }
  if (payout.proofUrl) {
    throw new AppError('This payout already has a payment proof', 409);
  }

  await prisma.$executeRawUnsafe(
    `UPDATE ${getDeliveryPayoutsSqlRef()}
     SET "proofUrl" = $1, "updatedAt" = NOW()
     WHERE "id" = $2 AND "status" = 'APPROVED' AND "proofUrl" IS NULL`,
    params.proofUrl,
    params.payoutId,
  );

  const updated = await getDeliveryPayoutById(params.payoutId);
  if (!updated?.proofUrl || updated.proofUrl !== params.proofUrl) {
    throw new AppError('Failed to attach payment proof', 409);
  }
  return mapPayoutRow(updated);
}

export async function rejectDeliveryPayout(params: {
  payoutId: string;
  reviewerId: string;
  reason?: string;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();
  const payout = await getDeliveryPayoutById(params.payoutId);
  if (!payout) throw new AppError('Delivery payout not found', 404);
  if (payout.status !== 'PENDING') {
    throw new AppError('Only pending delivery payouts can be rejected', 400);
  }

  await prisma.$executeRawUnsafe(
    `UPDATE ${getDeliveryPayoutsSqlRef()}
     SET "status" = 'REJECTED',
         "reviewedById" = $1,
         "reviewedAt" = NOW(),
         "rejectionReason" = $2,
         "updatedAt" = NOW()
     WHERE "id" = $3 AND "status" = 'PENDING'`,
    params.reviewerId,
    params.reason?.trim() || null,
    params.payoutId,
  );

  const updated = await getDeliveryPayoutById(params.payoutId);
  if (!updated || updated.status !== 'REJECTED') {
    throw new AppError('Failed to reject delivery payout', 500);
  }
  return mapPayoutRow(updated);
}

export async function cancelDeliveryPayout(params: {
  payoutId: string;
  requestedById: string;
}): Promise<DeliveryPayoutRow> {
  await ensureDeliveryPayoutSchema();
  const payout = await getDeliveryPayoutById(params.payoutId);
  if (!payout) throw new AppError('Delivery payout not found', 404);
  if (payout.status !== 'PENDING') {
    throw new AppError('Only pending delivery payouts can be cancelled', 400);
  }
  if (payout.requestedById !== params.requestedById) {
    throw new AppError('You can only cancel your own pending payout', 403);
  }

  await prisma.$executeRawUnsafe(
    `UPDATE ${getDeliveryPayoutsSqlRef()}
     SET "status" = 'CANCELLED',
         "updatedAt" = NOW()
     WHERE "id" = $1 AND "status" = 'PENDING'`,
    params.payoutId,
  );

  const updated = await getDeliveryPayoutById(params.payoutId);
  if (!updated || updated.status !== 'CANCELLED') {
    throw new AppError('Failed to cancel delivery payout', 500);
  }
  return mapPayoutRow(updated);
}

