# DO ops checklist — driver `GET /api/delivery/me` 504

Run when `x-do-orig-status: 503` appears (Cloudflare **504** to the app).

**App id from error headers:** `ddf093a7-8eb7-4b10-ab5a-8c03e2bd2af2` — map in App Platform → **bingchun-shop** (or custom domain target).

## Console checks (manual — API token required for doctl/MCP)

**Cursor DigitalOcean MCP:** If `apps/apps-list` returns `401 Unable to authenticate you`, regenerate the PAT in [DigitalOcean API tokens](https://cloud.digitalocean.com/account/api/tokens) with **read** scope for **Apps** (and **Databases** / Insights if you use log search), then update the token in Cursor → Settings → MCP → `user-digitalocean`.

1. **Components → shop-api** (or component serving `/api` on bingchunsrilanka.com)
   - Deployment: **Active** / not crash-looping
   - CPU / memory not pegged
   - Runtime logs around failure time (Prisma pool timeout, Redis, process exit)

2. **Environment (shop-api)**
   - `API_SURFACE` — live `/health` showed **`core`** (not `shop` from [`app.shop.yaml`](app.shop.yaml)); confirm matches intent
   - `DELIVERY_SERVICE_ENABLED` — should be **`false`** unless microservice cutover; if `true`, verify `DELIVERY_SERVICE_URL` reaches delivery service
   - `JWT_SECRET` — if rotated, all rider tokens invalid until re-login
   - `REDIS_URL`, `DATABASE_URL` bound and reachable

3. **Ingress**
   - `/api` and `/socket.io` → **shop-api** directly (not shop-web double proxy) — see [`app.shop.yaml`](app.shop.yaml) ingress rules

4. **Health**
   - `GET https://bingchunsrilanka.com/health` → `status: ok`, `socketAdapter: redis`

## Automated read-only probe (from repo root)

```powershell
node deploy/digitalocean/audit-delivery-me-live.cjs
# After fresh login on device, copy token (do not commit):
$env:BEARER = "<paste token>"
node deploy/digitalocean/audit-delivery-me-live.cjs
```

Report: [`.live-delivery-me-audit.json`](.live-delivery-me-audit.json) (gitignored pattern — local only).

## Interpretation quick reference

| Symptom | Likely cause |
|---------|----------------|
| 504 + `x-do-orig-status: 503` | DO origin unhealthy / hung |
| 401 `Invalid or expired token` | Re OTP login; check `sv` / JWT_SECRET |
| 401 `UNAUTHENTICATED` | Missing Bearer (expected without auth) |
| 404 `Route not found` | Wrong API_SURFACE or missing `/delivery` mount |
| 200 JSON profile | Route + auth OK |
