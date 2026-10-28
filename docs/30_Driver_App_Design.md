# 30 — Driver App Design System

**Status:** Premium redesign (2026-07-26)
**Target:** `driver_android/` — Kotlin, Jetpack Compose, Material 3 1.3.1, minSdk 26.

The redesign rebuilds only the presentation layer (`ui/`, theme, resources, feedback).
ViewModels, repositories, API and socket logic are unchanged.

---

## Design system

### Color

Theme-aware via `LocalBcColors` (`ui/theme/Color.kt`). Every screen reads `BcColors.*`,
which resolves the active light or dark palette at runtime. Legacy aliases
(`navy`, `navyLight`, `navyCard`, `navyBorder`, `error`) map onto the new roles so old
call sites keep compiling while migrating.

| Role | Dark | Light |
| --- | --- | --- |
| background | `#070A14` | `#F6F8FC` |
| surface | `#0F1428` | `#FFFFFF` |
| card | `#151B32` | `#FFFFFF` |
| surfaceElevated | `#1B2340` | `#FFFFFF` |
| border | `#232C46` | `#E4E9F2` |
| text | `#EEF2FF` | `#0B1220` |
| textMuted | `#8B9CB8` | `#5B6B84` |

Shared accents: brand `#307EF2`, brandLight `#5C9AF5`, success `#22C55E`/`#16A34A`,
warning `#F59E0B`, danger `#EF4444`/`#DC2626`, info `#22D3EE`. Pairs target 4.5:1 contrast.

`ThemeMode` (system / light / dark) is persisted in `RuntimeConfig` and applied by
`BingChunTheme`, which also drives the Material 3 `colorScheme`, edge-to-edge system bars,
and adaptive status/navigation bar icon colors. `values-night/themes.xml` sets the dark
splash background.

### Typography — `BcType` (`ui/theme/Type.kt`)

`largeTitle 32/38 Bold · title 24/30 Bold · subtitle 20/26 SemiBold · section 15/20 SemiBold ·
body 15/22 · bodyStrong 15/22 SemiBold · caption 13/18 · button 15/20 SemiBold · label 12/16 ·
tiny 11/14`. Mapped onto the M3 `Typography` so stock components inherit the scale.

### Spacing / radius / elevation / motion — `ui/theme/Tokens.kt`

- `BcSpacing` 2/4/8/12/16/20/24/32.
- `BcRadius` 8/12/16/20/28/full, with ready-made `*Shape` values.
- `BcElevation` none/low/mid/high (dark mode leans on surface tint over black shadow).
- `BcMotion` fast 150ms, standard 250ms, slow 350ms; `EaseOut` for enters, `EaseInOut`
  for moves, spring (0.75 damping) for press, spring (0.85) for sheets.

### Feedback layer — `core/BcSound.kt`, `core/BcFeedback.kt`

- `BcSound` synthesizes short PCM tones at runtime through `AudioTrack`
  (sine + fast attack/decay envelope) — tap, success, error, notification, completed,
  refresh, newJob, scanOk, scanFail. No binary assets. Respects `AudioManager.ringerMode`
  and the `RuntimeConfig.soundEnabled` pref, using `USAGE_ASSISTANCE_SONIFICATION`.
- `BcHaptics` wraps `VibratorManager` predefined effects (tick / confirm / reject) with a
  view-level `performHapticFeedback` fast path and the `RuntimeConfig.hapticsEnabled` pref.
- Both are exposed as one `LocalBcFeedback` so any component calls `feedback.tap()`,
  `feedback.success()`, `feedback.completed()`, `feedback.error()`, `feedback.refresh()`.

### Component library v2 — `ui/components/`

- `BcButton` — full-width primary, press-scale 0.97 spring, haptic + sound on tap,
  loading spinner morph, 52dp height, `contentDescription` semantics.
