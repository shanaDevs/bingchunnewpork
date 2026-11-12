# Microservices Deployment Guide — New CapRover Server

Complete, start-to-finish guide for standing up a **new** Hostinger VPS (96 GB RAM / 48 GB disk),
installing CapRover on it, creating every app (with exact UI steps), configuring every environment
variable, wiring nginx routing, setting up CI/CD, and cutting traffic over from the old server.

Domain used throughout this guide — your CapRover instance is already live at
`https://captain.bc.dartcodes.com`, root domain `bc.dartcodes.com`. You're using CapRover's default
per-app domains (`<appname>.bc.dartcodes.com`) rather than custom subdomains like `api.` or `shop.`,
so every app is reachable at its own name automatically once created:

| Purpose | URL |
|---|---|
| CapRover panel | `https://captain.bc.dartcodes.com` |
| Public API (web + mobile) | `https://bing-chun-core.bc.dartcodes.com` |
| Web shop / admin | `https://bing-chun.bc.dartcodes.com` |

If you'd rather use clean custom domains instead (`api.bc.dartcodes.com` / `shop.bc.dartcodes.com`),
add them via **HTTP Settings → Connect New Domain** on `bing-chun-core` / `bing-chun` and update the
matching env vars/CI workflow — everything below otherwise works identically either way.

### Final app list

| CapRover app name | Purpose | Container port | Public domain |
|---|---|---|---|
| `bing-chun-production-db` | PostgreSQL 16 (one-click) | 5432 | none (internal) |
| `bing-chun-redis` | Redis (one-click) | 6379 | none (internal) |
| `bc-pgbouncer` | Connection pooler in front of Postgres | 5432 | none (internal) |
| `bing-chun-core` | auth, menu, stores, cart, admin, sockets — public API entry | 4000 | `bing-chun-core.bc.dartcodes.com` |
| `bing-chun-orders` | orders, inventory, refunds, invoices | 4200 | none (internal, proxied by bing-chun-core) |
| `bing-chun-payments` | payments, wallets, settlements, ledger | 4300 | none (internal, proxied by bing-chun-core) |
| `bing-chun-delivery` | driver jobs, routing, driver wallet | 4100 | none (internal, proxied by bing-chun-core) |
| `bing-chun-notify` | WhatsApp/Telegram/SMS/FCM | 4400 | none (internal, proxied by bing-chun-core) |
| `bing-chun` | Next.js customer + admin web app | 3000 | `bing-chun.bc.dartcodes.com` |
| `bing-chun-delivery-frontend` | Delivery ops admin (split from main frontend) | 3100 | `bing-chun-delivery-frontend.bc.dartcodes.com` |

Source code for each app already exists in this repo:

- `bing-chun-core` → [backend/](../backend) (deploy files: [backend/deploy](../backend/deploy))
- `bing-chun-orders` → [services/orders](../services/orders) (scaffolded — see "What's already migrated" below)
- `bing-chun-payments` → [services/payment](../services/payment) (scaffolded)
- `bing-chun-notify` → [services/notification](../services/notification) (scaffolded)
- `bing-chun-delivery` → [delivery-service/](../delivery-service) (fully built)
- `bing-chun` → [Frontend/](../Frontend)
- `bing-chun-delivery-frontend` → [delivery-frontend/](../delivery-frontend) (deploy: [delivery-frontend/deploy](../delivery-frontend/deploy))

---

## Table of contents

