import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { columnUdtName, runtimeSchemaPatchesAllowed, tableExists } from './schemaPatch';
import { getDeliveryJobsSqlRef, primeDeliverySqlRefs } from './deliveryPg';

/**
 * Columns changed from INTEGER to DECIMAL(20,4) in
 * packages/db/prisma/migrations/20261005120000_admin_money_decimal.
 * Runtime patches only ADD missing columns, so existing integer columns stay
 * integer and Prisma's numeric bind is rejected (Postgres 22P03).
 */
const PUBLIC_MONEY_COLUMNS: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  { table: 'store_wallets', columns: ['balance', 'totalEarnings', 'totalWithdrawn'] },
  { table: 'store_withdrawals', columns: ['amount'] },
  { table: 'wallet_transactions', columns: ['amount', 'balanceAfter'] },
  {
    table: 'commission_settlements',
    columns: ['totalCommission', 'totalProviderFee', 'platformPaybackAmount'],
  },
  {
    table: 'platform_earnings',
    columns: [
      'commissionAmount',
      'convenienceFeeAmount',
      'platformPaybackAmount',
      'sharedPromoContributionAmount',
      'loyaltyDiscountAmount',
      'netPlatformCommissionAmount',
      'completedRefundConvenienceAmount',
      'rejectedRefundConvenienceAmount',
      'netPlatformEarningsAmount',
      'eligibleProviderAmount',
      'gatewayDeductionAmount',
      'totalEarned',
    ],
  },
  {
    table: 'platform_monthly_settlements',
    columns: ['totalCommission', 'totalConvenienceFee', 'totalEarned'],
  },
  { table: 'jason_ledger_entries', columns: ['amount', 'balanceBefore', 'balanceAfter'] },
];

let moneyDecimalSchemaReady = false;

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const meta = (err as { meta?: { code?: string; message?: string } }).meta;
  return [err.message, meta?.code, meta?.message].filter(Boolean).join(' ');
}

/** Postgres refuses ALTER TYPE when an integer DEFAULT cannot cast to numeric. */
function isDefaultCastError(err: unknown): boolean {
  const text = errorText(err);
  return /default for column/i.test(text) && /cannot be cast automatically/i.test(text);
}

/** information_schema defaults are literals like `0` or `0::integer`. */
function numericDefaultLiteral(columnDefault: string): string | null {
  const match = columnDefault.trim().match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const rest = columnDefault.trim().slice(match[0].length).trim();
  if (rest !== '' && !/^::[\w\s]+$/.test(rest)) return null;
  return match[0];
}

async function readColumnDefault(table: string, column: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_default: string | null }>>(
    `SELECT column_default FROM information_schema.columns
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1
       AND column_name = $2
     ORDER BY CASE table_schema WHEN 'delivery' THEN 0 ELSE 1 END
     LIMIT 1`,
    table,
    column,
  );
  return rows[0]?.column_default ?? null;
}

async function restoreNumericDefault(
  tableRef: string,
  column: string,
  previousDefault: string | null,
): Promise<void> {
  if (previousDefault == null) return;
  const literal = numericDefaultLiteral(previousDefault);
  if (!literal) {
    throw new Error(
      `Could not restore default for ${tableRef}.${column} after DECIMAL alter: ${previousDefault}`,
    );
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdent(column)} SET DEFAULT ${literal}`,
  );
}

async function alterColumnToDecimal(tableRef: string, table: string, column: string): Promise<void> {
  const udt = await columnUdtName(table, column);
  if (!udt || udt === 'numeric') return;

  const col = quoteIdent(column);
  const alterSql =
    `ALTER TABLE ${tableRef} ALTER COLUMN ${col} TYPE DECIMAL(20,4) USING ${col}::numeric(20,4)`;

  try {
    await prisma.$executeRawUnsafe(alterSql);
  } catch (err) {
    if (!isDefaultCastError(err)) throw err;
    const previousDefault = await readColumnDefault(table, column);
    await prisma.$executeRawUnsafe(`ALTER TABLE ${tableRef} ALTER COLUMN ${col} DROP DEFAULT`);
    try {
      await prisma.$executeRawUnsafe(alterSql);
    } catch (alterErr) {
      await restoreNumericDefault(tableRef, column, previousDefault);
      throw alterErr;
    }
    await restoreNumericDefault(tableRef, column, previousDefault);
  }

  logger.info(`[schema-patch] ${table}.${column}: ${udt} -> DECIMAL(20,4)`);
}

/** Align live money columns with Prisma Decimal(20,4). Idempotent. */
export async function ensureAdminMoneyDecimalColumns(): Promise<void> {
  if (moneyDecimalSchemaReady) return;
  // Only core may ALTER money columns at runtime (admin wallet used to trigger this).
  if (!runtimeSchemaPatchesAllowed()) {
    moneyDecimalSchemaReady = true;
    return;
  }

  for (const { table, columns } of PUBLIC_MONEY_COLUMNS) {
    if (!(await tableExists(table))) continue;
    const tableRef = `"public".${quoteIdent(table)}`;
    for (const column of columns) {
      await alterColumnToDecimal(tableRef, table, column);
    }
  }

  if (await tableExists('delivery_jobs')) {
    await primeDeliverySqlRefs();
    const tableRef = getDeliveryJobsSqlRef();
    await alterColumnToDecimal(tableRef, 'delivery_jobs', 'totalDeliveryFees');
  }

  moneyDecimalSchemaReady = true;
}
