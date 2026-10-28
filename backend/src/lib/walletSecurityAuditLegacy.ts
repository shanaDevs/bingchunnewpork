import type { StoreWithdrawal, WithdrawalStatus } from '@prisma/client';
import { prisma } from './prisma';
import { withdrawalAmountCents } from './walletApiMoney';
import type { WalletSecurityAuditRow } from './walletSecurityAuditSchema';

function withdrawalStatusToEvent(status: WithdrawalStatus): string {
  switch (status) {
    case 'PENDING':
      return 'wallet.withdrawal.request';
    case 'APPROVED':
      return 'wallet.withdrawal.approve';
    case 'REJECTED':
      return 'wallet.withdrawal.reject';
    case 'CANCELLED':
      return 'wallet.withdrawal.cancel';
    default:
      return 'wallet.withdrawal.request';
  }
}

export function withdrawalToLegacyAuditRow(withdrawal: StoreWithdrawal): WalletSecurityAuditRow {
  return {
    id: `legacy-withdrawal-${withdrawal.id}`,
    event: withdrawalStatusToEvent(withdrawal.status),
    outcome: 'success',
    actorId: withdrawal.reviewedById ?? withdrawal.requestedById,
    actorRole: null,
    storeId: withdrawal.storeId,
    amountCents: withdrawalAmountCents(withdrawal),
    reference: null,
    withdrawalId: withdrawal.id,
    transactionId: withdrawal.walletTransactionId,
    payoutId: null,
    clientIp: null,
    reason: withdrawal.rejectionReason,
    orderNumber: null,
    createdAt: withdrawal.updatedAt ?? withdrawal.createdAt,
  };
}

/** Branch withdrawals recorded before wallet_security_audit_logs existed (or when insert failed). */
export async function listLegacyBranchWithdrawalAuditRows(limit: number): Promise<WalletSecurityAuditRow[]> {
  const withdrawals = await prisma.storeWithdrawal.findMany({
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

  if (withdrawals.length === 0) return [];

  const ids = withdrawals.map((w) => w.id);
  let audited = new Set<string>();
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const existing = await prisma.$queryRawUnsafe<{ withdrawalId: string }[]>(
      `SELECT DISTINCT "withdrawalId" FROM "wallet_security_audit_logs"
       WHERE "withdrawalId" IN (${placeholders})`,
      ...ids,
    );
    audited = new Set(existing.map((r) => r.withdrawalId).filter(Boolean));
  }

  return withdrawals.filter((w) => !audited.has(w.id)).map(withdrawalToLegacyAuditRow);
}

export function mergeWalletSecurityAuditRows(
  primary: WalletSecurityAuditRow[],
  supplemental: WalletSecurityAuditRow[],
  page: number,
  limit: number,
): { rows: WalletSecurityAuditRow[]; total: number } {
  const byKey = new Map<string, WalletSecurityAuditRow>();
  for (const row of primary) {
    byKey.set(row.id, row);
  }
  for (const row of supplemental) {
    if (!byKey.has(row.id)) {
      byKey.set(row.id, row);
    }
  }
  const merged = [...byKey.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const skip = (page - 1) * limit;
  return {
    rows: merged.slice(skip, skip + limit),
    total: merged.length,
  };
}
