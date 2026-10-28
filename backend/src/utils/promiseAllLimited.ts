/**
 * Like Promise.all but caps how many tasks run at once — keeps Prisma pool usage
 * predictable when a handler fans out many DB queries.
 */
export function promiseAllLimited<T extends readonly (() => Promise<unknown>)[] | []>(
  limit: number,
  factories: T,
): Promise<{ -readonly [P in keyof T]: T[P] extends () => Promise<infer R> ? R : never }>;
export async function promiseAllLimited(
  limit: number,
  factories: Array<() => Promise<unknown>>,
): Promise<unknown[]> {
  if (factories.length === 0) return [];

  const results = new Array<unknown>(factories.length);
  let next = 0;
  const workers = Math.min(Math.max(1, limit), factories.length);

  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= factories.length) return;
      results[index] = await factories[index]();
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
