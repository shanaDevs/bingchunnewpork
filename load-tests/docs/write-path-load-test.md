# Production write-path load test (SMS-free)

Safe POST/PUT/DELETE load tests against `bing-chun-core`. **No OTP, no orders, no SMS, no payment gateway, no admin status changes.**

## Scenarios

| Scenario | What it hits | Auth | Side effects |
|----------|--------------|------|--------------|
| `cart` | `POST/PUT/DELETE /api/cart/*` | Yes | Cart rows — cleared each iteration |
| `account` | `PUT /api/auth/me`, addresses CRUD, wishlist add/remove | Yes | Self-cleaning |
| `authchurn` | `POST /api/auth/login`, `/api/auth/refresh` (+ optional register) | Bootstrap users | Tokens only; optional soft-deleted registers |
| `validate` | `POST /api/promos/validate`, `/eligible`, `/api/spin/validate` | None | No DB writes |

Combine: `-Scenarios cart,account,validate`

## Intentionally excluded

| Endpoint | Why |
|----------|-----|
| `POST /api/auth/otp/request` | Sends real SMS |
| `POST /api/orders` | SMS + stock + permanent rows |
| `POST /api/spin/play` | Creates `SpinResult` rows |
| Admin `PUT /api/orders/:id/status` | Can mutate real customer orders |
| `POST /api/stores/validate-delivery` | Google Maps cost — opt-in via `-IncludeGeocode` |
| `POST /api/notifications/fcm-token` | Leaves device tokens that could receive push |

## Safety rails

1. **Phone range `0990000xxx`** — passes backend Sri Lankan phone regex but is not a real mobile prefix (070–078). SMS never reaches a handset even if SMS is live.
2. **Self-bootstrap** — `setup()` logs in; if missing, `POST /api/auth/register` (no SMS). Users reuse across runs.
3. **`-LoadTestKey` required for production writes** — auth limiter is 20/15min without bypass; setup logins will 429.
4. **`-AllowProductionWrites`** — `run.ps1` refuses `cart|account|authchurn` on production without this flag.

## Commands

### Local sanity

```powershell
.\load-tests\run.ps1 -TargetEnv local -Scenarios cart,account,validate -Vus 5 -Duration 1m
```

### Production bootstrap (1 VU)

```powershell
.\load-tests\run.ps1 -TargetEnv production -Scenarios cart `
  -ConfirmProduction -AllowProductionWrites `
  -LoadTestKey "<key>" -WriteUserCount 5 -Vus 1 -Duration 30s
```

### Production ladder (stop early on errors)

```powershell
.\load-tests\ladder.ps1 -TargetEnv production -Scenarios cart,account,validate `
  -Rungs 5,10,20,35,50 -Duration 2m `
  -ConfirmProduction -AllowProductionWrites `
  -LoadTestKey "<key>"
```

Abort threshold on production write ladders: **2%** error rate (or any `dropped_iterations`).

### Auth churn with bounded registers

```powershell
.\load-tests\run.ps1 -TargetEnv production -Scenarios authchurn `
  -ConfirmProduction -AllowProductionWrites `
  -LoadTestKey "<key>" -RegisterCount 10 -Vus 10 -Duration 1m
```

`teardown()` soft-deletes planned churn phones via `DELETE /api/auth/me`.

### Optional geocode (costs money)

```powershell
.\load-tests\run.ps1 -TargetEnv production -Scenarios validate `
  -ConfirmProduction -LoadTestKey "<key>" -IncludeGeocode -Vus 5 -Duration 1m
```

## Abort rules (manual)

Stop with Ctrl+C if:

- Error rate exceeds ~5%
- p95 exceeds ~10s
- `/health` starts failing
- Real shoppers report slowness

Yesterday's browse-only run at 100 VUs already saw **44% failures / p95 ~59s**. Writes are heavier — start at 5–20 VUs.

## Cleanup

| Artifact | Action |
|----------|--------|
| Bootstrap users `0990000xxx` | Keep — reused next run |
| Churn users `0991xxxxxx` | Soft-deleted in `teardown()` when `-RegisterCount` used |
| CapRover `LOAD_TEST_BYPASS_KEY` | **Remove after the test window** — see [rate-limit-bypass.md](rate-limit-bypass.md) |

Optional hard-delete later: Prisma script matching `0990000*` / `0991*` phones (same pattern as `backend/prisma/seed-dummy-data.ts` cleanup).

## Related

- [production-browse-smoke.md](production-browse-smoke.md) — read-only browse smoke
- [rate-limit-bypass.md](rate-limit-bypass.md) — Option A bypass key
- [../README.md](../README.md) — profiles and reports
