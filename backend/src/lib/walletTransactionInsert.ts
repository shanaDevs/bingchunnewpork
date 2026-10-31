import type { Prisma, WalletTransactionType } from '@prisma/client';
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

function walletTxDirection(amountCents: number): 'CREDIT' | 'DEBIT' {
  return amountCents >= 0 ? 'CREDIT' : 'DEBIT';
}

/**
 * Insert a wallet ledger row with Postgres-required metadata (`direction`, etc.)
 * that is not yet on the Prisma WalletTransaction model.
 */
export async function insertWalletLedgerRow(
  tx: Prisma.TransactionClient,
  row: WalletLedgerInsert,
): Promise<void> {
  const direction = walletTxDirection(row.amountCents);
  const idempotencyKey = `${row.type}:${row.id}`;

  await tx.$executeRaw`
    INSERT INTO "wallet_transactions" (
      "id",
      "storeId",
      "orderId",
      "type",
      "direction",
      "counterparty",
      "idempotencyKey",
      "amount",
      "balanceAfter",
      "paymentMethod",
      "paymentRef",
      "description",
      "reference",
      "createdById",
      "periodFrom",
      "periodTo"
    ) VALUES (
      ${row.id},
      ${row.storeId},
      ${row.orderId ?? null},
      ${row.type}::"WalletTransactionType",
      ${direction}::"WalletTxDirection",
      'CUSTOMER'::"WalletTxCounterparty",
      ${idempotencyKey},
      ${centsToDecimal(row.amountCents)},
      ${centsToDecimal(row.balanceAfterCents)},
      ${row.paymentMethod ? `${row.paymentMethod}` : null}::"PaymentMethod",
      ${row.paymentRef ?? null},
      ${row.description ?? null},
      ${row.reference ?? null},
      ${row.createdById ?? null},
      ${row.periodFrom ?? null},
      ${row.periodTo ?? null}
    )
  `;
}