- `BcOutlineButton`, `BcTextButton` — secondary actions with the same feedback.
- `BcTextField` — labelled, inline validation/supporting text, focus-colored border.
- `BcPinBoxes` — per-digit OTP/PIN boxes, animated fill border, shake on error,
  optional masking.
- `BcCard` — borderless, soft elevation, optional press handling.
- `StatusChip` / `InfoBadge` — semantic status colors and readable labels.
- `BcSegmentedTabs` (sliding indicator) and `TabPill`.
- `BcEmptyState`, `BcErrorState`, `BcOfflineBanner`, `BcStickyBar`, `BcSkeleton` /
  `BcSkeletonCard` / `BcJobsSkeleton` shimmer.

### Navigation & structure — `ui/navigation/Navigation.kt`

- Shared-axis transitions on every route (forward slide+fade, back reverse).
- `core-splashscreen` branded launch, held while the auth gate resolves.
- A Jobs / History / Me bottom-navigation shell (`HomeShellScreen`) pulls duty, refresh,
  settings and logout out of the old cramped Jobs top bar.

---

## Screen specs (12-point)

For each screen: UI · UX · animation · sound · empty/loading/error/success · accessibility ·
performance · dark mode · rationale.

### Login (`LoginScreen`)
Hero gradient background, animated logo entrance (scale + fade), premium 6-digit PIN via
`BcPinBoxes` with error shake, inline error text, loading morph on the button, branch picker
dialog for shared PINs. Sounds: tap on submit, error on failure, success on auth. Loading:
button spinner. Error: shake + red text + error sound. Success: success sound → nav.
A11y: PIN field auto-focuses, labelled sections, 48dp+ targets. Dark mode: gradient and card
adapt. Rationale: fast, confident sign-in with unmistakable success/failure signals.

### Jobs tab (`JobsTab`, historyMode=false)
Decluttered top bar (title + subtitle + refresh), offline banner, sectioned active/available
jobs, `BcCard` job cards with `StatusChip` and inline claim. Pull-to-refresh + refresh button
(refresh sound). Loading: `BcJobsSkeleton`. Empty: `BcEmptyState` (online/offline copy).
Error: `BcErrorState` retry. A11y: icon descriptions, large tap areas. Perf: `LazyColumn`
with stable keys. Rationale: surface the one active run and claimable work with minimal noise.

### History tab (`JobsTab`, historyMode=true)
Summary KPI card (runs · orders delivered), per-run cards with delivered ratio and totals,
pull-to-refresh. Loading/empty/error mirror Jobs. Rationale: quick self-service performance
review, previously requested by drivers.

### Me tab (`MeScreen`)
Profile card (hidden 5-tap dev gesture), duty switch, appearance (system/light/dark),
sound + haptics toggles, sign out. Rationale: consolidates settings and duty into a reachable
tab and exposes the new premium prefs.

### Job Detail (`JobDetailScreen`)
Store/route meta, stop list, mini map into full map, sticky primary CTA (`BcButton` progress
feedback). Inherits theme, typography, and button feedback. Dark mode adaptive.

### Dashboard / active run (`DashboardScreen`)
Progress header, NEXT stop emphasis, stop cards with call/navigate, live map, sticky action
bar. Completion fires `feedback.completed()` (sound + haptic). Rationale: keep the driver's
next action obvious with tactile confirmation at completion.

### Order Detail (`OrderDetailScreen`) + Failure sheet
Customer/items layout, mandatory `BcPinBoxes` OTP entry (shake + error sound on invalid),
"Send code to customer" resend, "Mark delivered" gated on a complete code with completion
feedback, and a failure-reason sheet. Rationale: the code cannot be bypassed and mistakes are
felt immediately.

### Route Map (`RouteMapScreen`) & Server URL dialog (`ServerUrlDialog`)
Map colors hoisted out of the `AndroidView` lambdas so they follow the theme; the hidden dev
dialog uses themed surfaces. Rationale: consistent theming even in interop and dev tooling.

---

