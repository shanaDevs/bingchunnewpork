# 15 — Security Documentation

## 1. Authentication

| Control | Status |
|---------|--------|
| JWT access + refresh with separate secrets | Implemented (admin access ~15m; customer access ~1d renewed via refresh; customer refresh default `3650d`) |
| bcrypt password hashing (cost 12) | Implemented |
| Auth / OTP rate limiting | Implemented |
| Soft-delete customers | Implemented |
| Admin MFA | Removed |
| Password reset flow | Not Implemented |
| HttpOnly cookie session primary | Not Implemented |
| Token storage | localStorage / secure storage on mobile (XSS risk on web) |

Default JWT secrets exist in code/config for development — **must be overridden in production**.

---

## 2. Authorization

- Role checks + fine-grained `permissions` matrix
- `SYSTEM_ADMIN` bypass
- `blockCashier` on selected finance-sensitive routes (e.g. refunds, some reports). **Wallet / payout APIs** rely on RBAC: default seeded `CASHIER` role only has `DASHBOARD`, `ORDERS`, `POS` — no `WALLET` menu unless explicitly granted.
- Branch order writes limited to manager/cashier
- Driver routes require `DELIVERY_DRIVER`

### 2.1 Customer order access (IDOR)

- **Single helper:** [`resolveOrderAccess`](../../backend/src/lib/orderAccess.ts) — owner JWT, non-driver admin, or unguessable `trackToken` (order number alone is not sufficient).
- Apply to every customer route keyed by order id / order number / track token: `GET /orders/:id`, cancel, ratings, `confirm-payment`, `confirm-payhere-popup`, etc.
- **Payment checkout surfaces** (`/api/payments/payhere/:orderNumber`, …) require a matching track token (query/body) before returning PayHere fields.
- **Saved resources:** e.g. `addressId` on `POST /orders` must belong to `req.user.sub` when supplied.
- **Promo preview:** `POST /api/promos/validate` is display-only (`authoritative: false`); discounts persisted only via `POST /orders` server-side cart pricing.

### 2.2 Socket.IO

- Set `SOCKET_AUTH_ENFORCED=true` in production (default when unset in prod). **`SOCKET_AUTH_ENFORCED=false` prevents production boot** ([`assertProductionSecrets`](../../backend/src/lib/productionSecrets.ts)).
- `trackOrder`, `joinUser`, and `joinAdmin` reject mismatched or missing JWT when enforcement is on. See [32_Socket_Realtime.md](32_Socket_Realtime.md).

### 2.3 Developer checklist (new routes)

1. Order-scoped customer APIs → `resolveOrderAccess` + `readTrackToken(req)`.
2. Foreign keys from the client (`addressId`, …) → verify ownership or branch scope.
3. Admin finance → `requirePermission` / `requireSystemAdmin`; do not rely on UI hiding alone.

See [08_Authentication_Authorization.md](08_Authentication_Authorization.md).

---

## 3. Encryption / transport

| Area | Notes |
|------|-------|
| TLS | Expected at CapRover / reverse proxy (not configured in repo) |
| Passwords | bcrypt hashes at rest |
| PayHere | MD5 signature verification on notify (PayHere protocol) |
| Secrets at rest in DB | PayHere merchant secret stored in `system_settings` — protect DB access |

---

## 3.5 Webhooks and internal services

Prove the caller (signature / shared secret / optional IP allowlist); never trust a success flag alone; constrain outbound URLs.

| Control | Status | What Bing Chun uses today | Ops / config |
|---------|--------|---------------------------|--------------|
| PayHere notify | In place | Public `POST /api/orders/payment-notify`: MD5 `md5sig` verified, then `payhere_amount` + LKR must match `order.total` before `PAID`. Optional `PAYHERE_NOTIFY_IP_ALLOWLIST` (comma-separated IPs/CIDRs); unset = no IP gate. | Prefer edge allowlist at CapRover/nginx if known PayHere egress IPs; app env is a second layer. |
| WhatsApp webhook | In place | `X-Hub-Signature-256` + `WHATSAPP_APP_SECRET` (required in production when WhatsApp is enabled) | Keep; do not disable signature checks. |
| Core ↔ delivery internal | In place | `INTERNAL_SERVICE_SECRET` via `X-Internal-Secret` on `/api/internal/*`; production refuses missing/short/default secret | Rotate: generate ≥32-char secret, set **same** value on `bing-chun-core` and `bing-chun-delivery` (and orders/payments/notify if live), restart apps. Expect brief 403s if restarts are staggered (single secret). |
| SSRF (Maps / OSRM) | In place | Maps hosts hardcoded in adapter. `OSRM_URL` validated with hostname allowlist (`router.project-osrm.org` + `OSRM_ALLOWED_HOSTS`) before fetch; clients never supply routing base URLs. | Self-hosted OSRM: add hostname to `OSRM_ALLOWED_HOSTS`; use `http` only for those listed hosts. |

