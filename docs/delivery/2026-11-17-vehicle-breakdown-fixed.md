# 2026-11-17 — vehicle breakdown open / fixed

## Summary

- When a rider reports `POST /jobs/vehicle-failure`, the job still closes as `VEHICLE_FAILURE`, and a **`vehicle_breakdowns`** row stays open until cleared.
- The rider is set **`OFF_DUTY`** (not auto-online). They cannot go online or claim jobs while a breakdown is open.
- **Driver:** `POST /delivery/me/vehicle-fixed` clears the open row.
- **Admin:** `POST /admin/delivery/drivers/:driverId/vehicle-fixed` with required `{ comment }` (min 3 chars).
- **Lists:** `GET /admin/delivery/vehicle-breakdowns?openOnly=true` for ops; dashboard `attention.openVehicleBreakdowns`; live drivers expose `vehicleBreakdownOpen`.

**Driver mobile app:** not updated in this change — consume `vehicleBreakdown` on `GET /me`, `POST /me/vehicle-fixed`, and `VEHICLE_BREAKDOWN_OPEN` on duty/claim when you implement the app separately.

## Distinction

| Layer | Status |
|--------|--------|
| Delivery job | `VEHICLE_FAILURE` (terminal) |
| Rider ops | Open breakdown until `fixedAt` is set |