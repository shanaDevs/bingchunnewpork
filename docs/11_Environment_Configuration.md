# 11 — Environment Configuration

Do **not** commit real `.env` secrets. Use templates and CapRover/GitLab variables in production.

---

## 1. Backend (`backend/.env`)

### From `backend/env.example` (documented)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | MySQL connection string for Prisma |
| `PORT` | No (default 4000) | HTTP port |
| `NODE_ENV` | No | `development` / `production` |
| `JWT_SECRET` | **Yes in prod** | Access token secret (dev default exists in code — change it) |
| `JWT_REFRESH_SECRET` | **Yes in prod** | Refresh token secret |
| `JWT_EXPIRES_IN` | No (default `15m`) | Admin access token TTL |
| `JWT_USER_EXPIRES_IN` | No (default `1d`) | Customer access token TTL (renewed via refresh keep-alive) |
| `JWT_REFRESH_EXPIRES_IN` | No (default `3650d`) | Admin/cashier refresh TTL (~10y; stays signed in) |
| `JWT_USER_REFRESH_EXPIRES_IN` | No (default `3650d`) | Customer refresh TTL (~10y; sessions stay signed in) |
| `FRONTEND_URL` | Recommended | CORS + links |
| `LIVE_SHOP_URL` | Production | Customer shop origin for CORS and payment redirects |
| `CORS_EXTRA_ORIGINS` | Optional | Comma-separated extra HTTPS origins (staging previews) |
| `ADMIN_WEB_URL` | Recommended (split deploy) | Dedicated admin web origin (`WEB_SURFACE=admin` host); included in CORS/CSRF allowlist |
| `POS_WEB_URL` | Recommended (split deploy) | Dedicated cashier web origin (`WEB_SURFACE=pos` host); included in CORS/CSRF allowlist |
| `PAYHERE_NOTIFY_IP_ALLOWLIST` | Optional | Comma-separated IPv4/CIDR for PayHere notify when set |
| `ADMIN_URL` | Recommended | Staff admin base URL (origin + `/admin` path). Use the **admin-web** host when staff use `bing-chun-admin-web`, not the customer shop host |
| `API_BASE_URL` | Recommended | Public API origin for callbacks/QR |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional | Single-line Firebase service account JSON for FCM |
| `DO_SPACES_KEY` | Optional | Spaces access key |
| `DO_SPACES_SECRET` | Optional | Spaces secret |
| `DO_SPACES_BUCKET` | Optional | Bucket name |
| `DO_SPACES_REGION` | Optional | Default `sgp1` |
| `DO_SPACES_ENDPOINT` | Optional | Endpoint (path-style if bucket has dots) |
| `DO_SPACES_PREFIX` | Optional | Key prefix (default `bingchun`) |

### Used in `src/config` / code but not all listed in `env.example`

| Variable | Required | Description |
|----------|----------|-------------|
| `FAPI_BASE_URL` | No | Alias fallback for `API_BASE_URL` |
| `PAYHERE_MERCHANT_ID` | Optional | Fallback if DB settings empty |
| `PAYHERE_MERCHANT_SECRET` | Optional / **Secret** | Fallback merchant secret |
| `PAYHERE_MODE` | Optional | `sandbox` / live |
| `PAYHERE_NOTIFY_IP_ALLOWLIST` | Optional | Comma-separated IPs/CIDRs for `POST /api/orders/payment-notify`; empty = signature-only (no IP gate) |
| `GOOGLE_MAPS_API_KEY` | Optional / **Secret** | Default key for browser + server when split keys are not set. **Must be set on every API/worker component in production** (App Platform `RUN_TIME`). Live admin without this returns `"googleMapsApiKey":""` and OSM tiles — run `node deploy/digitalocean/set-google-maps-env.mjs` after filling `deploy/digitalocean/secrets.env`. |
| `GOOGLE_MAPS_BROWSER_API_KEY` | Optional / **Secret** | Browser-only key exposed via `GET /settings/app` when `app_settings.googleMapsApiKey` is empty. Falls back to `GOOGLE_MAPS_API_KEY`. |
| `GOOGLE_MAPS_SERVER_API_KEY` | Optional / **Secret** | Server geocoding, Directions, Map Tiles `createSession`. Use an **IP-restricted** or unrestricted key when the browser key is HTTP-referrer-only. Falls back to `GOOGLE_MAPS_API_KEY`, then DB settings key. |

