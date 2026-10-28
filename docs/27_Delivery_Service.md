# 27 — Delivery Service

**Status:** Standby / optional (core is authoritative as of 2026-07-25)  
**Branch:** `feature/delivery-service`  
**Related ADRs:** [0001](adr/0001-delivery-service-boundary.md) · [0002](adr/0002-shared-prisma-package.md) · [0003](adr/0003-single-writer-outbox.md) · [0004](adr/0004-socket-fanout-event-publisher.md) · [0005](adr/0005-delivery-state-vs-order-status.md) · [0006](adr/0006-driver-authentication.md)

## Current runtime (2026-07-25)

**Core backend is authoritative** for driver login, jobs, duty status, OTP, failure attempts, and GPS ingest.

- Set `DELIVERY_SERVICE_ENABLED=false` on core (default in `backend/env.example`).
- Kotlin driver app talks to **core** `/api` + core socket (default namespace): `joinBranchPool`, `newDeliveryJob`, `deliveryJobClaimed`, `driver:location`, `driverDutyChanged`.
- This `delivery-service/` package remains in the repo for rollback / future cutover — do not delete. When the flag is `true`, legacy `/api/delivery/*` proxies here again.

## Purpose

Independent Node/Express service (optional) for driver login, job assignment lifecycle, GPS, OTP/proof, delivery timeline, live tracking events, and driver history — while the **core backend** remains the only writer of orders, payments, and wallets.

## Topology

| Item | Value |
|------|--------|
| Package | `@bingchun/delivery-service` |
| Default port | `4100` |
| Public prefix | `/delivery-api` |
| CapRover app | `bing-chun-delivery` |
| Shared DB | Same MySQL as core (`@bingchun/db`) |
| Shared domain | `@bingchun/delivery-domain` |

```
Clients (Driver Flutter, Admin, Web tracking)
    │
    ├─ /api ──────────────► Core Backend :4000
    └─ /delivery-api ─────► Delivery Service :4100
                                  │
                    outbox ───────┴──► Core /api/internal/*
```

## Feature ownership

| Feature | Owner |
|---------|--------|
| Driver PIN login / refresh / logout | Delivery |
| Job assign / start / complete | Delivery |
| Driver GPS + shifts | Delivery |
| Delivery OTP + attempts + events | Delivery |
| Live tracking socket fan-out | Delivery (+ EventPublisher) |
| Order status / payment / wallet | Core (via outbox) |
| Admin classify / create job (until cutover) | Proxied → Delivery |
| Customer notifications / FCM (order status) | Core |

## API surface (canonical)

See milestones for progressive enablement. Target groups:

- `POST /delivery-api/auth/login|refresh|logout`
- `GET /delivery-api/jobs`, `/jobs/active`, `/jobs/:id`, `/jobs/:id/route`
- `POST /delivery-api/jobs/:id/assign|start|complete`
- `PUT /delivery-api/orders/:orderId/status`
- `POST /delivery-api/orders/:orderId/otp/verify`, `/attempt`
- `POST /delivery-api/locations/batch`
- `GET /delivery-api/me/history|earnings|ratings`
- `GET /delivery-api/tracking/:orderId`
- `GET /delivery-api/admin/live`
- Admin job/driver endpoints mirroring legacy `/api/admin/delivery*`

Feature flag on core: **`DELIVERY_SERVICE_ENABLED`** — when true, legacy routes proxy to this service.

## Socket namespace `/delivery`

- Handshake: JWT in `auth.token` (driver).
- Client → server: `driver:location`, `driver:online`, `driver:offline`.
- Server → rooms: `driverLocation`, `deliveryState`, `etaUpdate`, `jobAssigned`, `jobCancelled`, `deliveryJobUpdated`.

## Customer delivery code

A rider cannot set an order to `DELIVERED` without the code the customer received.

- The code is issued when the run starts (`POST /api/delivery/jobs/:id/start`) and sent to the
  customer by SMS, in-app notification/push, and the `deliveryCode` socket event (order + user rooms).
- Only the HMAC of the code is stored (`delivery_otps`), peppered with `DELIVERY_OTP_PEPPER` and
  valid for `DELIVERY_OTP_TTL_MINUTES`.
- `POST /api/delivery/orders/:orderId/otp/resend` issues a fresh code and re-sends it — used by the
  driver app's "Send code to customer" button.
- Enforcement is on for every branch via `DELIVERY_OTP_REQUIRED` (default `true`);
  `Store.deliveryOtpRequired` can only add the requirement, never remove it.
  Marking delivered without a code returns `400 OTP_REQUIRED`, a wrong code returns `400 OTP_INVALID`.

Regression check: `cd backend && npx ts-node --transpile-only scripts/smoke-delivery-otp.ts`.

## New tables

`driver_locations`, `driver_shifts`, `driver_devices`, `delivery_attempts`, `delivery_otps`, `delivery_events`, `delivery_outbox`  
Additive columns: `AdminUser.phone`, `Store.deliveryOtpRequired`  
Index: `orders(storeId, status, orderMode)`.

## Env (delivery service)

`DELIVERY_PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_SECRET`, `CORE_API_URL`, `REDIS_URL` (optional), `OSRM_URL`, `GPS_RETENTION_DAYS`, `FRONTEND_URL`, `ADMIN_URL`.

## Milestones

| M | Scope | Status |
|---|--------|--------|
| 1 | ADRs + this doc | Done |
| 2 | `packages/db` + migrations | Done |
| 3 | Service skeleton + CI | Done |
| 4 | Writes + sockets + proxy | Done |
| 5 | GPS + live fan-out | Done |
| 6 | OTP + failures | Done |
| 7 | FCM + device auth | Done |
| 8 | Flutter driver refactor | Done |
| 9 | Customer map + admin live | Done |
| 10 | Cutover + hardening | Done — see [29_Delivery_Cutover_Checklist.md](29_Delivery_Cutover_Checklist.md) |

Proxies remain behind `DELIVERY_SERVICE_ENABLED` for safe rollback. Full removal of proxy middleware is optional after sustained production stability.

## Rollback

Set `DELIVERY_SERVICE_ENABLED=false` and redeploy previous core image. Schema is additive-only — no data rollback required.
