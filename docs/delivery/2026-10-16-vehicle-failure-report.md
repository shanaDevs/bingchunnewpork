# 2026-10-16 — vehicle failure report

**Date:** 2026-10-16

## Changed

- A dropped database connection during `POST /jobs/vehicle-failure` is retried once after reconnect. If it is still down, the response is 503 “Database connection was reset. Please try again.” instead of a generic 500.
- A blank failure note, sent as JSON `null`, is accepted and stored as “Vehicle failure”.
