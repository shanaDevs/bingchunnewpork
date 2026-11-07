# 24 — Change Log

**Documentation inventory date:** 2026-07-25  

This log records version / feature snapshots from package manifests and codebase analysis — not a fabricated day-by-day git history.

---

## Version matrix

| Component | Version | Source |
|-----------|---------|--------|
| Monorepo root | `1.0.0` | `package.json` |
| Backend `@bingchun/backend` | `1.0.0` | `backend/package.json` |
| Frontend `@bingchun/frontend` | `0.1.0` | `frontend/package.json` |
| Driver app `bing_chun_delivery` | `1.0.0+1` | `mobile/pubspec.yaml` |
| Customer app `bing_chun_customer` | `1.0.0+1` | `customer_mobile/pubspec.yaml` |

---

## [Admin delivery] Close stuck rides — 2026-11-07

**Summary:** Super Admin and Delivery Partner can close stuck delivery jobs from Delivery → Jobs
(Incomplete / Active): `POST /admin/delivery-jobs/:id/cancel` sets job `CANCELLED`, releases the
rider, optional merit deduction; **customer order statuses are unchanged**. Audit rows in
`delivery_job_admin_cancellations` (migration `20261107150000_delivery_job_admin_cancellations`).

---

## [Admin delivery] Rider KPI efficiency times — 2026-11-07

**Summary:** Admin rider KPI **Efficiency** metrics (total delivery time, average time per
order, average station time) now use one shared calculator in
`packages/delivery-domain/src/riderEfficiency.ts`, wired from `computeRiderDetailKpi` in
`backend/src/controllers/adminDeliveryController.ts`.

### Definitions
- **Total delivery time** and **average time per order** share the same per-stop durations
  (pickup `DeliveryEvent` → `DELIVERED`, latest event when retried; per-order fallback splits
  job wall-clock when events are missing).
- **Average station time** is only the return leg (last `DELIVERED` / `FAILED` event on the job
  → `completedAt`).
- Rider KPI modal filters **Efficiency** on **completed jobs within jobs assigned in the
  selected range** (`assignedAt`). The delivery **dashboard** period averages still use jobs
  **completed** in the range (`completedAt`).

---

## [Driver app + Delivery API] Map-first Stops screen — 2026-09-03

**Summary:** The pre-claim Stops screen becomes map-first, and the route API stops masking
geometry for unclaimed jobs so there is something real to show on it. Customer identity
redaction is unchanged; only coordinates and the road polyline are newly visible.

### Changed — Delivery API
- `GET /delivery/jobs/:id/route` no longer collapses every stop onto the store's coordinates
  or trims `path` to a single point for unclaimed jobs. `stops[].lat`/`lng` and the OSRM
  `path` are now real regardless of `isMine`; `customerName`, `customerPhone`, `addressLine`
  and `total` stay redacted until the job is claimed. Mirrored in
  `delivery-service/src/controllers/jobsController.ts` and
  `backend/src/controllers/deliveryJobController.ts`.
- `GET /delivery/jobs/:id` returns `orders[].lat`/`lng` pre-claim instead of `null`, so the
  client's `toFallbackRoute()` can still draw a map when `/route` fails. Name, phone and
  address remain gated on `redactCustomer`. Mirrored in both `deliveryJobHelpers.ts` copies.
- Removed `buildDeliveryRoutePayloadWithDisplayStops` and its `maskPath` option — the two
  route handlers were its only callers. Deleted from `packages/delivery-domain` and the
  `backend/src/lib` mirror.

### Changed — driver_android
- `JobDetailScreen` restructured from `Scaffold` + `LazyColumn` to a full-screen `RouteMap`
  with floating top chrome, right-hand map controls (recentre / full screen) and a draggable
  bottom sheet snapping to 22% / 46% / 90%. The primary action sits in a fixed footer inside
  the sheet, so `Claim job` is reachable at every anchor.
- `RouteMap` gains `contentPaddingBottomPx` (frames the route above overlaying UI by
  stretching the bounding box southward) and `refitKey` (re-runs the once-per-route camera
  fit). Both default to the previous behaviour; `MiniRouteMap` and `DashboardScreen` are
  untouched.

