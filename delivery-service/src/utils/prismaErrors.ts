import { logger } from './logger';

const CONNECTIVITY_CODES = new Set(['P1001', 'P1017', 'P2024']);

/**
 * Windows 10054 / Linux 107 / Prisma "Server has closed the connection" — not always a coded P1017.
 * PgBouncer transaction mode often surfaces as `kind: Io` + `NotConnected` / `Socket not connected`.
 */
const CONNECTIVITY_MESSAGE =
  /P1017|P1001|P2024|10054|\b107\b|forcibly closed|connection reset|server has closed the connection|socket not connected|notconnected|kind:\s*ConnectionReset|kind:\s*Closed|kind:\s*Io|kind:\s*NotConnected/i;

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function errorMetaText(err: object): string {
  if (!('meta' in err)) return '';
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta === 'string') return meta;
  if (meta == null || typeof meta !== 'object') return '';
  try {
    return JSON.stringify(meta);
  } catch {
    return '';
  }
}

/** Message, cause chain, and Prisma `meta` — the engine text is not always the top-level message. */
function connectivityText(err: unknown, seen = new Set<unknown>()): string {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object' || seen.has(err)) return '';
  seen.add(err);

  const parts = [errorMessage(err), errorMetaText(err)].filter((part): part is string => !!part);
  const cause = (err as { cause?: unknown }).cause;
  if (cause != null) parts.push(connectivityText(cause, seen));
  return parts.join(' ');
}

function chainHasConnectivityCode(err: unknown, seen = new Set<unknown>()): boolean {
  if (!err || typeof err !== 'object' || seen.has(err)) return false;
  seen.add(err);
  const code = errorCode(err);
  if (code != null && CONNECTIVITY_CODES.has(code)) return true;
  const cause = (err as { cause?: unknown }).cause;
  return cause != null && chainHasConnectivityCode(cause, seen);
}

/** True when Prisma cannot reach the DB or the pool is holding a dead socket. */
export function isPrismaConnectivityError(err: unknown): boolean {
  if (chainHasConnectivityCode(err)) return true;
  const text = connectivityText(err);
  return text.length > 0 && CONNECTIVITY_MESSAGE.test(text);
}

/** Run `fn` once. If the database socket was reset, reconnect and try exactly once more. */
export async function retryOnceOnDisconnect<T>(
  fn: () => Promise<T>,
  reconnect: () => Promise<void>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err;
    logger.warn('Database connection dropped, reconnecting and retrying once');
    await reconnect();
    return await fn();
  }
}
