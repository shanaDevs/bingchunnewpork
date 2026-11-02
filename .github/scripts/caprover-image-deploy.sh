#!/usr/bin/env bash
# Deploy a pre-built GHCR image to CapRover with retries (handles transient 502s).
set -euo pipefail

APP_NAME="${1:?CapRover app name required}"
IMAGE="${2:?Image reference required (e.g. ghcr.io/org/repo/app:sha)}"
TOKEN_RAW="${3:?CapRover app token required}"
CAPROVER_URL="${CAPROVER_URL:?CAPROVER_URL env var required}"

TOKEN="$(printf '%s' "$TOKEN_RAW" | tr -d '[:space:]' | tr -d '"' | tr -d "'")"
if [ -z "$TOKEN" ]; then
  echo "Missing or empty CapRover app token for $APP_NAME"
  exit 1
fi

STAGE="/tmp/${APP_NAME}-stage"
TAR_FILE="/tmp/${APP_NAME}-deploy.tar"
rm -rf "$STAGE"
mkdir -p "$STAGE"
printf '{"schemaVersion":2,"imageName":"%s"}\n' "$IMAGE" > "$STAGE/captain-definition"
tar -czf "$TAR_FILE" -C "$STAGE" .

MAX_ATTEMPTS=5
DELAY=30

echo "Deploying $IMAGE to $APP_NAME at $CAPROVER_URL"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "Deploy attempt $attempt of $MAX_ATTEMPTS..."
  if npx -y caprover@2.2.3 deploy \
    --caproverUrl "$CAPROVER_URL" \
    --caproverApp "$APP_NAME" \
    --appToken "$TOKEN" \
    --tarFile "$TAR_FILE"; then
    echo "Deploy to $APP_NAME succeeded."
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    echo "Deploy failed (often a transient CapRover 502). Waiting ${DELAY}s before retry..."
    sleep "$DELAY"
    DELAY=$((DELAY * 2))
  fi
done

echo "Deploy to $APP_NAME failed after $MAX_ATTEMPTS attempts."
exit 1