### Known gap
`GET /delivery/route` (the legacy non-job-scoped helper) still returns unredacted names,
phones, addresses and a full path for every `READY` / `OUT_FOR_DELIVERY` order in the
driver's branches. It predates this change and remains the wider exposure.

---

## [Driver app] Light-first refresh + rider Stats tab — 2026-09-03

**Summary:** The `driver_android` app adopts the customer app's visual language, and riders
gain a tab showing their own numbers. Delivery flow logic, sockets, push and GPS tracking are
unchanged; the only backend change is one additive read-only endpoint.

### Features Added
- **Stats tab** (`ui/screens/StatsScreen.kt`, `StatsViewModel`) — 4th bottom-nav tab, after
  Jobs and History. Period selector (Today / 7d / 30d / All) over stat tiles (runs, stops,
  distance, online time), earnings, customer rating with recent comments, merit points with
  recent changes, and timing averages.
- **`GET /api/delivery/me/stats`** — mirrored in `backend` (`driverSelfController.getMyStats`)
  and `delivery-service` (`meController.getMyStats`) so it works either side of the
  `DELIVERY_SERVICE_ENABLED` proxy.
- **`packages/delivery-domain/src/riderStats.ts`** — shared aggregation. Metric definitions
  mirror the admin rider KPI endpoints; earnings use the same basis as `deliveredTotal` on
  `/jobs/history` (delivery fees on `DELIVERED` orders).

### Changed
- Light-first theme: `BcLightPalette` retuned to the customer app (`#F3F6FB` page, white
  cards, `#E8EEF5` border, `#0B1F3F` ink), new `iconTile` / `inputBorder` / `cardShadow`
  tokens, and `HeaderGradient` (`BcDesign.headerGradient`). `RuntimeConfig` now defaults new
  installs to `LIGHT`.
- `BcCard` gains the hairline border and soft shadow; new `BcGradientHeader`, `BcHeaderPill`,
  `BcWaveBottom` and `BcIconTile` components.
- Brand blue is no longer a surface: the active-run hero uses the navy header gradient, the
  nav bar drops its brand pill indicator, and Jobs / History / Stats / Me open with a
  gradient header. Ride alerts stay deliberately loud.
- Login gets the customer app's wave-scooped dark hero over a white form card.
- System bars are transparent; `BcLightStatusBarIcons()` flips the icons for dark headers.

---

## [Docs sync] — 2026-07-25

**Version:** Documentation sync (app versions unchanged: root/backend `1.0.0`, frontend `0.1.0`, Flutter `1.0.0+1`)  
**Date:** 2026-07-25  
**Summary:** Synchronized enterprise docs with current source after drift analysis (loyalty API, account pages, PayHere endpoints, order status/cash fields, JWT lifetimes, CI proxy URLs, expanded Vitest coverage, permission key corrections).

### Features Added
- Customer loyalty summary API (`GET /api/loyalty/summary`) + `loyaltyController`
- Web account pages: `/account/addresses`, `/account/loyalty`, `/account/notifications`
- Store forward geocode: `GET /api/stores/address/geocode`
- PayHere session + return endpoints; order `confirm-payhere-popup`
- Order cash tender fields: `cashReceivedAmount`, `changeGivenAmount`

### Features Updated
- Initial order status is **RECEIVED** (was documented as PREPARING)
- Customer JWT access tokens are non-expiring; customer refresh default `3650d`; admin access still ~15m
- Admin driver CRUD permissions use `DELIVERY` (not `DRIVERS`); branch analytics uses `SALES` read
- Frontend production API via same-origin `/api` + `BACKEND_URL` / `API_PROXY_URL` (`bing-chung-b.mp.dartcodes.com` in CI)
- Backend unit tests expanded to orders, analytics, wallets/settlements, takeaway queue

### Bug Fixes
- (Documentation only) Corrected stale Not Implemented flags for web account pages

### Database Changes
- `orders.status` default `RECEIVED`
- `orders.cashReceivedAmount`, `orders.changeGivenAmount` (nullable Int)

