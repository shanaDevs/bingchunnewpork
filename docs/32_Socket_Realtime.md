# 32 — Socket.IO Realtime Usage

**Status:** Implemented  
**Date:** 2026-08-22  
**Related:** [06 API](06_API_Documentation.md) · [27 Delivery Service](27_Delivery_Service.md) · [ADR 0004](adr/0004-socket-fanout-event-publisher.md)

This system **does use Socket.IO** (WebSocket with HTTP long-polling fallback). HTTP is still used for create/update/query. Sockets are used so the UI does not wait for the next poll when something important changes.

Typical latency target: **seconds, not minutes** — new order ding at the branch, order status on the customer phone, a new job popping on the driver app, live GPS on the map.

---

## Why sockets exist here

Without sockets, every client would poll REST every few seconds. That is slower, more load on MySQL, and easy to miss (a driver claim, a stock-out toast, a delivery OTP). Socket.IO keeps a long-lived connection and the **server pushes** into **rooms**.

| Channel | Role |
|---------|------|
| REST `/api` | Source of truth — place order, claim job, change duty, verify OTP |
| Socket.IO | Fan-out — tell the right people immediately |
| FCM / SMS | Backup when the app is backgrounded or the socket is down |

If the socket fails, most screens still work via REST polling. The socket is an accelerator, not the only path.

---

## Two Socket.IO servers

```
Customer web / Customer Flutter  ──┐
Admin web (branch + live map)    ──┼──►  Core backend :4000   default namespace `/`
Kotlin driver app                ──┘         rooms: user / admin / store / order / branch-pool

Flutter driver app (legacy `mobile/`) ──►  Delivery service :4100   namespace `/delivery`
                                              rooms: driver:{id}, store:{id}
                                              then EventPublisher → core rooms
```

**Today (core is authoritative):** the Kotlin driver app (`driver_android`) and all customer/admin web clients talk to the **core** socket. The delivery-service `/delivery` namespace is kept for the Flutter driver app and future cutover (`DELIVERY_SERVICE_ENABLED`). See [27_Delivery_Service.md](27_Delivery_Service.md).

Connect URL:

| Client | Origin |
|--------|--------|
| Next.js web | `NEXT_PUBLIC_SOCKET_URL` (fallback: backend origin, default `http://localhost:4000`) |
| Customer Flutter | `ApiConfig.serverBaseUrl` |
| Kotlin driver | `AppConfig.coreSocketOrigin` |
| Path | `/socket.io` |
| Transports | `websocket`, then `polling` |

---

## Who connects, and why

### 1. Customer (web + Flutter)

**Join**

| Client event | Room | When |
|--------------|------|------|
| `joinUser` | `user:{userId}` | After login — notifications for *this* account |
| `trackOrder` | `order:{id}` or `order:{orderNumber}` | Tracking page / live map |

**What they receive**

| Event | Meaning | UI effect |
|-------|---------|-----------|
| `orderStatus` | Kitchen / delivery status changed | Tracking page updates; cache patched |
| `orderStatusUpdate` | Same, sent to the user room | Order list / toast |
| `customerNotification` | Bell item (status, pickup soon, OTP, etc.) | Toast + notification inbox |
| `queueUpdate` | Takeaway queue position / scheduled pickup | Queue number on tracking |
| `pickupSoon` | Pickup window is close | Toast |
| `deliveryCode` | 4–8 digit OTP to read to the rider | Shown on tracking; SMS/push also sent |
| `driverLocation` | Live GPS while the job is in progress | Live delivery map |
| `deliveryState` | Delivery-run state (ADR 0005) | Tracking subtitle |
| `etaUpdate` | ETA minutes / timestamp | Map / tracking |

On `trackOrder`, the server also **catches up** immediately: it looks up the order and emits the current `orderStatus` + `queueUpdate` so a reconnect does not wait for the next HTTP poll. Lookups are throttled (5 s TTL) to protect Prisma during reconnect storms.

**Source**

- Server: `backend/src/lib/socket.ts`, `backend/src/lib/customerNotifications.ts`
- Web: `Frontend/src/lib/socketClient.ts`, `Frontend/src/hooks/useCustomerSocket.ts`, `Frontend/src/components/order/LiveDeliveryMap.tsx`
- Flutter: `customer_mobile/lib/services/order_socket_service.dart`

---

### 2. Branch / admin (web)

