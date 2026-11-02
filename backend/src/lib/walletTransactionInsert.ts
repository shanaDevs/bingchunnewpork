import type { PaymentMethod, Prisma, WalletTransactionType } from '@prisma/client';
import { centsToDecimal } from './moneyDecimal';

export type WalletLedgerInsert = {
  id: string;
  storeId: string;
  type: WalletTransactionType;
  /** Signed integer cents (matches amount column semantics). */
  amountCents: number;
  balanceAfterCents: number;
  orderId?: string | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
  description?: string | null;
  reference?: string | null;
  createdById?: string | null;
  periodFrom?: Date | null;
  periodTo?: Date | null;
};

/** Insert a wallet ledger row (matches Prisma `WalletTransaction` / Postgres schema). */
export async function insertWalletLedgerRow(
  tx: Prisma.TransactionClient,
  row: WalletLedgerInsert,
): Promise<void> {
  await tx.walletTransaction.create({
    data: {
      id: row.id,
      storeId: row.storeId,
      orderId: row.orderId ?? null,
      type: row.type,
      amount: centsToDecimal(row.amountCents),
      balanceAfter: centsToDecimal(row.balanceAfterCents),
      paymentMethod: (row.paymentMethod ?? null) as PaymentMethod | null,
      paymentRef: row.paymentRef ?? null,
      description: row.description ?? null,
      reference: row.reference ?? null,
      createdById: row.createdById ?? null,
      periodFrom: row.periodFrom ?? null,
      periodTo: row.periodTo ?? null,
    },
  });
}
