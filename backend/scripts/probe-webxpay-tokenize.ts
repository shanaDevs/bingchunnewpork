import { getPaymentSettings } from '../src/lib/paymentSettings';

const BASE = 'https://commtoken.webxpay.com';

async function main() {
  const settings = await getPaymentSettings();
  const username = settings.webxpay.apiUsername;
  const password = settings.webxpay.apiPassword;

  if (!username || !password) {
    console.log('Missing apiUsername/apiPassword in DB');
    return;
  }

  const authUrl = `${BASE}/authenticate?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const authRes = await fetch(authUrl, { method: 'POST' });
  const authText = await authRes.text();
  console.log('auth status', authRes.status);
  console.log('auth body', authText.slice(0, 400));

  let token: string | undefined;
  try {
    const parsed = JSON.parse(authText) as { token?: string };
    token = parsed.token;
  } catch {
    /* ignore */
  }

  if (!token) return;

  const cardsRes = await fetch(`${BASE}/tokenize/get-customer-cards`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: { id: 'test-user', email: 'test@bingchun.lk' },
    }),
  });
  console.log('cards status', cardsRes.status);
  console.log('cards body', (await cardsRes.text()).slice(0, 400));
}

main().catch(console.error);
