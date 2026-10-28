# ADR 0006 — Driver Authentication

**Status:** Accepted  
**Date:** 2026-07-25

## Context

Drivers authenticate with a 4–6 digit PIN and a 7-day access JWT. No refresh rotation, no device binding, no revoke. GPS, cash COD, and earnings raise the bar.

Replacing PIN with phone OTP slows shift start and conflicts with shared branch handsets.

## Decision

1. **Keep PIN login** for shift start.
2. Add **device binding** (`driver_devices`): first login from an unknown `deviceId` requires branch-manager approval (or auto-approve in early rollouts via config).
3. Issue **access + refresh** tokens; rotate refresh on use; store refresh hash on the device row.
4. **Logout / revoke** clears device refresh + FCM token.
5. ~~**Per-driver lockout** after N failed PIN attempts~~ — removed; not needed for current ops.
6. Additive column **`AdminUser.phone`** for future SMS fallback (not required for login in M1–M7).

Drivers remain `AdminUser` with role `DELIVERY_DRIVER` (no separate `Driver` table).

## Consequences

- Slightly more login UX on new devices.
- Existing PIN login API remains compatible; new fields are additive.
- Delivery service owns login/refresh/logout under `/delivery-api/auth/*`; core may still proxy `POST /auth/delivery/login` during migration.
