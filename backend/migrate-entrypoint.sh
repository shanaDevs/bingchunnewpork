#!/bin/sh
# ============================================================
# Bing Chun — Migration Entrypoint (one-shot)
# ============================================================
# Runs prisma migrate deploy then exits cleanly.
# Deployed as bing-chun-migrate on CapRover.
# This container is intentionally short-lived.
# ============================================================
set -e

export TZ="${TZ:-Asia/Colombo}"

if [ -z "$DATABASE_URL" ]; then
  echo "[migrate] ERROR: DATABASE_URL is not set. Cannot run migrations."
  exit 1
fi

# Wait for the database to be reachable before running migrations
DB_HOST=$(node -e "process.stdout.write(new URL(process.env.DATABASE_URL).hostname)")
DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port || (u.protocol.startsWith('postgres') ? '5432' : '3306'))")

echo "[migrate] Waiting for database at ${DB_HOST}:${DB_PORT}..."
RETRIES=30
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null || [ "$RETRIES" -eq 0 ]; do
  echo "[migrate] Database not ready, retrying... ($RETRIES attempts left)"
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ "$RETRIES" -eq 0 ]; then
  echo "[migrate] ERROR: Database did not become ready in time."
  exit 1
fi

echo "[migrate] Database is ready. Running Prisma migrations..."

SCHEMA_PATH="/app/packages/db/prisma/schema.prisma"
PRISMA_CLI="/app/node_modules/prisma/build/index.js"
MIGRATIONS_DIR="/app/packages/db/prisma/migrations"
PG_MIGRATIONS_DIR="/app/packages/db/prisma/migrations-pg"

# The historical migrations folder is MySQL SQL. It cannot build an empty
# Postgres database. App Platform uses the generated baseline instead.
case "$DATABASE_URL" in
  postgres://*|postgresql://*)
    if [ ! -d "$PG_MIGRATIONS_DIR" ]; then
      echo "[migrate] ERROR: Postgres migrations not found at $PG_MIGRATIONS_DIR"
      exit 1
    fi
    HAS_USERS=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAqc "SELECT CASE WHEN to_regclass('public.users') IS NULL THEN 'f' ELSE 't' END")
    if [ "$HAS_USERS" != "t" ]; then
      echo "[migrate] Postgres has no application tables. Clearing the failed migration record."
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS public."_prisma_migrations";'
    fi
    rm -rf "$MIGRATIONS_DIR"
    cp -a "$PG_MIGRATIONS_DIR" "$MIGRATIONS_DIR"
    ;;
esac

if [ ! -f "$SCHEMA_PATH" ]; then
  echo "[migrate] ERROR: Prisma schema not found at $SCHEMA_PATH"
  exit 1
fi

if [ ! -f "$PRISMA_CLI" ]; then
  echo "[migrate] ERROR: Prisma CLI not found at $PRISMA_CLI"
  exit 1
fi

node "$PRISMA_CLI" migrate deploy --schema="$SCHEMA_PATH"

echo "[migrate] ✅ Migrations applied successfully. Container will now exit."
exit 0
