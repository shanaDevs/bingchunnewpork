/**
 * Send Bing Chun WhatsApp welcome + product menu to a phone.
 * Usage: npx tsx scripts/sendWhatsAppProductList.ts [phoneE164Digits]
 */
require('dotenv').config();

async function main() {
  const phone = (process.argv[2] || '94759065140').replace(/\D/g, '');
  const { handleMessagingEvent } = await import('../src/services/messaging/orderConversationService');
  const { whatsAppChannel } = await import('../src/services/messaging/whatsappChannel');
  const { listActiveStores, listPopularStoreProducts } = await import(
    '../src/services/messaging/messagingCatalogService'
  );
  const { randomUUID } = await import('crypto');

  const stores = await listActiveStores();
  if (!stores.length) throw new Error('No active stores in DB');
  const store = stores[0];
  const products = await listPopularStoreProducts(store.id, 10);
  console.log(
    JSON.stringify(
      {
        phone,
        store: { id: store.id, name: store.name, city: store.city },
        productCount: products.length,
        products: products.map((p) => ({
          name: p.name,
          price: p.unitPrice,
          available: p.available,
        })),
      },
      null,
      2,
    ),
  );

  // Hi → welcome + auto product menu (single store)
  await handleMessagingEvent(whatsAppChannel, {
    channel: 'WHATSAPP',
    externalUserId: phone,
    externalMessageId: `local-hi-${randomUUID()}`,
    text: 'hi',
    phoneNumber: phone,
  });
  console.log('Sent: welcome + product menu');
  console.log('\nDone. Open WhatsApp on', phone);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
