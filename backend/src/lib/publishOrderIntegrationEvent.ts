import { randomUUID } from 'crypto';
import { IntegrationEventType } from '@bingchun/delivery-domain';
import { config } from '../config';
import { publishIntegrationEvent } from './integrationStream';

export async function publishOrderStatusChangedEvent(payload: {
  orderId: string;
  status: string;
  previousStatus?: string;
  orderMode?: string;
}): Promise<void> {
  if (!config.deliveryIntegrationEventsEnabled) return;
  await publishIntegrationEvent({
    id: randomUUID(),
    type: IntegrationEventType.ORDER_STATUS_CHANGED,
    source: 'core',
    payload,
    createdAt: new Date().toISOString(),
  });
}

/** True only when the event was written to Redis. Callers ring the rider themselves when this is false. */
export async function publishOrderCancelledEvent(payload: {
  orderId: string;
  orderMode?: string;
  cancelledBy?: 'customer' | 'admin' | 'system';
}): Promise<boolean> {
  if (!config.deliveryIntegrationEventsEnabled) return false;
  return publishIntegrationEvent({
    id: randomUUID(),
    type: IntegrationEventType.ORDER_CANCELLED,
    source: 'core',
    payload,
    createdAt: new Date().toISOString(),
  });
}
