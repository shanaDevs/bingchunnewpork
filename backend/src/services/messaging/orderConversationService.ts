import { logger } from '../../utils/logger';
import type {
  IncomingMessagingEvent,
  MessagingChannelAdapter,
  OutboundMessage,
  OutboundButton,
  ConversationCartItem,
  ConversationContext,
} from './types';
import { tryAcquireProcessingLock, markMessageProcessed, logOutboundMessage } from './channelMessageService';
import { resolveMessagingCustomer } from './customerChannelService';
import {
  getOrCreateSession,
  getSessionCart,
  getSessionContext,
  updateSession,
} from './conversationSessionService';
import {
  listActiveStores,
  searchStoreProducts,
  getStoreProductDetail,
  listPopularStoreProducts,
  getDefaultMessagingStore,
  type MessagingProductHit,
} from './messagingCatalogService';
import {
  formatCartSummary,
  placeMessagingOrder,
  getRecentOrdersForCustomer,
  getOrderTracking,
} from './messagingOrderPlacement';
import { AppError } from '../../middleware/errorHandler';
import { randomUUID } from 'crypto';
import { getEffectiveFrontendUrl } from '../../lib/resolveFrontendUrl';
import { normalizePhone } from '../../utils/phone';

function money(n: number): string {
  return `Rs. ${n.toLocaleString('en-LK')}`;
}

function publicOrderUrl(orderNumber: string): string {
  const base = getEffectiveFrontendUrl() || 'https://bing-chung.mp.dartcodes.com';
  return `${base.replace(/\/$/, '')}/order/${encodeURIComponent(orderNumber)}`;
}

function orderConfirmedMessage(input: {
  orderNumber: string;
  storeName: string;
  guestName: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  addressLine?: string;
  city?: string;
  orderMode: string;
  paymentMethod: string;
  items: Array<{ productName: string; quantity: number; lineTotal: number }>;
}): OutboundMessage {
  const lines = [
    '✅ Order Confirmed!',
    '',
    `Hi ${input.guestName},`,
    `Thank you for your purchase! Your order number is ${input.orderNumber}.`,
    '',
    `Store: ${input.storeName}`,
    `Mode: ${input.orderMode === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}`,
    '',
    'Products:',
    ...input.items.map((i) => `• ${i.productName} × ${i.quantity} — ${money(i.lineTotal)}`),
    '',
    `Items: ${money(input.subtotal)}`,
    ...(input.deliveryFee > 0 ? [`Delivery: ${money(input.deliveryFee)}`] : []),
    `Total: ${money(input.total)}`,
    `Payment: ${input.paymentMethod.replace(/_/g, ' ')}`,
  ];
  if (input.orderMode !== 'TAKEAWAY' && input.addressLine) {
    lines.push('', 'Delivery address:', `${input.addressLine}${input.city ? `, ${input.city}` : ''}`);
  }
  lines.push('', "We'll notify you when your order status changes.", 'Tap below for full order details.');

  return {
    text: lines.join('\n'),
    ctaUrl: {
      label: 'Visit order details',
      url: publicOrderUrl(input.orderNumber),
    },
  };
}

type TrackedOrder = NonNullable<Awaited<ReturnType<typeof getOrderTracking>>>;

function orderDetailsMessage(order: TrackedOrder): OutboundMessage {
  const lines = [
    `📋 Order details — #${order.orderNumber}`,
    '',
    `Status: ${order.status}`,
    `Store: ${order.store.name}`,
    `Mode: ${order.orderMode === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}`,
    '',
    'Products:',
    ...order.items.map((i) => `• ${i.productName} × ${i.quantity} — ${money(i.totalPrice)}`),
    '',
    `Total: ${money(order.total)}`,
  ];
  if (order.deliveryAddressLine) {
    lines.push(
      '',
      `Address: ${order.deliveryAddressLine}${order.deliveryCity ? `, ${order.deliveryCity}` : ''}`,
    );
  }
  lines.push('', 'Tap below to open full order details on the website.');

  return {
    text: lines.join('\n'),
    ctaUrl: {
      label: 'Visit order details',
      url: publicOrderUrl(order.orderNumber),
    },
  };
}

