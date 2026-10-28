# ADR 0005 — Delivery State vs OrderStatus

**Status:** Accepted  
**Date:** 2026-07-25

## Context

Richer delivery UX (OTP pending, failed attempt, returned to store) needs more states. Extending the Prisma `OrderStatus` enum would break web steppers, customer mobile mappings, admin filters, and analytics.

## Decision

Keep **`OrderStatus` unchanged**. Introduce a parallel **delivery-domain state** on delivery-owned tables / events:

`PENDING_ASSIGNMENT → ASSIGNED → PICKED_UP → EN_ROUTE → ARRIVED → AWAITING_OTP → DELIVERED`  
Failures: `FAILED → RETURNED_TO_STORE` or retry `EN_ROUTE`.

Mapping to orders via outbox:

| Delivery state | OrderStatus |
|----------------|-------------|
| Most in-progress states | `OUT_FOR_DELIVERY` |
| `DELIVERED` | `DELIVERED` |
| Cancelled / returned (business rule) | `CANCELLED` when applicable |

OTP was originally gated by `Store.deliveryOtpRequired` (default `false`). Since 2026-07-25 the
customer code is required on every branch (`DELIVERY_OTP_REQUIRED`, default `true`) and the store
flag can only add the requirement — see docs/27_Delivery_Service.md.

## Consequences

- Existing clients keep working without code changes.
- New clients opt into `deliveryState` / `delivery_events`.
- Schema changes stay additive.
