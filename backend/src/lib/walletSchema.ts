import { prisma } from './prisma';
import { addColumnIfMissing } from './schemaPatch';

let walletSchemaReady = false;

/** Ensures wallet settlement columns exist (idempotent). */
export async function ensureWalletSettlementColumns(): Promise<void> {
  if (walletSchemaReady) return;

  await addColumnIfMissing('store_wallets', 'lastSettledAt', 'DATETIME(3) NULL');
  await addColumnIfMissing('wallet_transactions', 'settledAt', 'DATETIME(3) NULL');
  await addColumnIfMissing('wallet_transactions', 'periodFrom', 'DATETIME(3) NULL');
  await addColumnIfMissing('wallet_transactions', 'periodTo', 'DATETIME(3) NULL');

  await prisma.$executeRawUnsafe(`
    DELETE FROM "wallet_transactions" a
    USING "wallet_transactions" b
    WHERE a."orderId" IS NOT NULL
      AND a."orderId" = b."orderId"
      AND a."type" = b."type"
      AND a."type" IN ('ORDER_PAYMENT', 'ORDER_ADDON_PAYMENT')
      AND a."createdAt" > b."createdAt"
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_tx_order_type"
    ON "wallet_transactions" ("orderId", "type")
  `);

  walletSchemaReady = true;
}
