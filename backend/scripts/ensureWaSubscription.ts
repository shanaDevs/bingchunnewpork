import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe<
    Array<{
      whatsappAccessToken: string | null;
      whatsappBusinessAccountId: string | null;
      whatsappPhoneNumberId: string | null;
      whatsappVerifyToken: string | null;
      whatsappCallbackUrl: string | null;
    }>
  >(
    `SELECT whatsappAccessToken, whatsappBusinessAccountId, whatsappPhoneNumberId, whatsappVerifyToken, whatsappCallbackUrl
     FROM system_settings WHERE id = 'default' LIMIT 1`,
  );
  const tok = rows[0]?.whatsappAccessToken || '';
  const waba = rows[0]?.whatsappBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1563949681945861';
  const phone = rows[0]?.whatsappPhoneNumberId || '1356038207583422';
  const verify = rows[0]?.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'bingchun-wa-verify-local';
  const callback =
    rows[0]?.whatsappCallbackUrl || 'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';
  console.log({ waba, phone, tokenLen: tok.length });

  const headers = { Authorization: `Bearer ${tok}` };

  const sub = await fetch(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`, { headers });
  console.log('subscribed_apps GET', sub.status, await sub.text());

  const subPost = await fetch(
    `https://graph.facebook.com/v21.0/${waba}/subscribed_apps?override_callback_uri=${encodeURIComponent(callback)}&verify_token=${encodeURIComponent(verify)}`,
    { method: 'POST', headers },
  );
  console.log('subscribed_apps POST (with override)', subPost.status, await subPost.text());

  const sub2 = await fetch(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`, { headers });
  console.log('subscribed_apps GET2', sub2.status, await sub2.text());

  // Recent inbound message debug (if any)
  const msg = await fetch(
    `https://graph.facebook.com/v21.0/${phone}?fields=display_phone_number,verified_name,webhook_configuration`,
    { headers },
  );
  console.log('phone fields', msg.status, await msg.text());

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
