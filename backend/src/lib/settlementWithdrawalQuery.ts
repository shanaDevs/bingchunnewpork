import type { Prisma, WithdrawalStatus } from '@prisma/client';
import { decimalFieldToCentsNumber } from './moneyDecimal';
import { prisma } from './prisma';
import { ensureCommissionSettlementTable } from './settlementSchema';
import { ensureWithdrawalSchema } from './withdrawalSchema';
import { tableHasColumn } from './schemaPatch';
import { resolveFinalPayoutAmountFromBreakdown } from './sharedPromoContribution';

export type WithdrawalForDartCodesSettlement = {
  id: string;
  amount: number;
  amountLkr: number;
  finalPayoutAmount: number;
  finalPayoutAmountLkr: number;
  status: WithdrawalStatus;
  periodFrom: string | null;
  periodTo: string | null;
  breakdown: unknown;
  remarks: string | null;
  isAdvance: boolean;
  createdAt: string;
  hasSettlement: boolean;
};

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function mapRow(row: {
  id: string;
  storeId?: string;
  amount: Prisma.Decimal | number;
  status: WithdrawalStatus;
  periodFrom: Date | null;
  periodTo: Date | null;
  breakdown: unknown;
  remarks: string | null;
  isAdvance: boolean;
  createdAt: Date;
}): WithdrawalForDartCodesSettlement {
  const amountCents = decimalFieldToCentsNumber(row.amount);
  const finalPayoutAmount = resolveFinalPayoutAmountFromBreakdown(row.breakdown, amountCents);
  return {
    id: row.id,
    amount: amountCents,
    amountLkr: amountCents / 100,
    finalPayoutAmount,
    finalPayoutAmountLkr: finalPayoutAmount / 100,
    status: row.status,
    periodFrom: row.periodFrom ? toDateStr(row.periodFrom) : null,
    periodTo: row.periodTo ? toDateStr(row.periodTo) : null,
    breakdown: row.breakdown,
    remarks: row.remarks,
    isAdvance: row.isAdvance,
    createdAt: row.createdAt.toISOString(),
    hasSettlement: false,
  };
}

async function unsettledWithdrawalWhere(storeId?: string) {
  await ensureWithdrawalSchema();
  await ensureCommissionSettlementTable();

  const hasLinkColumn = await tableHasColumn('commission_settlements', 'storeWithdrawalId');

  return {
    ...(storeId ? { storeId } : {}),
    status: { in: ['PENDING', 'APPROVED'] as WithdrawalStatus[] },
    periodFrom: { not: null },
    periodTo: { not: null },
    ...(hasLinkColumn ? { commissionSettlement: null } : {}),
  };
}

/** Branch payout requests not yet linked to a DartCodes commission settlement. */
export async function listWithdrawalsUnsettledForDartCodes(
  storeId: string,
): Promise<WithdrawalForDartCodesSettlement[]> {
  const rows = await prisma.storeWithdrawal.findMany({
    where: await unsettledWithdrawalWhere(storeId),
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return rows.map(mapRow);
}

/** First unsettled withdrawal per store (single query for bulk screens). */
export async function mapUnsettledWithdrawalsByStoreId(): Promise<
  Map<string, WithdrawalForDartCodesSettlement>
> {
  const rows = await prisma.storeWithdrawal.findMany({
    where: await unsettledWithdrawalWhere(),
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const map = new Map<string, WithdrawalForDartCodesSettlement>();
  for (const row of rows) {
    if (!map.has(row.storeId)) {
      map.set(row.storeId, mapRow(row));
    }
  }
  return map;
}

/** All unsettled withdrawals grouped by store (for bulk screens that need the full list). */
export async function groupAllUnsettledWithdrawalsByStoreId(): Promise<
  Map<string, WithdrawalForDartCodesSettlement[]>
> {
  const rows = await prisma.storeWithdrawal.findMany({
    where: await unsettledWithdrawalWhere(),
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const map = new Map<string, WithdrawalForDartCodesSettlement[]>();
  for (const row of rows) {
    const list = map.get(row.storeId) ?? [];
    list.push(mapRow(row));
    map.set(row.storeId, list);
  }
  return map;
}

export async function withdrawalHasDartCodesSettlement(withdrawalId: string): Promise<boolean> {
  await ensureCommissionSettlementTable();
  const hasLinkColumn = await tableHasColumn('commission_settlements', 'storeWithdrawalId');
  if (!hasLinkColumn) return false;

  const linked = await prisma.commissionSettlement.findFirst({
    where: { storeWithdrawalId: withdrawalId },
    select: { id: true },
  });
  return linked != null;
}
