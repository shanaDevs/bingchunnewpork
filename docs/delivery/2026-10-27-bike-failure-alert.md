# 2026-10-27 — bike failure alert

**Date:** 2026-10-27

## Added

- Delivery admins hear a repeating chime and see a bike-failure card on the delivery ops console when a rider reports a vehicle failure. The card stays until it is dismissed or Failures is opened. The Failures tab shows how many of those alerts are still open.

## Changed

- Vehicle-failure socket events are also sent to the delivery-admin room. Branch staff still receive the store-room event for live maps, without the chime.

## Links

| From | Opens |
|------|--------|
| Delivery ops bike-failure card | `/?tab=failures` |
