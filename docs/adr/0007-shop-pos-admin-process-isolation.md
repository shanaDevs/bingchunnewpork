# ADR 0007 — Shop, cashier, and admin process isolation

**Status:** Accepted  
**Date:** 2026-10-20

## Context

Customer checkout, cashier POS, and admin stock all run in one Node process (`bing-chun-core`) and one Next.js app. A crash or deploy of admin stops `POST /api/orders`, the menu, and the cashier together.

Those three roles write the same orders and FIFO batches. Splitting them into three databases, or copying the backend into three repositories, would double-sell stock and let security fixes drift.

## Decision

1. Keep **one backend image** and **one Postgres database**. Choose the process with `API_SURFACE=shop|pos|admin`. Unset or `core` keeps the full API on `bing-chun-core`.
2. Keep **one Next.js codebase**. Choose the site with `WEB_SURFACE=shop|pos|admin`.
3. Mount only the allowlist in `backend/src/routes/surfacePolicy.ts`. Boot fails if shop mounts `/admin` or if admin or POS mounts payment callbacks.
4. Run reservation expiry, pickup reminders, schema patches, and the integration consumer on **one** process (`RUN_BACKGROUND_JOBS=true`, default shop and core). POS and admin leave jobs off.
5. Require Redis for shop, POS, and admin in production so order alerts and rate limits are shared. Cap each Prisma pool (`PRISMA_CONNECTION_LIMIT`, default 4 on those surfaces).
6. Do not set `COOKIE_DOMAIN` to the parent domain. Staff cookies stay on the cashier host and the admin host.
7. Deploy the new CapRover apps beside core. Move traffic only after `/health` reports the expected `surface`. Do not delete core routes in the same release that switches traffic.

Payment notify URLs stay on the shop process and on core during the overlap, so a payment can complete while admin is down.

## Consequences

- An admin outage no longer stops checkout or the cashier, once traffic has moved.
- Three pools share one Postgres. Stock stays safe because of existing row locks, not because of separate databases.
- `services/orders`, `services/payment`, and `services/notification` stay a later domain split. This decision does not finish them.
