# ADR 0003 — Single Writer and Delivery Outbox

**Status:** Accepted  
**Date:** 2026-07-25

## Context

Delivery controllers today mutate `orders` and call wallet/notification helpers directly. If the delivery service wrote orders itself, transition rules and payment-on-fulfillment would be duplicated (two writers).

A synchronous internal call from delivery → core for every status change is correct but blocks the driver if core is down.

## Decision

- Delivery service **never** writes `orders` / `order_status_events` / wallets.
- On deliver/start/fail, delivery commits its own state, returns 200 to the driver, and inserts a row into **`delivery_outbox`** with unique `idempotencyKey` = `(orderId, targetStatus)` (or equivalent).
- A retry worker POSTs to core backend **`/api/internal/delivery/order-status`** (service secret auth).
- Core applies the same transition rules as today (`assertValidStatusTransition`, `paymentStatusOnOrderStatus`, notifications).

## Consequences

- Brief eventual consistency: delivery domain may show `DELIVERED` a few seconds before `orders.status`.
- Admin live views read delivery state; alert if outbox age > 5 minutes.
- No message broker required — DB-backed outbox is enough at this scale.