/** Plain-text product menu — always delivered even if interactive UI fails. */
function productCatalogText(storeName: string, hits: MessagingProductHit[]): string {
  if (!hits.length) {
    return [
      `✅ Store: ${storeName}`,
      '',
      'No products in stock right now.',
      'Type a product name to search when available.',
    ].join('\n');
  }

  return [
    `🧋 Bing Chun Menu — ${storeName}`,
    '',
    ...hits.map((h, i) => `${i + 1}. ${h.name} — ${money(h.unitPrice)} (${h.available} left)`),
    '',
    'Reply with a product name or number to order.',
    'Example: Bobo   or   1',
  ].join('\n');
}

function productCatalogMessage(
  storeName: string,
  hits: MessagingProductHit[],
): OutboundMessage {
  const text = productCatalogText(storeName, hits);
  if (!hits.length) {
    return {
      text,
      buttonRows: [[{ id: 'menu:home', label: 'Main Menu' }]],
    };
  }

  return {
    text,
    list: {
      buttonLabel: 'View products',
      header: 'Bing Chun menu',
      sections: [
        {
          title: 'Available now',
          rows: hits.slice(0, 10).map((h) => ({
            id: `product:${h.productId}`,
            label: h.name,
            description: `${money(h.unitPrice)} · ${h.available} left`,
          })),
        },
      ],
    },
    buttonRows: [
      [{ id: 'menu:cart', label: 'View Cup' }],
      [{ id: 'menu:checkout', label: 'Checkout' }],
      [{ id: 'menu:home', label: 'Main Menu' }],
    ],
  };
}

function mainMenu(): OutboundMessage {
  return {
    text: [
      'Welcome to Bing Chun Delivery 👋',
      '',
      'What would you like to do?',
      '',
      '1. Browse Products / Menu',
      '2. View Cup',
      '3. My Orders',
      '4. Track Order',
      '',
      'Tap a button or reply: menu',
    ].join('\n'),
    buttonRows: [
      [{ id: 'menu:browse', label: 'Browse Menu' }],
      [{ id: 'menu:cart', label: 'View Cup' }],
      [{ id: 'menu:orders', label: 'My Orders' }],
    ],
  };
}

function storePickerButtons(
  stores: Array<{ id: string; name: string; city: string }>,
): OutboundMessage {
  const limited = stores.slice(0, 10);
  const lines = limited.map((s, i) => `${i + 1}. ${s.name} (${s.city})`);
  const rows = limited.map((s) => ({
    id: `store:${s.id}`,
    label: s.name.slice(0, 24),
    description: s.city.slice(0, 72),
  }));
  return {
    text: [
      stores.length > 10
        ? `Found ${stores.length} stores — showing the first 10. Type a city name to narrow the list.`
        : 'Please select your preferred store:',
      '',
      ...lines,
      '',
      'Or reply with a city / branch name.',
    ].join('\n'),
    list: {
      buttonLabel: 'Choose store',
      header: 'Select store',
      sections: [{ title: 'Stores', rows }],
    },
  };
}

function askCityMessage(): OutboundMessage {
  return {
    text: [
      'Which city or branch are you ordering from?',
      '',
      'Reply with your city name, for example:',
      '• Colombo',
      '• Kandy',
      '• Anuradhapura',
      '• Galle',
    ].join('\n'),
  };
}

function afterAddButtons(): OutboundButton[][] {
  return [
    [{ id: 'menu:browse', label: 'Add More' }],
    [{ id: 'menu:cart', label: 'View Cup' }],
    [{ id: 'menu:checkout', label: 'Checkout' }],
  ];
}

function parseIntent(text: string | undefined, callbackData: string | undefined): string {
  const rawCb = (callbackData || '').trim();
  const t = (text || '').trim().toLowerCase();
  const label = rawCb.toLowerCase() || t;

  // Map WhatsApp button titles / free text to stable intents
  if (
    rawCb === 'menu:home' ||
    rawCb === 'menu:browse' ||
    rawCb === 'menu:cart' ||
    rawCb === 'menu:checkout' ||
    rawCb === 'menu:orders' ||
    rawCb === 'menu:track' ||
    rawCb.startsWith('store:') ||
    rawCb.startsWith('product:') ||
    rawCb.startsWith('qty:') ||
    rawCb.startsWith('confirm:') ||
    rawCb.startsWith('order:')
  ) {
    return rawCb;
  }

  if (!label || label === 'hi' || label === 'hello' || label === '/start' || label === 'help' || label === 'main menu') {
    return 'menu:home';
  }
  if (
    label === 'menu' ||
    label === 'browse' ||
    label === 'browse menu' ||
    label.includes('browse') ||
    label.includes('place order') ||
    label.includes('product')
  ) {
    return 'menu:browse';
  }
  if (label.includes('order detail') || label.includes('visit order') || label === 'details') {
    return 'order:details';
  }
  if (label === 'cart' || label === 'cup' || label.includes('view cart') || label.includes('view cup')) {
    return 'menu:cart';
  }
  if (label === 'checkout' || label.includes('check out')) return 'menu:checkout';
  if (label.includes('my order') || label === 'orders') return 'menu:orders';
  if (label.includes('track')) return 'menu:track';
  if (label === 'confirm') return 'confirm:yes';
  if (label === 'cancel') return 'confirm:cancel';
  if (label === 'edit') return 'confirm:edit';

  if (rawCb) return rawCb;
  return `text:${(text || '').trim()}`;
}


