# Customer app — API base URL

The Flutter app talks to the Bing Chun backend at `{API_BASE}/api`.

`API_BASE` is a **compile-time** flag. It is not read from `.env` at runtime. Changing it always needs a **full restart** (`flutter run` again). Hot reload / hot restart will not pick it up.

Release APKs and `npm run build:customer` use the live API `https://bing-chung-b.mp.dartcodes.com`. For local backend work, pass `--dart-define=API_BASE=http://localhost:4000` (or your LAN IP). Do **not** hardcode a LAN IP in Dart source.

## How the app reads it

`lib/core/constants/app_constants.dart`:

```dart
static const apiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'https://bing-chung-b.mp.dartcodes.com',
);
```

Dio then uses `{apiBase}/api` (see `lib/core/network/dio_client.dart`).

If you forget `--dart-define`, Chrome/Windows still work against localhost. A **physical phone** does not — `localhost` on the phone is the phone itself.

## Which file to change

Edit the file that matches **how you launch** the app. Put your PC IPv4 and port `4000`.

| You run from | File | What to change |
| --- | --- | --- |
| Android Studio / IntelliJ | `.idea/runConfigurations/main_dart.xml` | `additionalArgs` → `--dart-define=API_BASE=http://YOUR_IP:4000` |
| Cursor / VS Code | `.vscode/launch.json` | `args` on the device config you use |
| Terminal | (no file) | pass the flag on `flutter run` (examples below) |

Find your PC IP:

```bash
ipconfig
```

Use the **Wi-Fi** IPv4 (example: `10.141.146.87`). That value changes when you switch networks. Update the run config each time.

## Run commands

Backend must already be listening (`backend/` → `npm run dev`). It binds `0.0.0.0:4000`.

**Chrome / Windows (this PC):**

```bash
flutter run -d chrome --dart-define=API_BASE=http://localhost:4000
```

**Physical Android, same Wi-Fi as this PC:**

```bash
flutter run -d android --dart-define=API_BASE=http://YOUR_IP:4000
```

Phone and laptop must be on the same network. Mobile data (4G) cannot reach a LAN IP.

**Physical Android over USB only** (phone can stay on mobile data):

```bash
adb reverse tcp:4000 tcp:4000
flutter run -d android --dart-define=API_BASE=http://127.0.0.1:4000
```

Unplug USB → reverse is gone. Run `adb reverse` again after reconnect.

**Android emulator:**

```bash
flutter run -d android --dart-define=API_BASE=http://10.0.2.2:4000
```

`10.0.2.2` is the emulator’s alias for the host machine’s localhost.

## Backend CORS (only if Flutter web on LAN fails)

Native Android usually has no `Origin` header, so CORS is not the usual blocker.

If you run **Flutter web** from a LAN origin, the API already allows `192.168.*` and `10.*` in `backend/src/index.ts`. Socket origins for a specific laptop IP live in:

- `backend/src/index.ts` (`corsOrigins` + listen log)
- `backend/src/lib/socket.ts`

After changing those files, wait for the API process to restart.

Windows Firewall can still block inbound `:4000` from the phone even when `http://YOUR_IP:4000/health` works in the PC browser.

## Quick test

From this PC:

```text
http://YOUR_IP:4000/health
```

Expect `{"status":"ok",...}`.

On the phone, Home should load stores. **Cannot reach server** means the app cannot open `{API_BASE}` — wrong IP, phone on 4G, API not running, or USB reverse missing.

## Production / staging

Pass the real HTTPS origin. Do not bake a LAN address into a store build.

```bash
flutter build apk --dart-define=API_BASE=https://bing-chung-b.mp.dartcodes.com
```
