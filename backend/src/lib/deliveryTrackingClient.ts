import { config } from '../config';
import { logger } from '../utils/logger';
import type {
  AssignedDriverPublic,
  DeliveryTrackPhase,
  LiveDriverLocationPayload,
} from './liveDriverTracking';

export type DeliveryTrackingSnapshot = {
  location: LiveDriverLocationPayload | null;
  phase: DeliveryTrackPhase | null;
  pickedUp: boolean;
  pickedUpAt: string | null;
  driver: AssignedDriverPublic | null;
};

/** Internal delivery-service tracking API (Phase 2c). */
export async function fetchDeliveryTrackingFromService(
  orderId: string,
): Promise<DeliveryTrackingSnapshot | null> {
  if (!config.deliveryTrackingViaService) return null;
  if (!config.internalServiceSecret) return null;

  const base = config.deliveryServiceUrl.replace(/\/$/, '');
  const url = `${base}/delivery-api/internal/orders/${encodeURIComponent(orderId)}/tracking`;

  try {
    const res = await fetch(url, {
      headers: { 'X-Internal-Secret': config.internalServiceSecret },
    });
    if (!res.ok) {
      logger.warn(`Delivery tracking API ${res.status} for order ${orderId}`);
      return null;
    }
    const json = (await res.json()) as { data?: DeliveryTrackingSnapshot };
    return json.data ?? null;
  } catch (err) {
    logger.warn('Delivery tracking API request failed', err);
    return null;
  }
}
