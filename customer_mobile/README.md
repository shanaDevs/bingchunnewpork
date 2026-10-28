# Bing Chun Customer (Flutter)

Mobile app for menu browsing, ordering, pickup QR, and delivery tracking.

## Prerequisites

- [Flutter](https://docs.flutter.dev/get-started/install) 3.12+
- **Android:** Android Studio / SDK
- **iOS (Mac only):** Xcode, CocoaPods (`brew install cocoapods`)

## Run locally

```bash
cd customer_mobile
flutter pub get
flutter run
```

## Build for Android

```bash
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

## Build for iPhone

### 1. One-command build (unsigned `.app`)

```bash
chmod +x scripts/build_ios.sh
./scripts/build_ios.sh
```

Output: `build/ios/iphoneos/Runner.app`

### 2. Install on a physical iPhone

1. Open **`ios/Runner.xcworkspace`** in Xcode (not `.xcodeproj`).
2. Select the **Runner** target → **Signing & Capabilities**.
3. Choose your **Apple Developer Team** and ensure bundle ID `lk.bingchun.bingChunDelivery` is available (or change it to your own).
4. Connect your iPhone, trust the computer, select the device in Xcode.
5. **Product → Run** (or press ⌘R).

### 3. TestFlight / App Store IPA

Configure signing in Xcode, then:

```bash
./scripts/build_ios.sh --ipa
```

Output: `build/ios/ipa/bing_chun_customer.ipa` — upload via Xcode Organizer or Transporter.

### API URL for release

Default API origin is `https://bing-chung-b.mp.dartcodes.com` (`/api` is added in the client). Override at build time:

```bash
flutter build ios --release \
  --dart-define=API_BASE=https://bing-chung-b.mp.dartcodes.com
```

## App IDs

| Platform | Bundle / package |
|----------|------------------|
| iOS      | `lk.bingchun.bingChunDelivery` |
| Android  | see `android/app/build.gradle` |

## iOS notes

- Minimum iOS version: **14.0**
- Location permission string is in `ios/Runner/Info.plist`
- HTTP to local dev servers is allowed via App Transport Security (debug / LAN testing)
