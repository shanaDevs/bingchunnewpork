import { createClient, type RedisClientType } from 'redis';
import { IntegrationEventEnvelope, INTEGRATION_STREAM_KEY } from '@bingchun/delivery-domain';
import { config } from '../config';
import { logger } from '../utils/logger';

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export async function getIntegrationRedis(): Promise<RedisClientType | null> {
  if (!config.redisUrl?.trim()) return null;
  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const c = createClient({ url: config.redisUrl });
      c.on('error', (err) => logger.warn('Integration Redis error', err));
      await c.connect();
      client = c as RedisClientType;
      return client;
    } catch (err) {
      logger.warn('Integration Redis unavailable', err);
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function publishIntegrationEvent(
  envelope: IntegrationEventEnvelope,
): Promise<boolean> {
  const redis = await getIntegrationRedis();
  if (!redis) return false;

  try {
    await redis.xAdd(INTEGRATION_STREAM_KEY, '*', {
      body: JSON.stringify(envelope),
    });
    return true;
  } catch (err) {
    logger.error('Failed to publish integration event', err);
    return false;
  }
}

export function parseIntegrationStreamMessage(fields: Record<string, string>): IntegrationEventEnvelope | null {
  const raw = fields.body ?? fields.payload;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IntegrationEventEnvelope;
  } catch {
    return null;
  }
}