## Alerts and background behaviour

New delivery jobs must ring the driver's phone whether the app is in the foreground,
backgrounded, or the process is dead. Two independent delivery paths feed the same local
notification code:

1. **Socket + foreground service (`core/DriverAlertService.kt`)** — starts when the driver
   goes ONLINE (and on app start while online), stops on OFF_DUTY / logout. It shows a silent
   ongoing "On duty" notification (`bc_duty_v1` channel), keeps the core socket connected and
   joined to every accessible `branch-pool:{storeId}`, listens for `newDeliveryJob`, and
   re-fetches the job list every 15 s as a safety net for missed socket events. `START_STICKY`
   so the system restarts it after a low-memory kill. Declared with
   `foregroundServiceType="dataSync"` (Android 15 caps dataSync at ~6 h/24 h, which the FCM
   path covers).
2. **FCM push (`core/BcMessagingService.kt`)** — the backend sends a **data-only**
   high-priority message to every online driver of the branch when a job is created
   (`backend/src/lib/driverPush.ts`, called from `createDeliveryJob` after
   `broadcastNewJob`). Data-only means our own code builds the notification, so the custom
   channel and tone are guaranteed even when the process was dead. Tokens are registered via
   `POST /api/delivery/me/fcm-token` (upserts `DriverDevice`) on login/app start and cleared
   on logout. FCM stays inert until `driver_android/app/google-services.json` exists (the
   google-services Gradle plugin is applied conditionally) and the backend has
   `FIREBASE_SERVICE_ACCOUNT_JSON` set.

Both paths call `BcNotifications.notifyNewJob()`. The notification id is derived from the
job id and the builder uses `setOnlyAlertOnce(true)`, so when socket and FCM both deliver the
same job it rings once and the second post just replaces the first.

**Channels** (ids are versioned because Android freezes channel sound/importance at creation):

- `bc_new_job_v1` — IMPORTANCE_HIGH, custom tone `res/raw/new_job_alert.wav` played with
  `USAGE_NOTIFICATION_RINGTONE` (ring volume, louder than the notification stream),
  vibration pattern, lights, heads-up. The tone is generated by
  `driver_android/tools/gen-alert-sound.js` (3x rising two-tone chime, no hand-authored
  binaries in the repo). Changing the tone requires bumping the channel id.
- `bc_duty_v1` — IMPORTANCE_LOW, silent, hosts the ongoing on-duty service notification.

**Permissions**: `POST_NOTIFICATIONS` (requested once after login on Android 13+ via
`RequestNotificationPermission`), `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`,
`WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

**OEM battery killers (Xiaomi/Redmi MIUI)**: the Me tab shows a "Reliable job alerts" card
while the app is not exempt from battery optimizations; it deep-links to the system exemption
dialog. On MIUI the driver must additionally enable **Autostart** (Security app → Autostart)
or a swipe from recents can still kill the process. Note: if the user *force-stops* the app
from system settings, Android blocks both the service restart and FCM delivery until the app
is opened again — this is an OS rule, not a bug.

**Enabling FCM (one-time setup)**:
1. Firebase console → project `bing-chun-customer-app` → add Android app with package
   `lk.bingchun.bing_chun_delivery` → download `google-services.json` into
   `driver_android/app/`.
2. Project settings → Service accounts → generate a key, put the JSON (single line) in
   `backend/.env` as `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. Rebuild the app; verify with `backend/scripts/smoke-newjob-alert.ts` while the app is
   force-closed.

---

## Verification

`.\gradlew compileDebugKotlin` → `assembleDebug` → `installDebug` on the connected device,
then the manual flow: login → go online → claim → start run → OTP deliver → complete →
history.

New-job alerts: `backend/scripts/smoke-newjob-alert.ts` creates a READY order and a job
through the real admin API (so `broadcastNewJob` + driver push fire), then check the phone
with the app foregrounded, backgrounded, and swiped away.
