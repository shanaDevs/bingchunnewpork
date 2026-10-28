# 2026-10-16 — driver licence update

**Date:** 2026-10-16

## Changed

- Saving a rider licence image from the delivery portal uploads through a path-style Spaces request when the bucket name contains a dot, so the update no longer fails with an internal server error.
- Admin driver responses and the driver profile (`GET /delivery/me`) return a short-lived link for a private licence image. The driver Android app can display that link on the profile screen.
