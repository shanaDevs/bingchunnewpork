# Bing Chun Driver (Kotlin / Compose)

Native Android rewrite of the Flutter driver app in [`../mobile/`](../mobile/).
Same screens, theme, APIs, and socket GPS behavior. Application id stays
`lk.bingchun.bing_chun_delivery` so a release build can replace the Flutter install.

Flutter `mobile/` is kept until this app is accepted on a real device.

## Requirements

- Android Studio Hedgehog+ (or JDK 17)
- Android SDK 35, minSdk 26
- A phone/emulator with USB debugging

## Configure API hosts

Debug and release both point at the hosted backend in [`app/build.gradle.kts`](app/build.gradle.kts):

```
CORE_API_BASE_URL      = https://bing-chung-b.mp.dartcodes.com/api
DELIVERY_API_BASE_URL  = https://bing-chung-b.mp.dartcodes.com/delivery-api
STORE_ID               = (empty — PIN login picks the branch)
```

For local LAN testing, change those two URLs to `http://<your-ip>:4000/api` and
`http://<your-ip>:4100/delivery-api`.

## Run

From this folder:

```bash
# Windows
set JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr
gradlew.bat installDebug

# Or open driver_android/ in Android Studio → Run
```

From the monorepo root:

```bash
npm run build:driver-android   # assembleDebug
npm run install:driver-android # installDebug on a connected device
```

## Smoke test

1. Ensure the hosted core + delivery APIs are up (`bing-chung-b.mp.dartcodes.com`).
2. Install the debug APK on a phone (`gradlew.bat installDebug`).
3. Login with demo PIN **1234** (branch picker appears if the PIN is shared).
4. Open a job → Assign / Start → open map → Mark delivered (OTP sheet appears when the branch requires it).
5. Confirm GPS points land via `/delivery-api/locations/batch` / the `/delivery` socket.

## Stack

Compose + Material 3 · Navigation · ViewModel/StateFlow · Retrofit/Moshi ·
EncryptedSharedPreferences · FusedLocationProvider · socket.io-client · osmdroid

## Out of scope (parity with current Flutter, not unfinished M8)

FCM, Google Maps SDK, foreground-service GPS, Hive offline queue.
