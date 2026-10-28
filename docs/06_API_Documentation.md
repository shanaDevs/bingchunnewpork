# 06 — API Documentation

**Base URL (dev):** `http://localhost:4000`  
**API prefix:** `/api`  
**Health:** `GET /health` (no auth)

## Conventions

### Success response

```json
{ "success": true, "data": { } }
```

Paginated:

```json
{
  "success": true,
  "data": [],
  "meta": { "total": 0, "page": 1, "limit": 20, "pages": 0 }
}
```

### Error response

```json
{ "success": false, "message": "Error text", "details": null }
```

| Status | Typical meaning |
|--------|-----------------|
| 400 | Business validation / bad request |
| 401 | Missing/invalid JWT or credentials |
| 403 | Forbidden (role/permission) |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 422 | Zod validation failure |
| 429 | Rate limited |
| 500 | Unhandled server error |

### Common headers

| Header | When |
|--------|------|
| `Content-Type: application/json` | JSON bodies |
| `Authorization: Bearer <accessToken>` | Protected routes |
| `Content-Type: multipart/form-data` | Image/receipt uploads |

### Auth types

| Label | Meaning |
|-------|---------|
| Public | No JWT |
| Optional | `optionalAuth` — guest OK |
| Customer | JWT `type=user` |
| Admin | JWT `type=admin` + `requireAdmin` |
| Driver | Admin JWT with role `DELIVERY_DRIVER` |
| Permission | `requirePermission(MENU, action)` — SYSTEM_ADMIN bypasses |

---

## Health

### GET `/health`

| Field | Value |
|-------|--------|
| Method | GET |
| URL | `/health` |
| Auth | Public |
| Description | Liveness check |

**Example response:** service-dependent JSON/text from `index.ts` (healthy process).

---

## Auth — `/api/auth`

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/register` | Public + auth rate limit | Register customer |
| POST | `/api/auth/login` | Public + auth rate limit | Email/phone + password |
| POST | `/api/auth/phone/login` | Public + auth rate limit | Phone login/register (no OTP) |
| POST | `/api/auth/phone/check` | Public + auth rate limit | Check if phone exists |
| POST | `/api/auth/google` | Public + auth rate limit | Google ID token login |
| POST | `/api/auth/facebook` | Public + auth rate limit | Facebook token login |
| POST | `/api/auth/otp/request` | Public + OTP rate limit | Request OTP |
| POST | `/api/auth/otp/verify` | Public | Verify OTP |
| POST | `/api/auth/refresh` | Public | Refresh customer access token |
| GET | `/api/auth/me` | Customer | Current profile |
| PUT | `/api/auth/me` | Customer | Update profile |
| DELETE | `/api/auth/me` | Customer | Soft-delete account |
| POST | `/api/auth/admin/login` | Public + auth rate limit | Staff email/password |
| POST | `/api/auth/admin/refresh` | Public | Refresh admin token |
| POST | `/api/auth/delivery/login` | Public + auth rate limit | Driver PIN login |

### POST `/api/auth/register`

| Field | Value |
|-------|--------|
| Description | Create customer; issue JWT |
| Auth | Public |
| Validation | name 2–100; phone `^(?:\+94\|0)[0-9]{9}$`; email optional; password min 8 optional |

**Request body:**

```json
{
  "name": "Amal Perera",
  "phone": "0771234567",
  "email": "amal@example.com",
  "password": "Secret123"
}
```

**Example response `201`:**

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "refreshToken": "<jwt>",
    "user": { "id": "...", "name": "Amal Perera", "phone": "0771234567", "email": "amal@example.com" }
  }
}
```

**Errors:** `409` phone/email taken; `422` validation.

### POST `/api/auth/phone/login`

| Field | Value |
|-------|--------|
| Description | Find or create user by phone; interim passwordless flow |
| Body | `{ "phone": "0771234567", "name?": "...", "email?": "..." }` |

### POST `/api/auth/admin/login`

**Body:** `{ "email": "admin@example.com", "password": "..." }`  
**Response:** `{ token, refreshToken, admin: { id, name, email, role, storeId, storeName, storeCity } }`  
**Notes:** Delivery drivers cannot use this endpoint (directed to driver app).

