import { config } from '../../config';
import { logger } from '../../utils/logger';
import { toWhatsAppApiNumber } from '../../utils/phone';
import {
  getWhatsAppRuntimeConfig,
  getWhatsAppAdminView,
  type WhatsAppRuntimeConfig,
} from '../../lib/messagingSettings';
import type { MessagingChannelAdapter, OutboundMessage, IncomingMessagingEvent } from './types';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export async function resolveWhatsAppConfig(): Promise<WhatsAppRuntimeConfig> {
  return getWhatsAppRuntimeConfig();
}

export async function isWhatsAppConfigured(): Promise<boolean> {
  const cfg = await getWhatsAppRuntimeConfig();
  // Prefer configured credentials even if admin toggle lagged behind
  return cfg.configured && (cfg.enabled || Boolean(cfg.accessToken && cfg.phoneNumberId));
}

/** Quick Graph API probe — returns ok/expired/error for admin diagnostics. */
export async function probeWhatsAppToken(): Promise<{
  ok: boolean;
  status: 'ok' | 'missing' | 'expired' | 'error';
  detail: string;
  displayPhoneNumber?: string;
}> {
  const cfg = await getWhatsAppRuntimeConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { ok: false, status: 'missing', detail: 'Access token or Phone Number ID not set' };
  }
  try {
    const res = await fetch(
      `${GRAPH_API}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
    );
    const text = await res.text();
    if (res.status === 401 || /Session has expired|access token/i.test(text)) {
      return {
        ok: false,
        status: 'expired',
        detail: 'WhatsApp access token expired. Generate a new token in Meta and save it in Admin → Settings.',
      };
    }
    if (!res.ok) {
      return { ok: false, status: 'error', detail: text.slice(0, 240) };
    }
    const json = JSON.parse(text) as { display_phone_number?: string; verified_name?: string };
    return {
      ok: true,
      status: 'ok',
      detail: json.verified_name || 'Connected',
      displayPhoneNumber: json.display_phone_number,
    };
  } catch (err) {
    return { ok: false, status: 'error', detail: String(err) };
  }
}

/**
 * Ensure this WABA is subscribed and routes inbound messages to our callback URL.
 * Meta can drop override_callback_uri after a bare subscribed_apps POST — always re-apply.
 * Retries on 502 (common during CapRover rolling deploys when the public URL is briefly down).
 */
export async function ensureWhatsAppCloudSubscription(callbackUrl?: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  const cfg = await getWhatsAppRuntimeConfig();
  const waba = cfg.businessAccountId || config.whatsapp.businessAccountId;
  if (!cfg.accessToken || !waba) {
    return { ok: false, detail: 'Missing access token or WhatsApp Business Account ID' };
  }

  let viewUrl = callbackUrl;
  if (!viewUrl) {
    try {
      viewUrl = (await getWhatsAppAdminView()).webhookUrl;
    } catch {
      viewUrl = `${(config.apiBaseUrl || 'https://bing-chung-b.mp.dartcodes.com')
        .replace(/\/+$/, '')
        .replace(/\/api$/i, '')
        .replace(/^http:\/\//i, 'https://')}/api/whatsapp/webhook`;
    }
  }

  const verifyToken = cfg.verifyToken || config.whatsapp.verifyToken || 'bingchun-wa-verify-local';

  // Quick local probe first — don't ask Meta to verify if our public URL is down
  try {
    const probe = await fetch(
      `${viewUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=boot-probe`,
      { method: 'GET', signal: AbortSignal.timeout(10_000) },
    );
    const probeText = await probe.text();
    if (!probe.ok || probeText !== 'boot-probe') {
      const detail = `Callback not ready yet (HTTP ${probe.status}: ${probeText.slice(0, 80)})`;
      logger.warn('whatsapp.callback_probe_failed', { detail });
      return { ok: false, detail };
    }
  } catch (err) {
    const detail = `Callback probe error: ${String(err)}`;
    logger.warn('whatsapp.callback_probe_failed', { detail });
    return { ok: false, detail };
  }

  try {
    const url = new URL(`${GRAPH_API}/${waba}/subscribed_apps`);
    url.searchParams.set('override_callback_uri', viewUrl);
    url.searchParams.set('verify_token', verifyToken);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn('whatsapp.subscribed_apps_failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, detail: text.slice(0, 240) };
    }

    logger.info('whatsapp.subscribed_apps_ok', { waba, callback: viewUrl });
    // eslint-disable-next-line no-console
    console.log(
      `\n[WhatsApp] Webhook override set\n  WABA     : ${waba}\n  Callback : ${viewUrl}\n`,
    );
    return { ok: true, detail: `Subscribed with override ${viewUrl}` };
  } catch (err) {
    logger.warn('whatsapp.subscribed_apps_error', { error: String(err) });
    return { ok: false, detail: String(err) };
  }
}

/** @deprecated Prefer async isWhatsAppConfigured() — sync check uses env only as a fast gate. */
export function isWhatsAppConfiguredSync(): boolean {
  return Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId);
}

