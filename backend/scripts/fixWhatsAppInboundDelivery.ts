require('dotenv').config();

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
const PHONE = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const APP = process.env.WHATSAPP_APP_ID || '27930162523280607';
const CALLBACK = 'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || 'bingchun-wa-verify-local';

async function g(path: string, init?: RequestInit) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  console.log(`\n[${init?.method || 'GET'}] ${path}`);
  console.log(res.status, text.slice(0, 1200));
  return { status: res.status, text };
}

async function main() {
  await g(
    `${PHONE}?fields=display_phone_number,verified_name,code_verification_status,account_mode,is_official_business_account`,
  );
  await g(
    `${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,webhook_configuration,quality_rating`,
  );
  await g(`${WABA}/subscribed_apps`);

  // Re-subscribe app
  await g(`${WABA}/subscribed_apps`, { method: 'POST', body: '{}' });

  // Send a ping to the customer so they can reply in-thread
  const to = process.argv[2] || '94759065140';
  await g(`${PHONE}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: [
          'Bing Chun bot is online ✅',
          '',
          'Please reply with: Hi',
          '',
          'If you do not get a menu reply within a few seconds, Meta is not delivering your messages to our webhook yet.',
          '',
          'You must message this WhatsApp Business test number (the one that sent this text), and your phone must be on the Meta allow list.',
        ].join('\n'),
      },
    }),
  });

  console.log('\nCallback URL for Meta UI:', CALLBACK);
  console.log('Verify token:', VERIFY);
  console.log('App ID:', APP);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
