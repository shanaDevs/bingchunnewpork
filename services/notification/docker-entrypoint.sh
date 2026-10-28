#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for database..."
  DB_HOST=$(node -e "process.stdout.write(new URL(process.env.DATABASE_URL).hostname)")
  DB_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port || (u.protocol.startsWith('postgres') ? '5432' : '3306'))")

  until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    echo "Database not ready at ${DB_HOST}:${DB_PORT}, retrying..."
    sleep 2
  done
  echo "Database is ready."
fi

exec node dist/index.js
