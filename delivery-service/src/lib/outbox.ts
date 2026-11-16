import { prisma } from '@bingchun/db';
import { processOutboxOnce } from '../jobs/outboxWorker';

export interface OrderStatusOutboxPayload {
  orderId: string;
  status: string;
  note?: string;
  orderNumber?: string;
  userId?: string | null;
  orderMode?: string;
  lat?: number | null;
  lng?: number | null;
  dropoffAt?: string | null;
}

/** ADR 0003 — delivery service never writes `orders`; it commits its own state and
 *  enqueues this row so the retry worker can ask core to apply the transition. */
export async function enqueueOrderStatusOutbox(payload: OrderStatusOutboxPayload): Promise<void> {
  const idempotencyKey = `${payload.orderId}:${payload.status}`;
  await prisma.deliveryOutbox.upsert({
    where: { idempotencyKey },
    create: {
      type: 'ORDER_STATUS',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      idempotencyKey,
    },
    update: {},
  });

  // Process immediately so core (and customer sockets) update without waiting for the poll interval.
  void processOutboxOnce().catch(() => {});
}
