# Driver app design system

Kotlin Compose app in `driver_android`. **Light-first**, matching the customer app
(`customer_mobile`): a neutral page, white cards with a hairline border and a soft shadow,
a dark navy gradient header, and brand blue used only on icons, values and CTAs — never as
a page or card surface. Dark mode stays fully supported; the tone is operational, not
promotional.

`RuntimeConfig` defaults new installs to `LIGHT`; riders who pick a mode in Me → Appearance
keep their choice.

## Tokens

Defined in `ui/theme/Color.kt`, `Type.kt`, `Tokens.kt`. Screens should read `LocalBcColors.current` so light/dark/system recompose. Do not call `BcColors.*` inside composables.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F3F6FB` | `#070B18` |
| Surface / card | `#FFFFFF` | `#121A31` / `#151B32` |
| Border | `#E8EEF5` | `#14FFFFFF` |
| Text / muted | `#0B1F3F` / `#6B7C93` | `#F7F9FF` / `#94A3C2` |
| `iconTile` | `#E8F1FF` | `#16243F` |
| `inputBorder` | `#8EB5FF` | `#24FFFFFF` |
| `cardShadow` | `#0F000000` | transparent |
| Brand | `#307EF2` → `#5C9AF5` | same |
| Accent purple | `#6B5CFF` | same |
| Success / warning / danger | `#16A34A` / `#D97706` / `#DC2626` | `#22C985` / `#FFB020` / `#FF5C67` |

`HeaderGradient` (`#020B1C → #061428 → #0A1D38`) is the customer app's `BcDesign.headerGradient`
and is always dark in both schemes. `heroGradient(dark)` stays for the login hero;
`BrandGradient` is now only for progress fills.

Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 (`BcSpacing`). Radii: `BcRadius.card` 16dp,
`BcRadius.button` 14dp. Motion: 150 / 250 / 350 / 520ms (`BcMotion`).

System bars are transparent; `Scaffold(containerColor)` paints the page behind them and
gradient-header screens call `BcLightStatusBarIcons()` to flip the icons white while shown.

## Ride alert & completion

- `IncomingRideActivity` / `IncomingRideScreen` — large hero card “NEW DELIVERY RIDE” with ACCEPT RIDE. Surfaces via:
  - **Activity launch** from `DriverAlertService` when the app is backgrounded or another app is focused (`IncomingRideLauncher`).
  - **In-app overlay** (`IncomingRideOverlay`) when `MainActivity` is resumed — same card as the activity.
  - **Notification fallback** — `CallStyle` heads-up on Android 12+ plus `fullScreenIntent` on lock screen (`BcNotifications`).
- `DriverAlertService` — duty FGS (`dataSync|location`), looping alarm, ring gate via `alertEligible`, owns active-ride GPS for background tracking.
- Dashboard RETURNING phase — navigate back to branch; Complete Ride enabled only within `completionRadiusM`.

## Core components

- `BcCard` — white, 16dp, hairline border, soft shadow on light / border-only on dark. Carries most of the visual language, so screens rarely style themselves.
- `BcGradientHeader` / `BcHeaderPill` (`ui/components/Headers.kt`) — the dark navy header, the driver counterpart of the customer `BcHomeHeader`. Runs under the status bar.
- `BcWaveBottom` — the customer app's bottom scoop as a Compose shape, used by the login hero.
- `BcIconTile` — rounded `iconTile` square behind a brand icon, for list rows and stat tiles.
- `BcButton`, `BcOutlineButton`, `BcSegmentedTabs(filled)`
- `DriverStopCard`, `GpsStatusBanner`, `BcConfirmationSheet`, `BcSuccessOverlay`
- `HistorySummaryRow`, `SettingRow`, `BcPinBoxes`, `StatusChip` / `InfoBadge`

Ride alerts (`IncomingRideScreen` / `IncomingRideOverlay`) stay deliberately loud and
brand-heavy — an alert should shout, so the calmer palette does not apply there.

## Navigation

