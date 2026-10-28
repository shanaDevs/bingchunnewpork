# 2026-10-16 — licence image load

**Date:** 2026-10-16

## Changed

- Driver profile (`GET /delivery/me`) presigns the private licence image without the AWS checksum query DigitalOcean Spaces rejects, so the rider app can load it from the profile card.
- When the delivery service cannot sign that image, the profile omits the link instead of returning the private object URL.