async function send(
  adapter: MessagingChannelAdapter,
  externalUserId: string,
  message: OutboundMessage,
  orderId?: string | null,
): Promise<void> {
  const result = await adapter.send(externalUserId, message);
  const externalMessageId = result.waMessageId || `out:${randomUUID()}`;
  const messageType = message.list || message.buttonRows?.length || message.ctaUrl ? 'interactive' : 'text';

  await logOutboundMessage({
    channel: adapter.channel,
    externalUserId,
    externalMessageId,
    bodyText: message.text,
    messageType,
    senderType: 'BOT',
    orderId,
  });
}

/** Send product menu as plain text first (reliable), then interactive list if present. */
async function sendCatalog(
  adapter: MessagingChannelAdapter,
  externalUserId: string,
  storeName: string,
  hits: MessagingProductHit[],
): Promise<void> {
  const catalog = productCatalogMessage(storeName, hits);
  // 1) Always send plain text menu so customers see products even if list UI fails
  await send(adapter, externalUserId, { text: catalog.text });
  // 2) Interactive picker (list or buttons) as a follow-up
  if (catalog.list || catalog.buttonRows?.length) {
    try {
      await send(adapter, externalUserId, {
        text: 'Tap below to pick a product, or reply with the name/number from the menu.',
        list: catalog.list,
        buttonRows: catalog.list ? undefined : catalog.buttonRows,
      });
    } catch (err) {
      logger.warn('messaging.catalog_interactive_failed', { error: String(err) });
      await send(adapter, externalUserId, {
        text: 'Reply with a product name or number from the menu above to continue.',
        buttonRows: [
          [{ id: 'menu:cart', label: 'View Cup' }],
          [{ id: 'menu:checkout', label: 'Checkout' }],
        ],
      });
    }
  }
}

function catalogContextHits(hits: MessagingProductHit[]): ConversationContext['searchResults'] {
  return hits.map((h) => ({
    productId: h.productId,
    name: h.name,
    unitPrice: h.unitPrice,
    available: h.available,
  }));
}

/**
 * Unified conversation engine for WhatsApp + Telegram.
 * Channel adapters only format/send; all business logic lives here.
 */
