# Milestone 10 — Cutover Checklist

Use this when promoting the Delivery Service from dark deploy to full ownership.

## Delivery schema (`delivery` Postgres schema)

- [ ] Apply migrations `20261007100000_move_delivery_tables_to_delivery_schema` and `20261007110000_rider_profiles_and_delivery_role` (`npm run db:deploy` from repo root)
- [ ] Backfill rider profiles: `npm run db:backfill-rider-profiles`
- [ ] Enable dual-write: `DELIVERY_RIDER_PROFILE_ENABLED=true` on core + delivery-service (default `false`)
- [ ] Redis integration: `REDIS_URL` set; `DELIVERY_INTEGRATION_EVENTS_ENABLED=true` on core + delivery-service
- [ ] Optional tracking federation: `DELIVERY_TRACKING_VIA_SERVICE=true` on core (calls `GET /delivery-api/internal/orders/:id/tracking`)
- [ ] Confirm `SET search_path TO public, delivery` on app connections (handled in `@bingchun/db` `connectDb`)
- [ ] Smoke: create delivery job, customer track page, delivery wallet payout list
- Rollback SQL (metadata only): `ALTER TABLE delivery.<table> SET SCHEMA public;` for each moved table

## Preconditions

- [ ] `packages/db` migration `20260725120000_delivery_service_extensions` applied on staging/production
- [ ] CapRover app `bing-chun-delivery` healthy (`GET /health`)
- [ ] `INTERNAL_SERVICE_SECRET`, `JWT_SECRET`, `JWT_REFRESH_SECRET` identical on core + delivery
- [ ] `INTERNAL_SERVICE_SECRET` is a strong ≥32-char value (not `bingchun-internal-dev-secret`); rotate by setting the same new value on core + delivery then restarting (brief 403 window if staggered)
- [ ] Contract snapshots in `delivery-service/contracts/` reviewed against live responses
- [ ] Driver app build pointing at `/delivery-api` (or core proxy) tested on a pilot branch

## Rollout steps

1. Deploy delivery service with no traffic (already dark).
2. Set on **core backend**:
   - `DELIVERY_SERVICE_ENABLED=true`
   - `DELIVERY_SERVICE_URL=https://<delivery-host>`
   - (Admin APIs) `DELIVERY_ADMIN_SERVICE_ENABLED=true` — proxies `/api/admin/delivery*` to `delivery-service` `/delivery-api/admin/*` (in-process handlers remain fallback when off)
3. Pilot one store: create job → driver assign/start → GPS → deliver (OTP off).
4. Enable `Store.deliveryOtpRequired` on pilot store; verify OTP path.
5. Set `SOCKET_AUTH_ENFORCED=true` after web/admin send `auth.token` on socket connect.
6. Set `RUNTIME_SCHEMA_PATCHES=false` after confirming migrate deploy is the only schema path.
7. Monitor outbox: no rows with `deliveredAt IS NULL` older than 5 minutes.
8. (Optional later) Remove proxy middleware and call delivery service directly from clients.

## Rollback

1. Set `DELIVERY_SERVICE_ENABLED=false` on core → immediate restore of in-process handlers.
2. Redeploy previous core image tag if needed.
3. Schema is additive — **do not** roll back migrations.

## Load test

```bash
k6 run -e BASE_URL=https://<delivery> -e DRIVER_TOKEN=<jwt> -e VUS=50 -e DURATION=30m scripts/load/driver-gps.js
```

Target: p95 ingest &lt; 500ms locally / &lt; 100ms on sized staging; MySQL writes match downsample (not every fix).
