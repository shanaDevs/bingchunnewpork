import { logger } from '../utils/logger';
import { config } from '../config';
import { listUnprocessedInboundClaims } from '../services/messaging/channelMessageService';
import { handleMessagingEvent } from '../services/messaging/orderConversationService';
import { whatsAppChannel } from '../services/messaging/whatsappChannel';
import type { IncomingMessagingEvent } from '../services/messaging/types';

function rebuildEvent(row: {
  channel: string;
  externalMessageId: string;
  externalUserId: string;
  messageType: string | null;
  bodyText: string | null;
  payload: unknown;
}): IncomingMessagingEvent | null {
  if ((row.messageType || '').startsWith('webhook_')) return null;

  const raw = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as {
    text?: { body?: string };
    interactive?: {
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    button?: { payload?: string; text?: string };
    type?: string;
  };

  let text = row.bodyText || undefined;
  let callbackData: string | undefined;

  if (row.messageType === 'callback') {
    callbackData =
      raw.interactive?.button_reply?.id ||
      raw.interactive?.list_reply?.id ||
      raw.button?.payload ||
      row.bodyText ||
      undefined;
    text =
      raw.interactive?.button_reply?.title ||
      raw.interactive?.list_reply?.title ||
      raw.button?.text ||
      row.bodyText ||
      undefined;
  } else {
    text = raw.text?.body || row.bodyText || undefined;
  }

  if (!text && !callbackData) return null;

  return {
    channel: 'WHATSAPP',
    externalUserId: row.externalUserId,
    externalMessageId: row.externalMessageId,
    text,
    callbackData,
    phoneNumber: `+${row.externalUserId}`,
    raw,
  };
}

/** Retry claimed-but-unprocessed WhatsApp inbound (keeps Meta webhooks healthy with fast ACK). */
export async function processUnprocessedWhatsAppInbound(): Promise<void> {
  const rows = await listUnprocessedInboundClaims(20);
  if (!rows.length) return;

  logger.info('whatsapp.retry_unprocessed', { count: rows.length });

  for (const row of rows) {
    const event = rebuildEvent(row);
    if (!event) continue;
    try {
      await handleMessagingEvent(whatsAppChannel, event);
    } catch (err) {
      logger.error('whatsapp.retry_failed', {
        messageId: row.externalMessageId,
        error: String(err),
      });
    }
  }
}

export function startWhatsAppInboundRetryJob(): void {
  if (config.nodeEnv === 'development') {
    logger.info('WhatsApp inbound retry cron skipped (development — avoids racing production on shared DB)');
    return;
  }
  setInterval(() => {
    processUnprocessedWhatsAppInbound().catch((err) =>
      logger.error('whatsapp.retry_job_failed', { error: String(err) }),
    );
  }, 20_000);
  logger.info('WhatsApp inbound retry cron scheduled (every 20s)');
}
