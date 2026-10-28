import { prisma } from '../lib/prisma';
import { addColumnIfMissing, createIndexIfMissing } from '../lib/schemaPatch';
import { logger } from '../utils/logger';

let ready = false;

/**
 * Boot-time patches so messaging orders work before `prisma migrate deploy`
 * in environments that still rely on RUNTIME_SCHEMA_PATCHES.
 */
export async function ensureMessagingSchema(): Promise<void> {
  if (ready) return;

  await addColumnIfMissing(
    'orders',
    'channel',
    `TEXT NOT NULL DEFAULT 'WEB'`,
  );
  await createIndexIfMissing('orders', 'orders_channel_createdAt_idx', '`channel`, `createdAt`');

  await addColumnIfMissing(
    'channel_messages',
    'senderType',
    `TEXT NOT NULL DEFAULT 'CUSTOMER'`,
  );
  await addColumnIfMissing('channel_messages', 'processingStartedAt', 'TIMESTAMP(3) NULL');
  await createIndexIfMissing(
    'channel_messages',
    'channel_messages_channel_direction_processed_createdAt_idx',
    '`channel`, `direction`, `processed`, `createdAt`',
  );
  await createIndexIfMissing(
    'channel_messages',
    'channel_messages_channel_externalUserId_senderType_createdAt_idx',
    '`channel`, `externalUserId`, `senderType`, `createdAt`',
  );

  await prisma.$executeRawUnsafe(`
    UPDATE "channel_messages"
    SET "processed" = true, "senderType" = 'SYSTEM'
    WHERE ("externalMessageId" LIKE 'webhook:%' OR "messageType" LIKE 'webhook_%')
      AND "processed" = false
  `).catch(() => undefined);

  ready = true;
  logger.info('messaging.schema_ready');
}
