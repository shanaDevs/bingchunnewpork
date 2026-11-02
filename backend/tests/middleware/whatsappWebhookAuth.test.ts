import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/middleware/errorHandler';

vi.mock('../../src/config', () => ({
  config: {
    nodeEnv: 'test',
    whatsapp: { appSecret: 'test-whatsapp-app-secret' },
  },
}));

import { assertWhatsAppWebhookSignature } from '../../src/middleware/whatsappWebhookAuth';

function signBody(secret: string, body: Buffer): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('assertWhatsAppWebhookSignature', () => {
  it('accepts a valid X-Hub-Signature-256', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const req = {
      headers: {
        'x-hub-signature-256': signBody('test-whatsapp-app-secret', rawBody),
      },
      rawBody,
      body: JSON.parse(rawBody.toString()),
    };
    expect(() => assertWhatsAppWebhookSignature(req as never)).not.toThrow();
  });

  it('rejects a missing or invalid signature', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    expect(() =>
      assertWhatsAppWebhookSignature({
        headers: {},
        rawBody,
        body: {},
      } as never),
    ).toThrow(AppError);

    expect(() =>
      assertWhatsAppWebhookSignature({
        headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
        rawBody,
        body: {},
      } as never),
    ).toThrow(AppError);
  });
});
