# 28 — Flutter Driver App

**Status:** Legacy / deferred — production rider app is **`driver_android`** (Kotlin Compose). See [33_Driver_App_Design.md](33_Driver_App_Design.md).  
**Codebase:** [`mobile/`](../mobile/) (`bing_chun_delivery`) — FCM and full-screen alerts are **not** wired here.  
**Related:** [27 Delivery Service](27_Delivery_Service.md), [ADR 0006](adr/0006-driver-authentication.md)

## Purpose

Branch delivery staff app (Flutter target): PIN login, claim/start/complete jobs, optimized routes, live GPS while on a job, OTP/photo proof (when enabled), history and push notifications.

**Ride lifecycle (implemented in `driver_android`):** Online → full-screen NEW DELIVERY RIDE alert → Accept → Pickup → Start → deliver each order with PIN → RETURNING (alerts ring again) → return to branch within radius → Complete Ride → store actual route/km/time.

## Target stack

| Concern | Library |
|---------|---------|
| State | Riverpod |
| Routing | GoRouter |
| HTTP | Dio (+ auth/retry interceptors) |
| Realtime | socket_io_client → Delivery Service `/delivery` |
| Push | Firebase Messaging + local notifications |
| Maps UI | Google Maps Flutter (render); turn-by-turn via `url_launcher` |
| Location | geolocator + foreground task (active job only) |
| Offline GPS | Hive queue → `POST /locations/batch` |

## Clean Architecture layout

```
mobile/lib/
  core/          config, di, network, router, theme, storage, permissions
  features/
    auth/        data | domain | presentation
    jobs/
    route/
    tracking/
    proof/
    profile/
  shared/        widgets, formatters
```

## Migration approach

Refactor **in place**. Keep the app runnable every commit:

1. Introduce `core/` + Dio wrapping existing APIs.
2. Move auth / jobs / route into feature modules.
3. Point API base at Delivery Service when enabled (fallback to core `/api/delivery`).
4. Add tracking, proof, profile features.
5. Swap map to Google Maps behind a build flag; remove `flutter_map` after device QA.

## Privacy

GPS is collected only while a job is `IN_PROGRESS`, with a foreground notification. Retention is controlled server-side (`GPS_RETENTION_DAYS`).

## M8 progress (this change)

Refactored in place, keeping the app runnable at every step. No screens were deleted.

- **`pubspec.yaml`** — added `dio`, `socket_io_client`, `firebase_core`, `firebase_messaging`, `flutter_local_notifications`, `google_maps_flutter`, `geolocator`, `permission_handler`, `connectivity_plus`, `hive`/`hive_flutter`, `flutter_foreground_task` (kept `flutter_map` for now, per plan). Dependency resolution was verified by temporarily lowering the `sdk:` constraint to match the sandbox's installed Flutter (3.32.5 / Dart 3.8.1) — all packages resolved with zero conflicts — then reverted; the committed constraint stays `^3.12.0` to match the rest of the repo (`customer_mobile` uses the same pin, targeting a newer Flutter than is installed in this sandbox), so `flutter pub get` still fails here on SDK version, unrelated to this change.
- **`core/`** — new home for cross-cutting concerns:
  - `config/env.dart` — resolves core (`API_BASE_URL`) and Delivery Service (`DELIVERY_API_BASE_URL`, else same host on `:4100/delivery-api` in debug) base URLs from `String.fromEnvironment`.
  - `network/dio_client.dart` — Dio wrapper with a Bearer-token interceptor (reads `core/storage/secure_storage.dart`), unwraps the `{ success, data, message, code }` envelope, throws `ApiException`. `DioClient.core()` / `DioClient.delivery()` factories pick the right base URL.
  - `network/api_exception.dart` — moved `ApiException` here (now carries an optional `code`, plus `isOtpRequired`).
  - `router/app_router.dart` — `GoRouter` construction moved out of `app.dart`.
  - `storage/secure_storage.dart` — single source of truth for the token/driver secure-storage keys.
- **`features/`**:
  - `auth/data/auth_repository.dart` — login/token/session I/O against `/auth/delivery/*`, built on `DioClient.core()`. `services/auth_service.dart` is now a thin back-compat wrapper so `providers/auth_provider.dart` didn't need to change its call sites.
  - `auth/presentation/login_screen.dart` — re-exports the existing `screens/login_screen.dart` (screen itself not yet moved, to avoid a risky mass-move in one pass).
  - `jobs/data/jobs_repository.dart` — job list/detail/assign/start/complete + order status updates, built on `DioClient.core()` (still core backend routes; swapping to `DioClient.delivery()` is a one-line change once the Delivery Service owns this surface). `services/job_service.dart` now delegates here (keeping its `kUiPreviewMode` mock-data branch for UI-only dev).
  - `tracking/data/socket_service.dart` — connects to the Delivery Service `/delivery` socket namespace with the driver JWT in `auth.token`; `emitLocation` / `goOnline` / `goOffline` plus a generic `on`/`off` for `jobAssigned` / `jobCancelled` / `deliveryJobUpdated`.
  - `tracking/data/location_service.dart` — `geolocator`-based position stream while a job is active; emits over the socket when connected, otherwise queues points in memory and drains them via `POST /locations/batch` (`flushBatch()`, called from `stopTracking()`).
  - `proof/presentation/otp_sheet.dart` — `showOtpSheet(context)` bottom sheet for entering the customer's delivery OTP.
- **Wiring**: `providers/jobs_provider.dart`'s `DashboardNotifier.start()`/`complete()` now start/stop GPS tracking and go online/offline on the socket around the delivery run. `screens/order_detail_screen.dart`'s status-update flow opens the OTP sheet and retries the update when `ApiException.isOtpRequired` is true (server-side OTP enforcement itself is not built yet — this is client-side plumbing for when M6 lands).
- Old `services/api_client.dart` now wraps `DioClient.core()` and re-exports `ApiException`, so it keeps working as a deprecated shim for any remaining call sites.
