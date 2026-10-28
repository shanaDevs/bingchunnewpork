#!/bin/sh
# ============================================================
# Bing Chun — Backend API Entrypoint
# ============================================================
# NOTE: Database migrations are NO LONGER run here.
# Migrations are handled exclusively by the bing-chun-migrate
# one-shot CapRover app (backend/migrate-entrypoint.sh) which
# runs BEFORE all services are deployed in CI/CD.
#
# This makes core a pure stateless API server — it can crash
# and restart without affecting the migration state, and all
# other surfaces (shop, pos, admin) are unaffected if core
# goes down.
# ============================================================
set -e

export TZ="${TZ:-Asia/Colombo}"

if [ -n "$DATABASE_URL" ]; then
  echo "[$API_SURFACE] Waiting for database..."
  DB_HOST=$(node -e "process.stdout.write(new URL(process.env.DATABASE_URL).hostname)")
  DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port || (u.protocol.startsWith('postgres') ? '5432' : '3306'))")

  until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    echo "[$API_SURFACE] Database not ready at ${DB_HOST}:${DB_PORT}, retrying..."
    sleep 2
  done
  echo "[$API_SURFACE] Database is ready."
fi

echo "[$API_SURFACE] Starting API server..."
exec node dist/index.js
