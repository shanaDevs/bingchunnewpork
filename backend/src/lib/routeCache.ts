/** Prefer importing from `@bingchun/delivery-domain` for new code. */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { payload: unknown; expiresAt: number }>();

export function routeCacheKey(jobId: string, pendingOrderIds: string[]): string {
  return `${jobId}:${[...pendingOrderIds].sort().join(',')}`;
}

export function getCachedRoute<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.payload as T;
}

export function setCachedRoute(key: string, payload: unknown): void {
  cache.set(key, { payload, expiresAt: Date.now() + TTL_MS });
}

export function invalidateJobRoute(jobId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${jobId}:`)) cache.delete(key);
  }
}
