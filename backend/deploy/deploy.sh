#!/usr/bin/env bash
# Bing Chun — Backend CapRover deploy
#
# Usage (from backend/deploy folder):
#   ./deploy.sh
#   ./deploy.sh --token YOUR_CAPROVER_APP_TOKEN
#   CAPROVER_APP_TOKEN=your-token ./deploy.sh
#
# Do NOT use sudo — it is not required and can cause permission issues.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BACKEND_DIR")"
DEPLOY_ENV="$SCRIPT_DIR/.env.deploy"
TAR_FILE="$SCRIPT_DIR/backend-deploy.tar"
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
      echo "Token from: CapRover -> bing-chun-backend -> App Configs -> App Token"
      echo "Or set CAPROVER_APP_TOKEN in: $DEPLOY_ENV"
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
CAPROVER_APP="${CAPROVER_APP:-bing-chun-backend}"

APP_URL="https://${CAPROVER_APP}.mp.dartcodes.com"
HEALTH_URL="${APP_URL}/health"

echo ""
echo "============================================="
echo "  Bing Chun — Backend Deploy"
echo "============================================="
echo "  App     : $CAPROVER_APP"
echo "  Server  : $CAPROVER_URL"
echo "  API URL : ${APP_URL}/api"
echo "  Health  : $HEALTH_URL"
echo ""

if [[ -z "$CAPROVER_APP_TOKEN" ]]; then
  echo "  [FAIL] Missing CapRover app token for bing-chun-backend"
  echo ""
  echo "  1. Open CapRover -> Apps -> bing-chun-backend -> App Configs"
  echo "  2. Copy App Token (NOT the same as bing-chun frontend token)"
  echo "  3. Run ONE of:"
  echo ""
  echo "     ./deploy.sh --token PASTE_TOKEN_HERE"
  echo ""
  echo "     Or copy env.deploy.example to .env.deploy and set CAPROVER_APP_TOKEN"
  echo ""
  exit 1
fi

echo "============================================="
echo "  PHASE 1/4  Packaging backend source (monorepo)"
echo "============================================="
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
cp "$REPO_ROOT/packages/db/src" "$STAGE_DIR/packages/db/src" -R
if [[ -f "$REPO_ROOT/packages/db/prisma.config.ts" ]]; then
  cp "$REPO_ROOT/packages/db/prisma.config.ts" "$STAGE_DIR/packages/db/prisma.config.ts"
fi

cp "$REPO_ROOT/packages/delivery-domain/package.json" "$STAGE_DIR/packages/delivery-domain/package.json"
cp "$REPO_ROOT/delivery-service/package.json" "$STAGE_DIR/delivery-service/package.json"
cp "$REPO_ROOT/Frontend/package.json" "$STAGE_DIR/Frontend/package.json"

for dir in src prisma public assets; do
  if [[ -d "$BACKEND_DIR/$dir" ]]; then
    cp -R "$BACKEND_DIR/$dir" "$STAGE_DIR/backend/$dir"
  fi
done
cp "$BACKEND_DIR/package.json" "$STAGE_DIR/backend/package.json"
cp "$BACKEND_DIR/tsconfig.json" "$STAGE_DIR/backend/tsconfig.json"
cp "$BACKEND_DIR/docker-entrypoint.sh" "$STAGE_DIR/backend/docker-entrypoint.sh"
sed -i 's/\r$//' "$STAGE_DIR/backend/docker-entrypoint.sh" 2>/dev/null || \
  sed -i '' 's/\r$//' "$STAGE_DIR/backend/docker-entrypoint.sh" 2>/dev/null || true

PRODUCTS_SRC="$REPO_ROOT/Frontend/public/products"
if [[ ! -d "$PRODUCTS_SRC" ]]; then
  PRODUCTS_SRC="$REPO_ROOT/frontend/public/products"
fi
if [[ -d "$PRODUCTS_SRC" ]]; then
  mkdir -p "$STAGE_DIR/backend/public/products"
  cp -R "$PRODUCTS_SRC/." "$STAGE_DIR/backend/public/products/"
fi

tar -czf "$TAR_FILE" -C "$STAGE_DIR" .
rm -rf "$STAGE_DIR"

TAR_SIZE_MB=$(du -m "$TAR_FILE" | cut -f1)
echo "  [OK] Package ready (${TAR_SIZE_MB} MB)"

echo ""
echo "============================================="
echo "  PHASE 2/4  Uploading package to CapRover"
echo "============================================="
npx -y caprover deploy \
  --caproverUrl "$CAPROVER_URL" \
  --caproverApp "$CAPROVER_APP" \
  --appToken "$CAPROVER_APP_TOKEN" \
  --tarFile "$TAR_FILE"

rm -f "$TAR_FILE"

echo ""
echo "  [OK] Package uploaded"
echo ""
echo "============================================="
echo "  PHASE 3/4  CapRover Docker build (server-side)"
echo "============================================="
echo "  Note: app-token deploys do not stream build logs here."
echo "  Watch live phases: ${CAPROVER_URL}/#/apps/details/${CAPROVER_APP}"
echo "  Expected:"
echo "    PHASE 1/5  System packages"
echo "    PHASE 2/5  npm install"
echo "    PHASE 3/5  Prisma + db build"
echo "    PHASE 4/5  Backend build"
echo "    PHASE 5/5  Runtime image"
echo ""
echo "  API URL : ${APP_URL}/api"
echo "  Monitor : ${CAPROVER_URL}/#/apps/details/${CAPROVER_APP}"
echo ""

echo "============================================="
echo "  PHASE 4/4  Waiting for API health"
echo "============================================="
echo "  Waiting 90s for health check..."
sleep 90
if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "  [OK] API health check passed"
else
  echo "  [WARN] Health check pending — check CapRover logs"
fi
echo ""
echo "============================================="
echo "  [SUCCESS] BACKEND DEPLOY COMPLETE"
echo "============================================="
echo ""