### POST `/api/auth/delivery/login`

**Body:** `{ "pin": "1234", "storeId?": "<uuid>" }`  
**Auth result:** JWT with role `DELIVERY_DRIVER` (longer-lived driver session as implemented in controller).

### POST `/api/auth/refresh`

**Body:** `{ "refreshToken": "..." }` → new customer access (+ refresh as implemented).

**Password reset API:** Not Implemented.

---

## Menu — `/api/menu`

| Method | URL | Auth | Permission |
|--------|-----|------|------------|
| GET | `/categories` | Public | — |
| POST | `/categories` | Admin | MENU create |
| PUT | `/categories/:id` | Admin | MENU update |
| GET | `/toppings` | Public | — |
| POST | `/toppings` | Admin | MENU create |
| PUT | `/toppings/:id` | Admin | MENU update |
| DELETE | `/toppings/:id` | Admin | MENU delete |
| POST | `/toppings/bulk-assign` | Admin | MENU update |
| GET | `/products` | Public | — |
| GET | `/products/:id` | Public | — |
| POST | `/products` | Admin | MENU create |
| PUT | `/products/:id` | Admin | MENU update |
| DELETE | `/products/:id` | Admin | MENU delete |
| POST | `/products/upload` | Admin | MENU create (multipart `image`) |

**Product create/update body** (`POST/PUT /products`, SYSTEM_ADMIN required):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| categoryId | string | yes | |
| name | string | yes | 1–200 chars |
| basePrice | int | yes | Selling price (LKR), positive |
| cost | int | yes | Unit cost (LKR), min 0 |
| description | string | no | |
| ingredients | string | no | |
| imageUrl | string | no | |
| tag | string | no | |
| isAvailable | boolean | no | |
| isDeliveryAvailable | boolean | no | |
| sortOrder | int | no | |
| toppingIds | string[] | no | |

**Product GET visibility:** `cost` is included in `GET /products` and `GET /products/:id` responses only when the request carries a valid **SYSTEM_ADMIN** JWT (`optionalAuth`). Public/customer responses omit `cost`.

---

## Stores — `/api/stores`

| Method | URL | Auth | Notes |
|--------|-----|------|-------|
| GET | `/` | Optional | List stores |
| GET | `/address/autocomplete` | Public | Maps or mock |
| GET | `/address/geocode` | Public | Forward geocode (query text → lat/lng) |
| GET | `/address/reverse` | Public | Query lat/lng |
| POST | `/validate-delivery` | Public | Zone/store resolution |
| GET | `/:id` | Public | Store detail |
| POST | `/` | Admin + STORES create | Create store |
| PUT | `/:id` | Admin + STORES update | Update store |
| POST | `/zones` | Admin + STORES create | Create zone |

---

## Cart — `/api/cart` (all Customer JWT)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/` | Get cart |
| POST | `/items` | Add item |
| PUT | `/items/:itemId` | Update qty/options |
| DELETE | `/` | Clear cart |

---

