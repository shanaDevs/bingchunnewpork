# DigitalOcean deploy ($209 plan)

A push to `main` deploys the four App Platform apps. Each app builds its
Dockerfile from this GitHub repo. Shop runs `prisma migrate deploy` before the
new shop containers start.

Day-to-day deploys do not change instance counts. Leave autoscaling off.
A second shop-web running all month puts the bill over $210.

Postgres is `bingchun-pg` (direct port 25060, no pooler, no standby).
Valkey is `bingchun-valkey`. The specs bind both, so the apps do not store
those passwords. `DATABASE_URL` must stay on port 25060.

App components receive **`${pg.DATABASE_URL}` (doadmin)** from the database
binding. The `DATABASE_URL` line in `secrets.env` uses **`bingchun_app`** for
local checks; that user may not have `SELECT` on tables even when data exists.

### Check whether `bingchun-pg` has data (read-only)

From repo root (uses public host derived from `secrets.env`):

```powershell
node deploy/digitalocean/audit-delivery-portal-readonly.cjs
```

Optional exact row counts: copy **doadmin** public URL into
`deploy/digitalocean/audit-doadmin.url` (see `audit-doadmin.url.example`) or
set `AUDIT_DATABASE_URL`, then run the same command.

Compare legacy CapRover Postgres (`backend/.env`):

```powershell
node deploy/digitalocean/audit-delivery-portal-legacy.cjs
```

### Delivery portal routing (App Platform)

Ingress on `bingchun-delivery` should send **`/delivery-api`** to the **`delivery`**
API component and **`/socket.io`** to **`delivery-web`** (Next rewrites sockets to
`BACKEND_URL` / shop). Admin Socket.IO must not hit delivery-service Engine.IO.

Set **`DELIVERY_FRONTEND_URL`** on shop-api and delivery-service to the live
delivery portal URL for CORS. Redeploy after changing [`app.delivery.yaml`](app.delivery.yaml).

To merge secrets into the app spec and apply ingress with **doctl** (does not wipe UI-only
settings if you edit ingress in the console instead):

```powershell
node deploy/digitalocean/apply-delivery-app-spec.cjs
doctl apps update <APP_ID> --spec deploy/digitalocean/.generated-app.delivery.yaml
```

Until `/delivery-api` ingress is correct, **delivery-web** sets
`NEXT_PUBLIC_DELIVERY_ADMIN_VIA_CORE=true` and the frontend also routes admin APIs via shop
`/api` when the host is `*.ondigitalocean.app` (see `deliveryAdminViaCore` in
`delivery-frontend/src/lib/deliveryApi.ts`).

**Multipart uploads (driver photos, payout proof):** admin-api needs `DO_SPACES_*` on
`bingchun-admin`. Merge and apply with:

```powershell
node deploy/digitalocean/apply-admin-app-spec.cjs
doctl apps update <ADMIN_APP_ID> --spec deploy/digitalocean/.generated-app.admin.yaml
node deploy/digitalocean/diagnose-upload-health.cjs
```

Shop app (driver `/api/delivery/*` on `API_SURFACE=shop`, `DELIVERY_SERVICE_ENABLED=false`):

```powershell
node deploy/digitalocean/apply-shop-app-spec.cjs
doctl apps update <SHOP_APP_ID> --spec deploy/digitalocean/.generated-app.shop.yaml
```

After admin apply, check `GET /api/health/spaces` on the admin API host — `configured` and `reachable` should both be true.

The JWT-style secrets are generated and stored only in `secrets.env`, which
git ignores. The YAML files keep `REPLACE_ME`. Uploading a YAML file from git
onto a live app would wipe the real secrets. Change secrets in the DigitalOcean
UI, or update the live app from `secrets.env`.

A new `JWT_SECRET` logs every customer and cashier out. `DRIVER_PIN_PEPPER`
must not equal `JWT_SECRET`. `COOKIE_DOMAIN` stays unset.

The CapRover workflow (`.github/workflows/ci-cd-new-server.yml`) still runs
when `production` is pushed. Do not push `production` until that workflow is
turned off. The GHCR workflow in this repo only retags apps that already use
container images. It refuses to update these GitHub-built apps.

## Still required before the site can serve customers

The API process exits in production until SMSlenz is configured. There is no
database dump on this cluster, so the first boot is an empty schema. PayHere,
WebXPay, Spaces, FCM, Google, and Facebook keys are not set. Copy those from
the current production apps when you have them.

After `/health` shows `socketAdapter` redis, point DNS here. Then set
`FRONTEND_URL` to `https://bingchunsrilanka.com`, and update the PayHere notify
URL and the Flutter API base URL. `backgroundJobs` is true only on shop-worker.
shop-api stays at 2 instances. Do not add a second shop-web, delivery, cashier,
or admin instance.

**Driver 504 on `/api/delivery/me`:** read [`DO-OPS-delivery-me-504.md`](DO-OPS-delivery-me-504.md) and run
`node deploy/digitalocean/audit-delivery-me-live.cjs` (optional `BEARER` after device login).

`BACKEND_URL` on shop-web, pos-web, and admin-web is the private API URL inside
that app. Do not replace those with a public URL. Cross-app links use the
public `*.ondigitalocean.app` origin.
