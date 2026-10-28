import { config } from '../config';
import { logger } from '../utils/logger';

type RedisClient = {
  connect(): Promise<void>;
  quit(): Promise<void>;
  duplicate(): RedisClient;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, listener: (message: string) => void): Promise<void>;
  on(event: 'error', listener: (err: Error) => void): unknown;
};

let pubClient: RedisClient | null = null;
let subClient: RedisClient | null = null;

/** Optional Redis clients for Socket.io adapter and shared rate-limit store. */
export async function getRedisPubSub(): Promise<{ pub: RedisClient; sub: RedisClient } | null> {
  const url = config.redisUrl?.trim();
  if (!url) return null;

  if (pubClient && subClient) return { pub: pubClient, sub: subClient };

  try {
    const { createClient } = await import('redis');
    pubClient = createClient({ url }) as unknown as RedisClient;
    subClient = pubClient.duplicate();
    pubClient.on('error', (err: Error) => logger.warn('Redis pub client error', err));
    subClient.on('error', (err: Error) => logger.warn('Redis sub client error', err));
    await pubClient.connect();
    await subClient.connect();
    logger.info('Redis connected for Socket.io / rate limits');
    return { pub: pubClient, sub: subClient };
  } catch (err) {
    logger.warn('Redis unavailable — falling back to in-memory state', err);
    pubClient = null;
    subClient = null;
    return null;
  }
}

export async function closeRedisClients(): Promise<void> {
  await Promise.all([
    pubClient?.quit().catch(() => undefined),
    subClient?.quit().catch(() => undefined),
  ]);
  pubClient = null;
  subClient = null;
}
