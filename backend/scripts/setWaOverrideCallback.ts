import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe<
    Array<{
      whatsappAccessToken: string | null;
      whatsappBusinessAccountId: string | null;
      whatsappVerifyToken: string | null;
      whatsappCallbackUrl: string | null;
    }>
  >(
    `SELECT whatsappAccessToken, whatsappBusinessAccountId, whatsappVerifyToken, whatsappCallbackUrl
     FROM system_settings WHERE id = 'default' LIMIT 1`,
  );
  const tok = rows[0]?.whatsappAccessToken || '';
  const waba = rows[0]?.whatsappBusinessAccountId || '1563949681945861';
  const verify = rows[0]?.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'bingchun-wa-verify-local';
  const callback =
    rows[0]?.whatsappCallbackUrl ||
    'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';

  console.log({ waba, callback, verify });

  const url = new URL(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`);
  url.searchParams.set('override_callback_uri', callback);
  url.searchParams.set('verify_token', verify);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}` },
  });
  console.log('override POST', res.status, await res.text());

  const get = await fetch(`https://graph.facebook.com/v21.0/${waba}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  console.log('subscribed_apps', get.status, await get.text());

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
