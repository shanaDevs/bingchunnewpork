# Google Play — sensitive permission declarations

Copy-paste answers for Play Console → **App content** (and the review notes) for
Bing Chun Delivery (`com.bingchun.bing_chun_driver`). Keep this in sync with
`android/app/src/main/AndroidManifest.xml`.

The app is used only by Bing Chun delivery staff, who sign in with a staff PIN.
Give reviewers a test PIN in **App access** so they can reach the on-duty screens.

## Permissions deliberately NOT requested

These are stripped in the manifest with `tools:node="remove"` so plugins can't add them back:

| Permission | Why it isn't needed |
| --- | --- |
| `ACCESS_BACKGROUND_LOCATION` | Location runs inside a `location` foreground service started while the app is open, so while-in-use permission is enough. **No "Location permissions" declaration form is required.** |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | The app opens the system battery-optimisation list instead of the direct-request dialog. |
| `SCHEDULE_EXACT_ALARM` | No scheduled notifications or alarms are used. |
| `RECEIVE_BOOT_COMPLETED` | The duty service never starts at boot (`autoRunOnBoot: false`). |

If any of these is added back later, it needs its own declaration in Play Console.

## Foreground service types (Play Console → App content → Foreground service permissions)

You need to upload a short video for each type, showing the driver going on duty and the persistent "On duty" notification.

### `FOREGROUND_SERVICE_LOCATION`

> Delivery staff go "on duty" in the app to receive and carry out delivery jobs.
> While on duty, a foreground service with a persistent "On duty" notification shares
> the driver's location with our dispatch system. That way new jobs reach drivers near
> their branch, dispatchers and customers can follow a delivery in progress, and the
> app can confirm arrival at the branch and at each drop-off. The service starts only
> when the driver taps to go on duty or starts a delivery, with the app open. It stops
> as soon as the driver goes off duty or signs out. If it were interrupted, live
> tracking of in-progress deliveries would stop and drivers would miss job alerts.

User-visible impact if deferred or interrupted: dispatch loses the driver's position during an active delivery, and pickup or drop-off cannot be confirmed.

### `FOREGROUND_SERVICE_DATA_SYNC`

> The same on-duty service keeps a live connection to our dispatch server, so new
> delivery jobs and order cancellations arrive within seconds and can ring the driver.
> Job alerts are time-critical: a job that isn't accepted quickly is re-offered to
> other drivers. The connection runs only while the driver is on duty.

## `USE_FULL_SCREEN_INTENT` (Play Console → App content → Full-screen intent)

Play grants this by default only to calling and alarm apps. Declare it as **"Other"** with the text below. If Play doesn't pre-grant it, the app already handles that case: Me → Job Alerts & Reliability → Full-Screen Ride Alerts sends the driver to the system setting, and alerts fall back to a high-priority heads-up notification.

> New delivery jobs are time-critical, incoming-call-style alerts: the job rings until the
> driver accepts or declines it, and is re-offered to other drivers if nobody answers.
> A full-screen intent shows the incoming job over the lock screen so a driver on
> duty, whose phone is usually locked in a mount, can respond immediately.

## Prominent disclosure (User Data policy)

Shown in-app on the location gate (`lib/ui/components/device_lock_overlay.dart`, `_LocationDisclosure`) **before** the system location prompt. The prompt opens only after the driver taps **"Agree & allow location"**. Text:

> **How Bing Chun Delivery uses your location**
> Bing Chun Delivery collects your location while you are on duty, even when the app is closed or not in use, to:
> • send you new delivery jobs from your branch
> • show dispatch and customers your live position during a delivery
> • confirm pickup at the branch and drop-off at each stop
>
> Location is not collected when you are off duty or signed out. On Android, an "On duty" notification is shown whenever it is being collected.

## Data safety form — location

- **Precise location**: collected, shared with the service provider (our own backend only). Purpose: App functionality. Not optional for drivers.
- **Note:** OSRM routing (`router.project-osrm.org`) and OpenStreetMap tiles currently receive route coordinates and map-view areas. Either declare them as third-party sharing or move them behind our backend; see security review item 5.

## Other permissions (no declaration form)

`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE/COARSE_LOCATION` (while-in-use), `VIBRATE`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `WAKE_LOCK`.
