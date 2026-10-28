import { config } from '../config';
import { logger } from '../utils/logger';

export interface OrderStatusOutboxPayload {
  orderId: string;
  status: string;
  note?: string;
  orderNumber?: string;
  userId?: string | null;
  orderMode?: string;
}

/** Thin HTTP client for the internal API the core backend exposes to trusted services. */
async function postInternal(path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${config.coreApiUrl}/api/internal${path}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.internalServiceSecret,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    logger.error(`Core client request failed: ${path}`, err);
    return { ok: false, status: 0, text: err instanceof Error ? err.message : String(err) };
  }
}

export async function postOrderStatusToCore(payload: OrderStatusOutboxPayload) {
  return postInternal('/delivery/order-status', payload);
}

export async function postDeliveryCodeToCore(payload: { orderId: string; code: string }) {
  return postInternal('/delivery/send-code', payload);
}

export async function postSocketEmitToCore(room: string, event: string, socketPayload: unknown) {
  return postInternal('/socket/emit', { room, event, payload: socketPayload });
}