## Orders — `/api/orders`

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/` | Optional | Place order (guest OK) |
| GET | `/my` | Customer | My orders |
| GET | `/takeaway-queue` | Admin ORDERS read | Takeaway queue |
| PUT | `/takeaway-queue/reorder` | Admin ORDERS update + branch write | Reorder queue |
| POST | `/:id/confirm-payment` | Optional | Return URL confirm |
| POST | `/:id/confirm-payhere-popup` | Optional | Confirm PayHere popup checkout result |
| POST | `/:id/rating` | Optional | Platform rating |
| POST | `/:id/rider-rating` | Optional | Rider rating |
| GET | `/:id` | Optional | Get order (access rules in controller) |
| GET | `/` | Admin ORDERS read | List orders |
| PUT | `/:id/status` | Admin ORDERS update + branch write | Status transition |
| PATCH | `/:id/contact` | Admin ORDERS update + branch write | Contact edit |
| PUT | `/:id/items` | Admin ORDERS update + branch write | Edit items |
| POST | `/:id/complete-takeaway` | Admin + branch write | Complete pickup |
| POST | `/:id/collect-payment` | Admin + branch write | Collect cash |
| POST | `/payment-notify` | Public | PayHere IPN (MD5sig) |

### POST `/api/orders/` (place order)

| Field | Value |
|-------|--------|
| Auth | Optional (guest fields if no user) |
| Description | Creates order, prices items, applies promo/loyalty, sets initial status **RECEIVED** |

**Typical body fields (controller-validated):** orderMode, storeId / delivery location, items or cart reference, paymentMethod, promoCode, loyalty redemption, guest contact, notes — exact Zod schema in `orderController`.

**Status codes:** `201` created; `400` validation/business; `422` Zod.

### POST `/api/orders/payment-notify`

| Field | Value |
|-------|--------|
| Auth | Public (PayHere signature verification) |
| Description | Marks payment paid and triggers wallet credit when valid |

---

## Addresses — `/api/addresses` (Customer)

| Method | URL |
|--------|-----|
| GET | `/` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |

---

## Promos — `/api/promos`

| Method | URL | Auth |
|--------|-----|------|
| GET | `/` | Public — active promos |
| POST | `/validate` | Public — validate code |
| GET | `/admin/all` | Admin PROMOS read |
| POST | `/admin` | Admin PROMOS create |
| PUT | `/admin/:id` | Admin PROMOS update |

**`POST /validate` (preview):** Request may include client `orderTotal` for UX. Response includes `authoritative: false` and a `notice` that the preview is not binding. **Checkout authority** is `POST /orders`, which recomputes subtotal/discount from server cart lines — never persist discounts from validate alone.

**`POST /orders` and `addressId`:** When the body includes a saved `addressId`, the customer must be signed in and the address row must belong to that user (`404` if not found).

**Order payment confirm:** `POST /orders/:id/confirm-payment` and `POST /orders/:id/confirm-payhere-popup` require the same access as `GET /orders/:id` (owner JWT or valid `trackToken` in query/body).

---

## Settings — `/api/settings`

| Method | URL | Auth |
|--------|-----|------|
| GET | `/payment-methods` | Public |
| GET/PUT | `/payment` | Admin SETTINGS + SYSTEM_ADMIN |
| GET | `/app` | Public |
| PUT | `/app` | Admin SETTINGS update |
| GET | `/delivery-zones` | Public |
| POST/PUT/DELETE | `/delivery-zones`[`/:id`] | Admin SETTINGS + SYSTEM_ADMIN |

---

## Loyalty — `/api/loyalty`

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/api/loyalty/summary` | Customer | Points balance, loyalty settings, recent transactions (up to 50) |

**Example response `data` shape:** `{ points, settings: { pointsPerLkr, redeemValue, maxRedeemPct, minOrderToEarn }, transactions: [...] }`

---

## Payments — `/api/payments`

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/payhere/:orderNumber/session` | Public | PayHere checkout session payload (for popup/JS) |
| GET | `/payhere/:orderNumber` | Public | HTML PayHere checkout page |
| GET | `/payhere-return/:orderNumber` | Public | Return landing after PayHere |
| POST | `/payhere-return/:orderNumber` | Public | Return landing (POST from gateway) |

---

## Notifications — `/api/notifications` (Customer)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/` | List |
| PATCH | `/:id/read` | Mark read |
| POST | `/read-all` | Mark all read |
| POST | `/fcm-token` | Register FCM token |
| DELETE | `/fcm-token` | Unregister |

---

## Delivery (driver) — `/api/delivery`

