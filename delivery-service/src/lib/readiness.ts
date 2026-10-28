import { prisma } from '@bingchun/db';
import { createClient } from 'redis';
import { config } from '../config';

export type ReadinessChecks = {
  database: 'ok' | 'fail';
  redis: 'ok' | 'fail' | 'skipped';
};

export async function checkDatabase(): Promise<'ok' | 'fail'> {
  if (!config.databaseUrl) return 'fail';
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'fail';
  }
}

export async function checkRedis(): Promise<'ok' | 'fail' | 'skipped'> {
  const url = config.redisUrl?.trim();
  if (!url) return 'skipped';

  const client = createClient({ url });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG' ? 'ok' : 'fail';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return 'fail';
  }
}

export async function runReadinessChecks(): Promise<ReadinessChecks> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  return { database, redis };
}

export function isReady(checks: ReadinessChecks): boolean {
  if (checks.database !== 'ok') return false;
  if (checks.redis === 'fail') return false;
  return true;
}
