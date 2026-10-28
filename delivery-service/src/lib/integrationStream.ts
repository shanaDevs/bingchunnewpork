import { createClient, type RedisClientType } from 'redis';
import {
  INTEGRATION_STREAM_KEY,
  type IntegrationEventEnvelope,
} from '@bingchun/delivery-domain';
import { config } from '../config';
import { logger } from '../utils/logger';

let client: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  if (!config.redisUrl?.trim()) return null;
  if (client?.isOpen) return client;
  try {
    const c = createClient({ url: config.redisUrl });
    c.on('error', (err) => logger.warn('Integration Redis error', err));
    await c.connect();
    client = c as RedisClientType;
    return client;
  } catch (err) {
    logger.warn('Integration Redis unavailable', err);
    return null;
  }
}

export const getIntegrationRedis = getRedis;

export function parseIntegrationStreamMessage(fields: Record<string, string>): IntegrationEventEnvelope | null {
  const raw = fields.body ?? fields.payload;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IntegrationEventEnvelope;
  } catch {
    return null;
  }
}

export async function publishIntegrationEvent(envelope: IntegrationEventEnvelope): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    await redis.xAdd(INTEGRATION_STREAM_KEY, '*', { body: JSON.stringify(envelope) });
    return true;
  } catch (err) {
    logger.error('Failed to publish integration event', err);
    return false;
  }
}
