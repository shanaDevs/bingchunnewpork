/** Redis stream for cross-service integration (core ↔ delivery). */
export const INTEGRATION_STREAM_KEY =
  process.env.INTEGRATION_STREAM_KEY || 'bingchun:integration';

export const IntegrationEventType = {
  /** delivery-service → core: apply order status (same payload as internal HTTP). */
  DELIVERY_ORDER_STATUS: 'delivery.order_status',
  /** core → delivery-service (future): order lifecycle fan-out. */
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_STATUS_CHANGED: 'order.status_changed',
} as const;

export type IntegrationEventSource = 'core' | 'delivery';

export type IntegrationEventEnvelope<T = unknown> = {
  id: string;
  type: string;
  source: IntegrationEventSource;
  payload: T;
  createdAt: string;
};
