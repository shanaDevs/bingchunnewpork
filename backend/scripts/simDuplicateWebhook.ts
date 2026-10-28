/** Post the same WhatsApp webhook twice to verify idempotent processing. */
async function main() {
  const to = process.env.WHATSAPP_TEST_TO || '94759065140';
  const id = process.env.DUP_MESSAGE_ID || `wamid.sim.dupe.${Date.now()}`;

  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15556428621',
                phone_number_id: '1356038207583422',
              },
              contacts: [{ profile: { name: 'Test' }, wa_id: to }],
              messages: [
                {
                  from: to,
                  id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'hi' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const url = process.env.WEBHOOK_URL || 'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';

  for (let i = 1; i <= 2; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`attempt ${i}:`, res.status, await res.text());
  }

  console.log('messageId', id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
