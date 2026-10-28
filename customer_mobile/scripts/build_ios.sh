#!/usr/bin/env bash
# Build Bing Chun customer app for iPhone (device).
# Requires: Xcode, CocoaPods, Flutter.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ flutter pub get"
flutter pub get

echo "→ pod install"
cd ios
pod install
cd "$ROOT"

# Optional: override API URL for release builds
# flutter build ios --release --dart-define=API_BASE_URL=https://your-api.com/api

if [[ "${1:-}" == "--ipa" ]]; then
  echo "→ flutter build ipa (requires Apple code signing in Xcode)"
  flutter build ipa --release
  echo "✓ IPA: build/ios/ipa/bing_chun_customer.ipa"
else
  echo "→ flutter build ios --release --no-codesign"
  flutter build ios --release --no-codesign
  echo "✓ App bundle: build/ios/iphoneos/Runner.app"
  echo ""
  echo "To install on your iPhone:"
  echo "  1. open ios/Runner.xcworkspace"
  echo "  2. Select your Team under Signing & Capabilities"
  echo "  3. Connect iPhone → Product → Run"
fi