### PayHere notify IP allowlist (optional)

- **App:** set `PAYHERE_NOTIFY_IP_ALLOWLIST=a.b.c.d,10.0.0.0/8` on the core backend. Empty/unset preserves signature-only trust (current production-safe default).
- **Edge (CapRover / nginx):** restrict `location` for `/api/orders/payment-notify` to known PayHere notify source IPs when available; keep app signature + amount checks regardless.

### `INTERNAL_SERVICE_SECRET` rotation

1. Generate a new secret (≥32 random chars), never reuse `bingchun-internal-dev-secret`.
2. Set the identical value on CapRover apps that call `/api/internal`: core, delivery, and any live sibling services that share the secret.
3. Restart those apps so env reloads.
4. Confirm Delivery→Core paths still succeed (outbox order-status, OTP send-code, socket emit). Wrong secret → 403.

See also [29_Delivery_Cutover_Checklist.md](29_Delivery_Cutover_Checklist.md) and [30_Microservices_Deployment.md](30_Microservices_Deployment.md) § Secrets checklist.

---

## 4. Input validation

- Zod schemas on many controller inputs; shared query helpers in `backend/src/lib/httpSchemas.ts` (wallet report/transactions/withdrawals, PayHere notify body, invoice UUID params, loyalty `storeId`)
- Phone regex for Sri Lankan numbers on auth flows
- Multer upload limits for images/receipts (size cap, MIME allowlist, PDF magic-byte check, sanitized upload paths)
- Helmet with CSP tuned for PayHere checkout page (allows needed form posts / inline scripts)

Unhandled paths without Zod still rely on Prisma/DB constraints — prefer adding schemas for new endpoints.

**PayHere notify:** `POST /api/orders/payment-notify` validates the body with Zod. Optional IP allowlist via `PAYHERE_NOTIFY_IP_ALLOWLIST` (comma-separated IPv4 or CIDR); unset = allow all (sandbox/dev).

---

## 5. Rate limiting

Implemented in `backend/src/middleware/rateLimiter.ts`. When `REDIS_URL` is set, counters are shared across API replicas; otherwise in-memory per process. `NODE_ENV !== 'production'` uses much higher `max` values for local development.

| Limiter | Routes / scope | Window | Max (production) | Notes |
|---------|----------------|--------|------------------|-------|
| General | All `/api/*` except `/health` and messaging webhooks | 1 min | 200 | Applied in `backend/src/index.ts` |
| Auth | Register, login, OTP verify, social login, password reset, admin login | 15 min | 40 | `skipSuccessfulRequests: true` (failed attempts only) |
| Delivery auth | Driver PIN login | 15 min | 30 | `skipSuccessfulRequests: true` |
| OTP | OTP request, customer phone link request | 15 min | 5 | |
| Order placement | `POST /api/orders` | 15 min | 30 | Guest checkout abuse |
| Order track | Order GET, payment confirm, ratings, cancel | 15 min | 60 | |
| Reservation checkout | Inventory reservation checkout | 10 min | 20 | |
| Spin | Spin wheel play | 1 hour | 40 | |
| Admin reports | `GET /api/admin/reports/*` | 1 min | 20 | Authenticated report abuse |

---

## 5.1 Money integrity (payments and branch payouts)

| Control | Implementation |
|---------|----------------|
| Checkout pricing | Server-side `batchResolveLinePricing`; clients cannot send line `unitPrice` on `POST /orders`. |
| PayHere | Notify verifies signature; amount/currency must match order before `PAID`. |
| WebXPay | Checkout locks `onlineChargeAmount`; return rejected if it no longer matches `order.total`. |
| Wallet credit | `markOnlineOrderPaid` flips payment once; `creditWalletForOrder` + unique `(orderId, type)` on wallet transactions. |
| Gateway replay | Idempotent PAID handling; duplicate `paymentRef` across orders rejected (partial unique index). |
| Branch payout (current) | Super Admin initiates from **Payouts Due** (15-day elapsed window): `initiateAndApproveWithdrawal` — PIN, proof upload, period validation at initiate time, serialized wallet debit. Same admin as requester/approver in DB is intentional (single-step). |
| Branch payout (legacy) | `ENABLE_BRANCH_PAYOUT_REQUESTS` + `approveWithdrawal`: dual control (cannot approve own request), live period net re-check at approve, `updateMany` pending claim. |
| Delivery payout | Unchanged: requester ≠ approver; live net at approve. |