**Join:** `joinAdmin` → `admin:{adminId}` and optionally `store:{storeId}`.

**What they receive**

| Event | Room | Meaning | UI effect |
|-------|------|---------|-----------|
| `adminNotification` | `admin:{id}` | Personal alert (new order, new product, …) | Bell + sound |
| `storeNewOrder` | `store:{id}` | A new order landed at this branch | New-order toast / audio loop |
| `storeNewProduct` | `store:{id}` | Super-admin released a product | Product toast |
| `stock:updated` | `store:{id}` | Weekly / online qty changed | Stock tables refresh in place |
| `stock:low-warning` | `store:{id}` | Crossing low threshold | Warning toast |
| `stock:out-of-stock` | `store:{id}` | Sold out | Error toast |
| `takeawayQueueUpdated` | `store:{id}` | Takeaway queue changed | Queue screen refresh |
| `driverLocation` | `store:{id}` | Rider GPS | Admin live map |
| `driverDutyChanged` | `store:{id}` | ON_DUTY / OFF_DUTY / ON_DELIVERY | Drivers panel |

**Source**

- Emit: `backend/src/lib/branchNotifications.ts`, `backend/src/lib/batchStockEngine.ts`, `backend/src/lib/socket.ts`
- Listen: `Frontend/src/contexts/AdminNotificationProvider.tsx`, `Frontend/src/app/admin/delivery/live/page.tsx`, `Frontend/src/components/admin/AdminDriversPanel.tsx`

---

### 3. Delivery driver (Kotlin app → core)

Handshake JWT (`auth.token`) with `type: admin`, `role: DELIVERY_DRIVER`. On connect the socket auto-joins `driver:{id}` and `store:{storeId}` if present.

**Join / emit**

| Client event | Purpose |
|--------------|---------|
| `joinBranchPool` `{ storeIds }` | Join `branch-pool:{storeId}` so new jobs reach this phone |
| `driver:location` | GPS fix (lat/lng, heading, speed, jobId, recordedAt) |
| `driver:online` / `driver:offline` | Legacy shift hints (duty itself is `PATCH /delivery/me/duty`) |

**What they receive**

| Event | Meaning | UI effect |
|-------|---------|-----------|
| `newDeliveryJob` | Branch created / re-broadcast a job | Full-screen / heads-up alert + job list. Payload includes `rideCode`, `totalCups`, `estimatedDistanceKm`, `estimatedMinutes`, `deliveryFee`, `orderCount`, `storeName`. Ringing is client-gated: muted while ASSIGNED/IN_PROGRESS, active again during RETURNING. |
| `deliveryJobClaimed` | Another driver took it | Remove from available list |

GPS ingest on core (`ingestDriverLocation`):

1. Persist a `driver_locations` row only if the rider moved ≥ 50 m **or** ≥ 60 s passed (avoids flooding MySQL).
2. Emit `driverLocation` to `store:{storeId}` (admin live map) and each `order:{orderId}` on the active job (customer map).

FCM `newDeliveryJob` still fires so the alert lands if the socket is down. See `backend/src/lib/driverPush.ts`.

**Source:** `driver_android/.../tracking/DeliverySocket.kt`, `backend/src/lib/socket.ts`, `backend/src/controllers/deliveryJobController.ts`.

---

### 4. Delivery service `/delivery` (optional / Flutter driver)

JWT required at handshake. Same GPS / online / offline events. Locations are cached, then **EventPublisher** pushes `driverLocation` into core rooms so customers and admin do not open a second socket.

When `REDIS_URL` is absent (local/dev), publisher POSTs `POST /api/internal/socket/emit` on core. Redis adapter is the planned multi-replica path ([ADR 0004](adr/0004-socket-fanout-event-publisher.md)) and currently falls back to HTTP relay.

Also published from delivery-service (when that service owns the write): `deliveryJobClaimed`, `deliveryJobUpdated`.

---

## Rooms (who hears what)

