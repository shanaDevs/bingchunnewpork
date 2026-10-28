import { prisma } from './prisma';
import { isPrismaConnectivityError } from '../utils/prismaErrors';
import { qualifiedPhysicalTable } from './deliveryPg';

/**
 * Match boot-time policy in index.ts: only core may run DDL/ALTER patches.
 * Shop/admin/pos still called ensure* on request paths and exhausted the Prisma
 * pool (P2024) while holding advisory/table locks against PgBouncer.
 */
export function runtimeSchemaPatchesAllowed(): boolean {
  const surface = (process.env.API_SURFACE || 'core').trim().toLowerCase();
  if (surface && surface !== 'core') return false;
  return process.env.RUNTIME_SCHEMA_PATCHES !== 'false';
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Remote Postgres sometimes resets idle/pooled sockets mid-boot (Windows
 * error 10054 / Prisma P1017). Reconnect and retry idempotent patches.
 */
export async function withSchemaPatchRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isPrismaConnectivityError(err) || attempt >= attempts) throw err;

      console.warn(
        `[schema-patch] ${label}: database connection dropped `
          + `(attempt ${attempt}/${attempts}), reconnecting…`,
      );
      await prisma.$disconnect().catch(() => undefined);
      await sleep(750 * attempt);
      await prisma.$connect();
    }
  }

  throw lastErr;
}

function quoteIndexColumns(columnsSql: string): string {
  return columnsSql
    .split(',')
    .map((part) => part.trim().replace(/`/g, '').replace(/^"+|"+$/g, ''))
    .filter(Boolean)
    .map(quoteIdent)
    .join(', ');
}

/** Convert MySQL column defs used by runtime patches into PostgreSQL. */
export function pgColumnDef(columnDef: string): string {
  return columnDef
    .replace(/\bDATETIME\(\d+\)/gi, 'TIMESTAMP(3)')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP(3)')
    .replace(/\bTINYINT\(\d+\)/gi, 'BOOLEAN')
    .replace(/\bDOUBLE(?!\s+PRECISION)\b/gi, 'DOUBLE PRECISION')
    .replace(/\s+ON UPDATE CURRENT_TIMESTAMP(\(\d+\))?/gi, '')
    .replace(/ENUM\s*\([^)]+\)/gi, 'TEXT')
    .replace(/\bBOOLEAN NOT NULL DEFAULT 1\b/gi, 'BOOLEAN NOT NULL DEFAULT true')
    .replace(/\bBOOLEAN NOT NULL DEFAULT 0\b/gi, 'BOOLEAN NOT NULL DEFAULT false');
}

/** Convert MySQL-style raw SQL (backticks, DATABASE(), ?) to PostgreSQL. */
export function toPg(sql: string): string {
  let i = 0;
  return sql
    .replace(/`([^`]+)`/g, (_m, name: string) => quoteIdent(name))
    .replace(/\bDATABASE\(\)/gi, 'current_schema()')
    .replace(/\?/g, () => `$${++i}`);
}

export async function querySql<T = unknown>(sql: string, ...params: unknown[]): Promise<T> {
  return prisma.$queryRawUnsafe<T>(toPg(sql), ...params);
}

export async function execSql(sql: string, ...params: unknown[]): Promise<number> {
  return prisma.$executeRawUnsafe(toPg(sql), ...params);
}

export async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1`,
    table,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1
       AND column_name = $2`,
    table,
    column,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function tableHasIndex(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM pg_indexes
     WHERE schemaname IN ('public', 'delivery')
       AND tablename = $1
       AND (indexname = $2 OR indexname = left($2, 63))`,
    table,
    indexName,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function tableHasConstraint(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.table_constraints
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1
       AND constraint_name = $2`,
    table,
    constraintName,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

export async function addColumnIfMissing(
  table: string,
  column: string,
  columnDef: string,
): Promise<void> {
  if (!runtimeSchemaPatchesAllowed()) return;
  if (!(await tableExists(table))) return;
  const tableRef = await qualifiedPhysicalTable(table);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${tableRef} ADD COLUMN IF NOT EXISTS ${quoteIdent(column)} ${pgColumnDef(columnDef)}`,
  );
}

export async function ensureEnumTypeIfMissing(enumName: string, values: string[]): Promise<void> {
  if (!runtimeSchemaPatchesAllowed()) return;
  const quoted = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
  await prisma.$executeRawUnsafe(
    `DO $$ BEGIN CREATE TYPE ${quoteIdent(enumName)} AS ENUM (${quoted}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  );
}

function isDuplicateEnumLabel(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const meta = (err as { meta?: { code?: unknown } }).meta;
  return meta?.code === '42710';
}

export async function ensureEnumValueIfMissing(enumName: string, value: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt
     FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = $1 AND e.enumlabel = $2`,
    enumName,
    value,
  );
  if (Number(rows[0]?.cnt ?? 0) > 0) return;
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE ${quoteIdent(enumName)} ADD VALUE '${value.replace(/'/g, "''")}'`);
  } catch (err) {
    // Job detail and route both patch on open, so two requests can pass the
    // existence check and race the ALTER. The loser should continue.
    if (isDuplicateEnumLabel(err)) return;
    throw err;
  }
}

export async function createIndexIfMissing(
  table: string,
  indexName: string,
  columnsSql: string,
): Promise<void> {
  if (!runtimeSchemaPatchesAllowed()) return;
  if (!(await tableExists(table))) return;
  if (await tableHasIndex(table, indexName)) return;
  const tableRef = await qualifiedPhysicalTable(table);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${tableRef} (${quoteIndexColumns(columnsSql)})`,
  );
}

export async function createUniqueIndexIfMissing(
  table: string,
  indexName: string,
  columnsSql: string,
): Promise<void> {
  if (!runtimeSchemaPatchesAllowed()) return;
  if (!(await tableExists(table))) return;
  if (await tableHasIndex(table, indexName)) return;
  const tableRef = await qualifiedPhysicalTable(table);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${tableRef} (${quoteIndexColumns(columnsSql)})`,
  );
}

export async function columnIsNullable(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ is_nullable: string }>>(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1
       AND column_name = $2
     ORDER BY CASE table_schema WHEN 'delivery' THEN 0 ELSE 1 END
     LIMIT 1`,
    table,
    column,
  );
  return (rows[0]?.is_nullable ?? '').toUpperCase() === 'YES';
}

export async function columnUdtName(table: string, column: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ udt_name: string }>>(
    `SELECT udt_name FROM information_schema.columns
     WHERE table_schema IN ('public', 'delivery')
       AND table_name = $1
       AND column_name = $2
     ORDER BY CASE table_schema WHEN 'delivery' THEN 0 ELSE 1 END
     LIMIT 1`,
    table,
    column,
  );
  return rows[0]?.udt_name ?? null;
}

/** Prisma already owns the schema on Postgres — skip MySQL CREATE TABLE when present. */
export async function skipCreateIfTableExists(table: string): Promise<boolean> {
  return tableExists(table);
}
