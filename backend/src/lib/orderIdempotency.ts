import { prisma } from './prisma';
import { isPrismaConnectivityError, retryOnceOnDisconnect } from '../utils/prismaErrors';

const IDEM_LOCK_PREFIX = 'idem:';

/** A closed pool socket is discarded by Prisma; reconnect without dropping the rest of the pool. */
async function reconnectPool(): Promise<void> {
  await prisma.$connect();
}

/** Session-level lock: serializes concurrent placements sharing the same idempotency key. */
export async function acquireOrderIdempotencySessionLock(idempotencyKey: string): Promise<void> {
  await retryOnceOnDisconnect(
    () => prisma.$executeRaw`SELECT pg_advisory_lock(hashtext(${IDEM_LOCK_PREFIX + idempotencyKey}))`,
    reconnectPool,
  );
}

export async function releaseOrderIdempotencySessionLock(idempotencyKey: string): Promise<void> {
  try {
    await retryOnceOnDisconnect(
      () => prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext(${IDEM_LOCK_PREFIX + idempotencyKey}))`,
      reconnectPool,
    );
  } catch (err) {
    // The session died with the socket, so Postgres already released the lock.
    if (!isPrismaConnectivityError(err)) throw err;
  }
}
