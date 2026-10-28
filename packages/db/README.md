# `@bingchun/db`

Shared Prisma schema and client for Bing Chun core backend and delivery-service.

## Schema location

`prisma/schema.prisma` is the single source of truth. Do not edit a schema under `backend/prisma/`.

## Baseline for existing databases

Production (and long-lived local DBs) already have tables created via legacy flat SQL and boot-time `ensure*` patches.

1. Mark history as applied for any baseline migration you introduce (when present), e.g.:
   ```bash
   npx prisma migrate resolve --applied <baseline_migration_name> -w @bingchun/db
   ```
2. Apply only the additive delivery extensions:
   ```bash
   npm run prisma:deploy -w @bingchun/db
   ```
   That runs `prisma/migrations/20260725120000_delivery_service_extensions`.

Fresh environments can use `prisma migrate deploy` (or `prisma:migrate` in development) against an empty MySQL once a full baseline migration exists.

## Legacy SQL archive

Older one-off SQL scripts live under `prisma/legacy-sql-migrations/`. They are historical reference only — do not run them on databases that already applied those changes. New schema changes go through Prisma Migrate only.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run prisma:generate -w @bingchun/db` | Generate Prisma Client |
| `npm run prisma:migrate -w @bingchun/db` | Dev migrate |
| `npm run prisma:deploy -w @bingchun/db` | Apply pending migrations |
| `npm run prisma:push -w @bingchun/db` | Push schema (dev only) |
| `npm run build -w @bingchun/db` | Compile `src/` → `dist/` |
