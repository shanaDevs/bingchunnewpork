#!/usr/bin/env bash
# Bing Chun — Frontend local build + CapRover deploy (macOS / Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_ENV="$SCRIPT_DIR/.env.deploy"
TAR_FILE="$SCRIPT_DIR/frontend-prebuilt-deploy.tar"
STAGE_DIR="$SCRIPT_DIR/.deploy-stage"

CAPROVER_URL="${CAPROVER_URL:-https://captain.mp.dartcodes.com}"
CAPROVER_APP="${CAPROVER_APP:-bing-chung}"
CAPROVER_APP_TOKEN="${CAPROVER_APP_TOKEN:-}"
API_URL="${API_URL:-https://bing-chung-b.mp.dartcodes.com/api}"

if [[ -f "$DEPLOY_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$DEPLOY_ENV"
  set +a
fi

BACKEND_URL="${BACKEND_URL:-${API_URL%/api}}"

APP_URL="https://${CAPROVER_APP}.mp.dartcodes.com"

echo ""
echo "============================================="
echo "  Bing Chun — Frontend Deploy"
echo "============================================="
echo "  App     : $CAPROVER_APP"
echo "  Server  : $CAPROVER_URL"
echo "  API URL : $API_URL"
echo "  Backend : $BACKEND_URL"
echo "  Live at : $APP_URL"
echo ""

if [[ -z "$CAPROVER_APP_TOKEN" ]]; then
  echo "  [FAIL] Set CAPROVER_APP_TOKEN in deploy/.env.deploy"
  exit 1
fi

echo "STEP 1/4  Writing .env.production"
cat > "$FRONTEND_DIR/.env.production" <<EOF
NEXT_PUBLIC_API_URL=/api
BACKEND_URL=$BACKEND_URL
API_PROXY_URL=$BACKEND_URL
NEXT_PUBLIC_SOCKET_URL=$BACKEND_URL
EOF

echo "STEP 2/4  Building Next.js"
cd "$FRONTEND_DIR"
export NEXT_PUBLIC_API_URL="/api"
export BACKEND_URL="$BACKEND_URL"
export API_PROXY_URL="$BACKEND_URL"
export NEXT_PUBLIC_SOCKET_URL="$BACKEND_URL"
npm run build

if [[ ! -d "$FRONTEND_DIR/.next/standalone" ]]; then
  echo "  [FAIL] .next/standalone not found — ensure output: 'standalone' in next.config.ts"
  exit 1
fi

if [[ -f "$FRONTEND_DIR/.next/standalone/Frontend/server.js" ]]; then
  echo "  [OK] Standalone: Frontend/server.js"
elif [[ -f "$FRONTEND_DIR/.next/standalone/frontend/server.js" ]]; then
  echo "  [OK] Standalone: frontend/server.js"
elif [[ -f "$FRONTEND_DIR/.next/standalone/server.js" ]]; then
  echo "  [OK] Standalone: server.js"
else
  echo "  [FAIL] server.js missing from standalone output"
  echo "  Check outputFileTracingRoot in next.config.ts"
  ls -la "$FRONTEND_DIR/.next/standalone" || true
  exit 1
fi

echo "STEP 3/4  Packaging"
rm -f "$TAR_FILE"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/.next"

cp "$SCRIPT_DIR/Dockerfile.prebuilt" "$STAGE_DIR/Dockerfile"
cp "$SCRIPT_DIR/captain-definition" "$STAGE_DIR/captain-definition"
cp -R "$FRONTEND_DIR/.next/standalone" "$STAGE_DIR/.next/standalone"
cp -R "$FRONTEND_DIR/.next/static" "$STAGE_DIR/.next/static"
cp -R "$FRONTEND_DIR/public" "$STAGE_DIR/public"

tar -czf "$TAR_FILE" -C "$STAGE_DIR" .
rm -rf "$STAGE_DIR"

echo "STEP 4/4  Uploading to CapRover"
npx -y caprover deploy \
  --caproverUrl "$CAPROVER_URL" \
  --caproverApp "$CAPROVER_APP" \
  --appToken "$CAPROVER_APP_TOKEN" \
  --tarFile "$TAR_FILE"

rm -f "$TAR_FILE" "$FRONTEND_DIR/.env.production"

echo ""
echo "  [SUCCESS] Deploy complete: $APP_URL"
echo ""
