import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe<
    Array<{
      whatsappEnabled: number | boolean;
      whatsappPhoneNumberId: string | null;
      whatsappVerifyToken: string | null;
      whatsappAccessToken: string | null;
      whatsappCallbackUrl: string | null;
    }>
  >(
    `SELECT whatsappEnabled, whatsappPhoneNumberId, whatsappVerifyToken, whatsappAccessToken, whatsappCallbackUrl
     FROM system_settings WHERE id = 'default' LIMIT 1`,
  );
  const row = rows[0];
  const tok = row?.whatsappAccessToken || '';
  console.log({
    enabled: row?.whatsappEnabled,
    phone: row?.whatsappPhoneNumberId,
    verify: row?.whatsappVerifyToken,
    callback: row?.whatsappCallbackUrl,
    tokenLen: tok.length,
    tokenTail: tok.slice(-16),
  });

  if (tok) {
    const r = await fetch(
      'https://graph.facebook.com/v21.0/1356038207583422?fields=display_phone_number,verified_name',
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    console.log('graph_db_token', r.status, await r.text());
  }

  const envTok = process.env.WHATSAPP_ACCESS_TOKEN || '';
  if (envTok && envTok !== tok) {
    const r2 = await fetch(
      'https://graph.facebook.com/v21.0/1356038207583422?fields=display_phone_number,verified_name',
      { headers: { Authorization: `Bearer ${envTok}` } },
    );
    console.log('graph_env_token', r2.status, await r2.text());
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
