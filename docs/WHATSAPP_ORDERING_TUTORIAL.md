# WhatsApp ordering — deploy & customer tutorial

How to get Bing Chun’s **menu on WhatsApp** and place an order (same products, stock, and orders as the website).

---

## Part A — One-time server setup (admin)

### 1. Deploy the code

Production deploys from GitLab **`main`** → CapRover (`bing-chun-backend` + `bing-chung`).

1. Merge / push WhatsApp messaging changes to `main`
2. Wait for GitLab CI: `build-backend` → `deploy-backend` (and frontend if UI changed)
3. Confirm API is up: `https://bing-chung-b.mp.dartcodes.com/health`

### 2. Add WhatsApp env vars on CapRover

CapRover → **bing-chun-backend** → **App Configs** → **Environment Variables**:

| Variable | Value |
|----------|--------|
| `WHATSAPP_ACCESS_TOKEN` | Permanent token from Meta (not the temporary sandbox paste) |
| `WHATSAPP_PHONE_NUMBER_ID` | e.g. `1356038207583422` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | e.g. `1563949681945861` |
| `WHATSAPP_VERIFY_TOKEN` | Same string you put in Meta (e.g. `bingchun-wa-verify-local-test`) |
| `API_BASE_URL` | `https://bing-chung-b.mp.dartcodes.com` |

Save and **restart** the backend app.

You can also paste the same values later under **Admin → Settings → WhatsApp ordering** (stored in DB; env is the fallback).

### 3. Configure Meta webhook (required for replies)

In [Meta for Developers](https://developers.facebook.com/) → your app → WhatsApp → **Configuration** / Production setup → **Configure webhooks**:

| Field | Value |
|-------|--------|
| **Callback URL** | `https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook` |
| **Verify token** | Exactly the same as `WHATSAPP_VERIFY_TOKEN` (e.g. `bingchun-wa-verify-local`) |

> Meta requires **HTTPS**. Do not use `http://` — verification will fail. Same host/path with `https://` works.

Click **Verify and save**, then subscribe to:

- `messages`
- (optional) message delivery statuses

Until the app is published, Meta may only deliver **test** traffic to numbers you added in the sandbox.

### 4. Which WhatsApp number do customers message?

In Meta → WhatsApp → **API Setup** / phone numbers:

- Copy the **business display number** customers should chat with  
- Sandbox test number looks like `+1 555-…` and only works for **allowed test recipients**  
- Production needs a real registered WhatsApp Business number

Add your phone under **“To” / allowed list** while testing.

### 5. Stock so the menu is not empty

WhatsApp shows products that are **available at the selected store** (in stock).

Admin → Stock / Products: ensure items are available for the store (e.g. Anuradhapura).

---

## Part B — How a customer gets the menu (tutorial)

### Step 1 — Open WhatsApp

Message the **Bing Chun WhatsApp Business number** (from Part A §4).

### Step 2 — Say hello

Send any of:

- `Hi`
- `Hello`
- `Menu`

Bot replies with the main menu:

- Browse Products  
- View Cart  
- My Orders  
- Track Order  

### Step 3 — Browse / get the product list

1. Tap **Browse Products** (or type `browse`)
2. Pick your **store**
3. Bot sends the **menu / product list** (interactive list + text prices)

Tap a product **or** type a name (e.g. `Bobo`, `Milk Tea`).

### Step 4 — Add to cart

1. Choose **quantity** (1 / 2 / 3 or type a number)
2. Tap **Add More**, **View Cart**, or **Checkout**

### Step 5 — Checkout

Provide when asked:

1. Name  
2. Phone  
3. Address  
4. City  
5. Notes (optional)  

Confirm → order is created in the normal **Orders** admin list with channel **WhatsApp**.

---

## Part C — Quick admin checklist

| Check | OK when |
|-------|---------|
| Backend deployed | `/health` returns OK |
| Webhook verified | Meta shows green / saved callback |
| Env / Settings tokens set | Bot can send messages |
| Your phone on allow-list | You receive sandbox messages |
| Store has stock | Product list is not empty |
| Customer can reply | Webhook receives inbound (not only outbound scripts) |

### Optional: push a catalog from a server/dev machine

```bash
cd backend
npx tsx scripts/sendWhatsAppProductList.ts 94759065140
```

(Uses the same conversation engine; needs valid WhatsApp credentials.)

---

## Links

| What | URL |
|------|-----|
| Backend health | https://bing-chung-b.mp.dartcodes.com/health |
| WhatsApp webhook | https://bing-chung-b.mp.dartcodes.com/api/whatsapp/webhook |
| CapRover | https://captain.mp.dartcodes.com |
| Admin settings | Your site → `/admin/settings` → WhatsApp ordering |
| Technical design | [MESSAGING_ORDERS.md](./MESSAGING_ORDERS.md) |
