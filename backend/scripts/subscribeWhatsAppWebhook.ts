require('dotenv').config();

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1563949681945861';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1356038207583422';
const CALLBACK = 'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || 'bingchun-wa-verify-local';
const APP_ID = process.env.WHATSAPP_APP_ID || '27930162523280607';

async function call(method, path, body) {
  const url = path.startsWith('http') ? path : `https://graph.facebook.com/v21.0/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`\n[${method}] ${path}`);
  console.log(res.status, text.slice(0, 800));
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text };
  }
}

async function main() {
  if (!TOKEN) throw new Error('Missing WHATSAPP_ACCESS_TOKEN');

  // 1) Confirm token / phone
  await call('GET', `${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`);

  // 2) Subscribe app to WABA (required for message webhooks)
  await call('POST', `${WABA}/subscribed_apps`);

  // 3) List subscribed apps
  await call('GET', `${WABA}/subscribed_apps`);

  // 4) Try set app subscription fields (needs app token; may fail with user token)
  await call('POST', `${APP_ID}/subscriptions`, {
    object: 'whatsapp_business_account',
    callback_url: CALLBACK,
    verify_token: VERIFY,
    fields: ['messages', 'message_template_status_update'],
    include_values: true,
  });

  // 5) Debug token scopes
  await call(
    'GET',
    `debug_token?input_token=${encodeURIComponent(TOKEN)}&access_token=${encodeURIComponent(TOKEN)}`,
  );

  console.log('\nUse in Meta Callback URL:', CALLBACK);
  console.log('Verify token:', VERIFY);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