**Google Cloud (browser key HTTP referrers):** enable **Maps JavaScript API** + **Map Tiles API**. Allow at least: `http://localhost:3000/*`, `http://localhost:3100/*`, `https://bingchunsrilanka.com/*`, `https://admin.bingchunsrilanka.com/*`, `https://bingchun-admin-a4ndy.ondigitalocean.app/*`, `https://bingchun-delivery-6mgs2.ondigitalocean.app/*`. Admin → Settings can store a browser key in DB (overrides env for the browser). If Google paths fail, maps fall back to OpenStreetMap. |
| `GOOGLE_CLIENT_ID` | Optional | Google login audience |
| `GOOGLE_CLIENT_SECRET` | Optional | Present in config; **unused** in ID-token flow |
| `FACEBOOK_APP_ID` | Optional | Facebook login |
| `FACEBOOK_APP_SECRET` | Optional / **Secret** | Token debug |
| `SMS_PROVIDER` | Optional | Default `mock`; `dialog` throws (Not Implemented) |
| `SMS_API_KEY` | Optional / **Secret** | SMS |
| `SMS_SENDER_ID` | Optional | Default `BingChun` |
| `EMAIL_PROVIDER` | Optional | Default `mock`; `sendgrid` throws (Not Implemented) |
| `EMAIL_FROM` | Optional | From address |
| `SENDGRID_API_KEY` | Optional / **Secret** | Unused until SendGrid wired |
| `FCM_SERVER_KEY` | Optional | **Unused** — FCM uses service account JSON |
| `LOYALTY_POINTS_PER_LKR` | Optional | Env default (DB settings used in order flow) |
| `LOYALTY_REDEEM_VALUE` | Optional | |
| `LOYALTY_MAX_REDEEM_PCT` | Optional | |
| `OSRM_URL` | Optional | Road routing base URL (hostname must be allowlisted) |
| `OSRM_ALLOWED_HOSTS` | Optional | Extra OSRM hostnames (comma-separated); required for self-hosted / `http` bases |
| `OSRM_TIMEOUT_MS` | Optional | |
| `OSRM_OVERVIEW` | Optional | |
| `DEBUG_PRISMA` | Optional | Query logging |
| `REDIS_URL` | Optional (required for multi-replica) | Shared **rate-limit** counters and Socket.io **Redis adapter**. Unset = in-memory limits per process and HTTP relay for socket fan-out. Set when running more than one API container or when notification/orders services need shared pub/sub. See [30_Microservices_Deployment.md](30_Microservices_Deployment.md) and [32_Socket_Realtime.md](32_Socket_Realtime.md). |
| `TRUST_PROXY` | Recommended in prod | Express `trust proxy` for correct client IP behind CapRover/nginx (rate limits). |
| `ANALYTICS_CACHE_TTL_MS` | Optional | In-process admin analytics response cache TTL (default 60000). |

`GET /health` includes non-secret `rateLimitStore` (`redis` | `memory`) and `socketAdapter` (`redis` | `http-relay`) after startup for deploy verification.

---

## 2. Frontend (`frontend/.env`)

From `frontend/env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public site origin (`https://bingchunsrilanka.com` in production) |
| `NEXT_PUBLIC_API_URL` | **Yes** | Client API base — local full URL (`http://localhost:4000/api`); production often `/api` (same-origin proxy) |
| `NEXT_PUBLIC_SOCKET_URL` | Recommended | Socket.io origin |
| `BACKEND_URL` | Recommended | Backend origin for Next.js rewrites (`/api` → backend) |
| `API_PROXY_URL` | Recommended | Proxy target (typically same as `BACKEND_URL`) |
| `NEXT_PUBLIC_GA_ID` | Optional | Google Analytics 4 Measurement ID (`G-…`) — see [34_SEO_Guide.md](34_SEO_Guide.md) |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Optional | Google Search Console HTML-tag verification content value |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Google button |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | Optional | Facebook login |

**Note:** Any `PAYHERE_*` keys in a local frontend `.env` are **not referenced by frontend source** — PayHere is backend-driven. Do not put merchant secrets in Next public env.

Build-time (Docker/CI): `NEXT_PUBLIC_API_URL` is baked into the client bundle.

---

## 3. Docker Compose

| Variable | Default | Purpose |
|----------|---------|---------|
| `MYSQL_ROOT_PASSWORD` | `rootsecret` | MySQL root |
| `MYSQL_DATABASE` | `bingchun` | DB name |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `bingchun` / `bingchunsecret` | App user |
| `MYSQL_PORT` | 3306 | Host port |
| `BACKEND_PORT` / `FRONTEND_PORT` | 4000 / 3000 | Host ports |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | weak defaults | **Change in prod** |
| `FRONTEND_URL` / `ADMIN_URL` / `API_BASE_URL` | localhost | URLs |
| `NEXT_PUBLIC_API_URL` | localhost API | Frontend build arg |

---

## 4. GitHub Actions / CapRover secrets

| Variable | Where | Purpose |
|----------|-------|---------|
| `CAPROVER_BACKEND_TOKEN` | GitHub Actions secret | Deploy `bing-chun-backend` |
| `CAPROVER_FRONTEND_TOKEN` | GitHub Actions secret | Deploy `bing-chung` |
| `GITHUB_TOKEN` | GitHub built-in | Push images to GHCR |
| CapRover app env | CapRover dashboard | Runtime `DATABASE_URL`, JWT, PayHere, Spaces, Firebase, URLs |

CI builds frontend with:

- `NEXT_PUBLIC_API_URL=/api` (same-origin browser calls)
- `BACKEND_URL` / `API_PROXY_URL` = `https://bing-chung-b.mp.dartcodes.com`

---

## 5. Flutter dart-defines

| Define | App | Purpose |
|--------|-----|---------|
| `API_BASE_URL` | Both | Override API base |
| `STORE_ID` | Driver | Optional PIN login store scope |

**Customer mobile default:** hardcoded LAN IP `http://192.168.1.62:4000/api` if define missing — **must** set production URL for release builds.  
**Driver mobile default:** production CapRover backend URL if define missing.

---

## 6. Secrets checklist

Treat as secrets: `DATABASE_URL` passwords, JWT secrets, PayHere merchant secret, DO Spaces keys, Firebase JSON, Facebook app secret, SMS/email API keys, CapRover tokens.

Never commit `.env` files with real values.

---

## 7. Deployment requirements

1. Strong unique `JWT_SECRET` / `JWT_REFRESH_SECRET`
2. Reachable MySQL with schema applied (`db push` / ensure on boot)
3. `FRONTEND_URL` / `ADMIN_URL` / `API_BASE_URL` matching real domains (CORS)
4. PayHere credentials in DB settings or env for live payments
5. Spaces credentials for product image uploads in production
6. Firebase JSON for mobile push
7. Frontend image rebuilt when `NEXT_PUBLIC_*` URLs change

---

## Related

- [12_Installation_Guide.md](12_Installation_Guide.md)
- [13_Deployment_Guide.md](13_Deployment_Guide.md)
