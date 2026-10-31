import { parse as parseEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/** Ensure DATABASE_URL is loaded before PrismaClient reads process.env (monorepo / ts-node-dev safe). */
function bootstrapDatabaseEnv(): void {
  if (process.env.DATABASE_URL) return;

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend/.env'),
    path.resolve(__dirname, '../../../backend/.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const parsed = parseEnv(fs.readFileSync(envPath));
    // Only copy DATABASE_URL — never PORT / JWT from a sibling backend .env.
    if (parsed.DATABASE_URL) {
      process.env.DATABASE_URL = parsed.DATABASE_URL;
      return;
    }
  }
}

bootstrapDatabaseEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function defaultPrismaPoolLimit(): number {
  const surface = (process.env.API_SURFACE || '').trim().toLowerCase();
  // Behind PgBouncer (transaction mode) client connections are cheap — real Postgres
  // connections are capped by PgBouncer's default_pool_size, so allow more concurrency.
  // Keep modest even behind PgBouncer — CapRover rolling deploys double
  // every pool briefly, and Prisma P2024 appears when the local pool waits
  // on a saturated PgBouncer/Postgres.
  if (isPgbouncerDatabaseUrl()) {
    if (surface === 'admin' || surface === 'pos') return 5;
    if (surface === 'shop') return 6;
    return 5;
  }
  // Keep pools small: many CapRover apps + rolling deploys share one Postgres/PgBouncer.
  if (surface === 'shop' || surface === 'pos' || surface === 'admin') return 3;
  if (surface === 'core' || surface === '') {
    return process.env.NODE_ENV === 'development' ? 5 : 4;
  }
  return process.env.NODE_ENV === 'development' ? 5 : 4;
}

/** Resolved Prisma pool size (env / DATABASE_URL param / environment default). */
export function getPrismaPoolLimit(): number {
  const databaseUrl = process.env.DATABASE_URL;
  const fallback = defaultPrismaPoolLimit();

  if (!databaseUrl) {
    const fromEnv = process.env.PRISMA_CONNECTION_LIMIT;
    const parsed = fromEnv ? Number.parseInt(fromEnv, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  try {
    const url = new URL(databaseUrl);
    const fromEnv = process.env.PRISMA_CONNECTION_LIMIT;
    const fromUrl = url.searchParams.get('connection_limit');
    const raw = fromEnv || fromUrl;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Max parallel DB operations for heavy fan-out (wallet breakdown per store, etc.).
 * Reserves connections for concurrent HTTP handlers.
 */
export function getPrismaFanOutLimit(reserve = 1): number {
  return Math.max(1, Math.min(3, getPrismaPoolLimit() - reserve));
}


/** True when DATABASE_URL targets PgBouncer (transaction pooling). */
export function isPgbouncerDatabaseUrl(databaseUrl = process.env.DATABASE_URL): boolean {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    if (url.searchParams.get('pgbouncer') === 'true') return true;
    return /pgbouncer/i.test(url.hostname);
  } catch {
    return /pgbouncer=true|pgbouncer/i.test(databaseUrl);
  }
}

/**
 * Cap Postgres/MySQL `max_connections` by pinning Prisma's pool size.
 * Without this, Prisma defaults to ~`num_cpus * 2 + 1` per process — with
 * backend + delivery-service (+ rolling deploys) that quickly hits
 * P2037 "too many clients already".
 *
 * Override via `PRISMA_CONNECTION_LIMIT` / `PRISMA_POOL_TIMEOUT` / `PRISMA_CONNECT_TIMEOUT`
 * or already-present query params on `DATABASE_URL`.
 */
function pooledDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  try {
    const url = new URL(databaseUrl);
    // Env wins so CapRover can tune without rewriting DATABASE_URL.
    const connectionLimit = String(getPrismaPoolLimit());
    // Prefer short timeouts so CapRover health checks fail fast instead of
    // hanging ~60s and returning nginx 502 while the process is still "up".
    const poolTimeout =
      process.env.PRISMA_POOL_TIMEOUT
      || url.searchParams.get('pool_timeout')
      || '15';
    const connectTimeout =
      process.env.PRISMA_CONNECT_TIMEOUT
      || url.searchParams.get('connect_timeout')
      || '8';

    url.searchParams.set('connection_limit', connectionLimit);
    // Cap absurd CapRover URL values (e.g. pool_timeout=60) that turn outages into 502s.
    const poolTimeoutSec = Math.min(30, Math.max(5, Number.parseInt(String(poolTimeout), 10) || 15));
    const connectTimeoutSec = Math.min(15, Math.max(3, Number.parseInt(String(connectTimeout), 10) || 8));
    url.searchParams.set('pool_timeout', String(poolTimeoutSec));
    url.searchParams.set('connect_timeout', String(connectTimeoutSec));

    // Transaction-mode PgBouncer requires Prisma to disable prepared statements.
    // CapRover URLs may already include this; force it when the host is pgbouncer.
    if (isPgbouncerDatabaseUrl(url.toString()) && url.searchParams.get('pgbouncer') !== 'true') {
      url.searchParams.set('pgbouncer', 'true');
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createPrismaClient() {
  const devLogs: Array<'query' | 'warn' | 'error'> =
    process.env.NODE_ENV === 'development'
      ? process.env.DEBUG_PRISMA === '1'
        ? ['query', 'warn', 'error']
        : ['warn', 'error']
      : ['error'];

  const url = pooledDatabaseUrl();
  if (url && process.env.NODE_ENV !== 'test') {
    try {
      const parsed = new URL(url);
      const pgbouncer = parsed.searchParams.get('pgbouncer') === 'true' ? ' pgbouncer=true' : '';
      console.log(
        `[db] Prisma pool connection_limit=${parsed.searchParams.get('connection_limit')} `
        + `pool_timeout=${parsed.searchParams.get('pool_timeout')}s${pgbouncer}`,
      );
    } catch {
      /* ignore */
    }
  }

  const client = new PrismaClient({
    log: devLogs,
    ...(url ? { datasources: { db: { url } } } : {}),
  });

  // Idle sockets get dropped by PgBouncer / firewalls / DB restarts ("Socket not connected",
  // errno 107). Reads are idempotent, so retry them once on a fresh connection instead of
  // surfacing a 503. Writes and anything inside a transaction are never retried.
  client.$use(async (params, next) => {
    if (params.runInTransaction || !params.model || !RETRYABLE_READ_ACTIONS.has(params.action)) {
      return next(params);
    }
    try {
      return await next(params);
    } catch (err) {
      if (!isTransientSocketError(err)) throw err;
      console.warn(`[db] ${params.model}.${params.action} hit a dropped connection — retrying once`);
      await sleep(150 + Math.floor(Math.random() * 150));
      return next(params);
    }
  });

  return client;
}

const RETRYABLE_READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Dropped-socket errors only. P2024 (pool timeout) is excluded: retrying would deepen overload. */
const TRANSIENT_SOCKET_RE =
  /P1017|server has closed the connection|socket not connected|notconnected|connection reset|forcibly closed|kind:\s*(Io|Closed|ConnectionReset|NotConnected)/i;

function isTransientSocketError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 4) return false;
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (e.code === 'P1017') return true;
  if (typeof e.message === 'string' && TRANSIENT_SOCKET_RE.test(e.message)) return true;
  return e.cause != null && isTransientSocketError(e.cause, depth + 1);
}

/** One client per process, including development hot reloads. */
export const prisma = (globalForPrisma.prisma ??= createPrismaClient());

// Best-effort pool release on dev hot reload (ts-node-dev / nodemon).
if (process.env.NODE_ENV !== 'production') {
  const releasePool = () => {
    void prisma.$disconnect().catch(() => undefined);
    globalForPrisma.prisma = undefined;
  };
  process.once('SIGUSR2', releasePool);
  process.once('SIGHUP', releasePool);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectDb(options?: { retries?: number; delayMs?: number }) {
  const retries = options?.retries ?? Number(process.env.DB_CONNECT_RETRIES || 8);
  const delayMs = options?.delayMs ?? Number(process.env.DB_CONNECT_RETRY_MS || 1500);

  let lastErr: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    bootstrapDatabaseEnv();

    try {
      await prisma.$connect();
      // Session SET does not stick across PgBouncer transaction-mode checkouts.
      // Prisma multiSchema already qualifies public/delivery tables.
      if (!isPgbouncerDatabaseUrl()) {
        try {
          await prisma.$executeRawUnsafe(`SET search_path TO public, delivery`);
        } catch {
          /* delivery schema may not exist until migration is applied */
        }
      }
      console.log('[db] Database connected');
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[db] Database connection failed (attempt ${attempt}/${retries})`, err);

      if (attempt >= retries) break;

      // Release wedged engine sockets (P2024 / Closed) before retrying.
      await prisma.$disconnect().catch(() => undefined);
      await sleep(delayMs * attempt);
    }
  }

  console.error('[db] Database connection failed after all retries', lastErr);
  process.exit(1);
}

export async function disconnectDb() {
  await prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';
export { DELIVERY_PG_SCHEMA, deliveryTableSql } from './deliverySql';
