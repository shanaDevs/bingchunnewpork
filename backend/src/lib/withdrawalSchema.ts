import { ensureAdminMoneyDecimalColumns } from './moneyDecimalSchema';
import {
  addColumnIfMissing,
  columnUdtName,
  execSql,
  runtimeSchemaPatchesAllowed,
  tableHasColumn,
  withSchemaPatchRetry,
} from './schemaPatch';

let ensured = false;
let proofUrlWidened = false;
let inFlight: Promise<void> | null = null;

/** Ensure store_withdrawals table and wallet cache columns exist (idempotent). */
export function ensureWithdrawalSchema(): Promise<void> {
  // Non-core surfaces must not run DDL on the request path (pool timeouts / locks).
  if (!runtimeSchemaPatchesAllowed()) {
    ensured = true;
    proofUrlWidened = true;
    return Promise.resolve();
  }
  if (ensured && proofUrlWidened) {
    return ensureAdminMoneyDecimalColumns();
  }
  if (!inFlight) {
    inFlight = withSchemaPatchRetry('withdrawal', runEnsureWithdrawalSchema).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runEnsureWithdrawalSchema(): Promise<void> {
  await addColumnIfMissing('store_wallets', 'totalEarnings', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('store_wallets', 'totalWithdrawn', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('store_withdrawals', 'paymentMethod', "ENUM('BANK_TRANSFER', 'CASH') NULL");
  await addColumnIfMissing('store_withdrawals', 'proofUrl', 'TEXT NULL');
  await addColumnIfMissing('store_withdrawals', 'invoiceRef', 'VARCHAR(191) NULL');
  await addColumnIfMissing('store_withdrawals', 'invoiceUrl', 'VARCHAR(191) NULL');
  await addColumnIfMissing('store_withdrawals', 'checkNumber', 'VARCHAR(64) NULL');
  await addColumnIfMissing('store_withdrawals', 'checkDate', 'DATETIME(3) NULL');
  await addColumnIfMissing('store_withdrawals', 'periodFrom', 'DATETIME(3) NULL');
  await addColumnIfMissing('store_withdrawals', 'periodTo', 'DATETIME(3) NULL');
  await addColumnIfMissing('store_withdrawals', 'breakdown', 'JSONB NULL');
  await addColumnIfMissing('store_withdrawals', 'invoiceData', 'JSONB NULL');
  await addColumnIfMissing('store_withdrawals', 'isAdvance', 'BOOLEAN NOT NULL DEFAULT FALSE');

  const breakdownUdt = await columnUdtName('store_withdrawals', 'breakdown');
  if (breakdownUdt === 'json') {
    await execSql(
      `ALTER TABLE "store_withdrawals" ALTER COLUMN "breakdown" TYPE JSONB USING "breakdown"::jsonb`,
    );
  }

  // Spaces CDN URLs exceed VARCHAR(191); widen existing installs that are not already text.
  if (!proofUrlWidened && (await tableHasColumn('store_withdrawals', 'proofUrl'))) {
    const proofUdt = await columnUdtName('store_withdrawals', 'proofUrl');
    if (proofUdt && proofUdt !== 'text') {
      await execSql(
        `ALTER TABLE "store_withdrawals" ALTER COLUMN "proofUrl" TYPE TEXT USING "proofUrl"::TEXT`,
      );
    }
    proofUrlWidened = true;
  }

  // Verify columns exist before marking ready (guards against silent partial migration)
  const hasEarnings = await tableHasColumn('store_wallets', 'totalEarnings');
  const hasWithdrawn = await tableHasColumn('store_wallets', 'totalWithdrawn');
  if (!hasEarnings || !hasWithdrawn) {
    throw new Error(
      'store_wallets migration incomplete: totalEarnings/totalWithdrawn columns missing',
    );
  }

  await ensureAdminMoneyDecimalColumns();
  ensured = true;
}
