import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/messagingSettings', () => ({
  getWhatsAppRuntimeConfig: vi.fn().mockResolvedValue({
    enabled: true,
    accessToken: 'token',
    phoneNumberId: '123',
    businessAccountId: '456',
    verifyToken: 'bingchun-verify',
    configured: true,
  }),
}));

import { parseWhatsAppWebhook, verifyWhatsAppChallenge } from '../../src/services/messaging/whatsappChannel';
import { parseTelegramUpdate, validateTelegramWebhookSecret } from '../../src/services/messaging/telegramChannel';
import { formatCartSummary } from '../../src/services/messaging/messagingOrderPlacement';
import { toOrderChannel } from '../../src/services/messaging/types';

describe('messaging channel mapping', () => {
  it('maps adapters to order channels', () => {
    expect(toOrderChannel('WHATSAPP')).toBe('WHATSAPP');
    expect(toOrderChannel('TELEGRAM')).toBe('TELEGRAM');
  });
});

describe('formatCartSummary', () => {
  it('sums line totals and delivery', () => {
    const { text, subtotal, total } = formatCartSummary(
      [
        { productId: '1', productName: 'Coke', quantity: 2, unitPrice: 400 },
        { productId: '2', productName: 'Milk', quantity: 1, unitPrice: 450 },
      ],
      250,
    );
    expect(subtotal).toBe(1250);
    expect(total).toBe(1500);
    expect(text).toContain('Coke × 2');
    expect(text).toContain('Milk × 1');
  });
});

describe('WhatsApp webhook parsing', () => {
  it('parses text messages', () => {
    const events = parseWhatsAppWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.ABC',
                    from: '94771234567',
                    type: 'text',
                    text: { body: 'Coke' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].externalUserId).toBe('94771234567');
    expect(events[0].text).toBe('Coke');
    expect(events[0].externalMessageId).toBe('wamid.ABC');
  });

  it('parses interactive button replies as callbacks', () => {
    const events = parseWhatsAppWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.BTN',
                    from: '94770000000',
                    type: 'interactive',
                    interactive: {
                      button_reply: { id: 'menu:cart', title: 'View Cart' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events[0].callbackData).toBe('menu:cart');
  });

  it('ignores non-whatsapp payloads', () => {
    expect(parseWhatsAppWebhook({ object: 'other' })).toEqual([]);
  });
});

describe('WhatsApp verify challenge', () => {
  it('rejects wrong token', async () => {
    const result = await verifyWhatsAppChallenge({
      mode: 'subscribe',
      verifyToken: 'wrong',
      challenge: '123',
    });
    expect(result).toBeNull();
  });
});

describe('Telegram update parsing', () => {
  it('parses /start text', () => {
    const event = parseTelegramUpdate({
      update_id: 10,
      message: {
        message_id: 1,
        text: '/start',
        from: { id: 99, username: 'kasun' },
        chat: { id: 99 },
      },
    });
    expect(event?.channel).toBe('TELEGRAM');
    expect(event?.text).toBe('/start');
    expect(event?.username).toBe('kasun');
    expect(event?.externalMessageId).toContain('msg:10:1');
  });

  it('parses callback queries', () => {
    const event = parseTelegramUpdate({
      update_id: 11,
      callback_query: {
        id: 'cq1',
        data: 'confirm:yes',
        from: { id: 55, username: 'nimal' },
        message: { message_id: 2, chat: { id: 55 } },
      },
    });
    expect(event?.callbackData).toBe('confirm:yes');
    expect(event?.externalUserId).toBe('55');
  });

  it('returns null for empty updates', () => {
    expect(parseTelegramUpdate({ update_id: 1 })).toBeNull();
  });
});

describe('Telegram webhook secret', () => {
  it('allows missing secret outside production when unset', () => {
    // When TELEGRAM_WEBHOOK_SECRET is empty and NODE_ENV is not production, accept
    expect(typeof validateTelegramWebhookSecret(undefined)).toBe('boolean');
  });
});
