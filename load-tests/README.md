# Bing Chun Load Tests (k6)

Pure load/stress testing for the Bing Chun API — no business logic, only traffic simulation.

## Quick start

```powershell
# 1. Start the backend (from repo root)
npm run dev:backend

# 2. Smoke test — anonymous browsing (safe)
.\load-tests\run.ps1 -TargetEnv local -Profile smoke -Scenarios browse

# 3. Open live dashboard while the test runs
#    http://localhost:5665
```

## Scenarios

| Scenario | Description | Production-safe |
|----------|-------------|-----------------|
| `browse` | Anonymous reads: menu, stores, promos, settings | Yes (smoke only) |
| `cart` | Cart add → update → clear (self-cleaning) | Writes DB — needs `-AllowProductionWrites` |
| `account` | Profile, addresses, wishlist (self-cleaning) | Writes DB — needs `-AllowProductionWrites` |
| `authchurn` | Login + refresh (+ optional register) | Writes DB — needs `-AllowProductionWrites` |
| `validate` | Promo/spin validate POSTs (no DB writes) | Yes (no SMS/orders) |
| `order` | Login → cart → place takeaway order → track | No (writes DB rows + SMS) |
| `socket` | Socket.IO connect, joinUser, trackOrder | Caution |
| `driver` | POST `/delivery-api/locations/batch` | Requires `DRIVER_TOKEN` |

Combine scenarios: `-Scenarios browse,cart,validate`

Write-path runbook (SMS-free): [docs/write-path-load-test.md](docs/write-path-load-test.md)

## Environments

| `ENV` | API base |
|-------|----------|
| `local` | `http://localhost:4000` |
| `production` | `https://bing-chun-core.bc.dartcodes.com` (shop: `https://bing-chun.bc.dartcodes.com`) |

## Profiles

| Profile | Purpose |
|---------|---------|
| `smoke` | 5 VUs, 1 minute |
| `typical` | ~20 shoppers, 5 min, 5s between clicks |
| `baseline` | Ramp to 100 VUs over ~14 min |
| `stress` | Ramp to 5000 VUs |
| `spike` | Sudden spike to 2000 VUs |
| `soak` | 200 VUs for 30 minutes |

Override: `-Vus 50 -Duration 2m` or `-Stages "30s:100,5m:500"`

## Rate limiter bypass (production)

Production caps at **200 req/min/IP** on `bing-chun-core`. High-VU tests need Option A bypass:

1. Set on CapRover (**test window only**): `LOAD_TEST_BYPASS_KEY` on `bing-chun-core` (and `bing-chun-delivery` for driver scenario)
2. Pass the same value to k6: `-LoadTestKey "<same-key>"`

Full runbook: [docs/rate-limit-bypass.md](docs/rate-limit-bypass.md)

## Production rules

- Notify the team before any production run
- Use off-peak hours
- Start with `-Profile smoke -Scenarios browse -ConfirmProduction`
- What that command hits: [docs/production-browse-smoke.md](docs/production-browse-smoke.md)
- Never run `order` against production without `-AllowProductionOrders`
- Never run `cart` / `account` / `authchurn` without `-AllowProductionWrites` + `-LoadTestKey`
- Write-path ladder: [docs/write-path-load-test.md](docs/write-path-load-test.md)

## Reports

Each run writes to `load-tests/reports/`:

- `{env}-{profile}-{timestamp}.html` — k6 web dashboard export
- `{env}-{profile}-{timestamp}.json` — raw metrics
- `{env}-{profile}-{timestamp}.txt` — CLI summary
- `{env}-{profile}-{timestamp}.md` — digest

## Test users

| Scenario | Users |
|----------|-------|
| `cart` / `account` / `authchurn` | Self-bootstrapped `0990000xxx` via login-or-register in `setup()` (password `LoadTest123!`). Override count with `-WriteUserCount`. |
| `order` / `socket` | `config/runtime-data.json` phones `0770000001`–`0770000100` — **must already exist in DB** (fixture alone does not seed them). |

`099` is not a real Sri Lankan mobile prefix, so accidental SMS cannot reach a handset.

## Driver GPS scenario

```powershell
.\load-tests\run.ps1 -Scenarios driver -DriverToken "<jwt-from-delivery-login>"
```

## Scaling beyond one machine

Before high-VU runs on Windows (admin shell):

```powershell
netsh int ipv4 set dynamicport tcp start=10000 num=55000
```

Walk the VU ladder: 50 → 200 → 1000 → 5000 → 10000 → 30000. Stop when:

- Server `http_req_duration` p95 degrades sharply, or
- Client shows high `dropped_iterations` / `http_req_blocked` (client bottleneck, not server)

For 30k+ VUs, use [k6 distributed execution](https://grafana.com/docs/k6/latest/testing-guides/running-distributed-tests/) across multiple load generators.

## Direct k6 usage

```powershell
$env:K6_WEB_DASHBOARD = "true"
$env:K6_WEB_DASHBOARD_EXPORT = "load-tests/reports/manual.html"
k6 run -e ENV=local -e PROFILE=smoke -e SCENARIOS=browse load-tests/main.js
```
