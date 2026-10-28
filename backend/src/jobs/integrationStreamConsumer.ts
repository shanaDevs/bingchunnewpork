import { IntegrationEventType, INTEGRATION_STREAM_KEY } from '@bingchun/delivery-domain';
import {
  applyOrderStatusFromDelivery,
  deliveryOrderStatusPayloadSchema,
} from '../lib/applyOrderStatusFromDelivery';
import { getIntegrationRedis, parseIntegrationStreamMessage } from '../lib/integrationStream';
import { config } from '../config';
import { logger } from '../utils/logger';

const POLL_BLOCK_MS = 5_000;
const BATCH = 20;

let running = false;
let lastId = '0-0';

async function processBatch(): Promise<void> {
  const redis = await getIntegrationRedis();
  if (!redis) return;

  const streams = await redis.xRead(
    [{ key: INTEGRATION_STREAM_KEY, id: lastId }],
    { COUNT: BATCH, BLOCK: POLL_BLOCK_MS },
  );
  if (!streams?.length) return;

  for (const stream of streams) {
    for (const entry of stream.messages) {
      lastId = entry.id;
      const envelope = parseIntegrationStreamMessage(entry.message as Record<string, string>);
      if (!envelope) continue;

      if (envelope.type === IntegrationEventType.DELIVERY_ORDER_STATUS) {
        try {
          const payload = deliveryOrderStatusPayloadSchema.parse(envelope.payload);
          await applyOrderStatusFromDelivery(payload);
        } catch (err) {
          logger.error(`Integration event ${envelope.id} failed`, err);
        }
      }
    }
  }
}

async function loop(): Promise<void> {
  while (running) {
    try {
      await processBatch();
    } catch (err) {
      logger.error('Integration stream consumer tick failed', err);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

export function startIntegrationStreamConsumer(): void {
  if (!config.deliveryIntegrationEventsEnabled) return;
  if (running) return;
  if (!config.redisUrl?.trim()) {
    logger.warn('DELIVERY_INTEGRATION_EVENTS_ENABLED but REDIS_URL is unset — consumer not started');
    return;
  }
  running = true;
  void loop();
  logger.info('Integration stream consumer started');
}

export function stopIntegrationStreamConsumer(): void {
  running = false;
}
