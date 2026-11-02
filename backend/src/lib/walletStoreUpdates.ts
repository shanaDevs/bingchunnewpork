import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { centsToDecimal, parseDecimalFromDb } from './moneyDecimal';

export type LockedStoreWallet = {
  balance: Prisma.Decimal;
  totalWithdrawn: Prisma.Decimal;
};

export function parseLockedStoreWallet(row: {
  balance: unknown;
  totalWithdrawn: unknown;
}): LockedStoreWallet {
  return {
    balance: parseDecimalFromDb(row.balance),
    totalWithdrawn: parseDecimalFromDb(row.totalWithdrawn),
  };
}

/** Row-lock a branch wallet. Must run inside the caller's transaction. */
export async function lockStoreWallet(
  tx: Prisma.TransactionClient,
  storeId: string,
): Promise<LockedStoreWallet> {
  const rows = await tx.$queryRaw<Array<{ balance: unknown; totalWithdrawn: unknown }>>`
    SELECT "balance", "totalWithdrawn"
    FROM "store_wallets"
    WHERE "storeId" = ${storeId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new AppError('Wallet not found', 404);
  return parseLockedStoreWallet(row);
}

export function walletDataAfterDebit(
  locked: LockedStoreWallet,
  debitCents: number,
): { balance: Prisma.Decimal; totalWithdrawn: Prisma.Decimal } {
  const debit = centsToDecimal(debitCents);
  return {
    balance: locked.balance.minus(debit),
    totalWithdrawn: locked.totalWithdrawn.plus(debit),
  };
}

export function walletDataAfterBalanceDelta(
  currentBalance: Prisma.Decimal,
  deltaCents: number,
  opts?: { earningsDeltaCents?: number; withdrawnDeltaCents?: number },
  current?: { totalEarnings: Prisma.Decimal; totalWithdrawn: Prisma.Decimal },
): {
  balance: Prisma.Decimal;
  totalEarnings?: Prisma.Decimal;
  totalWithdrawn?: Prisma.Decimal;
} {
  const delta = centsToDecimal(deltaCents);
  const out: {
    balance: Prisma.Decimal;
    totalEarnings?: Prisma.Decimal;
    totalWithdrawn?: Prisma.Decimal;
  } = {
    balance: currentBalance.plus(delta),
  };
  if (opts?.earningsDeltaCents != null && current) {
    out.totalEarnings = current.totalEarnings.plus(centsToDecimal(opts.earningsDeltaCents));
  }
  if (opts?.withdrawnDeltaCents != null && current) {
    out.totalWithdrawn = current.totalWithdrawn.plus(centsToDecimal(opts.withdrawnDeltaCents));
  }
  return out;
}
