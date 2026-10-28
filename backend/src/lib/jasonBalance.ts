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
      `Insufficient Jason balance (LKR ${(jasonNetCents / 100).toFixed(2)}) to cover the platform contribution (LKR ${(contributionCents / 100).toFixed(2)}) for this payout.`,
      400,
    );
  }
}

export async function recordJasonSppcExpense(opts: {
  storeId: string;
  storeWithdrawalId: string;
  amountCents: number;
  reviewerId: string;
  approvedAt: Date;
  branchName?: string | null;
}): Promise<void> {
  if (opts.amountCents <= 0) return;

  await ensureJasonLedgerSchema();
  const balanceBefore = await computeJasonNetBalance();
  assertJasonBalanceCoversContribution(balanceBefore, opts.amountCents);
  const balanceAfter = balanceBefore - opts.amountCents;

  const branchLabel = opts.branchName?.trim() || 'Branch';
  const description = `Shared promo platform contribution — ${branchLabel} payout ${opts.storeWithdrawalId.slice(0, 8).toUpperCase()}`;

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "jason_ledger_entries" WHERE "storeWithdrawalId" = $1 LIMIT 1`,
    opts.storeWithdrawalId,
  );
  if (existing.length > 0) return;

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
    description,
    opts.approvedAt,
    opts.reviewerId,
    opts.storeId,
    opts.storeWithdrawalId,
    centsToDecimal(balanceBefore),
    centsToDecimal(balanceAfter),
  );
}
