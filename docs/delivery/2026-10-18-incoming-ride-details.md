# 2026-10-18 — incoming ride details

**Date:** 2026-10-18

## Changed

- The rider ringing screen keeps the blue header to the title block, so the route, order lines, delivery fee, pickup and drop, and Reject / Accept Ride stay on screen.
- While the offer is ringing, the app loads `GET /delivery/jobs/:id/route` and shows the branch and drop pins. If that route has no pins, the schematic map stays.
