# ADR 0004 — Socket Fan-out and EventPublisher

**Status:** Accepted  
**Date:** 2026-07-25

## Context

Socket.IO runs on a single node with no auth. Customers connect to the core backend. Live GPS must reach those rooms without forcing a second socket connection.

## Decision

1. Introduce **`EventPublisher`** interface:
   - `RedisAdapterPublisher` — both services use `@socket.io/redis-adapter` when `REDIS_URL` is set.
   - `HttpRelayPublisher` — delivery service POSTs to core `/api/internal/socket/emit` when Redis is absent (local/dev fallback).
2. Delivery service owns namespace **`/delivery`** with JWT in handshake `auth.token`.
3. New events (additive only): `driverLocation`, `deliveryState`, `etaUpdate`, `deliveryJobUpdated`, `jobAssigned`, `jobCancelled`.
4. Live GPS is emitted only into `order:{uuid}` (never guessable order numbers) and requires a tracking token where applicable.

## Consequences

- Redis is an optimisation, not a launch blocker.
- Multi-replica becomes possible once Redis is provisioned.
- Legacy `joinUser` / `joinAdmin` remain until M10, then require JWT.
