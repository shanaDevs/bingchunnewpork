#!/usr/bin/env bash
# Bing Chun — Delivery Service CapRover deploy
#
# Usage (from delivery-service/deploy folder):
#   ./deploy.sh
#   ./deploy.sh --token YOUR_CAPROVER_APP_TOKEN
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$SERVICE_DIR")"
DEPLOY_ENV="$SCRIPT_DIR/.env.deploy"
if [[ ! -f "$DEPLOY_ENV" ]]; then
  DEPLOY_ENV="$SCRIPT_DIR/.env"
fi
TAR_FILE="$SCRIPT_DIR/delivery-deploy.tar"
STAGE_DIR="$SCRIPT_DIR/.deploy-stage"

CAPROVER_URL=""
CAPROVER_APP=""
CAPROVER_APP_TOKEN=""

if [[ -f "$DEPLOY_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV"
  set +a
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token|-t)
      CAPROVER_APP_TOKEN="${2:-}"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--token CAPROVER_APP_TOKEN]"
      echo ""
      echo "Token from: CapRover -> bing-chun-delivery -> App Configs -> App Token"
      exit 0
      ;;
    *)
      if [[ -z "$CAPROVER_APP_TOKEN" ]]; then
        CAPROVER_APP_TOKEN="$1"
      fi
      shift
      ;;
  esac
done

CAPROVER_URL="${CAPROVER_URL:-https://captain.mp.dartcodes.com}"
CAPROVER_APP="${CAPROVER_APP:-bing-chun-delivery}"

APP_URL="https://${CAPROVER_APP}.mp.dartcodes.com"
HEALTH_URL="${APP_URL}/health"

echo ""
echo "============================================="
echo "  Bing Chun — Delivery Service Deploy"
echo "============================================="
echo "  App     : $CAPROVER_APP"
echo "  Server  : $CAPROVER_URL"
echo "  API URL : ${APP_URL}/delivery-api"
echo "  Health  : $HEALTH_URL"
echo ""

if [[ -z "$CAPROVER_APP_TOKEN" ]]; then
  echo "  [FAIL] Missing CapRover app token for bing-chun-delivery"
  echo ""
  echo "  1. Open CapRover -> Apps -> bing-chun-delivery -> App Configs"
  echo "  2. Copy App Token"
  echo "  3. Run: ./deploy.sh --token PASTE_TOKEN_HERE"
  echo "     Or copy env.deploy.example to .env.deploy"
  exit 1
fi

echo "STEP 1/2  Packaging delivery-service source..."
rm -f "$TAR_FILE"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cp "$SCRIPT_DIR/Dockerfile" "$STAGE_DIR/Dockerfile"
cp "$SCRIPT_DIR/captain-definition" "$STAGE_DIR/captain-definition"

cp "$REPO_ROOT/package.json" "$STAGE_DIR/package.json"
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  cp "$REPO_ROOT/package-lock.json" "$STAGE_DIR/package-lock.json"
fi

mkdir -p "$STAGE_DIR/packages/db" "$STAGE_DIR/packages/delivery-domain"
mkdir -p "$STAGE_DIR/backend" "$STAGE_DIR/delivery-service" "$STAGE_DIR/Frontend"

cp "$REPO_ROOT/packages/db/package.json" "$STAGE_DIR/packages/db/package.json"
cp -R "$REPO_ROOT/packages/db/prisma" "$STAGE_DIR/packages/db/prisma"
cp "$REPO_ROOT/packages/db/tsconfig.json" "$STAGE_DIR/packages/db/tsconfig.json"
cp -R "$REPO_ROOT/packages/db/src" "$STAGE_DIR/packages/db/src"
if [[ -f "$REPO_ROOT/packages/db/prisma.config.ts" ]]; then
  cp "$REPO_ROOT/packages/db/prisma.config.ts" "$STAGE_DIR/packages/db/prisma.config.ts"
fi

cp "$REPO_ROOT/packages/delivery-domain/package.json" "$STAGE_DIR/packages/delivery-domain/package.json"
cp "$REPO_ROOT/packages/delivery-domain/tsconfig.json" "$STAGE_DIR/packages/delivery-domain/tsconfig.json"
cp -R "$REPO_ROOT/packages/delivery-domain/src" "$STAGE_DIR/packages/delivery-domain/src"

cp "$REPO_ROOT/backend/package.json" "$STAGE_DIR/backend/package.json"
cp "$REPO_ROOT/Frontend/package.json" "$STAGE_DIR/Frontend/package.json"

cp -R "$SERVICE_DIR/src" "$STAGE_DIR/delivery-service/src"
cp "$SERVICE_DIR/package.json" "$STAGE_DIR/delivery-service/package.json"
cp "$SERVICE_DIR/tsconfig.json" "$STAGE_DIR/delivery-service/tsconfig.json"
cp "$SERVICE_DIR/docker-entrypoint.sh" "$STAGE_DIR/delivery-service/docker-entrypoint.sh"
sed -i 's/\r$//' "$STAGE_DIR/delivery-service/docker-entrypoint.sh" 2>/dev/null || \
  sed -i '' 's/\r$//' "$STAGE_DIR/delivery-service/docker-entrypoint.sh" 2>/dev/null || true

tar -czf "$TAR_FILE" -C "$STAGE_DIR" .
rm -rf "$STAGE_DIR"
echo "  [OK] Package ready"

echo "STEP 2/2  Uploading to CapRover..."
npx -y caprover deploy \
  --caproverUrl "$CAPROVER_URL" \
  --caproverApp "$CAPROVER_APP" \
  --appToken "$CAPROVER_APP_TOKEN" \
  --tarFile "$TAR_FILE"

rm -f "$TAR_FILE"

echo ""
echo "  [SUCCESS] Delivery service deploy uploaded"
echo "  Monitor : ${CAPROVER_URL}/#/apps/details/${CAPROVER_APP}"
echo ""
echo "  Set in CapRover App Configs:"
echo "    Container HTTP Port = 4100  (HTTP Settings tab)"
echo "    DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET"
echo "    CORE_API_URL=https://bing-chung-b.mp.dartcodes.com"
echo "    INTERNAL_SERVICE_SECRET=<same as backend>"
echo "    DELIVERY_PORT=4100"
echo "    NODE_ENV=production"
echo ""
