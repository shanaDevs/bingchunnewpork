import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/alert_service.dart';
import 'core/app_container.dart';
import 'core/app_lock.dart';
import 'core/duty_service.dart';
import 'core/feedback.dart';
import 'core/notifications.dart';
import 'core/offer_outcomes.dart';
import 'core/request_updates.dart';
import 'core/ride_alert.dart';
import 'core/runtime_config.dart';
import 'core/system_settings.dart';
import 'data/models/delivery_job.dart';
import 'data/network/api_exception.dart';
import 'l10n/l10n.dart';
import 'state/auth_controller.dart';
import 'state/jobs_controller.dart';
import 'ui/app_routes.dart';
import 'ui/components/app_bottom_nav.dart';
import 'ui/components/device_lock_overlay.dart';
import 'ui/screens/app_lock_screen.dart';
import 'ui/screens/history_screen.dart';
import 'ui/screens/incoming_ride_screen.dart';
import 'ui/screens/jobs_screen.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/me_screen.dart';
import 'ui/screens/splash_screen.dart';
import 'ui/screens/stats_screen.dart';
import 'ui/theme/bc_theme.dart';

/// Root widget — port of MainActivity + AppNavHost (Navigation.kt).
class BingChunDriverApp extends StatefulWidget {
  const BingChunDriverApp({super.key, required this.container});
  final AppContainer container;

  @override
  State<BingChunDriverApp> createState() => _BingChunDriverAppState();
}

class _BingChunDriverAppState extends State<BingChunDriverApp> with WidgetsBindingObserver {
  AppLanguage _language = L10n.current;

  @override
  void initState() {
    super.initState();
    RuntimeConfig.instance.addListener(_onConfig);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final lock = widget.container.appLock;
    if (state == AppLifecycleState.paused) lock.onBackground();
    if (state == AppLifecycleState.resumed) lock.onForeground();
  }

  @override
  void dispose() {
    RuntimeConfig.instance.removeListener(_onConfig);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Language switch: refresh every screen in place (navigation and state are kept).
  void _onConfig() {
    if (_language == L10n.current) return;
    _language = L10n.current;
    L10n.rebuildAll();
    // The sticky "On duty" notification lives outside the widget tree — re-translate it too.
    DutyService.refreshLanguage();
  }

  @override
  Widget build(BuildContext context) {
    final container = widget.container;
    return MultiProvider(
      providers: [
        Provider<AppContainer>.value(value: container),
        ChangeNotifierProvider<RuntimeConfig>.value(value: RuntimeConfig.instance),
        ChangeNotifierProvider<AlertService>.value(value: container.alertService),
        ChangeNotifierProvider<AppLock>.value(value: container.appLock),
        ChangeNotifierProvider<AuthController>(create: (_) => AuthController(container)),
      ],
      child: Consumer<RuntimeConfig>(
        builder: (context, rc, _) {
          final mode = switch (rc.themeMode.toUpperCase()) {
            'DARK' => ThemeMode.dark,
            'SYSTEM' => ThemeMode.system,
            _ => ThemeMode.light,
          };
          return MaterialApp(
            title: tr('Bring It Rider'),
            locale: rc.language.locale,
            supportedLocales: L10n.supportedLocales,
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            debugShowCheckedModeBanner: false,
            navigatorKey: AppRoutes.navigatorKey,
            theme: buildBcTheme(false),
            darkTheme: buildBcTheme(true),
            themeMode: mode,
            home: const _AuthGate(),
            // Overlays sit above every route, like the Kotlin Dialog-based takeovers.
            builder: (context, child) => _RootOverlays(child: child ?? const SizedBox.shrink()),
          );
        },
      ),
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  /// Every cold start shows the splash for at least this long, even when the
  /// saved session resolves instantly, so the launch always feels the same.
  static const _minSplash = Duration(milliseconds: 1600);

  bool? _wasAuthed;
  bool _splashShown = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(_minSplash, () {
      if (mounted) setState(() => _splashShown = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final splash = auth.checking || !_splashShown;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 450),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeIn,
      child: splash ? const StartupSplash(key: ValueKey('splash')) : _main(auth, context.watch<AppLock>()),
    );
  }

  Widget _main(AuthController auth, AppLock lock) {
    final authed = auth.isAuthenticated;
    if (_wasAuthed != null && _wasAuthed != authed) {
      // Signed out (or session revoked) — drop every pushed screen. Signed in —
      // drop the pushed sign-in steps (code entry) above the dashboard.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        AppRoutes.navigatorKey.currentState?.popUntil((r) => r.isFirst);
      });
    }
    _wasAuthed = authed;
    SystemSettings.setQuickBubbleSignedIn(authed);
    if (!authed) return const LoginScreen();
    // Optional app lock: verify the rider before the dashboard after every cold start.
    return lock.needsUnlock ? const AppLockScreen(key: ValueKey('app-lock')) : const HomeShell();
  }
}

/// Authenticated shell: Jobs / History / Stats / Me — port of HomeShellScreen.kt.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _tab = 0;
  StreamSubscription<NotificationTap>? _tapSub;
  StreamSubscription<int>? _tabSub;
  Timer? _updatesTimer;

