import { timingSafeEqual } from 'crypto';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { MessagingChannelAdapter, OutboundMessage, IncomingMessagingEvent } from './types';

const TELEGRAM_API = 'https://api.telegram.org';

export function isTelegramConfigured(): boolean {
  return Boolean(config.telegram.botToken);
}

export const telegramChannel: MessagingChannelAdapter = {
  channel: 'TELEGRAM',
  async send(externalUserId, message) {
    if (!isTelegramConfigured()) {
      logger.warn('telegram.send_skipped_unconfigured');
      return { waMessageId: null };
    }

    const payload: Record<string, unknown> = {
      chat_id: externalUserId,
      text: message.text.slice(0, 4096),
      parse_mode: undefined,
    };

    const listRows =
      message.list?.sections?.flatMap((section) =>
        section.rows.map((btn) => ({
          text: btn.label.slice(0, 64),
          callback_data: btn.id.slice(0, 64),
        })),
      ) || [];

    if (listRows.length) {
      // One button per row for readability
      payload.reply_markup = {
        inline_keyboard: listRows.slice(0, 10).map((btn) => [btn]),
      };
    } else if (message.ctaUrl?.url && message.ctaUrl.label) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: message.ctaUrl.label.slice(0, 64), url: message.ctaUrl.url }]],
      };
    } else if (message.buttonRows?.length) {
      payload.reply_markup = {
        inline_keyboard: message.buttonRows.map((row) =>
          row.map((btn) => ({
            text: btn.label.slice(0, 64),
            callback_data: btn.id.slice(0, 64),
          })),
        ),
      };
    }


    const res = await fetch(`${TELEGRAM_API}/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error('telegram.send_failed', { status: res.status, body: errText.slice(0, 300) });
      throw new Error(`Telegram send failed (${res.status})`);
    }

    return { waMessageId: null };
  },
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; username?: string; first_name?: string };
    message?: { message_id: number; chat: { id: number } };
  };
};

export function parseTelegramUpdate(update: TelegramUpdate): IncomingMessagingEvent | null {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat.id ?? cq.from.id);
    return {
      channel: 'TELEGRAM',
      externalUserId: chatId,
      externalMessageId: `cb:${update.update_id}:${cq.id}`,
      text: cq.data,
      callbackData: cq.data,
      username: cq.from.username,
      raw: update,
    };
  }

  if (update.message?.text) {
    const msg = update.message;
    return {
      channel: 'TELEGRAM',
      externalUserId: String(msg.chat.id),
      externalMessageId: `msg:${update.update_id}:${msg.message_id}`,
      text: msg.text,
      username: msg.from?.username,
      raw: update,
    };
  }

  return null;
}

export function validateTelegramWebhookSecret(headerValue: string | undefined): boolean {
  const expected = config.telegram.webhookSecret;
  if (!expected) {
    // If secret not configured, accept in development only
    return config.nodeEnv !== 'production';
  }
  if (!headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function answerTelegramCallback(callbackQueryId: string): Promise<void> {
  if (!isTelegramConfigured()) return;
  await fetch(`${TELEGRAM_API}/bot${config.telegram.botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => {});
}