Jobs | History | Stats | Me. Active run is `DashboardScreen` (not the Stats tab — the names
are distinct on purpose). Stop verification is `OrderDetailScreen`.

The shell passes only the nav-bar inset down to each tab; every tab opens with a
`BcGradientHeader` that owns its own status-bar inset. That gradient header stays **pinned**
at the top while tab content scrolls beneath it, via `BcPinnedTabLayout` with `overlap = 0`
so the first card sits fully below the header. Jobs chrome uses navy, neutral, brand,
success, and danger only.

## Stats tab — what a rider sees

`ui/screens/StatsScreen.kt`, backed by `StatsViewModel` and `GET /api/delivery/me/stats`.
Read-only; nothing on it changes a job's state. Period selector: Today / 7 days / 30 days /
All time, cached per period.

| Section | Shows |
| --- | --- |
| Stat tiles | Completed runs · Stops delivered · Distance covered · Online time |
| Earnings | Delivery fees on delivered stops for the period, plus the stop count |
| Customer rating | Average, star row, total count, and the 5 most recent comments |
| Merit points | Balance, status band chip, and the last 5 merit changes (+/−) |
| Timing | Average time to pick up, average time on the road, days on duty |

Metric definitions live in `packages/delivery-domain/src/riderStats.ts` and deliberately
mirror the admin rider KPI endpoints, so a rider and their branch manager see the same
numbers. Earnings use the same basis as the History tab's `deliveredTotal` — delivery fees
on `DELIVERED` orders — so the two agree per run. Whole-period totals can still differ,
because `/jobs/history` returns only the most recent 50 runs while Stats counts the window.

## GPS honesty

`GpsStatusBanner` reads `LocationTracker.hasPermission()`, `isLocationEnabled()`, and `runTracking`. “GPS active” only appears during an in-progress run while fused tracking is actually on. The map pulse uses the same `lastFix` / `runTracking` flows and does not rebuild the Active Run screen on each coordinate.

## Map

OSMDroid. Numbered stop markers (next / upcoming / delivered / failed). Compact fullscreen control. Pulse overlay ticks the map view locally.

`RouteMap` takes two framing parameters. `contentPaddingBottomPx` is the height of UI covering
the bottom of the map; the camera stretches its bounding box southward so the route lands in
the band left visible, rather than centring it behind the overlay (osmdroid only pads a box
symmetrically, hence the box maths rather than a camera offset). `refitKey` re-runs the fit
after the driver has panned away — the fit otherwise happens once per route.

## Stops screen — map first

`JobDetailScreen` is the screen a driver decides on before claiming, so the map is the
background layer at `fillMaxSize` and everything else floats above it:

- **Top chrome** — circular back button, a translucent "Stops · branch · N stops" pill, and
  the `StatusChip`, all over the map.
- **Map controls** — recentre (bumps `refitKey`) and full screen (`Routes.MAP`) on the right.
- **Draggable sheet** — snaps to 22% / 46% / 90% of the screen. Drag handle up top, then the
  summary card, `GpsStatusBanner` and the `DriverStopCard` list in a `LazyColumn`, with the
  primary action (`Claim job` / `Confirm pickup` / `Start run`) in a footer that stays put
  while the list scrolls above it.

The sheet's settled fraction feeds `contentPaddingBottomPx`, so the route reframes above the
sheet on each snap and not on every drag frame. Map padding is capped at half the screen; past
that the visible band is too short for a sensible fit. When `/route` yields nothing the sheet
opens at its tallest anchor over a plain background.

`MiniRouteMap` (the 220dp bordered strip) stays in use on `DashboardScreen` for the active
run — the map-first treatment applies to the pre-claim decision, not to a run in progress.

## Motion

`BcMotion` plus `rememberReducedMotion()` (Android animator duration scale). New animations should go through those tokens.

## Delivery

OTP is required when the store/global flag says so. Mark delivered opens a confirmation sheet; a ~520ms success overlay then returns to the run.