  /// Admin replies to complaints / branch requests → Notifications inbox.
  void _checkRequestUpdates() {
    if (!mounted) return;
    RequestUpdates.check(context.read<AppContainer>(), riderId: context.read<AuthController>().driver?.id);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkRequestUpdates();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkRequestUpdates());
    _updatesTimer = Timer.periodic(const Duration(minutes: 3), (_) => _checkRequestUpdates());
    // Ask once after login so new-job alerts can be posted (Android 13+ / iOS).
    BcNotifications.requestPermission();
    _tapSub = BcNotifications.taps.listen(_onNotificationTap);
    _tabSub = AppRoutes.tabRequests.listen((i) {
      if (mounted) setState(() => _tab = i);
    });
    final launch = BcNotifications.launchTap;
    if (launch != null) {
      BcNotifications.launchTap = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => _onNotificationTap(launch));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _updatesTimer?.cancel();
    _tapSub?.cancel();
    _tabSub?.cancel();
    super.dispose();
  }

  Future<void> _onNotificationTap(NotificationTap tap) async {
    final c = context.read<AppContainer>();
    switch (tap) {
      case OpenIncomingRide(:final alert):
        c.alertService.forceRing(alert);
      case AcceptRide(:final alert):
        try {
          await ensureNoUnfinishedRide(c, claimingJobId: alert.jobId);
          await c.jobsRepository.claimJob(alert.jobId);
          if (!alert.isTest) OfferOutcomes.instance.record(alert.jobId, OfferOutcome.accepted);
          c.alertService.silenceJob(alert.jobId);
          AppRoutes.openDashboardFromRoot(alert.jobId);
        } catch (_) {
          // Fall back to the in-app card so the rider sees why.
          c.alertService.forceRing(alert);
        }
      case SilenceRide(:final jobId):
        c.alertService.silenceJob(jobId);
      case OpenJobsTab():
        AppRoutes.navigatorKey.currentState?.popUntil((r) => r.isFirst);
        if (mounted) setState(() => _tab = 0);
    }
    // A notification may have opened the app over the lock screen. If no ride is ringing
    // (e.g. muted during an active run, or a non-ride tap), drop back behind it now
    // instead of showing jobs and customer details until the grace timer fires.
    final alerts = c.alertService;
    if (alerts.ringingAlert == null && alerts.activeAlerts.isEmpty) SystemSettings.releaseLockScreen();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    void openJob(JobSummary job) => AppRoutes.openJob(context, job);
    return ChangeNotifierProvider(
      create: (ctx) => JobsController(ctx.read<AppContainer>()),
      child: Scaffold(
        backgroundColor: c.background,
        body: IndexedStack(
          index: _tab,
          children: [
            JobsTab(onOpenJob: openJob, onOpenProfile: () => setState(() => _tab = 3)),
            _tab == 1
                ? HistoryScreen(onOpenJob: openJob, onViewJobs: () => setState(() => _tab = 0))
                : const SizedBox(),
            _tab == 2 ? StatsScreen(onOpenJobs: () => setState(() => _tab = 1)) : const SizedBox(),
            _tab == 3 ? const MeScreen() : const SizedBox(),
          ],
        ),
        bottomNavigationBar: AppBottomNav(
          current: _tab,
          onSelect: (i) {
            BcFeedback.tap();
            setState(() => _tab = i);
          },
        ),
      ),
    );
  }
}

/// Incoming ride takeover, cancelled-order takeover and the GPS/data lock,
/// stacked over the navigator.
class _RootOverlays extends StatelessWidget {
  const _RootOverlays({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final container = context.read<AppContainer>();
    // Ride takeovers open customer details, so they wait until the app lock is passed.
    final locked = context.watch<AppLock>().needsUnlock;
    return Stack(
      children: [
        Positioned.fill(child: child),
        if (auth.isAuthenticated && !locked) ...[
          const Positioned.fill(child: _IncomingRideOverlay()),
          const Positioned.fill(child: _OrderCancelledOverlay()),
        ],
        // Blocks login, home, dashboard and the takeovers until GPS + data are on.
        DeviceLockLayer(requirements: container.deviceRequirements),
      ],
    );
  }
}

class _IncomingRideOverlay extends StatefulWidget {
  const _IncomingRideOverlay();

  @override
  State<_IncomingRideOverlay> createState() => _IncomingRideOverlayState();
}

class _IncomingRideOverlayState extends State<_IncomingRideOverlay> {
  String? _acceptingId;
  String? _error;
  String? _errorFor;
  late final AlertService _alerts;

