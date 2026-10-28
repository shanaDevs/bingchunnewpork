# Messaging order channels (WhatsApp + Telegram)

Unified conversational ordering that creates **normal** `orders` rows with:

- `channel = WHATSAPP` or `channel = TELEGRAM`

Website / POS / App continue to use the same products, inventory reservations, stock engine, and admin order panel.

## Architecture

```text
WhatsApp Cloud API ──┐
                     ├── adapters ── OrderConversationService ── placeMessagingOrder
Telegram Bot API ────┘                      │
                                            ├── Product / Store search (existing DB)
                                            ├── ConversationSession cart (server-side)
                                            ├── validateOrderStock + deductOrderItemsOnce
                                            └── Order + OrderItem (same tables as web/POS)
```

## Environment

Set in `backend/.env` (see `backend/env.example`):

```bash
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

Never put these in `Frontend` or commit real secrets.

## Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/whatsapp/webhook` | Meta verify (`hub.verify_token`) |
| POST | `/api/whatsapp/webhook` | Inbound WhatsApp messages |
| POST | `/api/telegram/webhook` | Inbound Telegram updates |

Telegram: set webhook with secret token header `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.

Example:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_API_HOST/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

WhatsApp: in Meta Developer Console, set callback URL to `https://YOUR_API_HOST/api/whatsapp/webhook` and the same verify token as `WHATSAPP_VERIFY_TOKEN`.

## Database

Migration: `packages/db/prisma/migrations/20260811160000_messaging_order_channels/`

Adds:

- `orders.channel` (`WEB` \| `APP` \| `POS` \| `WHATSAPP` \| `TELEGRAM`)
- `customer_channels` — identity mapping (no duplicate users)
- `conversation_sessions` — server-side cart + state
- `channel_messages` — idempotency + admin history

Also applied at boot via `ensureMessagingSchema()` when `RUNTIME_SCHEMA_PATCHES` is enabled.

```bash
npm run prisma:generate -w @bingchun/db
npm run prisma:deploy -w @bingchun/db
```

## Order placement & stock

Messaging checkout calls `placeMessagingOrder`, which:

1. Re-prices from `products.basePrice`
2. Validates stock with `validateOrderStock` (available = physical − ACTIVE reservations)
3. Creates a normal `Order` + `OrderItem`s with `channel` set
4. Deducts via `deductOrderItemsOnce`
5. Notifies the branch with `notifyBranchNewOrder`

If deduction fails, the order is cancelled (`OUT_OF_STOCK`) — no oversell.

## Status notifications

When admin updates status (`PUT /api/orders/:id/status`), customers on WhatsApp/Telegram receive a channel message via `notifyMessagingOrderStatus`.

## Admin Settings

Super-admins can manage WhatsApp under **Admin → Settings → WhatsApp ordering**:

- Enable / disable WhatsApp orders
- Phone Number ID, Business Account ID
- Access token + webhook verify token (masked; blank keeps current)
- Callback URL shown for Meta webhook config

Stored on `system_settings` (secrets never returned to the client). Env vars remain a fallback until admin saves values.

## Admin order identification

- Orders list + All Orders: **Channel** column and filter (`🟢 WhatsApp`)
- WhatsApp rows get a green accent border on All Orders
- Order drawer shows channel badge + WhatsApp phone / conversation
- Branch new-order notifications say `via WhatsApp`

## Customer flow (product list → order)

1. Customer sends **Hi** → main menu (Browse / Cart / Orders / Track)
2. **Browse Products** → pick a store
3. Bot sends an interactive **product list** (WhatsApp list message, up to 10 in-stock items) plus a text fallback
4. Tap a product → choose quantity → added to server-side cart
5. **Checkout** → name, phone, address, city, notes → confirm
6. Creates a normal order with `channel = WHATSAPP` (same stock rules as web)

Customers can also type a product name to search. Search results use the same list UI when multiple matches exist.

### Push a catalog to a test number (local)

```bash
cd backend
npx tsx scripts/sendWhatsAppProductList.ts 94759065140
```

This greets the number and selects the first active store so WhatsApp receives the product list.

### Live two-way replies

Meta must reach your API. Point the WhatsApp webhook to a public URL, e.g. ngrok:

`https://YOUR_HOST/api/whatsapp/webhook` with verify token from Settings / `WHATSAPP_VERIFY_TOKEN`.

Without a public webhook, outbound messages still send, but customer taps/replies will not hit your server.

## Local testing without Meta/Telegram

Leave tokens empty — webhooks acknowledge but skip processing. Unit tests cover parsers and cart formatting:

```bash
npm run test:unit -w @bingchun/backend
```

## Important rules

- One inventory source: `store_products` + reservations
- No `whatsapp_orders` / `telegram_orders` tables
- Idempotent webhooks via unique `(channel, externalMessageId)` on `channel_messages`
