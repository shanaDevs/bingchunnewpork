import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import type { MessagingChannelKind } from './types';
import type { Prisma } from '@prisma/client';

export type MessageSenderTypeKind = 'CUSTOMER' | 'BOT' | 'ADMIN' | 'SYSTEM';

const PROCESSING_LOCK_MS = 120_000;

/** Exclude Meta webhook breadcrumbs from customer conversation views. */
export function excludeWebhookNoiseWhere(): Prisma.ChannelMessageWhereInput {
  return {
    NOT: {
      OR: [
        { externalMessageId: { startsWith: 'webhook:' } },
        { messageType: { startsWith: 'webhook_' } },
      ],
    },
  };
}

/**
 * Persist inbound message from webhook (idempotent insert only).
 * Does not acquire processing lock — call tryAcquireProcessingLock before bot work.
 */
export async function persistInboundMessage(input: {
  channel: MessagingChannelKind;
  externalMessageId: string;
  externalUserId: string;
  messageType?: string;
  bodyText?: string | null;
  payload?: unknown;
}): Promise<void> {
  try {
    await prisma.channelMessage.create({
      data: {
        channel: input.channel,
        externalMessageId: input.externalMessageId,
        externalUserId: input.externalUserId,
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        messageType: input.messageType ?? 'text',
        bodyText: input.bodyText ?? null,
        payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
        processed: false,
      } as Prisma.ChannelMessageUncheckedCreateInput,
    });
    logger.info('whatsapp.inbound_persisted', {
      channel: input.channel,
      externalMessageId: input.externalMessageId,
      externalUserId: input.externalUserId,
    });
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code === 'P2002') return;
    throw err;
  }
}

/**
 * Acquire exclusive processing lock for an already-persisted inbound message.
 * Returns true if this worker should run bot logic.
 */
export async function tryAcquireProcessingLock(input: {
  channel: MessagingChannelKind;
  externalMessageId: string;
}): Promise<boolean> {
  const now = new Date();
  const rows = await prisma.$queryRaw<
    Array<{ processed: number | boolean; processingStartedAt: Date | null }>
  >`
    SELECT processed, processingStartedAt
    FROM channel_messages
    WHERE channel = ${input.channel}
      AND externalMessageId = ${input.externalMessageId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    logger.warn('messaging.lock.missing_row', {
      channel: input.channel,
      externalMessageId: input.externalMessageId,
    });
    return false;
  }

  const isProcessed = row.processed === true || row.processed === 1;
  if (isProcessed) {
    logger.info('messaging.idempotency.skip', {
      channel: input.channel,
      externalMessageId: input.externalMessageId,
      reason: 'already_processed',
    });
    return false;
  }

  const staleThreshold = new Date(Date.now() - PROCESSING_LOCK_MS);
  const lockHeld =
    row.processingStartedAt != null && row.processingStartedAt > staleThreshold;

  if (lockHeld) {
    logger.info('messaging.idempotency.skip', {
      channel: input.channel,
      externalMessageId: input.externalMessageId,
      reason: 'processing_in_progress',
    });
    return false;
  }

  const claimed = await prisma.$executeRaw`
    UPDATE channel_messages
    SET processingStartedAt = ${now}
    WHERE channel = ${input.channel}
      AND externalMessageId = ${input.externalMessageId}
      AND processed = false
      AND (processingStartedAt IS NULL OR processingStartedAt <= ${staleThreshold})
  `;

  if (Number(claimed) > 0) {
    logger.info('messaging.lock.acquired', {
      channel: input.channel,
      externalMessageId: input.externalMessageId,
    });
    return true;
  }

  logger.info('messaging.idempotency.skip', {
    channel: input.channel,
    externalMessageId: input.externalMessageId,
    reason: 'lost_claim_race',
  });
  return false;
}

/**
 * @deprecated Use persistInboundMessage + tryAcquireProcessingLock.
 * Kept for Telegram and legacy callers.
 */
export async function claimInboundMessage(input: {
  channel: MessagingChannelKind;
  externalMessageId: string;
  externalUserId: string;
  messageType?: string;
  bodyText?: string | null;
  payload?: unknown;
}): Promise<boolean> {
  await persistInboundMessage(input);
  return tryAcquireProcessingLock({
    channel: input.channel,
    externalMessageId: input.externalMessageId,
  });
}

export async function markMessageProcessed(
  channel: MessagingChannelKind,
  externalMessageId: string,
  orderId?: string | null,
): Promise<void> {
  await prisma.channelMessage.updateMany({
    where: { channel, externalMessageId },
    data: {
      processed: true,
      ...(orderId ? { orderId } : {}),
    },
  });
}

export async function logOutboundMessage(input: {
  channel: MessagingChannelKind;
  externalUserId: string;
  externalMessageId: string;
  bodyText: string;
  messageType?: string;
  senderType?: MessageSenderTypeKind;
  orderId?: string | null;
  payload?: unknown;
}): Promise<void> {
  const senderType =
    input.senderType ??
    (input.messageType === 'admin'
      ? 'ADMIN'
      : input.messageType === 'status'
        ? 'SYSTEM'
        : 'BOT');

  try {
    await prisma.channelMessage.create({
      data: {
        channel: input.channel,
        externalMessageId: input.externalMessageId,
        externalUserId: input.externalUserId,
        direction: 'OUTBOUND',
        senderType,
        messageType: input.messageType ?? 'text',
        bodyText: input.bodyText,
        orderId: input.orderId ?? null,
        payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
        processed: true,
      } as Prisma.ChannelMessageUncheckedCreateInput,
    });
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code === 'P2002') return;
    logger.warn('messaging.outbound_log_failed', { error: String(err) });
  }
}

export async function getConversationHistory(input: {
  channel: MessagingChannelKind;
  externalUserId: string;
  orderId?: string;
  limit?: number;
}) {
  const take = input.limit ?? 100;
  const messages = await prisma.channelMessage.findMany({
    where: {
      channel: input.channel,
      ...(input.orderId
        ? { OR: [{ orderId: input.orderId }, { externalUserId: input.externalUserId }] }
        : { externalUserId: input.externalUserId }),
      ...excludeWebhookNoiseWhere(),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      direction: true,
      messageType: true,
      bodyText: true,
      createdAt: true,
      orderId: true,
    },
  });

  return messages.reverse();
}

/** Rebuild + reprocess inbound messages that were claimed but never finished (Meta ACK race). */
export async function listUnprocessedInboundClaims(limit = 25) {
  return prisma.channelMessage.findMany({
    where: {
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      processed: false,
      ...excludeWebhookNoiseWhere(),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      channel: true,
      externalMessageId: true,
      externalUserId: true,
      messageType: true,
      bodyText: true,
      payload: true,
    },
  });
}