export async function handleMessagingEvent(
  adapter: MessagingChannelAdapter,
  event: IncomingMessagingEvent,
): Promise<void> {
  logger.info('messaging.event', {
    channel: event.channel,
    externalUserId: event.externalUserId,
    text: (event.text || '').slice(0, 80) || null,
    // Interactive button/list id from WhatsApp (NOT the Meta webhook callback URL in DB)
    buttonReplyId: event.callbackData || null,
    hasButtonReply: Boolean(event.callbackData),
  });

  const shouldProcess = await tryAcquireProcessingLock({
    channel: event.channel,
    externalMessageId: event.externalMessageId,
  });
  if (!shouldProcess) return;

  try {
    const resolved = await resolveMessagingCustomer({
      channel: event.channel,
      externalUserId: event.externalUserId,
      phoneNumber: event.phoneNumber,
      username: event.username,
    });

    const session = await getOrCreateSession(
      event.channel,
      event.externalUserId,
      resolved.customerId,
    );

    const intent = parseIntent(event.text, event.callbackData);
    let cart = getSessionCart(session);
    let context = getSessionContext(session);
    let state = session.state;
    let storeId = session.storeId;
    let orderIdForLog: string | null = null;

    // Prefer WhatsApp sender number as the customer phone (never a hardcoded test MSISDN).
    if (adapter.channel === 'WHATSAPP' && event.externalUserId) {
      const senderLocal = normalizePhone(event.externalUserId);
      if (senderLocal && !context.guestPhone) {
        context = { ...context, guestPhone: senderLocal };
      }
    }

    const persist = async (patch?: {
      state?: typeof state;
      storeId?: string | null;
      cart?: ConversationCartItem[];
      context?: ConversationContext;
      customerId?: string | null;
    }) => {
      const updated = await updateSession(session.id, {
        state: patch?.state ?? state,
        storeId: patch?.storeId !== undefined ? patch.storeId : storeId,
        cart: patch?.cart ?? cart,
        context: patch?.context ?? context,
        customerId: patch?.customerId !== undefined ? patch.customerId : resolved.customerId,
      });
      state = updated.state;
      storeId = updated.storeId;
      cart = getSessionCart(updated);
      context = getSessionContext(updated);
    };

    const ensureStore = async (): Promise<boolean> => {
      if (storeId) return true;

      const preferred = await getDefaultMessagingStore();
      if (preferred) {
        await persist({ storeId: preferred.id, state: 'BROWSING_PRODUCTS' });
        return true;
      }

      const stores = await listActiveStores({ limit: 50 });
      if (!stores.length) {
        await send(adapter, event.externalUserId, {
          text: 'Sorry, no stores are available right now. Please try again later.',
        });
        return false;
      }
      // Single store → auto-select so customers get the menu immediately
      if (stores.length === 1) {
        await persist({ storeId: stores[0].id, state: 'BROWSING_PRODUCTS' });
        return true;
      }
      // Many branches: ask city instead of dumping 50 stores (WhatsApp list max = 10)
      await persist({ state: 'SELECTING_STORE' });
      await send(adapter, event.externalUserId, askCityMessage());
      return false;
    };

    // --- Store selection ---
    if (intent.startsWith('store:')) {
      const id = intent.slice('store:'.length);
      const stores = await listActiveStores({ limit: 50 });
      const store = stores.find((s) => s.id === id);
      if (!store) {
        await send(adapter, event.externalUserId, {
          text: 'This store is currently unavailable. Please type your city name again.',
        });
        await send(adapter, event.externalUserId, askCityMessage());
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      const popular = await listPopularStoreProducts(store.id, 10);
      await persist({
        storeId: store.id,
        state: 'BROWSING_PRODUCTS',
        context: { searchResults: catalogContextHits(popular) },
      });
      await sendCatalog(adapter, event.externalUserId, store.name, popular);
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:home') {
      if (state === 'SELECTING_STORE') {
        await send(adapter, event.externalUserId, askCityMessage());
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      await persist({ state: 'NEW' });
      await send(adapter, event.externalUserId, mainMenu());
      // Immediately follow with product menu when only one store / default store exists
      const preferred = await getDefaultMessagingStore();
      const stores = preferred ? [preferred] : await listActiveStores({ limit: 50 });
      if (stores.length === 1) {
        const popular = await listPopularStoreProducts(stores[0].id, 10);
        await persist({
          storeId: stores[0].id,
          state: 'BROWSING_PRODUCTS',
          context: { ...context, searchResults: catalogContextHits(popular) },
        });
        await sendCatalog(adapter, event.externalUserId, stores[0].name, popular);
      }
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:browse') {
      if (!(await ensureStore())) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      await persist({ state: 'BROWSING_PRODUCTS' });
      const stores = await listActiveStores();
      const store = stores.find((s) => s.id === storeId);
      const popular = storeId ? await listPopularStoreProducts(storeId, 10) : [];
      await persist({ context: { ...context, searchResults: catalogContextHits(popular) } });
      await sendCatalog(adapter, event.externalUserId, store?.name || 'your store', popular);
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:cart') {
      if (!(await ensureStore())) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      if (!cart.length) {
        await send(adapter, event.externalUserId, {
          text: 'Your cup is empty.\n\nType a product name to start shopping.',
          buttonRows: [[{ id: 'menu:browse', label: '🛒 Browse Products' }]],
        });
      } else {
        const summary = formatCartSummary(cart);
        await persist({ state: 'VIEWING_CART' });
        await send(adapter, event.externalUserId, {
          text: summary.text,
          buttonRows: afterAddButtons(),
        });
      }
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent.startsWith('product:')) {
      if (!(await ensureStore()) || !storeId) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      const productId = intent.slice('product:'.length);
      const detail = await getStoreProductDetail(storeId, productId);
      if (!detail) {
        await send(adapter, event.externalUserId, {
          text: "Sorry, I couldn't find that product.\nPlease try another product name.",
        });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      context = {
        ...context,
        selectedProductId: detail.productId,
        selectedProductName: detail.name,
        selectedUnitPrice: detail.unitPrice,
        selectedAvailable: detail.available,
      };
      await persist({ state: 'ADDING_PRODUCT', context });
      await send(adapter, event.externalUserId, {
        text: [
          detail.name,
          '',
          `Price: ${money(detail.unitPrice)}`,
          `Available: ${detail.available}`,
          '',
          'How many would you like?',
        ].join('\n'),
        buttonRows: [
          [
            { id: 'qty:1', label: '1' },
            { id: 'qty:2', label: '2' },
            { id: 'qty:3', label: '3' },
          ],
          [{ id: 'menu:browse', label: '← Back' }],
        ],
      });
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent.startsWith('qty:') || (/^text:\d+$/.test(intent) && state === 'ADDING_PRODUCT')) {
      const qtyRaw = intent.startsWith('qty:')
        ? intent.slice('qty:'.length)
        : intent.slice('text:'.length);
      const qty = parseInt(qtyRaw, 10);
      if (!context.selectedProductId || !Number.isFinite(qty) || qty < 1) {
        await send(adapter, event.externalUserId, { text: 'Please send a valid quantity (e.g. 2).' });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      if (!(await ensureStore()) || !storeId) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      const detail = await getStoreProductDetail(storeId, context.selectedProductId);
      if (!detail) {
        await send(adapter, event.externalUserId, {
          text: "Sorry, I couldn't find that product.\nPlease try another product name.",
        });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      if (detail.available < qty) {
        await send(adapter, event.externalUserId, {
          text:
            detail.available <= 0
              ? 'Sorry, this product is currently out of stock.'
              : `Sorry, only ${detail.available} units are available.\n\nWould you like to order ${detail.available} instead?`,
          buttonRows:
            detail.available > 0
              ? [
                  [{ id: `qty:${detail.available}`, label: `Order ${detail.available}` }],
                  [{ id: 'menu:browse', label: 'Choose another' }],
                ]
              : [[{ id: 'menu:browse', label: 'Browse Products' }]],
        });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }

      const existing = cart.find((c) => c.productId === detail.productId);
      if (existing) {
        existing.quantity += qty;
        existing.unitPrice = detail.unitPrice;
        existing.productName = detail.name;
      } else {
        cart = [
          ...cart,
          {
            productId: detail.productId,
            productName: detail.name,
            quantity: qty,
            unitPrice: detail.unitPrice,
            size: 'REGULAR',
          },
        ];
      }
      context = {
        ...context,
        selectedProductId: undefined,
        selectedProductName: undefined,
        selectedUnitPrice: undefined,
        selectedAvailable: undefined,
      };
      await persist({ cart, context, state: 'VIEWING_CART' });
      const lineTotal = detail.unitPrice * qty;
      await send(adapter, event.externalUserId, {
        text: [
          '✅ Added to your cup.',
          '',
          `${detail.name} × ${qty}`,
          `Subtotal: ${money(lineTotal)}`,
          '',
          'What next?',
        ].join('\n'),
        buttonRows: afterAddButtons(),
      });
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:checkout' || intent === 'confirm:edit') {
      if (!(await ensureStore()) || !storeId) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      if (!cart.length) {
        await send(adapter, event.externalUserId, { text: 'Your cup is empty. Search for a product first.' });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      context = {
        ...context,
        checkoutStep: 'name',
        orderMode: 'DELIVERY',
        paymentMethod: 'CASH_ON_DELIVERY',
        guestName: context.guestName || resolved.user?.name,
        guestPhone:
          context.guestPhone ||
          resolved.user?.phone ||
          (adapter.channel === 'WHATSAPP' ? normalizePhone(event.externalUserId) : undefined),
      };
      await persist({ state: 'COLLECTING_CUSTOMER_DETAILS', context });
      if (context.guestName && !/^customer|user|guest$/i.test(context.guestName)) {
        context.checkoutStep = 'phone';
        await persist({ context });
      }
      if (context.checkoutStep === 'name') {
        await send(adapter, event.externalUserId, { text: 'Please enter your name:' });
      } else if (!context.guestPhone) {
        await send(adapter, event.externalUserId, { text: 'Please enter your phone number:' });
      } else {
        context.checkoutStep = 'address';
        await persist({ context });
        await send(adapter, event.externalUserId, {
          text: `Using WhatsApp number ${context.guestPhone} for this order.\n\nPlease enter your delivery address:`,
        });
      }
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'confirm:yes' && state === 'CONFIRMING_ORDER') {
      if (!(await ensureStore()) || !storeId) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      try {
        const result = await placeMessagingOrder({
          channel: event.channel,
          externalUserId: event.externalUserId,
          username: event.username,
          storeId,
          cart,
          guestName: context.guestName || 'Customer',
          guestPhone: context.guestPhone || '',
          addressLine: context.addressLine || '',
          city: context.city || '',
          district: context.district,
          notes: context.deliveryNotes,
          orderMode: context.orderMode || 'DELIVERY',
          paymentMethod: context.paymentMethod || 'CASH_ON_DELIVERY',
          lat: context.lat,
          lng: context.lng,
        });
        orderIdForLog = result.orderId;
        cart = [];
        context = {
          lastOrderId: result.orderId,
          lastOrderNumber: result.orderNumber,
          guestName: context.guestName,
          guestPhone: context.guestPhone,
        };
        await persist({
          cart: [],
          context,
          state: 'ORDER_CREATED',
          customerId: resolved.customerId,
        });
        await send(
          adapter,
          event.externalUserId,
          orderConfirmedMessage({
            orderNumber: result.orderNumber,
            storeName: result.storeName,
            guestName: result.guestName,
            total: result.total,
            subtotal: result.subtotal,
            deliveryFee: result.deliveryFee,
            addressLine: result.addressLine,
            city: result.city,
            orderMode: result.orderMode,
            paymentMethod: result.paymentMethod,
            items: result.items,
          }),
          result.orderId,
        );
        await send(
          adapter,
          event.externalUserId,
          {
            text: 'What would you like to do next?',
            buttonRows: [
              [{ id: 'menu:track', label: 'Track Order' }],
              [{ id: `order:details:${result.orderNumber}`, label: 'Order Details' }],
              [{ id: 'menu:home', label: 'Main Menu' }],
            ],
          },
          result.orderId,
        );
      } catch (err) {
        const msg =
          err instanceof AppError
            ? err.message
            : "We're having trouble processing your request.\nPlease try again shortly.";
        logger.warn('messaging.order_failed', { error: String(err) });
        await send(adapter, event.externalUserId, {
          text: msg,
          buttonRows: [
            [{ id: 'menu:cart', label: '🛍️ View Cup' }],
            [{ id: 'menu:home', label: '🏠 Main Menu' }],
          ],
        });
      }
      await markMessageProcessed(event.channel, event.externalMessageId, orderIdForLog);
      return;
    }

    if (intent === 'confirm:cancel') {
      await persist({ state: 'VIEWING_CART' });
      await send(adapter, event.externalUserId, {
        text: 'Order cancelled. Your cup is still saved.',
        buttonRows: afterAddButtons(),
      });
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:orders') {
      const orders = await getRecentOrdersForCustomer({
        customerId: resolved.customerId,
        guestPhone: context.guestPhone || resolved.user?.phone,
      });
      if (!orders.length) {
        await send(adapter, event.externalUserId, {
          text: 'You have no recent orders yet.',
          buttonRows: [[{ id: 'menu:browse', label: '🛒 Browse Products' }]],
        });
      } else {
        const lines = orders.map(
          (o) => `#${o.orderNumber} — ${o.status}\n${money(o.total)} · ${o.store.name}`,
        );
        await send(adapter, event.externalUserId, {
          text: ['📋 Your recent orders', '', ...lines].join('\n\n'),
          buttonRows: [[{ id: 'menu:track', label: '🚚 Track Order' }], [{ id: 'menu:home', label: '🏠 Main Menu' }]],
        });
      }
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'menu:track') {
      await persist({ state: 'TRACKING_ORDER' });
      if (context.lastOrderNumber) {
        const order = await getOrderTracking(context.lastOrderNumber);
        if (order) {
          await send(
            adapter,
            event.externalUserId,
            orderDetailsMessage(order),
            order.id,
          );
          await markMessageProcessed(event.channel, event.externalMessageId, order.id);
          return;
        }
      }
      await send(adapter, event.externalUserId, {
        text: 'Send your order number to track (e.g. BC260811-1234).',
      });
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    if (intent === 'order:details' || intent.startsWith('order:details:')) {
      const explicitNumber = intent.startsWith('order:details:')
        ? intent.slice('order:details:'.length).trim()
        : '';
      const orderRef = explicitNumber || context.lastOrderNumber || '';
      if (!orderRef) {
        await send(adapter, event.externalUserId, {
          text: 'Send your order number to see details (e.g. BC260811-1234), or place an order first.',
          buttonRows: [[{ id: 'menu:browse', label: 'Browse Menu' }]],
        });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      const order = await getOrderTracking(orderRef);
      if (!order) {
        await send(adapter, event.externalUserId, {
          text: 'Order not found. Please check the order number and try again.',
        });
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }
      await send(adapter, event.externalUserId, orderDetailsMessage(order), order.id);
      await markMessageProcessed(event.channel, event.externalMessageId, order.id);
      return;
    }

    // Free-text handling by state
    if (intent.startsWith('text:')) {
      const text = intent.slice('text:'.length).trim();

      if (state === 'SELECTING_STORE' || (!storeId && state === 'NEW')) {
        const matches = await listActiveStores({ query: text, limit: 20 });
        if (!matches.length) {
          await persist({ state: 'SELECTING_STORE' });
          await send(adapter, event.externalUserId, {
            text: `No store found for "${text}". Try another city or branch name.`,
          });
          await send(adapter, event.externalUserId, askCityMessage());
          await markMessageProcessed(event.channel, event.externalMessageId);
          return;
        }
        if (matches.length === 1) {
          const popular = await listPopularStoreProducts(matches[0].id, 10);
          await persist({
            storeId: matches[0].id,
            state: 'BROWSING_PRODUCTS',
            context: { searchResults: catalogContextHits(popular) },
          });
          await sendCatalog(adapter, event.externalUserId, matches[0].name, popular);
          await markMessageProcessed(event.channel, event.externalMessageId);
          return;
        }
        await persist({ state: 'SELECTING_STORE' });
        await send(adapter, event.externalUserId, storePickerButtons(matches));
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }

      if (state === 'TRACKING_ORDER') {
        const order = await getOrderTracking(text);
        if (!order) {
          await send(adapter, event.externalUserId, {
            text: 'Order not found. Please check the order number and try again.',
          });
        } else {
          await send(adapter, event.externalUserId, orderDetailsMessage(order), order.id);
        }
        await markMessageProcessed(event.channel, event.externalMessageId, order?.id);
        return;
      }

      if (state === 'COLLECTING_CUSTOMER_DETAILS' || state === 'CHECKOUT' || state === 'SELECTING_PAYMENT') {
        const step = context.checkoutStep || 'name';
        if (step === 'name') {
          context.guestName = text;
          if (!context.guestPhone && adapter.channel === 'WHATSAPP') {
            context.guestPhone = normalizePhone(event.externalUserId);
          }
          if (context.guestPhone) {
            context.checkoutStep = 'address';
            await persist({ context });
            await send(adapter, event.externalUserId, {
              text: `Using WhatsApp number ${context.guestPhone} for this order.\n\nPlease enter your delivery address:`,
            });
          } else {
            context.checkoutStep = 'phone';
            await persist({ context });
            await send(adapter, event.externalUserId, { text: 'Please enter your phone number:' });
          }
        } else if (step === 'phone') {
          context.guestPhone = text;
          context.checkoutStep = 'address';
          await persist({ context });
          await send(adapter, event.externalUserId, { text: 'Please enter your delivery address:' });
        } else if (step === 'address') {
          context.addressLine = text;
          context.checkoutStep = 'city';
          await persist({ context });
          await send(adapter, event.externalUserId, { text: 'Which city?' });
        } else if (step === 'city') {
          context.city = text;
          context.district = text;
          context.checkoutStep = 'notes';
          await persist({ context });
          await send(adapter, event.externalUserId, {
            text: 'Any delivery instructions? (or type skip)',
          });
        } else if (step === 'notes') {
          if (!/^skip$/i.test(text)) context.deliveryNotes = text;
          context.checkoutStep = 'confirm';
          context.paymentMethod = 'CASH_ON_DELIVERY';
          await persist({ state: 'CONFIRMING_ORDER', context });
          const summary = formatCartSummary(cart);
          await send(adapter, event.externalUserId, {
            text: [
              '🧾 Order Summary',
              '',
              'Products:',
              '',
              ...cart.map((i) => `${i.productName} × ${i.quantity}\n${money(i.unitPrice * i.quantity)}`),
              '',
              `Subtotal: ${money(summary.subtotal)}`,
              'Delivery: calculated at confirmation',
              `Items total: ${money(summary.subtotal)}`,
              '',
              'Delivery:',
              `${context.addressLine}, ${context.city}`,
              '',
              'Payment:',
              'Cash on Delivery',
              '',
              'Confirm order?',
            ].join('\n'),
            buttonRows: [
              [{ id: 'confirm:yes', label: '✅ Confirm Order' }],
              [{ id: 'confirm:edit', label: '✏️ Edit Order' }],
              [{ id: 'confirm:cancel', label: '❌ Cancel' }],
            ],
          });
        }
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }

      // Product search / menu number pick
      if (!(await ensureStore()) || !storeId) {
        await markMessageProcessed(event.channel, event.externalMessageId);
        return;
      }

      // Reply with menu number (e.g. "1")
      if (/^\d+$/.test(text) && context.searchResults?.length) {
        const idx = parseInt(text, 10) - 1;
        const picked = context.searchResults[idx];
        if (picked) {
          const detail = await getStoreProductDetail(storeId, picked.productId);
          if (detail) {
            context = {
              ...context,
              selectedProductId: detail.productId,
              selectedProductName: detail.name,
              selectedUnitPrice: detail.unitPrice,
              selectedAvailable: detail.available,
            };
            await persist({ state: 'ADDING_PRODUCT', context });
            await send(adapter, event.externalUserId, {
              text: [
                detail.name,
                '',
                `Price: ${money(detail.unitPrice)}`,
                `Available: ${detail.available}`,
                '',
                'How many would you like?',
              ].join('\n'),
              buttonRows: [
                [
                  { id: 'qty:1', label: '1' },
                  { id: 'qty:2', label: '2' },
                  { id: 'qty:3', label: '3' },
                ],
                [{ id: 'menu:browse', label: 'Back' }],
              ],
            });
            await markMessageProcessed(event.channel, event.externalMessageId);
            return;
          }
        }
      }

      const hits = await searchStoreProducts(storeId, text);
      logger.info('messaging.product_searched', { query: text, hits: hits.length, storeId });
      if (!hits.length) {
        await send(adapter, event.externalUserId, {
          text: "Sorry, I couldn't find that product.\nPlease try another product name.",
        });
      } else if (hits.length === 1) {
        const detail = hits[0];
        context = {
          ...context,
          selectedProductId: detail.productId,
          selectedProductName: detail.name,
          selectedUnitPrice: detail.unitPrice,
          selectedAvailable: detail.available,
          searchResults: hits,
        };
        await persist({ state: 'ADDING_PRODUCT', context });
        await send(adapter, event.externalUserId, {
          text: [
            detail.name,
            '',
            `Price: ${money(detail.unitPrice)}`,
            `Available: ${detail.available}`,
            '',
            'How many would you like?',
          ].join('\n'),
          buttonRows: [
            [
              { id: 'qty:1', label: '1' },
              { id: 'qty:2', label: '2' },
              { id: 'qty:3', label: '3' },
            ],
          ],
        });
      } else {
        context = { ...context, searchResults: hits };
        await persist({ state: 'SELECTING_PRODUCT', context });
        await send(adapter, event.externalUserId, {
          text: [
            'I found several products:',
            '',
            ...hits.map((h, i) => `${i + 1}. ${h.name} — ${money(h.unitPrice)} (avail ${h.available})`),
            '',
            'Tap a product below, or reply with the number.',
          ].join('\n'),
          list: {
            buttonLabel: 'Pick product',
            header: 'Search results',
            sections: [
              {
                title: 'Matches',
                rows: hits.slice(0, 10).map((h) => ({
                  id: `product:${h.productId}`,
                  label: h.name,
                  description: `${money(h.unitPrice)} · ${h.available} left`,
                })),
              },
            ],
          },
          buttonRows: hits.slice(0, 3).map((h) => [{ id: `product:${h.productId}`, label: h.name }]),
        });
      }
      await markMessageProcessed(event.channel, event.externalMessageId);
      return;
    }

    await send(adapter, event.externalUserId, mainMenu());
    await markMessageProcessed(event.channel, event.externalMessageId);
  } catch (err) {
    logger.error('messaging.handle_failed', { error: String(err) });
    let replied = false;
    try {
      await send(adapter, event.externalUserId, {
        text: "We're having trouble processing your request.\nPlease try again shortly.",
      });
      replied = true;
    } catch (sendErr) {
      logger.error('messaging.handle_failed_reply_also_failed', { error: String(sendErr) });
    }
    // Only mark processed when we at least notified the customer; otherwise Meta/admin can retry.
    if (replied) {
      await markMessageProcessed(event.channel, event.externalMessageId);
    }
  }
}