function parseWaSendResponse(res: Response): Promise<{ waMessageId: string | null; errText: string }> {
  return res.text().then((text) => {
    if (!res.ok) {
      return { waMessageId: null, errText: text };
    }
    try {
      const json = JSON.parse(text) as { messages?: Array<{ id?: string }> };
      return { waMessageId: json.messages?.[0]?.id || null, errText: '' };
    } catch {
      return { waMessageId: null, errText: '' };
    }
  });
}

export const whatsAppChannel: MessagingChannelAdapter = {
  channel: 'WHATSAPP',
  async send(externalUserId, message) {
    const cfg = await getWhatsAppRuntimeConfig();
    if (!cfg.enabled || !cfg.configured) {
      logger.warn('whatsapp.send_skipped_unconfigured', {
        enabled: cfg.enabled,
        configured: cfg.configured,
      });
      throw new Error('WhatsApp is not configured or disabled');
    }

    // Always reply to the inbound sender WA id (msg.from) — never a fixed test number.
    const to = toWhatsAppApiNumber(externalUserId);
    if (!to) {
      logger.error('whatsapp.send_missing_recipient', { externalUserId });
      throw new Error('WhatsApp send failed: missing recipient');
    }

    const body = buildWhatsAppPayload(to, message);
    const envToken = (config.whatsapp.accessToken || '').trim();

    logger.info('whatsapp.send_attempt', {
      to,
      fromExternalUserId: externalUserId,
      type: body.type,
      preview: message.text?.slice(0, 80),
    });
    // eslint-disable-next-line no-console
    console.log(
      `\n---------- WhatsApp BOT → CUSTOMER ----------\n  To   : ${to}\n  Text : ${(message.text || '').replace(/\s+/g, ' ').trim().slice(0, 200)}\n--------------------------------------------\n`,
    );

    const postMessage = async (accessToken: string) =>
      fetch(`${GRAPH_API}/${cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    let res = await postMessage(cfg.accessToken);
    let parsed = await parseWaSendResponse(res);

    if (!res.ok) {
      const expired =
        res.status === 401 || /Session has expired|access token/i.test(parsed.errText);
      // DB token often lags behind CapRover/.env after Meta refresh — retry env token once.
      if (expired && envToken && envToken !== cfg.accessToken) {
        logger.warn('whatsapp.send_retrying_env_token');
        res = await postMessage(envToken);
        parsed = await parseWaSendResponse(res);
      }
    }

    if (!res.ok) {
      const errText = parsed.errText;
      logger.error('whatsapp.send_failed', {
        status: res.status,
        body: errText.slice(0, 400),
        type: body.type,
        to,
      });

      // Interactive payloads sometimes fail — always fall back to plain text so the menu arrives
      if (body.type !== 'text' && message.text?.trim()) {
        const tokenForFallback =
          envToken && /Session has expired|access token/i.test(errText) ? envToken : cfg.accessToken;
        const fallback = {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message.text.slice(0, 4096) },
        };
        const retry = await fetch(`${GRAPH_API}/${cfg.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenForFallback}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fallback),
        });
        const retryParsed = await parseWaSendResponse(retry);
        if (retry.ok) {
          logger.warn('whatsapp.send_fell_back_to_text', { to, waMessageId: retryParsed.waMessageId });
          return { waMessageId: retryParsed.waMessageId };
        }
        const retryText = retryParsed.errText;
        logger.error('whatsapp.send_fallback_failed', {
          status: retry.status,
          body: retryText.slice(0, 300),
          to,
        });
      }

      throw new Error(`WhatsApp send failed (${res.status})`);
    }

    logger.info('whatsapp.send_ok', { to, type: body.type, waMessageId: parsed.waMessageId });
    return { waMessageId: parsed.waMessageId };
  },
};

