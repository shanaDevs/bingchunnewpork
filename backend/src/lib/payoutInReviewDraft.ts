import crypto from 'crypto';
import { Prisma, prisma } from './prisma';
import { AppError } from '../middleware/errorHandler';
import {
  buildBranchPayoutDraftSnapshot,
  type PayoutReviewPeriodRef,
} from './payoutReviewInvoice';
import { centsToDecimal } from './moneyDecimal';
import {
  findInReviewWithdrawalForPeriod,
  isValidPayoutPeriodDays,
  type PayoutPeriodDays,
} from './withdrawalPayoutPeriod';
import { validatePayoutRequest } from './withdrawalService';
import { resolveFinalPayoutAmountFromBreakdown } from './sharedPromoContribution';
import { toUtcDateStr } from './utcDateString';
import {
  computePeriodBreakdownForPayout,
  resolveCycleContextForWindow,
} from './withdrawalPeriodNet';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function periodDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

function periodEndDate(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T23:59:59.999Z`);
}

function inclusivePeriodDays(periodFrom: string, periodTo: string): number {
  const start = new Date(`${periodFrom.slice(0, 10)}T00:00:00.000Z`).getTime();
  const end = new Date(`${periodTo.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function resolvePeriodDays(periodFrom: string, periodTo: string): PayoutPeriodDays {
  const days = inclusivePeriodDays(periodFrom, periodTo);
  if (isValidPayoutPeriodDays(days)) return days;
  return 15;
}

export function payoutDraftInvoiceApiPath(withdrawalId: string): string {
  return `/admin/wallet/payout-draft-invoice?withdrawalId=${encodeURIComponent(withdrawalId)}`;
}

export function payoutDraftInvoiceApiPathByPeriod(
  storeId: string,
  periodFrom: string,
  periodTo: string,
): string {
  const params = new URLSearchParams({
    storeId,
    periodFrom: periodFrom.slice(0, 10),
    periodTo: periodTo.slice(0, 10),
  });
  return `/admin/wallet/payout-draft-invoice?${params.toString()}`;
}

function jsonSnapshot<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export { findInReviewWithdrawalForPeriod } from './withdrawalPayoutPeriod';

export async function listInReviewPayoutMarks(): Promise<PayoutReviewPeriodRef[]> {
  const rows = await prisma.storeWithdrawal.findMany({
    where: { status: 'IN_REVIEW', periodFrom: { not: null }, periodTo: { not: null } },
    select: { storeId: true, periodFrom: true, periodTo: true },
  });
  return rows.map((row) => ({
    storeId: row.storeId,
    periodFrom: toUtcDateStr(row.periodFrom!),
    periodTo: toUtcDateStr(row.periodTo!),
  }));
}

export async function createInReviewPayoutDraft(input: {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  markedById: string;
}): Promise<void> {
  const periodFromYmd = input.periodFrom.slice(0, 10);
  const periodToYmd = input.periodTo.slice(0, 10);
  if (!YMD.test(periodFromYmd) || !YMD.test(periodToYmd) || periodFromYmd > periodToYmd) {
    throw new AppError('Invalid payout period', 400);
  }

  const periodFrom = periodDate(periodFromYmd);
  const periodToEnd = periodEndDate(periodToYmd);

  const paid = await prisma.storeWithdrawal.findFirst({
    where: {
      storeId: input.storeId,
      status: 'APPROVED',
      periodFrom,
      periodTo: periodToEnd,
    },
    select: { id: true },
  });
  if (paid) throw new AppError('This payout period is already paid', 409);

  const existing = await findInReviewWithdrawalForPeriod(
    input.storeId,
    periodFromYmd,
    periodToYmd,
  );
  if (existing?.invoiceData != null) return;

  const periodDays = resolvePeriodDays(periodFromYmd, periodToYmd);
  const bounds = { from: periodFromYmd, to: periodToYmd };

  const cycle = await resolveCycleContextForWindow(input.storeId, periodFromYmd, periodToYmd);
  const periodPreview = await computePeriodBreakdownForPayout(
    input.storeId,
    periodFromYmd,
    periodToYmd,
    cycle,
  );
  const payoutAmountCents = resolveFinalPayoutAmountFromBreakdown(
    periodPreview,
    periodPreview.netAmount,
  );
  const locked = await validatePayoutRequest(
    input.storeId,
    payoutAmountCents,
    periodDays,
    false,
    bounds,
  );

  const withdrawalId = existing?.id ?? crypto.randomUUID();
  const snapshot = await buildBranchPayoutDraftSnapshot({
    storeId: input.storeId,
    storeName: input.storeName,
    periodFrom: periodFromYmd,
    periodTo: periodToYmd,
    withdrawalId,
  });

  const invoiceData = {
    ...snapshot.invoiceData,
    withdrawalId,
  };

  if (existing) {
    await prisma.storeWithdrawal.update({
      where: { id: existing.id },
      data: {
        amount: centsToDecimal(payoutAmountCents),
        breakdown: locked.breakdown as object,
        invoiceData: jsonSnapshot(invoiceData),
        requestedById: input.markedById,
        invoiceUrl: payoutDraftInvoiceApiPath(withdrawalId),
        cycleStage: locked.breakdown.cycleStage ?? 'FIRST',
        cyclePairId: locked.breakdown.cyclePairId ?? null,
      },
    });
    return;
  }

  try {
    await prisma.storeWithdrawal.create({
      data: {
        id: withdrawalId,
        storeId: input.storeId,
        amount: centsToDecimal(payoutAmountCents),
        status: 'IN_REVIEW',
        periodFrom,
        periodTo: periodEndDate(periodToYmd),
        requestedById: input.markedById,
        breakdown: locked.breakdown as object,
        invoiceData: jsonSnapshot(invoiceData),
        invoiceUrl: payoutDraftInvoiceApiPath(withdrawalId),
        cycleStage: locked.breakdown.cycleStage ?? 'FIRST',
        cyclePairId: locked.breakdown.cyclePairId ?? null,
        isAdvance: false,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new AppError('A payout record already exists for this period', 409);
    }
    throw err;
  }
}

export async function removeInReviewPayoutDraft(
  storeId: string,
  periodFrom: string,
  periodTo: string,
): Promise<void> {
  const from = periodDate(periodFrom.slice(0, 10));
  const to = periodEndDate(periodTo.slice(0, 10));
  await prisma.storeWithdrawal.deleteMany({
    where: { storeId, status: 'IN_REVIEW', periodFrom: from, periodTo: to },
  });
}
