import { prisma } from '@bingchun/db';
import { IntegrationEventType } from '@bingchun/delivery-domain';
import { config } from '../config';
import { logger } from '../utils/logger';
import { postOrderStatusToCore, type OrderStatusOutboxPayload } from '../internal/coreClient';
import { publishIntegrationEvent } from '../lib/integrationStream';

const POLL_INTERVAL_MS = 1_000;
const BATCH_LIMIT = 20;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

let outboxTableMissingLogged = false;

function isMissingOutboxTable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const e = err as { code: string; meta?: { table?: string } };
  return e.code === 'P2021' && String(e.meta?.table ?? '').includes('delivery_outbox');
}

function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** attempts);
}

/** ADR 0003 — single sweep of the delivery outbox. Exported standalone so it can be
 *  unit-tested / invoked manually without starting the interval timer. */
export async function processOutboxOnce(): Promise<{ processed: number; delivered: number; failed: number }> {
  let rows: Awaited<ReturnType<typeof prisma.deliveryOutbox.findMany>>;
  try {
    rows = await prisma.deliveryOutbox.findMany({
      where: { deliveredAt: null, nextRetryAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
    });
  } catch (err) {
    if (isMissingOutboxTable(err)) {
      if (!outboxTableMissingLogged) {
        outboxTableMissingLogged = true;
        logger.warn(
          'Table delivery.delivery_outbox is missing. Run `npm run db:deploy` from the repo root, then restart delivery-service.',
        );
      }
      return { processed: 0, delivered: 0, failed: 0 };
    }
    throw err;
  }

  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = row.payload as unknown as OrderStatusOutboxPayload;
      let deliveredViaStream = false;

      if (config.deliveryIntegrationEventsEnabled) {
        deliveredViaStream = await publishIntegrationEvent({
          id: row.id,
          type: IntegrationEventType.DELIVERY_ORDER_STATUS,
          source: 'delivery',
          payload,
          createdAt: row.createdAt.toISOString(),
        });
      }

      const { ok, status, text } = deliveredViaStream
        ? { ok: true, status: 200, text: 'redis' }
        : await postOrderStatusToCore(payload);

      if (ok) {
        await prisma.deliveryOutbox.update({
          where: { id: row.id },
          data: { deliveredAt: new Date(), lastError: null },
        });
        delivered += 1;
      } else {
        const attempts = row.attempts + 1;
        await prisma.deliveryOutbox.update({
          where: { id: row.id },
          data: {
            attempts,
            nextRetryAt: new Date(Date.now() + backoffMs(attempts)),
            lastError: `HTTP ${status}: ${text.slice(0, 500)}`,
          },
        });
        logger.warn(`Outbox row ${row.id} failed (status ${status}), retry #${attempts} scheduled`);
        failed += 1;
      }
    } catch (err) {
      const attempts = row.attempts + 1;
      await prisma.deliveryOutbox
        .update({
          where: { id: row.id },
          data: {
            attempts,
            nextRetryAt: new Date(Date.now() + backoffMs(attempts)),
            lastError: err instanceof Error ? err.message : String(err),
          },
        })
        .catch(() => {});
      logger.error(`Outbox row ${row.id} threw`, err);
      failed += 1;
    }
  }

  return { processed: rows.length, delivered, failed };
}

let timer: NodeJS.Timeout | null = null;

export function startOutboxWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    processOutboxOnce().catch((err) => logger.error('Outbox worker tick failed', err));
  }, POLL_INTERVAL_MS);
  logger.info(`Outbox worker started (every ${POLL_INTERVAL_MS / 1000}s, batch ${BATCH_LIMIT})`);
}

export function stopOutboxWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
