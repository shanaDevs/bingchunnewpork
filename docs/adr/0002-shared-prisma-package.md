# ADR 0002 — Shared Prisma Package

**Status:** Accepted  
**Date:** 2026-07-25

## Context

Prisma schema lived only under `backend/prisma/`. A second service cannot safely own a copy without diverging. Runtime `$executeRawUnsafe` schema patches race if two processes boot concurrently.

## Decision

1. Move the Prisma schema, migrations, and client factory into **`packages/db`** (`@bingchun/db`).
2. Both `backend` and `delivery-service` depend on `@bingchun/db`.
3. Replace ad-hoc `db push` + boot-time `ensure*()` patches with authoritative Prisma Migrate:
   - Baseline existing production as `0_init` (`migrate resolve --applied`).
   - All new tables/columns go through migrations only.
4. Extract pure delivery logic into **`packages/delivery-domain`** (`@bingchun/delivery-domain`) — moved, not copied.

## Consequences

- Docker build context becomes the repository root for both services.
- Workspace casing (`Frontend` vs `frontend`) must be fixed when workspaces are updated.
- Gate for the move: empty `prisma migrate diff` vs production dump; existing Vitest suites green.