1. [Phase 0 — Provision the VPS and install CapRover](#phase-0)
2. [Phase 1 — Postgres, Redis, PgBouncer + data migration](#phase-1)
3. [Phase 2 — Create and deploy bing-chun-core](#phase-2)
4. [Phase 3 — Create and deploy bing-chun](#phase-3)
5. [Phase 4 — Create and deploy bing-chun-delivery](#phase-4)
6. [Phase 5 — Create and deploy bing-chun-orders / bing-chun-payments / bing-chun-notify](#phase-5)
7. [Phase 6 — nginx path routing on bing-chun-core](#phase-6)
8. [Phase 7 — CI/CD (GitHub Actions)](#phase-7)
9. [Phase 8 — Cutover from the old server](#phase-8)
10. [Secrets checklist](#secrets)
11. [Appendix — Full copy-paste env files per app](#envs)
12. [Troubleshooting](#troubleshooting)
13. [Resource budget](#budget)

---

<a name="phase-0"></a>
## Phase 0 — Provision the VPS and install CapRover

> **Already done for you:** CapRover is already running and reachable at
> `https://captain.bc.dartcodes.com`. Skip straight to [0.6](#phase-0) (HTTPS/registry check) and
> [0.7](#phase-0) (storage hygiene cron) — steps 0.1–0.5 (VPS creation, DNS, Docker/CapRover install)
> are only needed if you're setting up a brand-new box from scratch.

### 0.1 Create the VPS

Hostinger VPS panel → create a new VPS:
- OS: **Ubuntu 22.04 LTS** (or 24.04)
- RAM: 96 GB, Disk: 48 GB
- Note the public IP address (`VPS_IP`)

### 0.2 DNS records

At your domain registrar / Hostinger DNS zone for `bc.dartcodes.com`, add:

| Type | Host | Value |
|---|---|---|
| A | `captain` | `VPS_IP` |
| A | `*` | `VPS_IP` (wildcard — every CapRover app gets `<appname>.bc.dartcodes.com`) |

Wait for DNS propagation (`nslookup captain.bc.dartcodes.com` should return `VPS_IP`) before continuing.

### 0.3 Install Docker + CapRover

SSH into the VPS as root:

```bash
ssh root@VPS_IP
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
docker swarm init --advertise-addr VPS_IP
```

Start the CapRover installer container:

```bash
docker run -p 80:80 -p 443:443 -p 3000:3000 -p 996:996 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /captain:/captain \
  --name captain-installer \
  caprover/caprover
```

### 0.4 Firewall

Open these ports (Hostinger VPS firewall panel or `ufw`):

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw allow 996/tcp
ufw allow 7946/tcp
ufw allow 7946/udp
ufw allow 4789/udp
ufw allow 2377/tcp
ufw enable
```

### 0.5 Run the CapRover CLI setup

From your **local machine**:

```bash
npm install -g caprover
caprover serversetup
```

Answer the prompts:
- IP address of the server: `VPS_IP`
- New password for the CapRover admin panel: choose a strong password
- Are you using a Load Balancer: `No` (unless you configured one)
- Root domain: `bc.dartcodes.com`
- Enable HTTPS: `Yes`

When it finishes, log into `https://captain.bc.dartcodes.com` with the password you set.

### 0.6 Enable HTTPS force + registry (for image-based apps)

CapRover dashboard → **Settings**:
- "Force HTTPS" — enable once you've attached a domain to at least one app (comes later).
- If you plan to use the GHCR-based image workflow instead of tar-source deploys for any app, add a Docker Registry: **Cluster → Docker Registries → Add** → Registry Domain `ghcr.io`, Username: a GitHub user/org, Password: a GitHub PAT with `read:packages`. (Not required for the tar-based deploys this guide uses.)

### 0.7 Storage hygiene (48 GB disk is the tight constraint)

CapRover dashboard → **Cluster** → enable **"Automated Docker image cleanup"**.

Also add a host cron job over SSH:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * docker system prune -af --filter \"until=72h\"") | crontab -
```

---

<a name="phase-1"></a>
## Phase 1 — Postgres, Redis, PgBouncer + data migration

### 1.1 Create bing-chun-production-db (One-Click App)

CapRover dashboard → **Apps** → **One-Click Apps/Databases** tab → search `postgres` → select **PostgreSQL**.
- App Name: `bing-chun-production-db`
- Postgres Username: `postgres`
- Postgres Password: generate and **save** a strong password (`PG_PASSWORD`)
- Postgres Version: `16` (or latest available)
- Click **Deploy**

After it deploys, its internal hostname is `srv-captain--bing-chun-production-db` and it listens on port `5432` inside the CapRover network. One-click database templates normally deploy with **"Do not expose as web app"** already checked — open the app → **HTTP Settings** tab and confirm the box is checked (tick it if it isn't). It must never be reachable from the public internet.

### 1.2 Create bing-chun-redis (One-Click App)

**Apps** → **One-Click Apps/Databases** → search `redis` → select **Redis**.
- App Name: `bing-chun-redis`
- Set/confirm a password (`REDIS_PASSWORD`) — some templates auto-generate one; check the app's "App Configs" env vars after deploy for `REDIS_PASSWORD` or similar, or set your own via `--requirepass`.
- Click **Deploy**

Internal hostname: `srv-captain--bing-chun-redis:6379`. As with `bing-chun-production-db`, confirm **HTTP Settings → "Do not expose as web app"** is checked — Redis must never be reachable from the public internet.

### 1.3 Create bc-pgbouncer (custom image app)

**Apps** → **Create New App**:
- App Name: `bc-pgbouncer`
- Has Persistent Data: **No**
- Click **Create New App**

Open the new app → **Deployment** tab → Method: **"Deploy via ImageName"** → Image Name: `edoburu/pgbouncer:latest` → **Deploy Now**.

Then go to **App Configs** → **Environmental Variables** and add (this image — [edoburu/docker-pgbouncer](https://github.com/edoburu/docker-pgbouncer) — parses `DATABASE_URL` itself, there is no `DATABASES_HOST`-style variable):

```
DATABASE_URL=postgres://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01
POOL_MODE=transaction
MAX_CLIENT_CONN=200
DEFAULT_POOL_SIZE=20
```

Equivalent alternative using separate variables instead of one URL (same result):

```
DB_USER=postgres
DB_PASSWORD=post2026
DB_HOST=srv-captain--postgressql
DB_PORT=5432
DB_NAME=bingchun_db01
POOL_MODE=transaction
MAX_CLIENT_CONN=200
DEFAULT_POOL_SIZE=20
```

**HTTP Settings** tab → check **"Do not expose as web app"**, then set Container HTTP Port: `5432` → **Save & Update**.

PgBouncer speaks the raw Postgres wire protocol, not HTTP, so:
- **"Do not expose as web app" must be checked.** This removes the app from CapRover's nginx layer entirely — no domain, no HTTPS, no public port 80/443 route. It stays reachable only from inside the CapRover Docker network at `srv-captain--bc-pgbouncer:5432`, which is exactly what you want for a database-layer service.
- Do the same ("Do not expose as web app") for `bing-chun-production-db`, `bing-chun-redis`, `bing-chun-orders`, `bing-chun-payments`, and `bing-chun-notify` — none of them should ever be reachable from the public internet; only `bing-chun-core` and `bing-chun` need a public domain.

Internal hostname all other services will use: `srv-captain--bc-pgbouncer:5432`.

### 1.3.1 Verify PgBouncer can reach Postgres

From the VPS shell:

```bash
docker exec -it $(docker ps -qf name=srv-captain--bc-pgbouncer) psql -h 127.0.0.1 -p 5432 -U postgres -d bingchun -c "select 1;"
```

If this returns `1`, PgBouncer is correctly proxying to `bing-chun-production-db`. If it hangs or errors, double-check `DATABASE_URL`/`DB_*` vars match the real `bing-chun-production-db` password and that both apps are in the same CapRover Docker network (default — true unless you changed networking).

### 1.4 Create the application database

SSH into the VPS, then exec into the Postgres container to create the `bingchun` database:

```bash
docker exec -it $(docker ps -qf name=srv-captain--bing-chun-production-db) psql -U postgres -c "CREATE DATABASE bingchun;"
```

### 1.5 Migrate data from the old server

Run this from any machine that can reach both the old DB (`187.127.120.129`) and the new VPS (or run it directly on the VPS if outbound access to the old DB is allowed):

```bash
# 1. Dump the old database (custom format — fastest restore, supports parallel jobs)
pg_dump -Fc -h 187.127.120.129 -U postgres -d bingchun_db01 -f bingchun_backup.dump

# 2. Copy the dump to the new VPS
scp bingchun_backup.dump root@VPS_IP:/root/

# 3. Restore into bing-chun-production-db (run on the VPS, targeting the container directly)
docker exec -i $(docker ps -qf name=srv-captain--bing-chun-production-db) \
  pg_restore -U postgres -d bingchun --clean --if-exists --no-owner -j 4 < /root/bingchun_backup.dump
```

Verify row counts against the old DB before continuing:

```bash
docker exec -it $(docker ps -qf name=srv-captain--bing-chun-production-db) \
  psql -U postgres -d bingchun -c 'select count(*) from "Order";'
docker exec -it $(docker ps -qf name=srv-captain--bing-chun-production-db) \
  psql -U postgres -d bingchun -c 'select count(*) from "User";'
docker exec -it $(docker ps -qf name=srv-captain--bing-chun-production-db) \
  psql -U postgres -d bingchun -c 'select count(*) from "Store";'
```

Compare each count against the same query run on `187.127.120.129`. Re-run this dump/restore as a final delta right before Phase 8 cutover so no orders placed during migration are lost.

---

<a name="phase-2"></a>
## Phase 2 — Create and deploy bing-chun-core

### 2.1 Create the app

CapRover → **Apps** → **Create New App**:
- App Name: `bing-chun-core`
- Has Persistent Data: **No**
- **Create New App**

### 2.2 Attach domain + enable websockets

Open `bing-chun-core` → **HTTP Settings**. CapRover already assigns the default domain
`bing-chun-core.bc.dartcodes.com` automatically when the app is created — no need to connect it
manually (only do this step if you later want a custom domain like `api.bc.dartcodes.com` instead).
Just set:
- Enable HTTPS → **Enable HTTPS**
- Force HTTPS → **Force HTTPS** (toggle on)
- **Websocket Support** → toggle **ON** (required for Socket.IO)
- Container HTTP Port: `4000`

### 2.3 Enable the App Token (needed for CI/CD)

Same app → **Deployment** tab → **App Token** section → **Enable App Token** → copy the generated token. You'll paste this as the `CAPROVER_TOKEN` secret inside the GitHub Environment named `bing-chun-core` (see [Phase 7](#phase-7)).

### 2.4 Environment variables

`bing-chun-core` → **App Configs** → **Environmental Variables** → add each of the following.
Full filled copy-paste blocks (all microservices) are in the [Appendix](#envs) and in gitignored [`deploy/caprover-dev/`](../deploy/caprover-dev/).

```bash
# Generate extra secrets locally if needed, e.g.:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `TZ` | `Asia/Colombo` |
| `DATABASE_URL` | `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public` |
| `PRISMA_CONNECTION_LIMIT` | `5` |
| `PRISMA_POOL_TIMEOUT` | `30` |
| `PRISMA_CONNECT_TIMEOUT` | `10` |
| `DB_CONNECT_RETRIES` | `5` |
| `DB_CONNECT_RETRY_MS` | `2000` |
| `REDIS_URL` | `redis://:bing2026@srv-captain--bing-chun-redis:6379` |
| `FRONTEND_URL` | `https://bing-chun.bc.dartcodes.com` |
| `LIVE_SHOP_URL` | `https://bing-chun.bc.dartcodes.com` |
| `ADMIN_URL` | `https://bing-chun.bc.dartcodes.com/admin` |
| `API_BASE_URL` | `https://bing-chun-core.bc.dartcodes.com` |
| `JWT_SECRET` | *(new 32+ char secret)* |
| `JWT_REFRESH_SECRET` | *(new 32+ char secret)* |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_USER_EXPIRES_IN` | `1d` |
| `JWT_REFRESH_EXPIRES_IN` | `3650d` |
| `JWT_USER_REFRESH_EXPIRES_IN` | `3650d` |
| `DRIVER_PIN_PEPPER` | *(new secret)* |
| `DELIVERY_OTP_REQUIRED` | `true` |
| `DELIVERY_OTP_PEPPER` | *(new secret)* |
| `DELIVERY_OTP_TTL_MINUTES` | `15` |
| `INTERNAL_SERVICE_SECRET` | *(new secret — copy the exact same value into bing-chun-delivery, bing-chun-orders, bing-chun-payments, bing-chun-notify)* |
| `DELIVERY_SERVICE_ENABLED` | `false` *(flip to `true` in [Phase 4](#phase-4))* |
| `DELIVERY_SERVICE_URL` | `http://srv-captain--bing-chun-delivery:4100` |
| `ORDER_SERVICE_ENABLED` | `false` *(only after migrating order routes — see [Phase 5](#phase-5))* |
| `ORDER_SERVICE_URL` | `http://srv-captain--bing-chun-orders:4200` |
| `PAYMENT_SERVICE_ENABLED` | `false` |
| `PAYMENT_SERVICE_URL` | `http://srv-captain--bing-chun-payments:4300` |
| `NOTIFICATION_SERVICE_ENABLED` | `false` |
| `NOTIFICATION_SERVICE_URL` | `http://srv-captain--bing-chun-notify:4400` |
| `RUNTIME_SCHEMA_PATCHES` | `true` *(set `false` after the first successful `prisma migrate deploy`)* |
| `SOCKET_AUTH_ENFORCED` | `true` |
| `TRUST_PROXY` | `1` |
| `PAYHERE_MERCHANT_ID` | *(from PayHere dashboard)* |
| `PAYHERE_MERCHANT_SECRET` | *(from PayHere dashboard)* |
| `PAYHERE_MODE` | `live` (or `sandbox` while testing) |
| `WEBXPAY_PUBLIC_KEY` | *(from WebXPay dashboard)* |
| `WEBXPAY_SECRET_KEY` | *(from WebXPay dashboard)* |
| `WEBXPAY_API_USERNAME` | *(from WebXPay dashboard)* |
| `WEBXPAY_API_PASSWORD` | *(from WebXPay dashboard)* |
| `WEBXPAY_MODE` | `live` (or `sandbox`) |
| `WEBXPAY_RETURN_URL` | `https://bing-chun-core.bc.dartcodes.com/api/payments/webxpay-return` (must include `?returnOrigin=` encoded storefront URL — see note below) |

**Local WebXPay return URL:** Register  
`http://localhost:4000/api/payments/webxpay-return?returnOrigin=http%3A%2F%2Flocalhost%3A3000`  
in the WebXPay dashboard (API callback on port 4000, `returnOrigin` = Next.js on port 3000). If `returnOrigin` mistakenly points at port 4000, customers see `{"success":false,"message":"Route not found"}` after paying. Re-copy the URL from `webxpayReturnUrl()` in the backend or the storefront admin payment hint when `FRONTEND_URL` changes.
| `GOOGLE_MAPS_API_KEY` | *(Google Cloud Console)* |
| `GOOGLE_CLIENT_ID` | *(Google Cloud Console OAuth client)* |
| `GOOGLE_CLIENT_SECRET` | *(Google Cloud Console OAuth client)* |
| `FACEBOOK_APP_ID` | *(Meta for Developers)* |
| `FACEBOOK_APP_SECRET` | *(Meta for Developers)* |
| `WHATSAPP_ACCESS_TOKEN` | *(Meta WhatsApp Cloud API)* |
| `WHATSAPP_PHONE_NUMBER_ID` | *(Meta WhatsApp Cloud API)* |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | *(Meta WhatsApp Cloud API)* |
| `WHATSAPP_VERIFY_TOKEN` | *(choose your own string)* |
| `WHATSAPP_APP_SECRET` | *(Meta app settings)* |
| `TELEGRAM_BOT_TOKEN` | *(BotFather)* |
| `TELEGRAM_WEBHOOK_SECRET` | *(choose your own string)* |
| `SMS_PROVIDER` | `smslenz` |
| `SMSLENZ_BASE_URL` | `https://smslenz.lk` |
| `SMSLENZ_USER_ID` | *(SMSlenz account)* |
| `SMSLENZ_API_KEY` | *(SMSlenz account)* |
| `SMSLENZ_SENDER_ID` | `BingChun` |
| `SMSLENZ_CONNECTION_TIMEOUT_MS` | `30000` |
| `SMSLENZ_READ_TIMEOUT_MS` | `30000` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(base64 or single-line JSON of your Firebase service account)* |
| `DO_SPACES_KEY` | *(DigitalOcean Spaces)* |
| `DO_SPACES_SECRET` | *(DigitalOcean Spaces)* |
| `DO_SPACES_BUCKET` | *(your bucket name)* |
| `DO_SPACES_REGION` | `sgp1` |
| `DO_SPACES_ENDPOINT` | *(e.g. `https://sgp1.digitaloceanspaces.com`)* |
| `DO_SPACES_PREFIX` | `bingchun` |

Click **Save & Update** after adding all variables.

### 2.5 Run Prisma migrations against the new database

From your local machine (needs network access to `bc-pgbouncer`; if it's not publicly reachable, temporarily add a port mapping in CapRover's app **Deployment → persistent app port mapping**, or run this step from inside the VPS with the repo checked out):

```bash
DATABASE_URL="postgresql://postgres:post2026@captain.bc.dartcodes.com:<mapped-port>/bingchun_db01?schema=public" \
  npm run db:deploy
```

### 2.6 First deploy

Easiest: use the CI workflow with manual dispatch (see [Phase 7](#phase-7)) once secrets are set. To deploy once by hand right now instead:

```bash
npm install -g caprover
cd bingchung
STAGE=/tmp/core-stage
rm -rf "$STAGE"
mkdir -p "$STAGE/packages/db" "$STAGE/packages/delivery-domain" "$STAGE/backend" "$STAGE/delivery-service" "$STAGE/services/orders" "$STAGE/services/payment" "$STAGE/services/notification" "$STAGE/Frontend"
cp backend/deploy/Dockerfile "$STAGE/Dockerfile"
cp backend/deploy/captain-definition "$STAGE/captain-definition"
cp package.json package-lock.json "$STAGE/"
cp packages/db/package.json packages/db/tsconfig.json "$STAGE/packages/db/"
cp -R packages/db/prisma packages/db/src "$STAGE/packages/db/"
cp packages/delivery-domain/package.json "$STAGE/packages/delivery-domain/"
cp delivery-service/package.json "$STAGE/delivery-service/"
cp services/orders/package.json "$STAGE/services/orders/"
cp services/payment/package.json "$STAGE/services/payment/"
cp services/notification/package.json "$STAGE/services/notification/"
cp Frontend/package.json "$STAGE/Frontend/"
cp -R backend/src backend/package.json backend/tsconfig.json backend/docker-entrypoint.sh "$STAGE/backend/"
cp -R backend/prisma "$STAGE/backend/prisma" 2>/dev/null || true
cp -R backend/public "$STAGE/backend/public" 2>/dev/null || true
chmod +x "$STAGE/backend/docker-entrypoint.sh"
tar -czf /tmp/core-deploy.tar -C "$STAGE" .
caprover deploy --caproverUrl https://captain.bc.dartcodes.com --caproverApp bing-chun-core --appToken <TOKEN_FROM_2.3> --tarFile /tmp/core-deploy.tar
```

### 2.7 Smoke test

```bash
curl https://bing-chun-core.bc.dartcodes.com/health
```

Should return `{"status":"ok",...}`.

---

<a name="phase-3"></a>
## Phase 3 — Create and deploy bing-chun

### 3.1 Create the app

**Apps** → **Create New App**: App Name `bing-chun`, Has Persistent Data: **No**.

### 3.2 Domain

`bing-chun` → **HTTP Settings** — default domain `bing-chun.bc.dartcodes.com` is already assigned. Just enable HTTPS → Force HTTPS. Container HTTP Port: `3000`.

### 3.3 App Token

**Deployment** tab → Enable App Token → paste this token as the `CAPROVER_TOKEN` secret inside the GitHub Environment named `bing-chun` (see [Phase 7](#phase-7)).

### 3.4 Environment variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://bing-chun.bc.dartcodes.com` |
| `NEXT_PUBLIC_API_URL` | `/api` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://bing-chun-core.bc.dartcodes.com` |
| `BACKEND_URL` | `https://bing-chun-core.bc.dartcodes.com` |
| `API_PROXY_URL` | `https://bing-chun-core.bc.dartcodes.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | *(same Google OAuth client ID as bing-chun-core)* |
| `NEXT_PUBLIC_FACEBOOK_APP_ID` | *(same Facebook app ID as bing-chun-core)* |

### 3.5 Deploy

```bash
STAGE=/tmp/frontend-stage
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R Frontend/. "$STAGE/"
printf '{"schemaVersion":2,"dockerfilePath":"./Dockerfile"}\n' > "$STAGE/captain-definition"
tar -czf /tmp/frontend-deploy.tar -C "$STAGE" .
caprover deploy --caproverUrl https://captain.bc.dartcodes.com --caproverApp bing-chun --appToken <TOKEN_FROM_3.3> --tarFile /tmp/frontend-deploy.tar
```

Visit `https://bing-chun.bc.dartcodes.com` to confirm it loads and can reach the API (menu should populate).

---

<a name="phase-4"></a>
## Phase 4 — Create and deploy bing-chun-delivery

### 4.1 Create the app

**Apps** → **Create New App**: App Name `bing-chun-delivery`, Has Persistent Data: **No**. Then **HTTP Settings** tab → check **"Do not expose as web app"** (internal-only — traffic reaches it through bing-chun-core, never directly from the internet).

### 4.2 App Token

**Deployment** tab → Enable App Token → paste this token as the `CAPROVER_TOKEN` secret inside the GitHub Environment named `bing-chun-delivery` (see [Phase 7](#phase-7)).

### 4.3 Environment variables

| Variable | Value |
|---|---|
| `DELIVERY_PORT` | `4100` |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Colombo` |
| `DATABASE_URL` | `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public` |
| `PRISMA_CONNECTION_LIMIT` | `5` |
| `PRISMA_POOL_TIMEOUT` | `30` |
| `PRISMA_CONNECT_TIMEOUT` | `10` |
| `JWT_SECRET` | *(same value as bing-chun-core)* |
| `JWT_REFRESH_SECRET` | *(same value as bing-chun-core)* |
| `DRIVER_PIN_PEPPER` | *(same value as bing-chun-core)* |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_DELIVERY_ACCESS_EXPIRES_IN` | `12h` |
| `JWT_DELIVERY_REFRESH_EXPIRES_IN` | `30d` |
| `CORE_API_URL` | `http://srv-captain--bing-chun-core:4000` |
| `INTERNAL_SERVICE_SECRET` | *(same value as bing-chun-core)* |
| `FRONTEND_URL` | `https://bing-chun.bc.dartcodes.com` |
| `ADMIN_URL` | `https://bing-chun.bc.dartcodes.com/admin` |
| `OSRM_URL` | `https://router.project-osrm.org` |
| `GPS_RETENTION_DAYS` | `30` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@srv-captain--bing-chun-redis:6379` |
| `DELIVERY_OTP_PEPPER` | *(same value as bing-chun-core)* |
| `DELIVERY_OTP_TTL_MINUTES` | `15` |
| `DELIVERY_OTP_REQUIRED` | `true` |
| `DRIVER_DEVICE_AUTO_APPROVE` | `false` *(recommended for production — approve devices manually)* |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(same value as bing-chun-core)* |

### 4.4 Deploy

```bash
STAGE=/tmp/delivery-stage
rm -rf "$STAGE"
mkdir -p "$STAGE/packages/db" "$STAGE/packages/delivery-domain" "$STAGE/backend" "$STAGE/delivery-service" "$STAGE/services/orders" "$STAGE/services/payment" "$STAGE/services/notification" "$STAGE/Frontend"
cp delivery-service/deploy/Dockerfile "$STAGE/Dockerfile"
cp delivery-service/deploy/captain-definition "$STAGE/captain-definition"
cp package.json package-lock.json "$STAGE/"
cp packages/db/package.json packages/db/tsconfig.json "$STAGE/packages/db/"
cp -R packages/db/prisma packages/db/src "$STAGE/packages/db/"
cp -R packages/delivery-domain "$STAGE/packages/delivery-domain"
cp backend/package.json "$STAGE/backend/"
cp services/orders/package.json "$STAGE/services/orders/"
cp services/payment/package.json "$STAGE/services/payment/"
cp services/notification/package.json "$STAGE/services/notification/"
cp Frontend/package.json "$STAGE/Frontend/"
cp -R delivery-service/src delivery-service/package.json delivery-service/tsconfig.json delivery-service/docker-entrypoint.sh "$STAGE/delivery-service/"
chmod +x "$STAGE/delivery-service/docker-entrypoint.sh"
tar -czf /tmp/delivery-deploy.tar -C "$STAGE" .
caprover deploy --caproverUrl https://captain.bc.dartcodes.com --caproverApp bing-chun-delivery --appToken <TOKEN_FROM_4.2> --tarFile /tmp/delivery-deploy.tar
```

### 4.5 Wire it into bing-chun-core

Back on `bing-chun-core` → **App Configs**, update:

```
DELIVERY_SERVICE_ENABLED=true
DELIVERY_SERVICE_URL=http://srv-captain--bing-chun-delivery:4100
```

**Save & Update** (this restarts `bing-chun-core`).

### 4.6 Smoke test

```bash
curl http://srv-captain--bing-chun-delivery:4100/health   # from inside another CapRover app, or via a temporary port mapping
```

Then run the full checklist in [docs/29_Delivery_Cutover_Checklist.md](29_Delivery_Cutover_Checklist.md): driver login, job claim, live tracking socket, OTP-gated delivery completion.

---

<a name="phase-5"></a>
## Phase 5 — Create and deploy bing-chun-orders / bing-chun-payments / bing-chun-notify

### What's already migrated vs. scaffolded

These three services currently expose only `GET /health` and `GET /<prefix>/status` — a deployable
"strangler fig" starting point. **bing-chun-core still serves `/api/orders`, `/api/payments`, `/api/whatsapp`,
etc. directly** until you migrate each controller group over (see the migration steps at the end of
this phase). Deploying them now validates the pipeline (build, env, CapRover networking) before any
real traffic depends on them.

### 5.1 Create the apps

Repeat for each of `bing-chun-orders`, `bing-chun-payments`, `bing-chun-notify`:
**Apps** → **Create New App** → App Name (as above) → Has Persistent Data: **No** → **Create New App**. Then for each, **HTTP Settings** tab → check **"Do not expose as web app"** — none of them need a public domain; bing-chun-core (and later, nginx path routing in [Phase 6](#phase-6)) is the only public entry point.

### 5.2 App Tokens

For each app → **Deployment** tab → Enable App Token, then paste each one as the `CAPROVER_TOKEN`
secret inside the matching GitHub Environment (see [Phase 7](#phase-7)):
- `bing-chun-orders` app token → Environment `bing-chun-orders` → secret `CAPROVER_TOKEN`
- `bing-chun-payments` app token → Environment `bing-chun-payments` → secret `CAPROVER_TOKEN`
- `bing-chun-notify` app token → Environment `bing-chun-notify` → secret `CAPROVER_TOKEN`

### 5.3 Environment variables — bing-chun-orders

| Variable | Value |
|---|---|
| `ORDER_PORT` | `4200` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public` |
| `PRISMA_CONNECTION_LIMIT` | `5` |
| `INTERNAL_SERVICE_SECRET` | *(same value as bing-chun-core)* |
| `CORE_API_URL` | `http://srv-captain--bing-chun-core:4000` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@srv-captain--bing-chun-redis:6379` |
| `FRONTEND_URL` | `https://bing-chun.bc.dartcodes.com` |
| `ADMIN_URL` | `https://bing-chun.bc.dartcodes.com/admin` |
| `API_BASE_URL` | `http://srv-captain--bing-chun-orders:4200` |
| `JWT_SECRET` | *(same value as bing-chun-core)* |
| `DELIVERY_OTP_REQUIRED` | `true` |
| `DELIVERY_OTP_PEPPER` | *(same value as bing-chun-core)* |
| `DELIVERY_OTP_TTL_MINUTES` | `15` |

### 5.4 Environment variables — bing-chun-payments

| Variable | Value |
|---|---|
| `PAYMENT_PORT` | `4300` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public` |
| `PRISMA_CONNECTION_LIMIT` | `5` |
| `INTERNAL_SERVICE_SECRET` | *(same value as bing-chun-core)* |
| `CORE_API_URL` | `http://srv-captain--bing-chun-core:4000` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@srv-captain--bing-chun-redis:6379` |
| `FRONTEND_URL` | `https://bing-chun.bc.dartcodes.com` |
| `ADMIN_URL` | `https://bing-chun.bc.dartcodes.com/admin` |
| `API_BASE_URL` | `http://srv-captain--bing-chun-payments:4300` |
| `JWT_SECRET` | *(same value as bing-chun-core)* |
| `PAYHERE_MERCHANT_ID` | *(same value as bing-chun-core, once migrated)* |
| `PAYHERE_MERCHANT_SECRET` | *(same value as bing-chun-core, once migrated)* |
| `PAYHERE_MODE` | `live` |
| `WEBXPAY_MERCHANT_ID` | *(same value as bing-chun-core, once migrated)* |
| `WEBXPAY_PUBLIC_KEY` | *(same value as bing-chun-core, once migrated)* |
| `WEBXPAY_PRIVATE_KEY` | *(same value as bing-chun-core, once migrated)* |
| `WEBXPAY_MODE` | `live` |

### 5.5 Environment variables — bing-chun-notify

| Variable | Value |
|---|---|
| `NOTIFY_PORT` | `4400` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public` |
| `PRISMA_CONNECTION_LIMIT` | `5` |
| `INTERNAL_SERVICE_SECRET` | *(same value as bing-chun-core)* |
| `CORE_API_URL` | `http://srv-captain--bing-chun-core:4000` |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@srv-captain--bing-chun-redis:6379` |
| `FRONTEND_URL` | `https://bing-chun.bc.dartcodes.com` |
| `ADMIN_URL` | `https://bing-chun.bc.dartcodes.com/admin` |
| `API_BASE_URL` | `http://srv-captain--bing-chun-notify:4400` |
| `WHATSAPP_ACCESS_TOKEN` | *(same value as bing-chun-core, once migrated)* |
| `WHATSAPP_PHONE_NUMBER_ID` | *(same value as bing-chun-core, once migrated)* |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | *(same value as bing-chun-core, once migrated)* |
| `WHATSAPP_VERIFY_TOKEN` | *(same value as bing-chun-core, once migrated)* |
| `WHATSAPP_APP_SECRET` | *(same value as bing-chun-core, once migrated)* |
| `TELEGRAM_BOT_TOKEN` | *(same value as bing-chun-core, once migrated)* |
| `TELEGRAM_WEBHOOK_SECRET` | *(same value as bing-chun-core, once migrated)* |
| `SMS_PROVIDER` | `smslenz` |
| `SMSLENZ_BASE_URL` | `https://smslenz.lk` |
| `SMSLENZ_USER_ID` | *(same value as bing-chun-core, once migrated)* |
| `SMSLENZ_API_KEY` | *(same value as bing-chun-core, once migrated)* |
| `SMSLENZ_SENDER_ID` | `BingChun` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(same value as bing-chun-core, once migrated)* |

### 5.6 Deploy each (empty scaffolds — safe to run now)

```bash
# bing-chun-orders
STAGE=/tmp/orders-stage; rm -rf "$STAGE"
mkdir -p "$STAGE/packages/db" "$STAGE/packages/delivery-domain" "$STAGE/backend" "$STAGE/delivery-service" "$STAGE/services/orders" "$STAGE/services/payment" "$STAGE/services/notification" "$STAGE/Frontend"
cp services/orders/deploy/Dockerfile "$STAGE/Dockerfile"
cp services/orders/deploy/captain-definition "$STAGE/captain-definition"
cp package.json package-lock.json "$STAGE/"
cp packages/db/package.json packages/db/tsconfig.json "$STAGE/packages/db/"
cp -R packages/db/prisma packages/db/src "$STAGE/packages/db/"
cp packages/delivery-domain/package.json "$STAGE/packages/delivery-domain/"
cp backend/package.json "$STAGE/backend/"
cp delivery-service/package.json "$STAGE/delivery-service/"
cp services/payment/package.json "$STAGE/services/payment/"
cp services/notification/package.json "$STAGE/services/notification/"
cp Frontend/package.json "$STAGE/Frontend/"
cp -R services/orders/src services/orders/package.json services/orders/tsconfig.json services/orders/docker-entrypoint.sh "$STAGE/services/orders/"
chmod +x "$STAGE/services/orders/docker-entrypoint.sh"
tar -czf /tmp/orders-deploy.tar -C "$STAGE" .
caprover deploy --caproverUrl https://captain.bc.dartcodes.com --caproverApp bing-chun-orders --appToken <the bing-chun-orders app token> --tarFile /tmp/orders-deploy.tar
```

Repeat the same pattern for `bing-chun-payments` (using `services/payment`) and `bing-chun-notify` (using
`services/notification`) — or simply push to `production` after setting up [Phase 7](#phase-7) CI/CD,
which does exactly this for all three automatically.

### 5.7 Migrating real logic into each service (do this incrementally, later)

1. Move a controller + its `lib/` dependencies from `backend/src` into the matching `services/*/src`.
2. Replace `../lib/prisma` imports with `@bingchun/db`.
3. Mount the new route in that service's `src/routes/index.ts`.
4. Remove the old route mount from `backend/src/routes/index.ts`, and set the matching flag
   (`ORDER_SERVICE_ENABLED` / `PAYMENT_SERVICE_ENABLED` / `NOTIFICATION_SERVICE_ENABLED`) to `true` on `bing-chun-core`.
5. Add the matching nginx `location` block from [Phase 6](#phase-6).
6. For customer-facing Socket.IO updates originating outside `bing-chun-core` (e.g. order status from
   `bing-chun-orders`), don't run a second Socket.IO server — either:
   - **HTTP relay** (simplest, same pattern delivery-service already uses — see
     [delivery-service/src/internal/coreClient.ts](../delivery-service/src/internal/coreClient.ts)):
     `POST http://srv-captain--bing-chun-core:4000/api/internal/socket/emit` with `X-Internal-Secret`, or
   - **Redis pub/sub adapter**: `npm install @socket.io/redis-adapter ioredis --workspace=@bingchun/backend`,
     wire `io.adapter(createAdapter(pubClient, subClient))` in
     [backend/src/lib/socket.ts](../backend/src/lib/socket.ts), then any service publishes to a
     `socket-emit` channel and bing-chun-core relays it.
7. For async cross-service events (`order.placed` → notify + reserve inventory), use BullMQ (already
   a dependency in each new service's `package.json`):
   ```ts
   // producer (bing-chun-core or bing-chun-orders)
   new Queue('notifications', { connection: redis }).add('order.placed', payload);

   // consumer (bing-chun-notify)
   new Worker('notifications', handler, { connection: redis });
   ```

---

<a name="phase-6"></a>
## Phase 6 — nginx path routing on bing-chun-core

Only needed once a service's routes are actually migrated (Phase 5.7) and you want nginx to route
directly to it instead of bing-chun-core's application-level proxy flags.

Template file: [deploy/nginx/bing-chun-core-microservices.conf](../deploy/nginx/bing-chun-core-microservices.conf).

Apply it:
1. CapRover → **Apps** → `bing-chun-core` → **HTTP Settings** → **Edit Default Nginx Config**.
2. Paste the relevant `location` blocks from the template **above** the existing `location /` block that proxies to the bing-chun-core container itself.
3. **Save & Update**.
4. Test each path: `curl -i https://bing-chun-core.bc.dartcodes.com/api/orders/...` and confirm it now reaches the target service (check that service's logs in CapRover → App → Logs).

---

<a name="phase-7"></a>
## Phase 7 — CI/CD (GitHub Actions)

Workflow file already created: [.github/workflows/ci-cd-new-server.yml](../.github/workflows/ci-cd-new-server.yml).

### 7.1 Edit the placeholders

Open the file and replace at the top:

```yaml
env:
  CAPROVER_URL: https://captain.bc.dartcodes.com
  API_URL: https://bing-chun-core.bc.dartcodes.com
  FRONTEND_URL: https://bing-chun.bc.dartcodes.com
```

### 7.2 Add GitHub secrets (one common name, per-environment values)

Each `deploy-*` job in the workflow already declares `environment: name: <app-name>` (e.g.
`bing-chun-core`, `bing-chun-orders`, ...). That means instead of 6 differently-named repo secrets,
you can use **one secret name** — `CAPROVER_TOKEN` — and give it a **different value in each
GitHub Environment**. GitHub resolves `secrets.CAPROVER_TOKEN` to whichever environment the running
job belongs to, so each app gets its own token under the same variable name.

Steps (repeat for each of the 6 environments):

1. Repo on GitHub → **Settings** → **Environments** → **New environment**.
2. Name it **exactly** as the app (must match the `environment: name:` value in the workflow):
   `bing-chun-core`, `bing-chun-orders`, `bing-chun-payments`, `bing-chun-delivery`,
   `bing-chun-notify`, `bing-chun`.
3. Inside that environment page → **Environment secrets** → **Add secret**.
4. Name: `CAPROVER_TOKEN`. Value: the app token collected for that specific app (see table below).
5. Save, then move to the next environment and repeat with that app's own token value.

| Environment name | `CAPROVER_TOKEN` value collected in |
|---|---|
| `bing-chun-core` | Phase 2.3 |
| `bing-chun-orders` | Phase 5.2 |
| `bing-chun-payments` | Phase 5.2 |
| `bing-chun-delivery` | Phase 4.2 |
| `bing-chun-notify` | Phase 5.2 |
| `bing-chun` | Phase 3.3 |

You end up with 6 environments, each holding its own `CAPROVER_TOKEN` secret value — 1 secret name,
6 tokens. No workflow YAML edits needed if you add more services later using this same pattern; just
create a new environment with the matching name and a `CAPROVER_TOKEN` secret in it.

> Note: environment secrets are only visible to jobs that declare that `environment:` — plain
> repository secrets (Settings → Secrets and variables → Actions) are visible to every job, so if
> you ever add a secret named `CAPROVER_TOKEN` there too, remove it to avoid ambiguity; the
> environment-scoped value always wins for jobs that set `environment:`, but keeping a stray
> repo-level one around is confusing.

### 7.3 First full rollout

GitHub repo → **Actions** → **CI/CD (new server)** → **Run workflow** → branch `production` → set `deploy_all: true` → **Run workflow**. This deploys all CapRover apps (core microservices, storefront, and delivery-frontend when wired) regardless of changed paths.

### 7.4 Ongoing deploys

After the first rollout, most pushes to `production` only redeploy apps whose files changed (via `dorny/paths-filter` comparing against `backend/**`, `services/orders/**`, `services/payment/**`, `services/notification/**`, `delivery-service/**`, `Frontend/**`, plus shared `packages/db/**` and `packages/delivery-domain/**`).

**Merge PRs from `main` into `production`** set `force_deploy_all` in CI so all six CapRover apps deploy. That avoids the case where `bingchun-production` rebuilds every GHCR image but only deploys services whose paths changed (e.g. a merge that only touches `backend/**` would otherwise deploy only `bing-chun-core`).

To debug skipped deploy jobs locally:

```bash
node scripts/ci/simulate-path-filters.mjs <previous-sha> <merge-sha>
```

On GitHub, open **Detect changed services** → **Log path-filter and deploy-all flags**.

To roll out every app without a code change: **bingchun-production** → **Actions** → **CI/CD (new server)** → **Run workflow** with `deploy_all: true`.

> **Do not add new files under `.github/workflows/` on `bingchung` `production`.** **Sync from bingchung** pushes to `bingchun-production` with the built-in `GITHUB_TOKEN`, which GitHub refuses to use for creating or updating workflow files (`refusing to allow a GitHub App to create or update workflow ... without workflows permission`). The whole sync push is rejected. Edit workflows directly in `bingchun-production`, or switch its sync to a PAT with the `workflow` scope. On `bingchun-production`, give each **Build** job the same `if` as its **Deploy** job (or use `force_deploy_all`) so images are not rebuilt when deploy is skipped.

**CI workflow changes only reach CapRover after they land on `bingchung` branch `production`.** That push runs **Sync to production repo**, which only triggers **Sync from bingchung** on `bingchun-production` (fire-and-forget; check that repo's Actions tab for the result). Pushes to `main`, `diliveryapp`, or other branches do **not** sync or deploy production.

### 7.4.1 `bing-chun-delivery-frontend` on **bingchun-production**

The delivery admin app is **not** part of the original six-app GHCR pipeline. **`bingchung`** already defines a tar-based **Deploy bing-chun-delivery-frontend** job in [`.github/workflows/ci-cd-new-server.yml`](../.github/workflows/ci-cd-new-server.yml). That job often **never appears** on **bingchun-production** because workflow YAML does not sync from `bingchung` (see warning above).

**If you only watch Actions on `bingchun-production`:** edit **that repo’s** `ci-cd-new-server.yml` on `main` and merge in the jobs from [`scripts/ci/bingchun-production-delivery-frontend-jobs.yml`](../scripts/ci/bingchun-production-delivery-frontend-jobs.yml) (path filter + build + deploy). Mirror the **`if:`** conditions used by **Build bing-chun image** / **Deploy bing-chun** so build and deploy stay aligned.

**GitHub Environment:** `bing-chun-delivery-frontend` with `CAPROVER_TOKEN` (app token from CapRover → **bing-chun-delivery-frontend** → Deployment).

**CapRover app configs:** `BACKEND_URL=https://bing-chun-core.bc.dartcodes.com`, `DELIVERY_SERVICE_URL=http://srv-captain--bing-chun-delivery:4100`. On **bing-chun-core**, set `COOKIE_DOMAIN=.bc.dartcodes.com` if admin sessions must work on the delivery-frontend subdomain.

**Alternatively:** merge to **`bingchung` `production`** and use **bingchung** → **CI/CD (new server)** (no GHCR image job; prebuilt Next standalone + CapRover tar). Path filter `delivery_frontend` or `deploy_all: true` must be set.

Debug path filters locally:

```bash
node scripts/ci/simulate-path-filters.mjs <base-sha> <head-sha>
```

### 7.5 Database migrations in CI

Every push to `production` runs a single **Prisma migrate deploy** job after unit tests and
**before** any CapRover deploy. That keeps schema updates serialized (no two services racing
migrations) while apps only roll out after the DB is ready.

**Required repo secret** (Settings → Secrets and variables → Actions → `PRODUCTION_DATABASE_URL`):

```text
postgresql://postgres:<password>@captain.bc.dartcodes.com:<mapped-port>/bingchun_db01?schema=public
```

Use a URL GitHub Actions can reach (public host + CapRover HTTP/TCP mapped Postgres port).
Do **not** use internal hostnames like `srv-captain--postgressql` — runners cannot resolve those.

If migrate fails, all deploy jobs are skipped.
---

<a name="phase-8"></a>
## Phase 8 — Cutover from the old server

1. **Rebuild mobile apps** with the new API base:
   - Customer Flutter app: update `--dart-define=API_BASE=https://bing-chun-core.bc.dartcodes.com` in the root
     [package.json](../package.json) (`dev:customer`, `build:customer` scripts), rebuild, submit to the app store.
   - Driver Kotlin app: update its base-URL config (see [driver_android/README.md](../driver_android/README.md)), rebuild, release.
2. **Update third-party callback URLs** to the new domain:
   - Meta WhatsApp Cloud API → App → WhatsApp → Configuration → Webhook URL → `https://bing-chun-core.bc.dartcodes.com/api/whatsapp/webhook`, re-verify with `WHATSAPP_VERIFY_TOKEN`.
   - PayHere merchant dashboard → Notify URL / Return URL → new domain.
   - WebXPay merchant dashboard → Return/Notify URLs → new domain.
   - Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs → add `https://bing-chun-core.bc.dartcodes.com/api/auth/google/callback`.
   - Meta for Developers → Facebook Login → Valid OAuth Redirect URIs → add `https://bing-chun-core.bc.dartcodes.com/api/auth/facebook/callback`.
3. **Run both servers in parallel** while the mobile app store review/rollout completes — old app versions keep hitting the old server, new installs/updates hit the new one.
4. **Final data cutover**: put the old server into maintenance/read-only mode, re-run the Phase 1.5 `pg_dump`/`pg_restore` delta, then fully switch remaining traffic to the new server.
5. **Decommission**: once telemetry shows zero traffic on the old `bing-chun-b` / `bing-chun` CapRover apps for a full week, delete them and downsize/cancel the old VPS.

---

<a name="secrets"></a>
## Secrets checklist

Secrets that **must be identical** across every app that needs them (copy-paste the exact same value):

| Secret | Needed by |
|---|---|
| `JWT_SECRET` | bing-chun-core, bing-chun-delivery, bing-chun-orders, bing-chun-payments |
| `JWT_REFRESH_SECRET` | bing-chun-core, bing-chun-delivery |
| `DRIVER_PIN_PEPPER` | bing-chun-core, bing-chun-delivery |
| `DELIVERY_OTP_PEPPER` | bing-chun-core, bing-chun-delivery, bing-chun-orders |
| `INTERNAL_SERVICE_SECRET` | bing-chun-core, bing-chun-delivery, bing-chun-orders, bing-chun-payments, bing-chun-notify |

Secrets that are **unique per environment** (generate fresh ones for the new server, never reuse the old server's):

- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DRIVER_PIN_PEPPER`, `DELIVERY_OTP_PEPPER`, `INTERNAL_SERVICE_SECRET`
- `PG_PASSWORD` (bing-chun-production-db), `REDIS_PASSWORD` (bing-chun-redis)
- CapRover app tokens (one per app, generated by CapRover itself)

**Rotating `INTERNAL_SERVICE_SECRET`:** generate a new ≥32-char value (never the default `bingchun-internal-dev-secret`), set the **same** value on every app in the table above, then restart those apps. Production boot refuses missing/short/default secrets. Expect a short 403 window on Delivery→Core calls if restarts are staggered (single secret; no dual-accept). Confirm outbox order-status / OTP / socket emit after rotation. See [15_Security_Documentation.md](15_Security_Documentation.md) §3.5.

Generate any secret locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

<a name="envs"></a>
## Appendix — Full copy-paste env files per app

Filled values for CapRover **App Configs → Environmental Variables** on `captain.bc.dartcodes.com`.
Source-of-truth copies (gitignored) also live under [`deploy/caprover-dev/`](../deploy/caprover-dev/).

**Database (all apps):** `postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public`

Still fill placeholders marked `<FROM_...>` / `<CHOOSE_...>` before go-live (PayHere, Google Maps, WhatsApp App Secret, Telegram).

CapRover accepts one key/value per row — paste from these blocks, or from the matching `deploy/caprover-dev/*.env` file.

### bc-pgbouncer

```env
DATABASE_URL=postgres://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01
POOL_MODE=transaction
MAX_CLIENT_CONN=200
DEFAULT_POOL_SIZE=20
```

### bing-chun-core

```env
NODE_ENV=production
PORT=4000
TZ=Asia/Colombo
DATABASE_URL=postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
PRISMA_CONNECT_TIMEOUT=10
DB_CONNECT_RETRIES=5
DB_CONNECT_RETRY_MS=2000
REDIS_URL=redis://:bing2026@srv-captain--bing-chun-redis:6379
FRONTEND_URL=https://bing-chun.bc.dartcodes.com
LIVE_SHOP_URL=https://bing-chun.bc.dartcodes.com
ADMIN_URL=https://bing-chun.bc.dartcodes.com/admin
API_BASE_URL=https://bing-chun-core.bc.dartcodes.com
JWT_SECRET=12a90f26534f24d273cd173c08db5856bddee7bc7a8387e7a1b1231a202f93fe
JWT_REFRESH_SECRET=408ee4bc6f4cabe10164320d476ed946521ca5a5718089b5390458318ac7412f
JWT_EXPIRES_IN=15m
JWT_USER_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=3650d
JWT_USER_REFRESH_EXPIRES_IN=3650d
DRIVER_PIN_PEPPER=273b55afb6222c5566a344b5a38fbdd120260eddf30e1bb7fe13510bae36be4b
DELIVERY_OTP_REQUIRED=true
DELIVERY_OTP_PEPPER=4985bdb5328f65995ba8de1273cea2cc4e1c8c02684272b436d19a4d75e3ba47
DELIVERY_OTP_TTL_MINUTES=15
INTERNAL_SERVICE_SECRET=2b8f93254b73cc973fc0ddfa00921fc0bbcc6127074ca65e66cee2f077afc14b
DELIVERY_SERVICE_ENABLED=false
DELIVERY_SERVICE_URL=http://srv-captain--bing-chun-delivery:4100
ORDER_SERVICE_ENABLED=false
ORDER_SERVICE_URL=http://srv-captain--bing-chun-orders:4200
PAYMENT_SERVICE_ENABLED=false
PAYMENT_SERVICE_URL=http://srv-captain--bing-chun-payments:4300
NOTIFICATION_SERVICE_ENABLED=false
NOTIFICATION_SERVICE_URL=http://srv-captain--bing-chun-notify:4400
RUN_BACKGROUND_JOBS=true
RUNTIME_SCHEMA_PATCHES=true
SOCKET_AUTH_ENFORCED=true
TRUST_PROXY=1
PAYHERE_MERCHANT_ID=<FROM_PAYHERE_DASHBOARD>
PAYHERE_MERCHANT_SECRET=<FROM_PAYHERE_DASHBOARD>
PAYHERE_MODE=live
WEBXPAY_PUBLIC_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDvePAxVy/cxu0I\n2pKqIZcMi20QgprjcuhSehamilatZVJhYXJtonS0ugzBI4e0ZQTZWrq5oam/TIkl\nEJkD4PWRFjexOu+Yy2aXfNEmdeKSmRlwMjf9VKNUTVUdY+8/B6csRKg3otu9lhe9\nGLcFIsNVJCpzrtUNOA5xrwixQ726Qi2jxw3jpDznDaG3swFHYCqlMJ67lyQg9SWF\nF4aqF0i3SaHbUH0guUt1D5Hfk0uNQzFJBtZx6pmH2mSeI6BXf/SzTSJEUL36W/FC\nS4j/kgonlmEXnsg+EPluRNgW1LXNPrsJrI5RdZVL6/CmMh6AuPVw08EHNh/C18UM\nTU1QMcEvAgMBAAECggEAVooiZvpGgibjNw1h7hiIcRCbv9kq5yI54cBcGiApFa1l\neWqRQxxvx3XqsQtJeb/94hxfGUFaShb7Asl+OoAbziw0wRf2yQVMVFdXb+ovEGJC\nZqDHSgXBpm/x39ai+WinGaDQF5cDiP5KItxhG3qGE2kn7DlUpdvJoHysC/9ae4nG\n4+MDkkBVIM/JNBERRNsd0B4fQUsWCwWkth4ICPXIiYZcz19Zkwcc68wfYv7ahVR/\n6HyfvwrbPRFD77POl1OATE6AOMMwxjDBkAg1p4fLyZSrcBYSGea0fDre/tEZOJe7\nseeQcU21xZgTDdk0j+XC9M3sLET4Kv6V0gDJI7O+7QKBgQD6h8ODBW73r8AZRIr2\nldpL/rzYzuCzpbOWWRmj+CdKwspH3rNfQL8GpWxsQl2ed0f3dYqN5Zcsb4QLUaWK\nMgOfZRSxmhQtBjUm0rqdb6rsZKOIw/hYfjTmTIDL0IfaEsfDJO/JtGYFsza8GkS+\nsIRuXN/b1mp6GiYrlnUKwqMVcwKBgQD0s17yE7ANtCk4I5N4jcBGhjLAbzrvYWYA\nAEFKRkIPnS6Fob/wbGoO6BDN7bFGHYVDKlkUpryxrMkcNfwwY8c2c+Xte0WBSt48\nkTIuSOiOTC1s5CcsFuiJ+tqsspB1bu4w20grsm8x0sQKD9LorEyDzrRt4cBn/MU9\n5mI88A1WVQKBgD0FspaITUYhVd4RtvNm/rwB+Uep5Et9seeOHlO1DwUDuzeURAaQ\ng7b/thAMfjcqAKqCw9PaN19IblY/dd3aXs2FVmwIBqAM4gdpzrCoUW6w+LBIY4ZS\nf1oVCk4apex1JJkgtxNfUHZU96ELmPEFl8w17QTkDh1dnyyAwlNzozuHAoGAfv1T\nabfT5ti3h33W+3o87ZyZXAqdgDuArsFzILOjduzwhsMxk/j/dWrzxZr0I9oQHZIt\nlq0NQfvUhsJxdT9i1ByDl6IgqP+Mo8wKScDmh2p7LIae2Z+t4GWB9JvaokcGb+5s\n3tiEIkwqFrqtjrhUIRc1xcyhiJXCWuRj2RIPKd0CgYEAhj8AgCGz5FNytIWFmCV+\nFJoqnRvdR0wDhGtPQc8gTkqzE1Bp/4dU4mZ3ej14nq/mBSW+prH/Ra6EGHH751SW\nuCpxH5oyvveWROzb+JNwCz870VGsfLbMY5GVtaWhZILc4tySvw8HGf+/z6M2VRBO\nSoMXjPgLtQdBFp1G/Ak1/54=\n-----END PRIVATE KEY-----\n
WEBXPAY_SECRET_KEY=80dbdd54-04d6-4116-83b2-449e0d506dbb
WEBXPAY_API_USERNAME=agGDbrOfLN
WEBXPAY_API_PASSWORD=ZMBE!hQtIg
WEBXPAY_MODE=sandbox
WEBXPAY_RETURN_URL=https://bing-chun-core.bc.dartcodes.com/api/payments/webxpay-return
GOOGLE_MAPS_API_KEY=<FROM_GOOGLE_CLOUD_CONSOLE>
GOOGLE_CLIENT_ID=251896428006-f8hna269pjl205l38t14e6ofn3a4t5eq.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
FACEBOOK_APP_ID=1078982394521027
FACEBOOK_APP_SECRET=6b486d2f851c23aa685207323654d31a
WHATSAPP_ACCESS_TOKEN=EAGM6Vbe4FN8BSEwr9uXgHMlKwyIrgVZBe6ZANog4JVhRQZCOZCC2o24nLUyZCgBMeJOeY1ZCbsvHBGIyMSXGd0rFasQxpuChtUB8lyri6tPWzAIDuHl15CuIZB98ocxwZACUjPHQkHuR9ZBfZAyDZAgXQ04xm4Pp4RUo2pRFyMNJHu1gaKo5aYMpU1yOxNh5TazbGIhjh7aloKSCZAUEMk3ybantl2ppY68Q29RofylSBk25PZCB2I4hSGOqxpOA2L8HpIGxkklPJFuOkAYZBT8ytrWZBFTF3ZAwZC28ZBAUJ9v814XQZDZD
WHATSAPP_PHONE_NUMBER_ID=1356038207583422
WHATSAPP_BUSINESS_ACCOUNT_ID=1563949681945861
WHATSAPP_VERIFY_TOKEN=bingchun-wa-verify-local
WHATSAPP_APP_SECRET=<FROM_META_APP_SETTINGS>
WHATSAPP_BOOT_SUBSCRIBE=true
TELEGRAM_BOT_TOKEN=<FROM_BOTFATHER>
TELEGRAM_WEBHOOK_SECRET=<CHOOSE_YOUR_OWN_STRING>
SMS_PROVIDER=smslenz
SMSLENZ_BASE_URL=https://smslenz.lk
SMSLENZ_USER_ID=1862
SMSLENZ_API_KEY=b706c1f8-0231-4d15-bb1a-d4616f3e3ef6
SMSLENZ_SENDER_ID=DARTCODES
SMSLENZ_CONNECTION_TIMEOUT_MS=30000
SMSLENZ_READ_TIMEOUT_MS=30000
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"bing-chun-customer-app","private_key_id":"41d3ae1ddbf0fd641b32c28c050e0d077578ce05","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDvePAxVy/cxu0I\n2pKqIZcMi20QgprjcuhSehamilatZVJhYXJtonS0ugzBI4e0ZQTZWrq5oam/TIkl\nEJkD4PWRFjexOu+Yy2aXfNEmdeKSmRlwMjf9VKNUTVUdY+8/B6csRKg3otu9lhe9\nGLcFIsNVJCpzrtUNOA5xrwixQ726Qi2jxw3jpDznDaG3swFHYCqlMJ67lyQg9SWF\nF4aqF0i3SaHbUH0guUt1D5Hfk0uNQzFJBtZx6pmH2mSeI6BXf/SzTSJEUL36W/FC\nS4j/kgonlmEXnsg+EPluRNgW1LXNPrsJrI5RdZVL6/CmMh6AuPVw08EHNh/C18UM\nTU1QMcEvAgMBAAECggEAVooiZvpGgibjNw1h7hiIcRCbv9kq5yI54cBcGiApFa1l\neWqRQxxvx3XqsQtJeb/94hxfGUFaShb7Asl+OoAbziw0wRf2yQVMVFdXb+ovEGJC\nZqDHSgXBpm/x39ai+WinGaDQF5cDiP5KItxhG3qGE2kn7DlUpdvJoHysC/9ae4nG\n4+MDkkBVIM/JNBERRNsd0B4fQUsWCwWkth4ICPXIiYZcz19Zkwcc68wfYv7ahVR/\n6HyfvwrbPRFD77POl1OATE6AOMMwxjDBkAg1p4fLyZSrcBYSGea0fDre/tEZOJe7\nseeQcU21xZgTDdk0j+XC9M3sLET4Kv6V0gDJI7O+7QKBgQD6h8ODBW73r8AZRIr2\nldpL/rzYzuCzpbOWWRmj+CdKwspH3rNfQL8GpWxsQl2ed0f3dYqN5Zcsb4QLUaWK\nMgOfZRSxmhQtBjUm0rqdb6rsZKOIw/hYfjTmTIDL0IfaEsfDJO/JtGYFsza8GkS+\nsIRuXN/b1mp6GiYrlnUKwqMVcwKBgQD0s17yE7ANtCk4I5N4jcBGhjLAbzrvYWYA\nAEFKRkIPnS6Fob/wbGoO6BDN7bFGHYVDKlkUpryxrMkcNfwwY8c2c+Xte0WBSt48\nkTIuSOiOTC1s5CcsFuiJ+tqsspB1bu4w20grsm8x0sQKD9LorEyDzrRt4cBn/MU9\n5mI88A1WVQKBgD0FspaITUYhVd4RtvNm/rwB+Uep5Et9seeOHlO1DwUDuzeURAaQ\ng7b/thAMfjcqAKqCw9PaN19IblY/dd3aXs2FVmwIBqAM4gdpzrCoUW6w+LBIY4ZS\nf1oVCk4apex1JJkgtxNfUHZU96ELmPEFl8w17QTkDh1dnyyAwlNzozuHAoGAfv1T\nabfT5ti3h33W+3o87ZyZXAqdgDuArsFzILOjduzwhsMxk/j/dWrzxZr0I9oQHZIt\nlq0NQfvUhsJxdT9i1ByDl6IgqP+Mo8wKScDmh2p7LIae2Z+t4GWB9JvaokcGb+5s\n3tiEIkwqFrqtjrhUIRc1xcyhiJXCWuRj2RIPKd0CgYEAhj8AgCGz5FNytIWFmCV+\nFJoqnRvdR0wDhGtPQc8gTkqzE1Bp/4dU4mZ3ej14nq/mBSW+prH/Ra6EGHH751SW\nuCpxH5oyvveWROzb+JNwCz870VGsfLbMY5GVtaWhZILc4tySvw8HGf+/z6M2VRBO\nSoMXjPgLtQdBFp1G/Ak1/54=\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@bing-chun-customer-app.iam.gserviceaccount.com","client_id":"116945026158970438884","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bing-chun-customer-app.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
DO_SPACES_KEY=DO801KGTU46R2FHMU9C3
DO_SPACES_SECRET=UCZWI6mw9ZtRkZnqRYkEBTqkG4c8m3Di0wKXmryF3vI
DO_SPACES_BUCKET=dartcodes.data
DO_SPACES_REGION=sgp1
DO_SPACES_ENDPOINT=https://dartcodes.data.sgp1.digitaloceanspaces.com
DO_SPACES_PREFIX=bingchun
OSRM_URL=https://router.project-osrm.org
```

### bing-chun

```env
NEXT_PUBLIC_SITE_URL=https://bing-chun.bc.dartcodes.com
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SOCKET_URL=https://bing-chun-core.bc.dartcodes.com
BACKEND_URL=https://bing-chun-core.bc.dartcodes.com
API_PROXY_URL=https://bing-chun-core.bc.dartcodes.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=251896428006-f8hna269pjl205l38t14e6ofn3a4t5eq.apps.googleusercontent.com
NEXT_PUBLIC_FACEBOOK_APP_ID=1078982394521027
```

### bing-chun-delivery

```env
DELIVERY_PORT=4100
NODE_ENV=production
TZ=Asia/Colombo
DATABASE_URL=postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
PRISMA_CONNECT_TIMEOUT=10
JWT_SECRET=12a90f26534f24d273cd173c08db5856bddee7bc7a8387e7a1b1231a202f93fe
JWT_REFRESH_SECRET=408ee4bc6f4cabe10164320d476ed946521ca5a5718089b5390458318ac7412f
DRIVER_PIN_PEPPER=273b55afb6222c5566a344b5a38fbdd120260eddf30e1bb7fe13510bae36be4b
JWT_EXPIRES_IN=15m
JWT_DELIVERY_ACCESS_EXPIRES_IN=12h
JWT_DELIVERY_REFRESH_EXPIRES_IN=30d
CORE_API_URL=http://srv-captain--bing-chun-core:4000
INTERNAL_SERVICE_SECRET=2b8f93254b73cc973fc0ddfa00921fc0bbcc6127074ca65e66cee2f077afc14b
FRONTEND_URL=https://bing-chun.bc.dartcodes.com
ADMIN_URL=https://bing-chun.bc.dartcodes.com/admin
OSRM_URL=https://router.project-osrm.org
GPS_RETENTION_DAYS=30
REDIS_URL=redis://:bing2026@srv-captain--bing-chun-redis:6379
DELIVERY_OTP_PEPPER=4985bdb5328f65995ba8de1273cea2cc4e1c8c02684272b436d19a4d75e3ba47
DELIVERY_OTP_TTL_MINUTES=15
DELIVERY_OTP_REQUIRED=true
DRIVER_DEVICE_AUTO_APPROVE=false
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"bing-chun-customer-app","private_key_id":"41d3ae1ddbf0fd641b32c28c050e0d077578ce05","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDvePAxVy/cxu0I\n2pKqIZcMi20QgprjcuhSehamilatZVJhYXJtonS0ugzBI4e0ZQTZWrq5oam/TIkl\nEJkD4PWRFjexOu+Yy2aXfNEmdeKSmRlwMjf9VKNUTVUdY+8/B6csRKg3otu9lhe9\nGLcFIsNVJCpzrtUNOA5xrwixQ726Qi2jxw3jpDznDaG3swFHYCqlMJ67lyQg9SWF\nF4aqF0i3SaHbUH0guUt1D5Hfk0uNQzFJBtZx6pmH2mSeI6BXf/SzTSJEUL36W/FC\nS4j/kgonlmEXnsg+EPluRNgW1LXNPrsJrI5RdZVL6/CmMh6AuPVw08EHNh/C18UM\nTU1QMcEvAgMBAAECggEAVooiZvpGgibjNw1h7hiIcRCbv9kq5yI54cBcGiApFa1l\neWqRQxxvx3XqsQtJeb/94hxfGUFaShb7Asl+OoAbziw0wRf2yQVMVFdXb+ovEGJC\nZqDHSgXBpm/x39ai+WinGaDQF5cDiP5KItxhG3qGE2kn7DlUpdvJoHysC/9ae4nG\n4+MDkkBVIM/JNBERRNsd0B4fQUsWCwWkth4ICPXIiYZcz19Zkwcc68wfYv7ahVR/\n6HyfvwrbPRFD77POl1OATE6AOMMwxjDBkAg1p4fLyZSrcBYSGea0fDre/tEZOJe7\nseeQcU21xZgTDdk0j+XC9M3sLET4Kv6V0gDJI7O+7QKBgQD6h8ODBW73r8AZRIr2\nldpL/rzYzuCzpbOWWRmj+CdKwspH3rNfQL8GpWxsQl2ed0f3dYqN5Zcsb4QLUaWK\nMgOfZRSxmhQtBjUm0rqdb6rsZKOIw/hYfjTmTIDL0IfaEsfDJO/JtGYFsza8GkS+\nsIRuXN/b1mp6GiYrlnUKwqMVcwKBgQD0s17yE7ANtCk4I5N4jcBGhjLAbzrvYWYA\nAEFKRkIPnS6Fob/wbGoO6BDN7bFGHYVDKlkUpryxrMkcNfwwY8c2c+Xte0WBSt48\nkTIuSOiOTC1s5CcsFuiJ+tqsspB1bu4w20grsm8x0sQKD9LorEyDzrRt4cBn/MU9\n5mI88A1WVQKBgD0FspaITUYhVd4RtvNm/rwB+Uep5Et9seeOHlO1DwUDuzeURAaQ\ng7b/thAMfjcqAKqCw9PaN19IblY/dd3aXs2FVmwIBqAM4gdpzrCoUW6w+LBIY4ZS\nf1oVCk4apex1JJkgtxNfUHZU96ELmPEFl8w17QTkDh1dnyyAwlNzozuHAoGAfv1T\nabfT5ti3h33W+3o87ZyZXAqdgDuArsFzILOjduzwhsMxk/j/dWrzxZr0I9oQHZIt\nlq0NQfvUhsJxdT9i1ByDl6IgqP+Mo8wKScDmh2p7LIae2Z+t4GWB9JvaokcGb+5s\n3tiEIkwqFrqtjrhUIRc1xcyhiJXCWuRj2RIPKd0CgYEAhj8AgCGz5FNytIWFmCV+\nFJoqnRvdR0wDhGtPQc8gTkqzE1Bp/4dU4mZ3ej14nq/mBSW+prH/Ra6EGHH751SW\nuCpxH5oyvveWROzb+JNwCz870VGsfLbMY5GVtaWhZILc4tySvw8HGf+/z6M2VRBO\nSoMXjPgLtQdBFp1G/Ak1/54=\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@bing-chun-customer-app.iam.gserviceaccount.com","client_id":"116945026158970438884","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bing-chun-customer-app.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

### bing-chun-orders

```env
ORDER_PORT=4200
NODE_ENV=production
DATABASE_URL=postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
PRISMA_CONNECT_TIMEOUT=10
INTERNAL_SERVICE_SECRET=2b8f93254b73cc973fc0ddfa00921fc0bbcc6127074ca65e66cee2f077afc14b
CORE_API_URL=http://srv-captain--bing-chun-core:4000
REDIS_URL=redis://:bing2026@srv-captain--bing-chun-redis:6379
FRONTEND_URL=https://bing-chun.bc.dartcodes.com
ADMIN_URL=https://bing-chun.bc.dartcodes.com/admin
API_BASE_URL=http://srv-captain--bing-chun-orders:4200
JWT_SECRET=12a90f26534f24d273cd173c08db5856bddee7bc7a8387e7a1b1231a202f93fe
DELIVERY_OTP_REQUIRED=true
DELIVERY_OTP_PEPPER=4985bdb5328f65995ba8de1273cea2cc4e1c8c02684272b436d19a4d75e3ba47
DELIVERY_OTP_TTL_MINUTES=15
```

### bing-chun-payments

```env
PAYMENT_PORT=4300
NODE_ENV=production
DATABASE_URL=postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
PRISMA_CONNECT_TIMEOUT=10
INTERNAL_SERVICE_SECRET=2b8f93254b73cc973fc0ddfa00921fc0bbcc6127074ca65e66cee2f077afc14b
CORE_API_URL=http://srv-captain--bing-chun-core:4000
REDIS_URL=redis://:bing2026@srv-captain--bing-chun-redis:6379
FRONTEND_URL=https://bing-chun.bc.dartcodes.com
ADMIN_URL=https://bing-chun.bc.dartcodes.com/admin
API_BASE_URL=http://srv-captain--bing-chun-payments:4300
JWT_SECRET=12a90f26534f24d273cd173c08db5856bddee7bc7a8387e7a1b1231a202f93fe
PAYHERE_MERCHANT_ID=<FROM_PAYHERE_DASHBOARD>
PAYHERE_MERCHANT_SECRET=<FROM_PAYHERE_DASHBOARD>
PAYHERE_MODE=live
WEBXPAY_PUBLIC_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDvePAxVy/cxu0I\n2pKqIZcMi20QgprjcuhSehamilatZVJhYXJtonS0ugzBI4e0ZQTZWrq5oam/TIkl\nEJkD4PWRFjexOu+Yy2aXfNEmdeKSmRlwMjf9VKNUTVUdY+8/B6csRKg3otu9lhe9\nGLcFIsNVJCpzrtUNOA5xrwixQ726Qi2jxw3jpDznDaG3swFHYCqlMJ67lyQg9SWF\nF4aqF0i3SaHbUH0guUt1D5Hfk0uNQzFJBtZx6pmH2mSeI6BXf/SzTSJEUL36W/FC\nS4j/kgonlmEXnsg+EPluRNgW1LXNPrsJrI5RdZVL6/CmMh6AuPVw08EHNh/C18UM\nTU1QMcEvAgMBAAECggEAVooiZvpGgibjNw1h7hiIcRCbv9kq5yI54cBcGiApFa1l\neWqRQxxvx3XqsQtJeb/94hxfGUFaShb7Asl+OoAbziw0wRf2yQVMVFdXb+ovEGJC\nZqDHSgXBpm/x39ai+WinGaDQF5cDiP5KItxhG3qGE2kn7DlUpdvJoHysC/9ae4nG\n4+MDkkBVIM/JNBERRNsd0B4fQUsWCwWkth4ICPXIiYZcz19Zkwcc68wfYv7ahVR/\n6HyfvwrbPRFD77POl1OATE6AOMMwxjDBkAg1p4fLyZSrcBYSGea0fDre/tEZOJe7\nseeQcU21xZgTDdk0j+XC9M3sLET4Kv6V0gDJI7O+7QKBgQD6h8ODBW73r8AZRIr2\nldpL/rzYzuCzpbOWWRmj+CdKwspH3rNfQL8GpWxsQl2ed0f3dYqN5Zcsb4QLUaWK\nMgOfZRSxmhQtBjUm0rqdb6rsZKOIw/hYfjTmTIDL0IfaEsfDJO/JtGYFsza8GkS+\nsIRuXN/b1mp6GiYrlnUKwqMVcwKBgQD0s17yE7ANtCk4I5N4jcBGhjLAbzrvYWYA\nAEFKRkIPnS6Fob/wbGoO6BDN7bFGHYVDKlkUpryxrMkcNfwwY8c2c+Xte0WBSt48\nkTIuSOiOTC1s5CcsFuiJ+tqsspB1bu4w20grsm8x0sQKD9LorEyDzrRt4cBn/MU9\n5mI88A1WVQKBgD0FspaITUYhVd4RtvNm/rwB+Uep5Et9seeOHlO1DwUDuzeURAaQ\ng7b/thAMfjcqAKqCw9PaN19IblY/dd3aXs2FVmwIBqAM4gdpzrCoUW6w+LBIY4ZS\nf1oVCk4apex1JJkgtxNfUHZU96ELmPEFl8w17QTkDh1dnyyAwlNzozuHAoGAfv1T\nabfT5ti3h33W+3o87ZyZXAqdgDuArsFzILOjduzwhsMxk/j/dWrzxZr0I9oQHZIt\nlq0NQfvUhsJxdT9i1ByDl6IgqP+Mo8wKScDmh2p7LIae2Z+t4GWB9JvaokcGb+5s\n3tiEIkwqFrqtjrhUIRc1xcyhiJXCWuRj2RIPKd0CgYEAhj8AgCGz5FNytIWFmCV+\nFJoqnRvdR0wDhGtPQc8gTkqzE1Bp/4dU4mZ3ej14nq/mBSW+prH/Ra6EGHH751SW\nuCpxH5oyvveWROzb+JNwCz870VGsfLbMY5GVtaWhZILc4tySvw8HGf+/z6M2VRBO\nSoMXjPgLtQdBFp1G/Ak1/54=\n-----END PRIVATE KEY-----\n
WEBXPAY_SECRET_KEY=80dbdd54-04d6-4116-83b2-449e0d506dbb
WEBXPAY_API_USERNAME=agGDbrOfLN
WEBXPAY_API_PASSWORD=ZMBE!hQtIg
WEBXPAY_MODE=sandbox
```

### bing-chun-notify

```env
NOTIFY_PORT=4400
NODE_ENV=production
DATABASE_URL=postgresql://postgres:post2026@srv-captain--postgressql:5432/bingchun_db01?schema=public
PRISMA_CONNECTION_LIMIT=5
PRISMA_POOL_TIMEOUT=30
PRISMA_CONNECT_TIMEOUT=10
INTERNAL_SERVICE_SECRET=2b8f93254b73cc973fc0ddfa00921fc0bbcc6127074ca65e66cee2f077afc14b
CORE_API_URL=http://srv-captain--bing-chun-core:4000
REDIS_URL=redis://:bing2026@srv-captain--bing-chun-redis:6379
FRONTEND_URL=https://bing-chun.bc.dartcodes.com
ADMIN_URL=https://bing-chun.bc.dartcodes.com/admin
API_BASE_URL=http://srv-captain--bing-chun-notify:4400
WHATSAPP_ACCESS_TOKEN=EAGM6Vbe4FN8BSEwr9uXgHMlKwyIrgVZBe6ZANog4JVhRQZCOZCC2o24nLUyZCgBMeJOeY1ZCbsvHBGIyMSXGd0rFasQxpuChtUB8lyri6tPWzAIDuHl15CuIZB98ocxwZACUjPHQkHuR9ZBfZAyDZAgXQ04xm4Pp4RUo2pRFyMNJHu1gaKo5aYMpU1yOxNh5TazbGIhjh7aloKSCZAUEMk3ybantl2ppY68Q29RofylSBk25PZCB2I4hSGOqxpOA2L8HpIGxkklPJFuOkAYZBT8ytrWZBFTF3ZAwZC28ZBAUJ9v814XQZDZD
WHATSAPP_PHONE_NUMBER_ID=1356038207583422
WHATSAPP_BUSINESS_ACCOUNT_ID=1563949681945861
WHATSAPP_VERIFY_TOKEN=bingchun-wa-verify-local
WHATSAPP_APP_SECRET=<FROM_META_APP_SETTINGS>
WHATSAPP_BOOT_SUBSCRIBE=true
TELEGRAM_BOT_TOKEN=<FROM_BOTFATHER>
TELEGRAM_WEBHOOK_SECRET=<CHOOSE_YOUR_OWN_STRING>
SMS_PROVIDER=smslenz
SMSLENZ_BASE_URL=https://smslenz.lk
SMSLENZ_USER_ID=1862
SMSLENZ_API_KEY=b706c1f8-0231-4d15-bb1a-d4616f3e3ef6
SMSLENZ_SENDER_ID=DARTCODES
SMSLENZ_CONNECTION_TIMEOUT_MS=30000
SMSLENZ_READ_TIMEOUT_MS=30000
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"bing-chun-customer-app","private_key_id":"41d3ae1ddbf0fd641b32c28c050e0d077578ce05","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDvePAxVy/cxu0I\n2pKqIZcMi20QgprjcuhSehamilatZVJhYXJtonS0ugzBI4e0ZQTZWrq5oam/TIkl\nEJkD4PWRFjexOu+Yy2aXfNEmdeKSmRlwMjf9VKNUTVUdY+8/B6csRKg3otu9lhe9\nGLcFIsNVJCpzrtUNOA5xrwixQ726Qi2jxw3jpDznDaG3swFHYCqlMJ67lyQg9SWF\nF4aqF0i3SaHbUH0guUt1D5Hfk0uNQzFJBtZx6pmH2mSeI6BXf/SzTSJEUL36W/FC\nS4j/kgonlmEXnsg+EPluRNgW1LXNPrsJrI5RdZVL6/CmMh6AuPVw08EHNh/C18UM\nTU1QMcEvAgMBAAECggEAVooiZvpGgibjNw1h7hiIcRCbv9kq5yI54cBcGiApFa1l\neWqRQxxvx3XqsQtJeb/94hxfGUFaShb7Asl+OoAbziw0wRf2yQVMVFdXb+ovEGJC\nZqDHSgXBpm/x39ai+WinGaDQF5cDiP5KItxhG3qGE2kn7DlUpdvJoHysC/9ae4nG\n4+MDkkBVIM/JNBERRNsd0B4fQUsWCwWkth4ICPXIiYZcz19Zkwcc68wfYv7ahVR/\n6HyfvwrbPRFD77POl1OATE6AOMMwxjDBkAg1p4fLyZSrcBYSGea0fDre/tEZOJe7\nseeQcU21xZgTDdk0j+XC9M3sLET4Kv6V0gDJI7O+7QKBgQD6h8ODBW73r8AZRIr2\nldpL/rzYzuCzpbOWWRmj+CdKwspH3rNfQL8GpWxsQl2ed0f3dYqN5Zcsb4QLUaWK\nMgOfZRSxmhQtBjUm0rqdb6rsZKOIw/hYfjTmTIDL0IfaEsfDJO/JtGYFsza8GkS+\nsIRuXN/b1mp6GiYrlnUKwqMVcwKBgQD0s17yE7ANtCk4I5N4jcBGhjLAbzrvYWYA\nAEFKRkIPnS6Fob/wbGoO6BDN7bFGHYVDKlkUpryxrMkcNfwwY8c2c+Xte0WBSt48\nkTIuSOiOTC1s5CcsFuiJ+tqsspB1bu4w20grsm8x0sQKD9LorEyDzrRt4cBn/MU9\n5mI88A1WVQKBgD0FspaITUYhVd4RtvNm/rwB+Uep5Et9seeOHlO1DwUDuzeURAaQ\ng7b/thAMfjcqAKqCw9PaN19IblY/dd3aXs2FVmwIBqAM4gdpzrCoUW6w+LBIY4ZS\nf1oVCk4apex1JJkgtxNfUHZU96ELmPEFl8w17QTkDh1dnyyAwlNzozuHAoGAfv1T\nabfT5ti3h33W+3o87ZyZXAqdgDuArsFzILOjduzwhsMxk/j/dWrzxZr0I9oQHZIt\nlq0NQfvUhsJxdT9i1ByDl6IgqP+Mo8wKScDmh2p7LIae2Z+t4GWB9JvaokcGb+5s\n3tiEIkwqFrqtjrhUIRc1xcyhiJXCWuRj2RIPKd0CgYEAhj8AgCGz5FNytIWFmCV+\nFJoqnRvdR0wDhGtPQc8gTkqzE1Bp/4dU4mZ3ej14nq/mBSW+prH/Ra6EGHH751SW\nuCpxH5oyvveWROzb+JNwCz870VGsfLbMY5GVtaWhZILc4tySvw8HGf+/z6M2VRBO\nSoMXjPgLtQdBFp1G/Ak1/54=\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@bing-chun-customer-app.iam.gserviceaccount.com","client_id":"116945026158970438884","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40bing-chun-customer-app.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

---

<a name="troubleshooting"></a>
## Troubleshooting

**`P2037: too many clients already`** — confirm every service's `DATABASE_URL` points at
`srv-captain--postgressql:5432` (or PgBouncer if you re-enable it), not a public IP, and that `PRISMA_CONNECTION_LIMIT=5`
is set on each. See [packages/db/src/index.ts](../packages/db/src/index.ts) for the pooling logic.

**CapRover deploy fails with "app token invalid"** — the token was rotated or the app was recreated;
re-enable the App Token under that app's Deployment tab and update the `CAPROVER_TOKEN` secret in
that app's matching GitHub Environment (Settings → Environments → `<app-name>` → Environment secrets).

**Socket.IO clients can't connect** — confirm **Websocket Support** is enabled in `bing-chun-core` → HTTP
Settings, and that `NEXT_PUBLIC_SOCKET_URL` on `bing-chun` points at `https://bing-chun-core.bc.dartcodes.com`
(not the old domain).

**WhatsApp webhook verification fails** — Meta calls `GET /api/whatsapp/webhook` with a challenge; it
must reach `bing-chun-core` (or `bing-chun-notify` after migration) over HTTPS with a valid cert — check
`captain.bc.dartcodes.com` → `bing-chun-core` → HTTP Settings shows HTTPS enabled and forced.

**Disk fills up** — check `docker system df` on the VPS; confirm the Phase 0.7 prune cron is
installed (`crontab -l`) and CapRover's automated image cleanup is enabled.

---

<a name="budget"></a>
## Resource budget (96 GB RAM / 48 GB disk)

- RAM: 6 Node apps (~1.5 GB total) + Postgres (a few GB) + Redis (~0.5 GB) + PgBouncer (negligible) — trivial for 96 GB.
- Disk is the real constraint: each service image is ~400–700 MB; with the Phase 0.7 prune cron, steady state should stay ~15–20 GB, leaving headroom for the Postgres data volume. Keep product images on DigitalOcean Spaces (already configured) rather than the VPS disk.
