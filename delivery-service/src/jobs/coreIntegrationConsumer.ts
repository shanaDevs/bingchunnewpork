import { IntegrationEventType, INTEGRATION_STREAM_KEY } from '@bingchun/delivery-domain';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getIntegrationRedis, parseIntegrationStreamMessage } from '../lib/integrationStream';
import { handleCoreOrderCancelled } from '../lib/orderCancelledFromCore';

const POLL_BLOCK_MS = 5_000;
let running = false;
/**
 * `$` asks Redis for messages that arrive after this call, so a process restart
 * does not replay old cancels and ring riders for rides that already ended.
 * After the first delivery, reads continue from that id so messages published
 * while a batch is handled are not skipped.
 */
let lastId = '$';

async function handleEnvelope(type: string, payload: unknown): Promise<void> {
  if (type === IntegrationEventType.ORDER_CANCELLED) {
    await handleCoreOrderCancelled(payload);
  } else if (type === IntegrationEventType.ORDER_STATUS_CHANGED) {
    logger.debug('Core order.status_changed event', payload);
  }
}

async function tick(): Promise<void> {
  const redis = await getIntegrationRedis();
  if (!redis) return;

  const streams = await redis.xRead(
    [{ key: INTEGRATION_STREAM_KEY, id: lastId }],
    { COUNT: 20, BLOCK: POLL_BLOCK_MS },
  );
  if (!streams?.length) return;

  for (const stream of streams) {
    for (const entry of stream.messages) {
      lastId = entry.id;
      const envelope = parseIntegrationStreamMessage(entry.message as Record<string, string>);
      if (!envelope || envelope.source !== 'core') continue;
      await handleEnvelope(envelope.type, envelope.payload);
    }
  }
}

async function loop(): Promise<void> {
  while (running) {
    try {
      await tick();
    } catch (err) {
      logger.error('Core integration consumer tick failed', err);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

export function startCoreIntegrationConsumer(): void {
  if (!config.deliveryIntegrationEventsEnabled) return;
  if (running) return;
  running = true;
  void loop();
  logger.info('Core integration consumer started (delivery-service)');
}

export function stopCoreIntegrationConsumer(): void {
  running = false;
}