All require `authenticate` + `requireDeliveryDriver`.

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/route` | Optimized multi-stop route (legacy/helper) |
| GET | `/jobs` | List jobs (includes rideCode, cups, estimates, delivery fee) |
| GET | `/jobs/active` | Active job (ASSIGNED / IN_PROGRESS / RETURNING / QUEUED) |
| GET | `/jobs/:id` | Job detail (includes completionRadiusM on store, canComplete) |
| GET | `/jobs/:id/route` | Job route geometry (see redaction note below) |
| POST | `/jobs/:id/assign` | Claim job |
| POST | `/jobs/:id/claim` | Claim job (preferred) |
| POST | `/jobs/:id/pickup` | Confirm pickup at branch |
| POST | `/jobs/:id/start` | Start job (starts actual time/distance tracking) |
| POST | `/jobs/:id/complete` | Complete job — body `{ lat, lng }`; requires RETURNING + within branch radius |
| PUT | `/orders/:orderId/status` | Update order on job; last delivered order moves ride to RETURNING |
| GET | `/me/stats` | Rider's own performance figures for the driver app's Stats tab |

### GET `/jobs/:id/route` — what an unclaimed job reveals

The driver app's Stops screen is map-first: the route is the full-screen background a driver
judges the run on, so **geometry is never redacted**. `stops[].lat`/`lng` and the OSRM `path`
polyline are real whether or not the job is claimed.

Customer *identity* is still gated on `isMine` (`job.driverId === req.user.sub`):

| Field | Unclaimed job | Driver's own job |
|-------|---------------|------------------|
| `store`, `path`, `summary` | real | real |
| `stops[].lat` / `lng` | real | real |
| `stops[].city` / `district` | real | real |
| `stops[].customerName` | `"Customer"` | real name |
| `stops[].customerPhone` | `""` | real phone |
| `stops[].addressLine` | `""` | real street address |
| `stops[].total` | `0` | order total |

`GET /jobs/:id` follows the same split — `orders[].lat`/`lng` are always present so the
client's `toFallbackRoute()` still draws a map when `/route` fails, while `customerName`,
`customerPhone` and `addressLine` stay redacted until the job is claimed.

Handlers are mirrored: `delivery-service/src/controllers/jobsController.ts` (`getJobRoute`)
and `backend/src/controllers/deliveryJobController.ts`. Both call
`buildDeliveryRoutePayload` and rely on the redaction already applied when building
`routingRawStops`. Keep the two in step.

> Note: `GET /route` (the legacy helper above) applies **no** redaction and is not
> job-scoped — it returns real names, phones and addresses for every `READY` /
> `OUT_FOR_DELIVERY` order in the driver's branches. Tighten it before treating the
> per-job redaction as a privacy boundary.

### GET `/me/stats`

Read-only. Query `period` = `today` \| `7d` (default) \| `30d` \| `all`.

Aggregation lives in `packages/delivery-domain/src/riderStats.ts` and is called by both the
core controller and the delivery service, so the response is identical either side of the
`DELIVERY_SERVICE_ENABLED` proxy. Metric definitions mirror the admin rider KPI endpoints;
`earningsLkr` uses the same basis as `deliveredTotal` on `/jobs/history` — delivery fees on
`DELIVERED` orders — though whole-period totals can differ, since `/jobs/history` returns
only the most recent 50 runs.

```jsonc
{
  "period": { "key": "7d", "from": "…", "to": "…" },
  "totals": {
    "completedRuns": 18, "deliveredStops": 42, "totalDistanceKm": 96.4,
    "earningsLkr": 8400, "onlineMinutes": 1870, "attendanceDays": 6,
    "averagePickupMinutes": 7, "averageDeliveryMinutes": 34
  },
  "rating": { "average": 4.8, "count": 12, "recent": [ /* 5 most recent */ ] },
  "merit":  { "points": 88, "status": "GOOD", "recent": [ /* 5 most recent */ ] }
}
```

---

## Admin — `/api/admin`

**All routes:** `authenticate` + `requireAdmin`.

### Dashboard & payments

| Method | URL | Extra gates |
|--------|-----|-------------|
| GET | `/dashboard` | DASHBOARD read |
| GET | `/payment-history` | blockCashier + PAYMENT_HISTORY read |
| GET | `/payment-history/pending-all` | same |
| GET | `/payment-history/settlement-preview` | same |
| POST | `/payment-history/settlement` | create + multipart receipt |
| POST | `/payment-history/settlement/bulk` | create + multipart receipt |
| GET | `/payment-history/settlements/:id` | read |

### Reports

| Method | URL | Extra gates |
|--------|-----|-------------|
| GET | `/reports/sales` | blockCashier + REPORTS read |
| GET | `/reports/top-products` | same |
| GET | `/reports/branch-analytics` | blockCashier + **SALES** read |
| GET | `/reports/brand-analytics` | SYSTEM_ADMIN |
| GET | `/reports/branch-tier-analytics` | SYSTEM_ADMIN |
| GET | `/reports/brand-branch-performance` | SYSTEM_ADMIN |
| GET | `/reports/hourly-peak-heatmap` | SYSTEM_ADMIN |
| GET | `/reports/monthly-delivery-orders` | SYSTEM_ADMIN |
| GET | `/reports/top-customers` | SYSTEM_ADMIN |
| GET | `/reports/customer-loyalty` | SYSTEM_ADMIN |
| GET | `/reports/order-fulfillment` | SYSTEM_ADMIN |
| GET | `/reports/order-cancellations` | SYSTEM_ADMIN |
| GET | `/reports/settlements` | SYSTEM_ADMIN |
| GET | `/reports/wallet-ledger` | SYSTEM_ADMIN |

### Delivery access & stock

| Method | URL | Extra |
|--------|-----|-------|
| GET | `/stores/delivery-access` | SYSTEM_ADMIN |
| GET | `/stores/delivery-access-log` | SYSTEM_ADMIN |
| PATCH | `/stores/:id/delivery-access` | SYSTEM_ADMIN |
| GET | `/stock` | blockCashier + STOCK read |
| GET | `/stock/audit-logs` | STOCK read — filter by store, product, changeType, date range |
| GET | `/stock/movement-ledger` | **SYSTEM_ADMIN only** — product-wise daily valuation ledger |
| PATCH | `/stock/:productId` | STOCK update |
| POST | `/stock/sync` | STOCK update |
| POST | `/stock/:productId/topup` | STOCK update |
| POST | `/stock/weekly-reset` | SYSTEM_ADMIN |

**`GET /stock/movement-ledger`** — product-wise stock movement ledger (super admin only).

Query params: `storeId` (required for super admin), `productId` (required), `from` (required, `YYYY-MM-DD`), `to` (required, `YYYY-MM-DD`).

Response `data`:

| Field | Description |
|-------|-------------|
| `store` | `{ id, name }` |
| `product` | `{ id, name, cost, basePrice }` |
| `from` / `to` | Selected date range |
| `opening` | `{ date, stock, value, lkrMargin }` — balance on the day **before** `from` (`value = stock × cost`; `lkrMargin` = cumulative LKR In − LKR Out before the range) |
| `rows[]` | One row per calendar day in range |
| `broughtForward` | `{ date, stock, value, lkrMargin }` — closing balance at end of `to` |

Each `rows[]` entry:

| Field | Formula / notes |
|-------|-----------------|
| `openStock` | Previous day's closing qty (null on first day — shown in `opening` row) |
| `stockValue` | `openStock × cost` |
| `stockIn` | Sum of positive `qtyChange` that day (null if 0) |
| `stockOut` | Sum of absolute negative `qtyChange` that day (null if 0) |
| `lkrIn` | `stockOut × basePrice` (revenue at selling price) |
| `lkrOut` | `stockIn × cost` |
| `stockMargin` | Closing qty = open + in − out |
| `lkrMargin` | Running total: previous day's `lkrMargin` + today's `lkrIn` − today's `lkrOut` (null if 0) |

### Admin notifications

| Method | URL |
|--------|-----|
| GET | `/notifications` |
| PATCH | `/notifications/:id/read` |
| POST | `/notifications/read-all` |
| POST | `/notifications/read-order` |

### Delivery ops & drivers

| Method | URL | Permission |
|--------|-----|------------|
| GET | `/delivery/pending-orders` | DELIVERY read |
| POST | `/delivery/classify` | DELIVERY update |
| POST | `/delivery/preview-route` | DELIVERY read |
| GET | `/delivery-jobs` | DELIVERY read |
| GET | `/delivery-jobs/:id` | DELIVERY read |
| GET | `/delivery-jobs/:id/route` | DELIVERY read |
| GET | `/delivery-jobs/:id/actual-route` | DELIVERY read — GPS actual polyline + est/actual km/min |
| POST | `/delivery-jobs` | DELIVERY create |
| GET | `/drivers` | blockCashier + **DELIVERY** read |
| POST | `/drivers` | blockCashier + **DELIVERY** create |

### Wallet

| Method | URL | Notes |
|--------|-----|-------|
| GET | `/wallet` | list |
| GET | `/wallet/summary` | summary |
| GET/POST | `/wallet/withdrawals` | list / request |
| POST | `/wallet/withdrawals/:id/approve` | multipart proof |
| POST | `/wallet/withdrawals/:id/reject` | SYSTEM_ADMIN |
| DELETE | `/wallet/withdrawals/:id` | cancel |
| GET | `/wallet/report` | report |
| GET | `/wallet/payout-period-info` | Rolling period options + SPPC preview per option |
| GET | `/wallet/pending-withdrawal` | SYSTEM_ADMIN |
| GET | `/wallet/settlement-withdrawals` | SYSTEM_ADMIN |
| GET | `/wallet/net-preview` | Period breakdown + SPPC fields + `finalPayoutAmount` |
| GET | `/wallet/payout-details` | |
| GET | `/wallet/payout-detail/:transactionId` | |
| POST | `/wallet/sync` | |
| POST | `/wallet/:storeId/initiate-payout` | multipart proof |
| GET | `/wallet/:storeId/settle-info` | |
| GET | `/wallet/:storeId/settle-preview` | |
| POST | `/wallet/:storeId/settle` | |
| GET | `/wallet/:storeId/transactions` | |
| POST | `/wallet/:storeId/adjust` | |
| GET | `/wallet/:storeId` | detail |

**`GET /wallet/payout-period-info`** — each option in `data.options[]` includes `sharedPromoTotalDiscount`, `sharedPromoBranchContributionPct/Amount`, `sharedPromoPlatformContributionPct/Amount`, `finalPayoutAmount`, and LKR display fields.

**`GET /wallet/net-preview`** — response includes the same SPPC fields plus `finalPayoutAmountLkr`.

### Jason ledger

| Method | URL | Notes |
|--------|-----|-------|
| GET | `/jason` | List entries; `?type=EXPENSE`, `?linkedToWithdrawal=true` |
| POST | `/jason` | Create manual INVESTMENT/EXPENSE |
| PATCH | `/jason/:id` | Soft-disable via `{ isActive: false }` |

Response entries include optional `storeId`, `storeWithdrawalId`, `balanceBefore`, `balanceAfter` (LKR) for auto-generated SPPC expenses.

### Users, roles, branch staff

| Method | URL | Permission |
|--------|-----|------------|
| GET | `/me/permissions` | Admin auth only |
| GET | `/users` | USERS read |
| GET | `/users/:id` | USERS read |
| GET/PUT | `/users/:id/permissions` | read/update |
| GET/PUT | `/users/:id/stores` | read/update |
| GET/POST | `/roles` | SETTINGS |
| PUT/DELETE | `/roles/:id` | SETTINGS |
| GET/POST | `/branch-managers` | BRANCH_MANAGERS |
| PATCH | `/branch-managers/:id` | BRANCH_MANAGERS update |
| GET/POST | `/cashiers` | CASHIERS (or branch admin) |
| PATCH | `/cashiers/:id` | CASHIERS update |

---

## Socket.io realtime API

**Connect:** `NEXT_PUBLIC_SOCKET_URL` (default `http://localhost:4000`)

| Client event | Payload | Joins room |
|--------------|---------|------------|
| `trackOrder` | order id/number string | `order:{id}` |
| `joinUser` | userId string | `user:{userId}` |
| `joinAdmin` | `{ adminId, storeId? }` | `admin:{id}`, optional `store:{storeId}` |

Server emits order/notification events to these rooms (see notification libs).

**CORS note:** Socket CORS includes hardcoded LAN IPs (`192.168.1.62`) in addition to env URLs.

---

## Rate limiting

| Limiter | Scope |
|---------|--------|
| General | All requests (200/min prod; very high in dev) |
| Auth | Register/login/social/delivery login |
| OTP | OTP request |

---

## Related

- [08_Authentication_Authorization.md](08_Authentication_Authorization.md)
- [07_Business_Logic.md](07_Business_Logic.md)
