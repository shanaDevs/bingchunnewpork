# 2026-11-05 — failure reassign vehicle only

**Date:** 2026-11-05

## Changed

- Delivery portal failure reassignment (“Ring rider”) is limited to attempts with outcome `VEHICLE_FAILURE`. Other failure types remain visible in the Failures tab but cannot be reassigned from the portal or via `POST /admin/delivery-failures/:attemptId/reassign`.
