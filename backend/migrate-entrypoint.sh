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

# Prefer DIRECT_URL (plain Postgres). Never run migrate deploy through PgBouncer
# transaction pooling — advisory locks / DDL break there.
if [ -n "${DIRECT_URL:-}" ]; then
  export DATABASE_URL="$DIRECT_URL"
  echo "[migrate] Using DIRECT_URL (direct Postgres, not PgBouncer)"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[migrate] ERROR: DATABASE_URL (or DIRECT_URL) is not set. Cannot run migrations."
  exit 1
fi

case "$DATABASE_URL" in
  *pgbouncer=true*|*@*pgbouncer*)
    echo "[migrate] ERROR: DATABASE_URL points at PgBouncer. Set DIRECT_URL to srv-captain--<postgres>:5432"
    exit 1
    ;;
esac

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
