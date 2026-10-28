import crypto from 'crypto';
import type { Request } from 'express';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

/** Verify Meta WhatsApp webhook X-Hub-Signature-256 when WHATSAPP_APP_SECRET is configured. */
export function assertWhatsAppWebhookSignature(req: Request): void {
  const secret = config.whatsapp.appSecret?.trim();
  if (!secret) {
    if (config.nodeEnv === 'production') {
      throw new AppError('WhatsApp webhook secret is not configured', 503);
    }
    return;
  }
  const header = req.headers['x-hub-signature-256'];
  if (typeof header !== 'string' || !header.startsWith('sha256=')) {
    throw new AppError('Invalid WhatsApp webhook signature', 403);
  }

  const payload = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const provided = header.slice('sha256='.length);

  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  ) {
    throw new AppError('Invalid WhatsApp webhook signature', 403);
  }
}
