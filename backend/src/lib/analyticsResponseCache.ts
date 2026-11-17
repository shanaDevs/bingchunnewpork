const DEFAULT_TTL_MS = Number.parseInt(process.env.ANALYTICS_CACHE_TTL_MS ?? '60000', 10) || 60_000;

export function getAnalyticsCacheTtlMs(): number {
  return DEFAULT_TTL_MS;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const store = new Map<string, CacheEntry<unknown>>();

export function analyticsCacheKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => (part == null ? '' : String(part))).join('|');
}

export async function withAnalyticsCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
  bypassCache = process.env.NODE_ENV === 'test',
): Promise<T> {
  if (bypassCache) {
    return fn();
  }
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await fn();
  store.set(key, { expiresAt: now + ttlMs, value });
  if (store.size > 500) {
    for (const [entryKey, entry] of store) {
      if (entry.expiresAt <= now) store.delete(entryKey);
    }
  }
  return value;
}

export function invalidateAnalyticsCache(key: string): void {
  store.delete(key);
}

/** Remove all entries whose key starts with `prefix` (e.g. all date-scoped wallet-payouts-due rows). */
export function invalidateAnalyticsCacheByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}|`)) {
      store.delete(key);
    }
  }
}

export function clearAnalyticsResponseCache(): void {
  store.clear();
}
