# Bing Chun Driver (Flutter)

Cross-platform (Android + iOS) port of the Kotlin driver app in [`../driver_android/`](../driver_android/).
Same screens, theme, APIs, socket events and GPS behaviour, talking to the same core
backend (`/api`) and delivery service (`/delivery-api`).

Application id: `com.bringit.driver` — deliberately different from the Kotlin
app (`lk.bingchun.bing_chun_delivery`) so both can be installed side by side while this
port is verified. Change `applicationId` in `android/app/build.gradle.kts` (and the iOS
bundle id) when it replaces the Kotlin app.

## Requirements

- Flutter **3.47** (Dart 3.12). On this machine: `C:\Users\USER\fvm\versions\3.47.0\bin\flutter.bat`
- Android: SDK 35, minSdk 26. iOS: Xcode 16+ (build on macOS).

## Run against your local backend

Debug builds default to `http://127.0.0.1:4000/api` and `http://127.0.0.1:4100/delivery-api`,
exactly like the Kotlin debug build. Forward the ports to the phone/emulator first:

```powershell
# backend + delivery service (repo root)
$env:DELIVERY_PORT = "4100"
npx concurrently -n backend,delivery "npm run dev:backend" "npm run dev:delivery"

# app
adb reverse tcp:4000 tcp:4000
adb reverse tcp:4100 tcp:4100
cd driver_flutter
C:\Users\USER\fvm\versions\3.47.0\bin\flutter.bat run
```

Other hosts: pass `--dart-define=CORE_API_BASE_URL=http://192.168.1.50:4000/api`
`--dart-define=DELIVERY_API_BASE_URL=http://192.168.1.50:4100/delivery-api`, or tap the
login logo 5 times (debug builds) to open the server-URL dialog. Release builds default to
`https://bing-chung-b.mp.dartcodes.com`.

## Tests

```powershell
flutter test        # logic ported from Format.kt, RideAlertPriority.kt, DeliveryJob.kt, DeliveryRoute.kt
flutter analyze
```

## Push notifications (optional)

Like the Kotlin app, FCM is inert until Firebase is configured. Add
`android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist` for
`lk.bingchun.bing_chun_driver`; the Gradle plugin applies itself only when the file exists.

## Layout

| Kotlin (`driver_android`)                         | Flutter (`lib/`)                                   |
| ------------------------------------------------- | -------------------------------------------------- |
| `data/network/*` (Retrofit, interceptors)          | `data/network/api_client.dart` (Dio)               |
| `data/model/*`                                    | `data/models/*`                                    |
| `data/repository/*`                               | `data/repositories/*`                              |
| `tracking/DeliverySocket.kt`                      | `tracking/delivery_socket.dart`                    |
| `tracking/LocationTracker.kt`                     | `tracking/location_tracker.dart` (geolocator)      |
| `core/DriverAlertService.kt`                      | `core/alert_service.dart` + `core/duty_service.dart` |
| `core/BcNotifications.kt`, `BcMessagingService.kt` | `core/notifications.dart`, `core/push.dart`        |
| `core/BcSound.kt`, `BcFeedback.kt`                | `core/feedback.dart`                               |
| `core/DeviceRequirements.kt`                      | `core/device_requirements.dart`                    |
| `ui/*ViewModel*.kt`                               | `state/*_controller.dart` (ChangeNotifier)         |
| `ui/theme/*`                                      | `ui/theme/bc_theme.dart`                           |
| `ui/screens/*`, `ui/components/*`                 | `ui/screens/*`, `ui/components/*`                  |
| osmdroid maps                                     | `flutter_map` (OpenStreetMap, no API key)          |

## Differences from the Kotlin app

- **Background alerts.** The Kotlin `DriverAlertService` is a native foreground service that
  keeps the socket alive even after the app is swiped away. Here, an Android foreground
  service (`flutter_foreground_task`) keeps the process alive while on duty and the alert
  engine runs in the app isolate — it keeps ringing while the app is backgrounded, but if the
  rider swipes the app away, new-job alerts arrive only through FCM push (configure Firebase).
- **Re-ring after the 3-minute quiet gap** uses an in-process timer instead of AlarmManager,
  so it relies on the foreground service keeping the process alive.
- **Incoming ride over the lock screen** uses the full-screen notification plus
  `showWhenLocked`/`turnScreenOn` on `MainActivity`, instead of a separate activity.
- **iOS** has no foreground services: tracking continues in the background through the
  `location` background mode during an active run; idle new-job alerts on iOS need FCM.
