import { config } from '../config';
import { logger } from '../utils/logger';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface EmailAdapter {
  send(payload: EmailPayload): Promise<void>;
}

class MockEmailAdapter implements EmailAdapter {
  async send(payload: EmailPayload) {
    await new Promise((r) => setTimeout(r, 200));
    logger.info(`[EMAIL MOCK] To: ${payload.to} | Subject: ${payload.subject}`);
  }
}

class SendGridAdapter implements EmailAdapter {
  async send(payload: EmailPayload) {
    logger.info(`[EMAIL] Sending to ${payload.to}: ${payload.subject}`);
    // TODO: integrate with SendGrid
    throw new Error('SendGrid not yet configured');
  }
}

function createEmailAdapter(): EmailAdapter {
  if (config.email.provider === 'sendgrid') return new SendGridAdapter();
  return new MockEmailAdapter();
}

export const emailAdapter = createEmailAdapter();

export async function sendOrderConfirmationEmail(
  email: string,
  orderNumber: string,
  items: { name: string; qty: number; price: number }[],
  total: number
) {
  const itemRows = items
    .map((i) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>LKR ${i.price.toLocaleString()}</td></tr>`)
    .join('');

  await emailAdapter.send({
    to: email,
    subject: `Bing Chun Order Confirmation #${orderNumber}`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#fff;padding:32px;border-radius:12px">
        <h1 style="color:#e91e8c">Order Confirmed! 🧋</h1>
        <p>Thank you for your Bing Chun order.</p>
        <p><strong>Order Number:</strong> ${orderNumber}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#2a2a4e"><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <p style="font-size:1.2em"><strong>Total: LKR ${total.toLocaleString()}</strong></p>
        <a href="${config.frontendUrl}/track/${orderNumber}" style="background:#e91e8c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Track Order</a>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  await emailAdapter.send({
    to: email,
    subject: 'Reset your Bing Chun password',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
        <a href="${resetLink}">Reset Password</a>
      </div>
    `,
  });
}
