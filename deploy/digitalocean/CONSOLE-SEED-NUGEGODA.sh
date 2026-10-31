#!/bin/sh
# bingchun-shop → shop-api → Console (one instance). Run after deploy includes commit 7e285b7+.
# DATABASE_URL is already doadmin on shop-api.

set -e
cd /app/backend

echo "=== Pre-flight audit ==="
export SEED_TARGET_STORE_NAME=Nugegoda
npm run audit:nugegoda-seed:prod

echo "=== Seed (30–60+ min) ==="
export TZ=Asia/Colombo
export ALLOW_NUGEGODA_APP_SEED=true
export ALLOW_SEED_ON_LIVE=true
export SEED_TARGET_STORE_NAME=Nugegoda
npm run seed:nugegoda-app:prod

echo "=== Post-run audit ==="
export SEED_TARGET_STORE_NAME=Nugegoda
npm run audit:nugegoda-seed:prod
