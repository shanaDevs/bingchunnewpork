#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

API_BASE_URL="${API_BASE_URL:-https://bing-chung-b.mp.dartcodes.com/api}"
EXTRA_DEFINES=()

if [[ -n "${STORE_ID:-}" ]]; then
  EXTRA_DEFINES+=(--dart-define="STORE_ID=${STORE_ID}")
fi

echo "Building release APK → API_BASE_URL=${API_BASE_URL}"

flutter build apk --release \
  --dart-define="API_BASE_URL=${API_BASE_URL}" \
  "${EXTRA_DEFINES[@]}"

APK="build/app/outputs/flutter-apk/app-release.apk"
echo ""
echo "APK ready: ${APK}"
