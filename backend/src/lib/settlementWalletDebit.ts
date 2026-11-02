import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { centsToDecimal, lkrToCents } from './moneyDecimal';
import { walletBalanceCents } from './walletApiMoney';
import { insertWalletLedgerRow } from './walletTransactionInsert';
import { lockStoreWallet } from './walletStoreUpdates';

/** Net platform commission debited from branch wallet when commission settlement is recorded. */
export function computeNetCommissionSettlementDebitCents(
  totalCommissionLkr: number,
  platformPaybackAmountCents: number,
): number {
  return Math.max(0, lkrToCents(totalCommissionLkr) - platformPaybackAmountCents);
}

export async function debitStoreWalletForCommissionSettlement(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    netCommissionCents: number;
    statementRef: string;
    submittedById?: string;
    periodFrom: Date;
    periodTo: Date;
  },
): Promise<void> {
  if (input.netCommissionCents <= 0) return;

  const locked = await lockStoreWallet(tx, input.storeId);
  const balanceCents = walletBalanceCents({ balance: locked.balance });
  if (balanceCents < input.netCommissionCents) {
    throw new AppError(
      'Insufficient wallet balance to record platform commission settlement',
      400,
    );
  }

  const newBalance = locked.balance.minus(centsToDecimal(input.netCommissionCents));
  const balanceAfterCents = Number(newBalance.toFixed(0));

  await insertWalletLedgerRow(tx, {
    id: crypto.randomUUID(),
    storeId: input.storeId,
    type: 'ADJUSTMENT',
    amountCents: -input.netCommissionCents,
    balanceAfterCents,
    reference: input.statementRef,
    description: `Platform commission settlement ${input.statementRef}`,
    createdById: input.submittedById ?? null,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  });

  await tx.storeWallet.update({
    where: { storeId: input.storeId },
    data: { balance: newBalance },
  });
}
