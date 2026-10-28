/** Simulate Browse Menu button click via production webhook. */
async function main() {
  const to = process.env.WHATSAPP_TEST_TO || '94759065140';
  const id = `wamid.sim.button.${Date.now()}`;

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
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: { id: 'menu:browse', title: 'Browse Menu' },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const url = process.env.WEBHOOK_URL || 'https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('status', res.status, await res.text());
  console.log('messageId', id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
