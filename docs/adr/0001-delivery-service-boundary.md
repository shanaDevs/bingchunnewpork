# ADR 0001 — Delivery Service Boundary

**Status:** Accepted  
**Date:** 2026-07-25  
**Context:** Feature `feature/delivery-service`

## Context

The existing monolith (`backend/`) owns orders, payments, wallets, admin, and delivery jobs. GPS ingest and long-lived driver sockets have a different load profile from order placement. The Flutter driver app ships on its own cadence.

## Decision

Introduce an independently deployable **Delivery Service** (`delivery-service/`, port 4100, CapRover app `bing-chun-delivery`) in this monorepo.

**Ownership contract (single writer per table):**

| Service | Writes |
|---------|--------|
| Core backend | `orders`, `order_status_events`, `wallet_*`, `users`, `admin_users`, `customer_notifications`, catalog, payments |
| Delivery service | `delivery_jobs`, `delivery_job_orders`, `driver_locations`, `driver_shifts`, `driver_devices`, `delivery_attempts`, `delivery_otps`, `delivery_events`, `delivery_outbox` |

Both services read freely. No cross-service database transactions.

Legacy `/api/delivery/*` and `/api/admin/delivery*` remain on the core backend as thin proxies (flag `DELIVERY_SERVICE_ENABLED`) until Milestone 10.

## Consequences

- Second CapRover app and CI build/deploy jobs.
- Shared MySQL + shared JWT secret so driver tokens verify without a network hop.
- Core backend remains source of truth for order status; delivery service pushes intents via outbox (ADR 0003).
