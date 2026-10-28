import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { success } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { centsToDecimal, decimalFieldToCentsNumber, decimalToCentsString, parseDecimalFromDb } from '../lib/moneyDecimal';
import type { Prisma } from '@prisma/client';

const MAX_AMOUNT_LKR = 20_000_000;

const createEntrySchema = z.object({
  amount: z.coerce.number().positive().max(MAX_AMOUNT_LKR),
  type: z.enum(['INVESTMENT', 'EXPENSE']),
  description: z.string().trim().min(1).max(2000),
  occurredAt: z.string().trim().optional(),
});

const listQuerySchema = z.object({
  type: z.enum(['INVESTMENT', 'EXPENSE']).optional(),
  linkedToWithdrawal: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

function lkrToCents(lkr: number): number {
  return Math.round(lkr * 100);
}

function centsToLkr(cents: number): number {
  return cents / 100;
}

function parseOccurredAt(value?: string): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000+05:30`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('Invalid date', 400);
  }
  return parsed;
}

const updateEntrySchema = z.object({
  isActive: z.boolean(),
});

function serializeEntry(row: {
  id: string;
  type: 'INVESTMENT' | 'EXPENSE';
  amount: Prisma.Decimal | number;
  description: string;
  occurredAt: Date;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  storeId?: string | null;
  storeWithdrawalId?: string | null;
  balanceBefore?: Prisma.Decimal | number | null;
  balanceAfter?: Prisma.Decimal | number | null;
}) {
  const amountCents = decimalToCentsString(parseDecimalFromDb(row.amount));
  return {
    id: row.id,
    type: row.type,
    amount: amountCents,
    amountLkr: centsToLkr(Number(amountCents)),
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    isActive: row.isActive,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    storeId: row.storeId ?? null,
    storeWithdrawalId: row.storeWithdrawalId ?? null,
    balanceBefore:
      row.balanceBefore != null ? decimalToCentsString(parseDecimalFromDb(row.balanceBefore)) : null,
    balanceAfter:
      row.balanceAfter != null ? decimalToCentsString(parseDecimalFromDb(row.balanceAfter)) : null,
  };
}

function buildListEntriesSql(type?: 'INVESTMENT' | 'EXPENSE', linkedToWithdrawal?: boolean) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (type) {
    params.push(type);
    clauses.push(`"type" = $${params.length}::"JasonLedgerType"`);
  }
  if (linkedToWithdrawal) {
    clauses.push(`"storeWithdrawalId" IS NOT NULL`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return {
    sql: `SELECT "id", "type", "amount", "description", "occurredAt", "isActive",
                 "createdById", "createdAt", "storeId", "storeWithdrawalId",
                 "balanceBefore", "balanceAfter"
          FROM "jason_ledger_entries"
          ${where}
          ORDER BY "occurredAt" DESC, "createdAt" DESC
          LIMIT 500`,
    params,
  };
}

export async function listJasonLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const { ensureJasonLedgerSchema } = await import('../lib/jasonLedgerSchema');
    await ensureJasonLedgerSchema();
    const { type, linkedToWithdrawal } = listQuerySchema.parse(req.query);

    const { sql, params } = buildListEntriesSql(type, linkedToWithdrawal);

    const [entries, grouped] = await Promise.all([
      prisma.$queryRawUnsafe<
        Array<{
          id: string;
          type: 'INVESTMENT' | 'EXPENSE';
          amount: number;
          description: string;
          occurredAt: Date;
          isActive: boolean;
          createdById: string | null;
          createdAt: Date;
          storeId: string | null;
          storeWithdrawalId: string | null;
          balanceBefore: number | null;
          balanceAfter: number | null;
        }>
      >(sql, ...params),
      prisma.jasonLedgerEntry.groupBy({
        by: ['type'],
        where: { isActive: true },
        _sum: { amount: true },
      }),
    ]);

    let totalInvestmentsCents = 0;
    let totalExpensesCents = 0;
    for (const row of grouped) {
      const sum = decimalFieldToCentsNumber(row._sum.amount);
      if (row.type === 'INVESTMENT') totalInvestmentsCents = sum;
      if (row.type === 'EXPENSE') totalExpensesCents = sum;
    }

    return success(res, {
      entries: entries.map(serializeEntry),
      summary: {
        totalInvestments: centsToLkr(totalInvestmentsCents),
        totalExpenses: centsToLkr(totalExpensesCents),
        net: centsToLkr(totalInvestmentsCents - totalExpensesCents),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createJasonLedgerEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, type, description, occurredAt } = createEntrySchema.parse(req.body);

    const entry = await prisma.jasonLedgerEntry.create({
      data: {
        type,
        amount: centsToDecimal(lkrToCents(amount)),
        description,
        occurredAt: parseOccurredAt(occurredAt),
        createdById: req.user?.sub ?? null,
      },
    });

    return success(res, serializeEntry(entry), 201);
  } catch (err) {
    next(err);
  }
}

export async function updateJasonLedgerEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { isActive } = updateEntrySchema.parse(req.body);

    const existing = await prisma.jasonLedgerEntry.findUnique({ where: { id } });
    if (!existing) throw new AppError('Ledger entry not found', 404);

    const entry = await prisma.jasonLedgerEntry.update({
      where: { id },
      data: { isActive },
    });
    return success(res, serializeEntry(entry));
  } catch (err) {
    next(err);
  }
}