Initiate and approve payout routes require `SYSTEM_ADMIN` (not only `WALLET` permission).

---

## 6. CORS

HTTP and Socket.IO CORS on the core API use `isCorsAllowedOrigin` in `backend/src/lib/resolveFrontendUrl.ts`, backed by `buildConfiguredCorsOrigins` (`backend/src/lib/corsOrigins.ts`).

**Production allowlist (normalized origins):**

- `LIVE_SHOP_URL` / customer shop URL
- `FRONTEND_URL`
- `ADMIN_URL` (origin only — path `/admin` is stripped)
- `ADMIN_WEB_URL` / `POS_WEB_URL` (dedicated staff web hosts — required for cookie CSRF origin checks when using split `WEB_SURFACE` deploys)
- Optional `CORS_EXTRA_ORIGINS` (comma-separated) for staging/preview hosts

**Development only:** `localhost` / `127.0.0.1` and `192.168.*` LAN origins when not in a production deployment.

Microservices (`services/payment`, `services/orders`, `services/notification`) mirror the same env-driven allowlist.

`credentials: true` is enabled — set real HTTPS origins in CapRover (`LIVE_SHOP_URL`, `FRONTEND_URL`, `ADMIN_URL`) before go-live.

## 6b. Frontend CSP (Next.js)

- **Shop routes:** `frontend/next.config.ts` — CSP allows `unsafe-inline` / `unsafe-eval` on scripts where the storefront requires it.
- **Admin routes (`/admin/*`):** stricter CSP — no `unsafe-eval` in production; `connect-src` includes the configured API and delivery-service origins.

---

## 7. OWASP-oriented risks (mapped)

| Risk | Project note |
|------|--------------|
| A01 Broken access control | Mitigated by RBAC; verify every new admin route has permission gates; guest order access rules need careful review |
| A02 Cryptographic failures | JWT defaults; ensure TLS; avoid secrets in frontend |
| A03 Injection | Prisma parameterized queries; avoid raw SQL except controlled schema/FCM helpers |
| A04 Insecure design | SMS/email mock may leak OTP codes in logs/dev responses |
| A05 Security misconfiguration | Mis-set `FRONTEND_URL` / `LIVE_SHOP_URL`; CI path casing; admin CSP vs shop CSP |
| A07 Identification failures | No password reset; phone login without OTP on web interim flow |
| A08 Data integrity | PayHere notify: MD5 verify + `payhere_amount`/LKR must match `order.total`; WebXPay: encrypted charge locked at checkout (`onlineChargeAmount`); wallet credits guarded by `(orderId, type)` unique index; gateway `paymentRef` unique when set; branch payouts: Super Admin **direct initiate** (`POST /admin/wallet/:storeId/initiate-payout`) uses admin PIN + settlement proof + live period net validation + wallet `FOR UPDATE` (not branch-request → super-approve dual control); legacy PENDING branch requests (when `ENABLE_BRANCH_PAYOUT_REQUESTS=true`) use separate approve with requester ≠ approver + live net re-check |
| A09 Logging failures | No centralized audit/APM |
| A10 SSRF | OSRM: hostname allowlist on `OSRM_URL` (`assertOsrmBaseUrlAllowed`); Maps adapter hosts hardcoded; clients cannot supply routing base URLs |

**Customer mobile saved cards:** stores last4 locally; add-card form collects PAN/CVV in UI but does **not** tokenize to a payment vault — do not treat as PCI card storage; remove before any compliance claim.

---

## 8. Security improvements (recommendations)

1. Rotate and remove hardcoded JWT defaults; fail boot if unset in production
2. Wire real SMS/email providers; never return OTP codes in API responses in production
3. Replace phone-login-without-OTP with OTP-required flow for production
4. Keep `CORS_EXTRA_ORIGINS` minimal; verify production env origins after each deploy
5. Centralize admin API client; add Next.js middleware for `/admin` auth redirect
6. Add CI security scans + automated tests for authz regressions
7. Fix customer mobile API default to production URL; remove fake Visa seed data
8. Remove/hide driver demo PIN prefills from release builds
9. Optional: set `PAYHERE_NOTIFY_IP_ALLOWLIST` or CapRover/nginx IP allowlist for PayHere notify; monitor duplicate notifies

---

## Related

- [08_Authentication_Authorization.md](08_Authentication_Authorization.md)
- [18_Known_Issues.md](18_Known_Issues.md)
