# Driver vehicle breakdown — handover API

Endpoints for the stranded rider (driver 1) after reporting a mid-route vehicle failure. They expose replacement rider progress, handed-over orders, map data, and timeline.

## Related flows (already in repo)

| Action | Endpoint |
|--------|----------|
| Report breakdown | `POST /api/delivery/jobs/vehicle-failure` |
| Rider profile + open breakdown flag | `GET /api/delivery/me` (`vehicleBreakdown`) |
| Clear breakdown (any screen) | `POST /api/delivery/me/vehicle-fixed` |
| Admin reassign | `POST /api/admin/delivery/delivery-failures/:attemptId/reassign` |

After `vehicle-failure`, the ride closes as `VEHICLE_FAILURE`, the rider is set `OFF_DUTY`, and a `vehicle_breakdowns` row stays open until fixed. See [delivery/2026-11-17-vehicle-breakdown-fixed.md](./delivery/2026-11-17-vehicle-breakdown-fixed.md).

## `GET /api/delivery/jobs/:id/handover`

**Auth:** delivery driver JWT; **only** the failed ride’s original `driverId`.

**Preconditions:** `:id` job `status === VEHICLE_FAILURE`.

### Response shape

```json
{
  "jobId": "…",
  "rideCode": "BC-1234",
  "stage": "finding_rider",
  "breakdownSpot": { "lat": 6.91, "lng": 79.86 },
  "replacement": null,
  "orders": [
    {
      "orderId": "…",
      "orderNumber": "10042",
      "sequence": 2,
      "status": "OUT_FOR_DELIVERY",
      "cupCount": 3
    }
  ],
  "events": [
    {
      "at": "2026-11-17T10:00:00.000Z",
      "kind": "breakdown_reported",
      "label": "Vehicle breakdown reported"
    }
  ]
}
```

### `stage`

| Value | Meaning |
|-------|---------|
| `finding_rider` | No replacement redelivery job yet |
| `handover` | Replacement assigned; orders not collected at breakdown spot |
| `done` | Replacement collected (`PICKED_UP` / `IN_PROGRESS` on redelivery job) |

### `replacement` (when assigned)

| Field | Source |
|-------|--------|
| `driverId`, `jobId`, `rideCode`, `jobStatus` | Redelivery job via `loadReassignedRidersByFailedJob` |
| `name`, `profilePhotoUrl`, `vehicleType`, `vehicleNumber` | `admin_users` |
| `averageRating` | `rider_ratings` aggregate |
| `accepted` | Redelivery job claimed / `ASSIGNED` event |
| `collected` | `PICKED_UP` or `IN_PROGRESS` on redelivery job |
| `location` | Latest `driver_locations` for driver 2 |
| `distanceKm`, `etaMinutes` | OSRM route from driver 2 → `breakdownSpot` (haversine fallback) |

### Privacy

When `replacement.collected` is `true`, the API **omits** driver 2’s `phone`, `location`, `distanceKm`, and `etaMinutes`.

### Errors

| Status | When |
|--------|------|
| 404 | Unknown job |
| 403 | Job belongs to another driver |
| 400 | Job is not `VEHICLE_FAILURE` |

## `POST /api/delivery/jobs/:id/handover/back-on-road`

Same outcome as `POST /api/delivery/me/vehicle-fixed`, but requires the open `vehicle_breakdowns` row to belong to this failed `jobId`. Use from the handover screen’s **I’m back on the road** action.

Returns `{ breakdownId, jobId, fixedAt, fixedComment }`.

## Realtime

| Event | Room | When |
|-------|------|------|
| `handoverRiderAssigned` | `driver:{strandedDriverId}` | Admin reassigned orders after vehicle failure |
| `vehicleBreakdownOpened` | store + `delivery-ops` | Driver reported failure |
| `vehicleBreakdownCleared` | store + `delivery-ops` | Vehicle marked fixed |

FCM: stranded driver also receives a `DRIVER_UPDATE` with `kind: HANDOVER_RIDER_ASSIGNED`.

## Polling

Handover UI may poll `GET …/handover` every ~15s; socket `handoverRiderAssigned` reduces wait after admin assign.

## Cancel report

There is **no** cancel-report API. The stranded rider should contact branch ops; admin closes reassignment from the delivery portal if needed.