| Room | Joined by | Typical events |
|------|-----------|----------------|
| `user:{userId}` | Logged-in customer | `customerNotification`, `orderStatusUpdate`, `deliveryCode`, `pickupSoon` |
| `order:{orderId}` | Anyone tracking that order | `orderStatus`, `queueUpdate`, `driverLocation`, `deliveryCode` |
| `order:{orderNumber}` | Same, for clients that only have the human number | Same as above |
| `admin:{adminId}` | Logged-in staff | `adminNotification` |
| `store:{storeId}` | Staff of that branch; driver handshake | New order, stock, duty, live GPS, takeaway queue |
| `branch-pool:{storeId}` | On-duty drivers covering that branch | `newDeliveryJob`, `deliveryJobClaimed` |
| `driver:{driverId}` | That driver’s socket | Reserved / driver-scoped |

---

## End-to-end examples

### New dine-in / takeaway / delivery order

1. Customer places order (REST).
2. Core writes the order, then `branchNotifications` emits `storeNewOrder` + `adminNotification`.
3. Branch tablet plays the new-order sound without refresh.
4. Customer tracking page already in `order:{id}` gets `orderStatus: RECEIVED`.

### Kitchen moves PREPARE → READY

1. Admin patches status (REST).
2. `notifyCustomerOrderStatus` emits `orderStatus` + `customerNotification` and may SMS / FCM.
3. Customer sees READY immediately; pickup-soon later uses `pickupSoon`.

### Branch creates a delivery job

1. Admin creates job (REST) → `broadcastNewJob` → `newDeliveryJob` on `branch-pool:{storeId}`.
2. Eligible drivers’ phones alert; first claim (REST) → `deliveryJobClaimed` so others drop it.
3. Reject before pickup re-broadcasts `newDeliveryJob`.

### Live map while out for delivery

1. Driver app samples GPS → `driver:location`.
2. Core stores a thinned trail and emits `driverLocation` to the store + those order rooms.
3. Customer map (`LiveDeliveryMap`) and `/admin/delivery/live` move the marker.

### Delivery OTP

1. Job start issues a code. Core sends SMS, in-app notification, and `deliveryCode` to order + user rooms.
2. Customer reads the code to the rider. Rider submits it over REST. Socket is only the push channel.

---

## Authentication

Handshake: `auth.token` (JWT) or `Authorization: Bearer …`.

| Env | Behaviour |
|-----|-----------|
| `SOCKET_AUTH_ENFORCED=true` (production default) | `trackOrder` requires `resolveOrderAccess` (owner JWT or track token); `joinUser` / `joinAdmin` / `joinBranchPool` rejected unless JWT matches |
| Unset in non-production | May allow deprecated unauthenticated joins (local/dev only) |
| `SOCKET_AUTH_ENFORCED=false` in production | **Process refuses to start** (`assertProductionSecrets`) |

**CapRover / production:** leave `SOCKET_AUTH_ENFORCED` unset or set `true` on the core API app. After deploy, smoke-test: wrong `joinUser` id → `socketError` `UNAUTHORIZED`; `trackOrder` without token → no room join.

Driver GPS (`driver:location`) always requires a handshake JWT with `DELIVERY_DRIVER`. Delivery-service `/delivery` always requires JWT.

Internal relay `POST /api/internal/socket/emit` is service-to-service (not a public client API).

---

## Source map

| Area | File |
|------|------|
| Core Socket.IO init, rooms, GPS ingest, job broadcasts | `backend/src/lib/socket.ts` |
| Customer status / OTP / pickup-soon emits | `backend/src/lib/customerNotifications.ts` |
| Branch new-order / new-product emits | `backend/src/lib/branchNotifications.ts` |
| Stock live events | `backend/src/lib/batchStockEngine.ts` |
| HTTP relay from delivery-service | `backend/src/controllers/internalController.ts` |
| Web customer singleton | `Frontend/src/lib/socketClient.ts` |
| Web customer hooks | `Frontend/src/hooks/useCustomerSocket.ts` |
| Web admin alerts | `Frontend/src/contexts/AdminNotificationProvider.tsx` |
| Delivery-service `/delivery` | `delivery-service/src/sockets/index.ts` |
| Fan-out to core rooms | `delivery-service/src/sockets/eventPublisher.ts` |
| Kotlin driver | `driver_android/.../tracking/DeliverySocket.kt` |
| Customer Flutter | `customer_mobile/lib/services/order_socket_service.dart` |

---

## What sockets are *not* for

- Placing or paying for an order
- Claiming a job, changing duty, or verifying OTP (those stay REST)
- A replacement for FCM when the app is killed
- Multi-replica fan-out by themselves — that needs the Redis adapter (not wired yet; HTTP relay is the current cross-service path)