  @override
  void initState() {
    super.initState();
    _alerts = context.read<AlertService>()..addListener(_syncLockScreen);
    _syncLockScreen();
  }

  @override
  void dispose() {
    _alerts.removeListener(_syncLockScreen);
    // Signed out while a card was up — the overlay is removed.
    SystemSettings.setRideAlertActive(false);
    super.dispose();
  }

  static RideAlert? _currentAlert(AlertService alerts) =>
      alerts.testAlert ??
      alerts.ringingAlert ??
      (alerts.postRejectHoldActive ? null : (alerts.activeAlerts.isEmpty ? null : alerts.activeAlerts.first));
  void _syncLockScreen() => SystemSettings.setRideAlertActive(_currentAlert(_alerts) != null);

  Future<void> _accept(AlertService alerts, RideAlert alert) async {
    // Test alert: just close it — never reaches the server.
    if (alert.isTest) {
      alerts.endTestAlert();
      return;
    }
    setState(() {
      _acceptingId = alert.jobId;
      _error = null;
    });
    try {
      final container = context.read<AppContainer>();
      await ensureNoUnfinishedRide(container, claimingJobId: alert.jobId);
      await container.jobsRepository.claimJob(alert.jobId);
      OfferOutcomes.instance.record(alert.jobId, OfferOutcome.accepted);
      BcFeedback.success();
      // The card may be over the lock screen; the dashboard shows customer details,
      // so it needs an unlock. If the rider cancels, it opens after they unlock.
      await SystemSettings.requestUnlock();
      await SystemSettings.refreshDeviceLocked();
      alerts.silenceJob(alert.jobId);
      AppRoutes.openDashboardFromRoot(alert.jobId);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = errorMessage(e, tr('Could not accept ride'));
          _errorFor = alert.jobId;
        });
      }
    } finally {
      if (mounted) setState(() => _acceptingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final alerts = context.watch<AlertService>();
    final alert = _currentAlert(alerts);
    return ValueListenableBuilder<bool>(
      valueListenable: SystemSettings.deviceLocked,
      builder: (_, locked, _) {
        // Locked with no ride card: the app may still be on screen over the lock screen for a
        // moment (card just dismissed, notification opened it) — never show the jobs list there.
        if (alert == null) return locked ? const _LockedShield() : const SizedBox.shrink();
        // Unlocked and in the background, the system notification is the alert. Locked,
        // the app may be on screen over the lock screen while reported paused/inactive —
        // always show the card then, or the jobs list (customer details) would show instead.
        if (!alerts.appInForeground && !locked) return const SizedBox.shrink();
        return _RideCardPresence(
          child: IncomingRideScreen(
            key: ValueKey(alert.jobId),
            alert: alert,
            locked: locked,
            accepting: _acceptingId == alert.jobId,
            error: _errorFor == alert.jobId ? _error : null,
            onAccept: () => _accept(alerts, alert),
            onDismiss: () {
              if (alert.isTest) {
                alerts.endTestAlert();
                return;
              }
              OfferOutcomes.instance.record(alert.jobId, OfferOutcome.declined);
              alerts.silenceJob(alert.jobId);
            },
          ),
        );
      },
    );
  }
}

/// Tells MainActivity when the ride card is drawn / gone, so it only uncovers the app over
/// the lock screen while the card is what's on screen.
class _RideCardPresence extends StatefulWidget {
  const _RideCardPresence({required this.child});
  final Widget child;

  @override
  State<_RideCardPresence> createState() => _RideCardPresenceState();
}

class _RideCardPresenceState extends State<_RideCardPresence> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) SystemSettings.rideCardShown();
    });
  }

  @override
  void dispose() {
    SystemSettings.rideCardHidden();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Shown instead of the app while the phone is locked and no ride card is up.
class _LockedShield extends StatelessWidget {
  const _LockedShield();

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: c.background,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipOval(child: Image.asset('assets/images/logo.png', width: 72, height: 72, fit: BoxFit.cover)),
            const SizedBox(height: 16),
            Icon(Icons.lock_outline_rounded, color: c.textMuted),
            const SizedBox(height: 8),
            Text(
              tr('Unlock your phone to continue'),
              style: TextStyle(color: c.textMuted, fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderCancelledOverlay extends StatelessWidget {
  const _OrderCancelledOverlay();

  @override
  Widget build(BuildContext context) {
    final alerts = context.watch<AlertService>();
    final pending = alerts.pendingCancellations;
    if (pending.isEmpty) return const SizedBox.shrink();
    final alert = pending.first;
    return OrderCancelledView(
      label: alert.displayNumber,
      onAcknowledge: () => alerts.acknowledgeCancellation(alert.orderId),
    );
  }
}
