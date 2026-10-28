# Production browse smoke — what this command tests

```powershell
.\load-tests\run.ps1 -TargetEnv production -Profile smoke -Scenarios browse -ConfirmProduction
```

This is a **read-only** smoke test of the live customer browsing API. It does not log in, does not place orders, and does not write to the database.

## Command flags

| Flag | Meaning |
|------|---------|
| `-TargetEnv production` | Hit the live CapRover API, not localhost |
| `-Profile smoke` | 5 concurrent virtual users for 1 minute |
| `-Scenarios browse` | Anonymous GET mix only |
| `-ConfirmProduction` | Safety unlock — without this the script refuses to run against production |

## Target

| Role | URL |
|------|-----|
| API under test | `https://bing-chun-core.bc.dartcodes.com` |
| Shop (not hit by this scenario) | `https://bing-chun.bc.dartcodes.com` |

Delivery, orders, payments, and notify services are **not** called. They sit behind core; this smoke only exercises public catalog reads on **bing-chun-core**.

## What happens before traffic starts

1. Preflight `GET /health` — abort if the API is down.
2. **Catalog hydrate** (setup, 2 extra GETs):
   - `GET /api/stores` — pick a live store (prefers Anuradhapura if present, otherwise the first store)
   - `GET /api/menu/products?storeId=...` — keep up to 8 product IDs for later detail/inventory calls

That store + product list is used for the rest of the run so old seed IDs cannot 404.

## Load shape

| Setting | Value |
|---------|-------|
| Virtual users | 5, constant |
| Duration | 1 minute |
| Think time | 500 ms between requests |
| Auth | none (no JWT, no cookies) |
| Expected request rate | ~10 req/s (~600/min) |

Production general rate limit is **200 req/min per IP**. This smoke is above that, so some **HTTP 429** responses are expected unless `LOAD_TEST_BYPASS_KEY` is set on `bing-chun-core` and passed with `-LoadTestKey`.

## Endpoints that get hit

Each VU picks one endpoint per iteration using these weights (total 100):

| Weight | Name | Method + path | What it checks |
|--------|------|----------------|----------------|
| 5% | health | `GET /health` | Core process is up |
| 15% | menu_categories | `GET /api/menu/categories` | Category list |
| 25% | menu_products | `GET /api/menu/products?storeId={store}` | Store catalog (heaviest path) |
| 15% | menu_product_detail | `GET /api/menu/products/{id}` | Single product page |
| 15% | stores | `GET /api/stores` | Branch list |
| 10% | promos | `GET /api/promos` | Active promotions |
| 10% | settings_app | `GET /api/settings/app` | App config (links, flags) |
| 5% | inventory | `GET /api/inventory/availability?storeId=...&productId=...` | Stock availability |

A request **passes** if the HTTP status is 2xx.

Not called (on purpose):

- Google Maps geocode / autocomplete (`/api/stores/address/*`)
- Auth, OTP, cart, checkout, payments
- Admin APIs
- Socket.IO
- Driver GPS (`/delivery-api/...`)
- WhatsApp / Telegram webhooks

## Pass / fail thresholds

k6 exit code is non-zero if any of these fail:

| Metric | Default threshold |
|--------|-------------------|
| `http_req_duration` p95 | `< 500 ms` |
| `http_req_failed` | `< 1%` |
| `checks` | `> 95%` 2xx |

Remote production often fails the **p95 < 500 ms** gate even when every request is 200. Treat that as a latency signal, not an outage. Override if needed:

```powershell
# still browse smoke, but accept p95 under 3000 ms
k6 run -e ENV=production -e PROFILE=smoke -e SCENARIOS=browse -e P95_MS=3000 load-tests/main.js
```

## Reports written

`load-tests/reports/production-smoke-{timestamp}.*`

| File | Contents |
|------|----------|
| `.html` | Dashboard export (graphs if duration is long enough) |
| `.json` | Raw k6 metrics |
| `.txt` | CLI summary |
| `.md` | Short digest |

Live dashboard tries to bind `http://localhost:5665`. On some Windows machines that port is reserved; the test still runs, only the live UI is missing.

## How to read the result

| Signal | Meaning |
|--------|---------|
| All `✓ status 2xx` and `http_req_failed` ~ 0% | Catalog APIs are healthy |
| Many 429s | Rate limiter, not an app crash |
| High `http_req_waiting` | Server/DB time |
| High `http_req_receiving` | Large JSON payloads (full catalog) |
| p95 over 500 ms with 0% errors | Slow, but up |

## Safer / heavier variants

```powershell
# Stay under the 200/min limiter (recommended first prod run)
.\load-tests\run.ps1 -TargetEnv production -Profile smoke -Scenarios browse -ConfirmProduction -Vus 2 -Duration 45s -ThinkTimeMs 2000

# Same browse mix, more load (needs bypass key on core)
.\load-tests\run.ps1 -TargetEnv production -Profile baseline -Scenarios browse -ConfirmProduction -LoadTestKey "<key>"
```
