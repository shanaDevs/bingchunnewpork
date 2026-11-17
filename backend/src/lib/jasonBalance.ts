import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { centsToDecimal, decimalFieldToCentsNumber } from './moneyDecimal';
import { prisma } from './prisma';
import { ensureJasonLedgerSchema } from './jasonLedgerSchema';
import { AppError } from '../middleware/errorHandler';

/** Net Jason balance in cents: Σ active INVESTMENT − Σ active EXPENSE. */
export async function computeJasonNetBalance(tx?: Prisma.TransactionClient): Promise<number> {
  await ensureJasonLedgerSchema();
  const db = tx ?? prisma;
  const grouped = await db.jasonLedgerEntry.groupBy({
    by: ['type'],
    where: { isActive: true },
    _sum: { amount: true },
  });

  let investments = 0;
  let expenses = 0;
  for (const row of grouped) {
    const sum = decimalFieldToCentsNumber(row._sum.amount);
    if (row.type === 'INVESTMENT') investments = sum;
    if (row.type === 'EXPENSE') expenses = sum;
  }
  return investments - expenses;
}

export function assertJasonBalanceCoversContribution(
  jasonNetCents: number,
  contributionCents: number,
): void {
  if (contributionCents <= 0) return;
  if (jasonNetCents < contributionCents) {
    throw new AppError(
      `Insufficient Jason balance (LKR ${(jasonNetCents / 100).toFixed(2)}) to cover Jason payout contributions (LKR ${(contributionCents / 100).toFixed(2)}) for this payout.`,
      400,
    );
  }
}

async function recordJasonLedgerExpense(opts: {
  storeId: string;
  storeWithdrawalId: string;
  amountCents: number;
  reviewerId: string;
  approvedAt: Date;
  description: string;
}): Promise<void> {
  if (opts.amountCents <= 0) return;

  await ensureJasonLedgerSchema();

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "jason_ledger_entries" WHERE "storeWithdrawalId" = $1 AND "description" = $2 LIMIT 1`,
    opts.storeWithdrawalId,
    opts.description,
  );
  if (existing.length > 0) return;

  const balanceBefore = await computeJasonNetBalance();
  assertJasonBalanceCoversContribution(balanceBefore, opts.amountCents);
  const balanceAfter = balanceBefore - opts.amountCents;

  // Raw insert: SPPC columns are added at runtime via ensureJasonLedgerSchema and may
  // not be present on a stale generated Prisma client until `prisma generate` is run.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "jason_ledger_entries"
      ("id", "type", "amount", "description", "occurredAt", "isActive",
       "createdById", "storeId", "storeWithdrawalId", "balanceBefore", "balanceAfter",
       "createdAt", "updatedAt")
     VALUES ($1, 'EXPENSE'::"JasonLedgerType", $2, $3, $4, true, $5, $6, $7, $8, $9, NOW(), NOW())`,
    randomUUID(),
    centsToDecimal(opts.amountCents),
    opts.description,
    opts.approvedAt,
    opts.reviewerId,
    opts.storeId,
    opts.storeWithdrawalId,
    centsToDecimal(balanceBefore),
    centsToDecimal(balanceAfter),
  );
}

type JasonPayoutExpenseKind = 'sppc' | 'negative_net_platform';

function jasonPayoutLedgerDescription(
  kind: JasonPayoutExpenseKind,
  branchName: string | null | undefined,
  storeWithdrawalId: string,
): string {
  const branchLabel = branchName?.trim() || 'Branch';
  const ref = storeWithdrawalId.slice(0, 8).toUpperCase();
  if (kind === 'sppc') {
    return `Shared promo platform contribution — ${branchLabel} payout ${ref}`;
  }
  return `Net platform deficit (Jason contribution) — ${branchLabel} payout ${ref}`;
}

async function recordJasonPayoutKindExpense(
  kind: JasonPayoutExpenseKind,
  opts: {
    storeId: string;
    storeWithdrawalId: string;
    amountCents: number;
    reviewerId: string;
    approvedAt: Date;
    branchName?: string | null;
  },
): Promise<void> {
  if (opts.amountCents <= 0) return;

  await recordJasonLedgerExpense({
    storeId: opts.storeId,
    storeWithdrawalId: opts.storeWithdrawalId,
    amountCents: opts.amountCents,
    reviewerId: opts.reviewerId,
    approvedAt: opts.approvedAt,
    description: jasonPayoutLedgerDescription(kind, opts.branchName, opts.storeWithdrawalId),
  });
}

export async function recordJasonSppcExpense(opts: {
  storeId: string;
  storeWithdrawalId: string;
  amountCents: number;
  reviewerId: string;
  approvedAt: Date;
  branchName?: string | null;
}): Promise<void> {
  await recordJasonPayoutKindExpense('sppc', opts);
}

export async function recordJasonNegativeNetPlatformExpense(opts: {
  storeId: string;
  storeWithdrawalId: string;
  amountCents: number;
  reviewerId: string;
  approvedAt: Date;
  branchName?: string | null;
}): Promise<void> {
  await recordJasonPayoutKindExpense('negative_net_platform', opts);
}

/** SPPC and net-platform deficit ledger lines for an approved branch payout. */
export async function recordJasonPayoutApprovalExpenses(opts: {
  storeId: string;
  storeWithdrawalId: string;
  sppcJasonCents: number;
  negativeNetPlatformCents: number;
  reviewerId: string;
  approvedAt: Date;
  branchName?: string | null;
}): Promise<void> {
  if (opts.sppcJasonCents <= 0 && opts.negativeNetPlatformCents <= 0) return;

  const base = {
    storeId: opts.storeId,
    storeWithdrawalId: opts.storeWithdrawalId,
    reviewerId: opts.reviewerId,
    approvedAt: opts.approvedAt,
    branchName: opts.branchName,
  };

  if (opts.sppcJasonCents > 0) {
    await recordJasonSppcExpense({ ...base, amountCents: opts.sppcJasonCents });
  }
  if (opts.negativeNetPlatformCents > 0) {
    await recordJasonNegativeNetPlatformExpense({
      ...base,
      amountCents: opts.negativeNetPlatformCents,
    });
  }
}