### API Changes
- Added: loyalty summary; stores geocode; PayHere session/return; confirm-payhere-popup
- Permission corrections on admin drivers + branch-analytics
- No endpoint removals detected

### Breaking Changes
- None documented for clients beyond behavioral JWT lifetime change for customers (longer sessions / non-expiring access tokens)

### Documentation Updated
- `01`, `02`, `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `13`, `14`, `15`, `18`, `20`, `22`, `24`, `26`
- New: `Documentation_Update_Report.md`

---

## Current capability summary (baseline inventory)

### Platform

- npm workspaces for backend + frontend
- Docker Compose (MySQL, backend, frontend)
- GitHub Actions → GHCR → CapRover deploy on `production` (GitLab CI retained as legacy)

### Backend

- Express 5 + Prisma + MySQL order/commerce domain
- JWT auth for customers, admins, drivers (customer access non-expiring)
- Menu, stores, cart, orders, promos, loyalty summary, settings
- PayHere (page, session, return) + mock payment path
- Delivery jobs, clustering, OSRM routing
- Store wallets, withdrawals, commission settlements
- Analytics/reporting suite
- Socket.io realtime
- Vitest unit tests (auth, orders, analytics, wallets, pricing/payment, …)
- Runtime schema ensure helpers

### Frontend

- Next.js customer storefront (browse → checkout → track)
- Account: addresses, loyalty, notification preferences
- Full admin panel (orders, delivery, stock, wallet, reports, staff, settings)
- Zustand + React Query + Socket client
- Playwright E2E for login and order flows

### Mobile

- Driver app: PIN login, jobs, maps, status updates
- Customer app: menu, cart, checkout, PayHere WebView, FCM (Android), profile flows (some stubs)

---

## Explicitly incomplete at this version

- Production SMS (Dialog) and Email (SendGrid) adapters
- Password reset API
- Frontend unit tests; CI test stage
- NGINX/PM2 configs in repo
- Several customer-mobile features (referral, help tickets, saved cards backend, settings toggles)
- POS nav visibility

See [18_Known_Issues.md](18_Known_Issues.md).

---

## Documentation suite

| Change | Notes |
|--------|-------|
| Added | Enterprise docs `01`–`26` + `docs/README.md` index (initial) |
| Updated | 2026-07-25 sync — see entry above |
| Preserved | Existing login E2E/unit QA markdown files |

---

## How to extend this log

When releasing, append entries like:

```markdown
## [x.y.z] — YYYY-MM-DD
### Added
### Changed
### Fixed
### Security
```

Prefer linking merge requests / commits rather than inventing history.

---

## [Unreleased] — 2026-08-07

### Added
- Product `cost` field (unit cost in LKR) on catalog products — super-admin menu form, database column, and admin-only API exposure
- Branch-admin complaint details modal on Delivery → Complaints (full order items, payment, driver contact, resolution; Confirm warns about −5 merit)
- `GET /api/admin/driver-complaints/:id` — branch-scoped complaint detail with order items and related context (no database schema change)
- Delivery Failures tab on Branch Admin Delivery (separate from Complaints) listing per-order driver-reported failures from `delivery_attempts`
- `GET /api/admin/delivery-failures` — branch-scoped list of non-delivered delivery attempts (no database schema change)
- Rider can reject an accepted job before pickup (Android Reject UI); rebroadcast includes socket `broadcastedAt` + FCM to ONLINE branch drivers; alert dedupe cleared so the same job can ring again
- Active run: hide customer Call/Navigate on stops until Confirm pickup; Reject job available on Active run before pickup
- Driver Me screen: request branch add / change home / remove (super-admin Branch requests review); `REMOVE_BRANCH` enum + approve disconnects `accessibleStores`
- Runtime schema patch creates `driver_branch_requests` (+ `REMOVE_BRANCH`) when migrate is not applied locally
- Suspended rider PIN login shows “Your account has been suspended. Please contact the administrator.” instead of “Invalid PIN” (QA #13)
- Login PIN field: show/hide toggle (eye icon) so riders can verify digits (QA #14)

---

## [Unreleased] — 2026-08-27

### Added
- Ride lifecycle **RETURNING** phase: after all orders are delivered the ride stays active until the rider returns to the branch and completes within `branchCompletionRadiusM` / `Store.completionRadiusM`
- Ride estimates at job creation: `rideCode`, `totalCups`, `estimatedDistanceKm`, `estimatedMinutes` (branch → stops → branch); FCM/socket payloads include these fields
- Actual ride tracking: GPS-accumulated `actualDistanceKm` + simplified `actualRoute` polyline; actual time = `completedAt - startedAt`
- Kotlin driver app: full-screen incoming ride alert (`IncomingRideActivity`) with ACCEPT RIDE; ring gating (muted while ASSIGNED/IN_PROGRESS, active during RETURNING); radius-gated Complete Ride; background location via `DriverAlertService`
- Admin portal completed jobs: Ride ID, cups, est vs actual km/min, actual route replay map (`/admin/delivery/route/[jobId]?actual=1`)
- `GET /api/admin/delivery-jobs/:id/actual-route`; `GET /delivery/me` returns `alertEligible` + `activeRidePhase`
- App setting `branchCompletionRadiusM` (default 100m)

### Changed
- `POST /delivery/jobs/:id/complete` now requires body `{ lat, lng }` and job status `RETURNING`
- Auto-complete on last order delivered removed — jobs enter `RETURNING` instead
- New-job FCM audience includes alert-eligible `ON_DELIVERY` riders (returning to branch)

---

## [Unreleased] — 2026-09-02

Closes the three gaps found auditing the driver-app scenarios (branch-scoped ringing,
ring eligibility, pickup/complete geofencing, reject re-pooling, customer-cancel
alerting, unclaimed visibility, branch re-ring).

### Added
- **Pickup branch geofence** — `POST /delivery/jobs/:id/pickup` now takes `{ lat, lng }` and
  refuses outside `Store.completionRadiusM` / `branchCompletionRadiusM` with 400
  `OUTSIDE_BRANCH_RADIUS` + `{ distanceM, radiusM }`, mirroring ride completion. Driver app
  gates the Confirm pickup button on proximity and offers Navigate to branch when out of range.
- **Customer-cancel rider alert** — a cancelled stop on a held ride now reaches the rider
  immediately instead of silently appearing on the next poll:
  - `orderCancelled` socket event on the (previously unused) `driver:{driverId}` room
  - data-only FCM `type: 'ORDER_CANCELLED'` push
  - `notifyDriverOrderCancelled` (`backend/src/lib/driverOrderAlerts.ts`), fired from the
    customer cancel, branch/admin cancel, and delivery-service outbox paths
  - Kotlin app: `bc_order_cancelled_v1` channel, heads-up notification and a single short
    tone (never the looping ride alert, and not gated by `alertEligible` — a mid-run rider is
    muted for new jobs but must still hear this), plus an immediate job refresh
- First test coverage for the driver assignment path: `driverAccess`,
  `deliveryJobHelpers.driverAvailability`, `driverPush.audience`, `driverOrderAlerts`, and
  `deliveryJobController` claim / reject / geofence / re-ring (101 tests).

### Changed
- **`delivery-service` re-synced with core** (it is a lagging fork, live only when
  `DELIVERY_SERVICE_ENABLED=true`): `RETURNING` added to the held-status sets;
  `maybeEnterReturningPhase` replaces auto-complete-on-last-delivery; `complete` requires
  `{ lat, lng }` + `RETURNING` + the branch radius; `pickup` geofenced; new-job push audience
  widened to alert-eligible `ON_DELIVERY` riders and gained `forceRing`; its `AppError`
  now carries `data` so `OUTSIDE_BRANCH_RADIUS` details survive the proxy.

### Fixed
- `driverPush` under-reported `tokensSent` whenever a rider had more than one registered
  device — `tokensSent += await …` inside `Promise.all` read the counter before awaiting, so
  concurrent sends clobbered each other's increments. Now sums the settled results.
