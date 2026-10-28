# 2026-10-16 — vehicle failure enum

**Date:** 2026-10-16

## Changed

- Boot schema patches now add `VEHICLE_FAILURE` to `DeliveryAttemptOutcome` before admin job detail and route lookups, so an active schedule opens instead of returning 500 when that label is missing from Postgres. A second request that races the same add is ignored.