function sanitizeButtonTitle(label: string): string {
  // WhatsApp reply button titles: max 20 chars; avoid emoji-heavy titles that break counting
  return label
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20) || 'Option';
}

function buildWhatsAppPayload(to: string, message: OutboundMessage): Record<string, unknown> {
  if (message.ctaUrl?.url && message.ctaUrl.label) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: message.text.slice(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: message.ctaUrl.label.slice(0, 20),
            url: message.ctaUrl.url.slice(0, 2000),
          },
        },
      },
    };
  }

  if (message.list?.sections?.length) {
    const sections = message.list.sections
      .map((section) => ({
        title: section.title.slice(0, 24),
        rows: section.rows.slice(0, 10).map((row) => ({
          id: row.id.slice(0, 200),
          title: row.label.slice(0, 24),
          ...(row.description ? { description: row.description.slice(0, 72) } : {}),
        })),
      }))
      .filter((s) => s.rows.length > 0)
      .slice(0, 10);

    if (sections.length > 0) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(message.list.header
            ? { header: { type: 'text', text: message.list.header.slice(0, 60) } }
            : {}),
          body: { text: message.text.slice(0, 1024) },
          action: {
            button: (message.list.buttonLabel || 'View menu').slice(0, 20),
            sections,
          },
        },
      };
    }
  }

  const buttons = (message.buttonRows || []).flat().slice(0, 3);
  if (buttons.length > 0) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.text.slice(0, 1024) },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id.slice(0, 256), title: sanitizeButtonTitle(b.label) },
          })),
        },
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message.text.slice(0, 4096) },
  };
}

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
          button?: { text?: string; payload?: string };
        }>;
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
      };
    }>;
  }>;
};

export function parseWhatsAppWebhook(body: WhatsAppWebhookBody): IncomingMessagingEvent[] {
  const events: IncomingMessagingEvent[] = [];
  // Some proxies / older payloads omit object — still try to parse message entries
  if (body.object && body.object !== 'whatsapp_business_account') return events;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const contactWaId = value.contacts?.[0]?.wa_id;
      for (const msg of value.messages) {
        let text: string | undefined;
        let callbackData: string | undefined;

        if (msg.type === 'text' || (!msg.type && msg.text?.body)) {
          text = msg.text?.body;
        } else if (msg.type === 'interactive') {
          callbackData =
            msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
          text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title;
          // Some clients send title only — treat title as the button id for intent routing
          if (!callbackData && text) callbackData = text;
        } else if (msg.type === 'button') {
          callbackData = msg.button?.payload || msg.button?.text;
          text = msg.button?.text;
        } else if (msg.text?.body) {
          // Fallback for unexpected types that still carry text
          text = msg.text.body;
        } else {
          // Always auto-reply for unsupported types (image/audio/sticker/etc.)
          text = 'hi';
          logger.info('whatsapp.inbound_unsupported_type_as_hi', {
            type: msg.type,
            messageId: msg.id,
          });
        }

        if (!text && !callbackData) continue;

        // Prefer message.from (sender). Fall back to contacts.wa_id. Never hardcode a test phone.
        const senderRaw = msg.from || contactWaId || '';
        const sender = toWhatsAppApiNumber(senderRaw);
        if (!sender) {
          logger.warn('whatsapp.inbound_missing_sender', { messageId: msg.id });
          continue;
        }

        events.push({
          channel: 'WHATSAPP',
          externalUserId: sender,
          externalMessageId: msg.id,
          text,
          callbackData,
          phoneNumber: `+${sender}`,
          raw: msg,
        });
      }
    }
  }
  return events;
}

export async function verifyWhatsAppChallenge(input: {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
}): Promise<string | null> {
  const cfg = await getWhatsAppRuntimeConfig();
  if (input.mode === 'subscribe' && input.verifyToken && input.verifyToken === cfg.verifyToken) {
    return input.challenge || '';
  }
  return null;
}
