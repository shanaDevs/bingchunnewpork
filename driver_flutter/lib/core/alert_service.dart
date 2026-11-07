import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/json.dart';
import '../data/local/secure_store.dart';
import '../data/models/delivery_job.dart';
import '../data/models/driver.dart';
import '../data/repositories/auth_repository.dart';
import '../data/repositories/jobs_repository.dart';
import '../tracking/delivery_socket.dart';
import '../tracking/location_tracker.dart';
import 'duty_service.dart';
import 'events.dart';
import 'format.dart';
import 'notifications.dart';
import 'ride_alert.dart';

/// Runs while the driver is ON DUTY — port of DriverAlertService.kt.
///
/// Keeps the core socket connected (joined to every accessible branch pool),
/// polls jobs every 15s, and rings + notifies when a new delivery job arrives.
/// Also owns active-ride GPS tracking.
///
/// Ringing is gated by [alertEligible]: muted while ASSIGNED/IN_PROGRESS,
/// active again during RETURNING. Cancellation alerts are deliberately outside
/// that gate and outside the ring cycle.
class AlertService extends ChangeNotifier with WidgetsBindingObserver {
  AlertService({
    required this.store,
    required this.authRepository,
    required this.jobsRepository,
    required this.socket,
    required this.locationTracker,
  });

  static const _pollInterval = Duration(seconds: 15);
  static const _maxPollInterval = Duration(seconds: 60);
  static const ringDuration = Duration(seconds: 30);
  static const _ringGap = Duration(minutes: 3);
  static const _postRejectHold = Duration(seconds: 5);
  static const _cancelTone = Duration(seconds: 3);
  static const _silencedKey = 'silenced_job_ids';
  static const _blockingJobStatuses = {'IN_PROGRESS', 'ASSIGNED', 'QUEUED'};

  final SecureStore store;
  final AuthRepository authRepository;
  final JobsRepository jobsRepository;
  final DeliverySocket socket;
  final LocationTracker locationTracker;

  final Map<String, RideAlert> _activeAlerts = {};
  final Set<String> _seenJobIds = {};
  final Set<String> _alertedCancellations = {};
  final List<CancelledOrderAlert> _pendingCancellations = [];

  bool _running = false;
  bool alertEligible = true;
  String? _trackingJobId;
  Timer? _loopTimer;
  Timer? _ringBurstTimer;
  Timer? _ringGapTimer;
  Timer? _postRejectTimer;
  String? _ringingJobId;
  RideAlert? _ringingAlert;
  String? _lastRejectedJobId;
  String? _lastRejectedStoreId;
  DateTime? _postRejectHoldUntil;
  int _cycle = 0;
  int _consecutiveFailures = 0;
  bool _appInForeground = true;

  AudioPlayer? _alertPlayer;
  AudioPlayer? _cancelPlayer;
  SharedPreferences? _prefs;

  /// Fired when the incoming-ride card should be shown for [RideAlert].
  final _incoming = StreamController<RideAlert>.broadcast();
  Stream<RideAlert> get incomingRides => _incoming.stream;

  // ---------------- Public state (the Kotlin companion StateFlows) ----------------

  /// Empty while the rider holds an unfinished ride: no new-ride card or popup is shown
  /// until the current ride is done. Alerts are kept and surface once eligible again.
  List<RideAlert> get activeAlerts => alertEligible
      ? prioritizedRideAlerts(_activeAlerts.values, _lastRejectedJobId, _lastRejectedStoreId)
      : const [];
  Set<String> get activeAlertJobIds => activeAlerts.map((a) => a.jobId).toSet();
  RideAlert? get ringingAlert => alertEligible ? _ringingAlert : null;
  bool get postRejectHoldActive => _isPostRejectHoldActive;
  List<CancelledOrderAlert> get pendingCancellations => List.unmodifiable(_pendingCancellations);
  bool get isRunning => _running;
  bool get appInForeground => _appInForeground;

  // ---------------- Lifecycle ----------------

  Future<void> start() async {
    if (store.token == null) return;
    _prefs ??= await SharedPreferences.getInstance();
    await DutyService.start(trackingActive: _trackingJobId != null);
    if (_running) return;
    _running = true;
    WidgetsBinding.instance.addObserver(this);
    // The observer only hears changes — start from the real state (e.g. launched behind
    // the lock screen = paused), not an assumed "foreground".
    final life = WidgetsBinding.instance.lifecycleState;
    _appInForeground = life == null || life == AppLifecycleState.resumed;
    socket.on('newDeliveryJob', _onSocketNewJob);
    socket.on('jobAssignedToDriver', _onSocketJobAssigned);
    socket.on('deliveryJobClaimed', _onSocketJobClaimed);
    socket.on('orderCancelled', _onSocketOrderCancelled);
    _connectSocketPools();
    _cycle = 0;
    _consecutiveFailures = 0;
    _runCycle();
    notifyListeners();
  }

  Future<void> stop() async {
    _running = false;
    WidgetsBinding.instance.removeObserver(this);
    _loopTimer?.cancel();
    _loopTimer = null;
    socket.off('newDeliveryJob', _onSocketNewJob);
    socket.off('jobAssignedToDriver', _onSocketJobAssigned);
    socket.off('deliveryJobClaimed', _onSocketJobClaimed);
    socket.off('orderCancelled', _onSocketOrderCancelled);
    for (final id in _activeAlerts.keys.toList()) {
      BcNotifications.cancelJob(id);
    }
    _activeAlerts.clear();
    _pauseRingCycle();
    _postRejectTimer?.cancel();
    _stopCancelSound();
    _trackingJobId = null;
    await locationTracker.stop();
    _pendingCancellations.clear();
    await DutyService.stop();
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appInForeground = state == AppLifecycleState.resumed;
    // The in-app takeover and the system heads-up must never show together:
    // post the notification only once the app leaves the screen, drop it on return.
    final ringing = _ringingAlert;
    final burstActive = _ringBurstTimer?.isActive ?? false;
    if (ringing == null || !burstActive) {
      _syncQueuedNotification(state);
      return;
    }
    if (state == AppLifecycleState.resumed) {
      BcNotifications.cancelJob(ringing.jobId);
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      BcNotifications.notifyNewJob(ringing);
    }
  }

  // ---------------- Poll loop ----------------

  Future<void> _runCycle() async {
    if (!_running) return;
    try {
      DriverProfile? profile;
      try {
        profile = await authRepository.getMe();
        if (!profile.isOnline) {
          debugPrint('Driver went off duty — stopping alert service');
          await stop();
          return;
        }
        if (profile.alertEligible != alertEligible) {
          setAlertEligible(profile.alertEligible);
        }
      } catch (e) {
        debugPrint('Alert loop getMe failed (continuing poll/socket): $e');
      }
      if (_cycle % 4 == 0) {
        _connectSocketPools(profile: profile);
      }
      await _pollJobs();
      _consecutiveFailures = 0;
    } catch (e) {
      debugPrint('Alert loop cycle failed: $e');
      _consecutiveFailures++;
    }
    _cycle++;
    if (!_running) return;
    _loopTimer = Timer(_pollDelayFor(_consecutiveFailures), _runCycle);
  }

  /// Fixed 15s cadence while healthy; backs off (30s, 60s, capped) across a failure streak.
  Duration _pollDelayFor(int failures) {
    if (failures <= 0) return _pollInterval;
    final ms = _pollInterval.inMilliseconds << failures.clamp(0, 2);
    return Duration(milliseconds: ms.clamp(0, _maxPollInterval.inMilliseconds));
  }

  Future<void> _connectSocketPools({DriverProfile? profile}) async {
    socket.connect();
    final ids = <String>{};
    if (profile != null) {
      ids.addAll(profile.poolStoreIds);
    }
    final session = authRepository.restore();
    if (session?.storeId != null) ids.add(session!.storeId!);
    try {
      final jobs = await jobsRepository.listJobs();
      for (final j in jobs) {
        if (j.storeId.isNotEmpty) ids.add(j.storeId);
      }
    } catch (_) {}
    if (ids.isNotEmpty) socket.joinBranchPool(ids.toList());
  }

  Future<void> _pollJobs() async {
    final jobs = await jobsRepository.listJobs();
    final availableIds = jobs.where((j) => j.status == 'SCHEDULED').map((j) => j.id).toSet();
    for (final id in _activeAlerts.keys.where((id) => !availableIds.contains(id)).toList()) {
      _silenceJob(id);
    }
    if (_seenJobIds.length > 500) {
      _seenJobIds
        ..clear()
        ..addAll(jobs.map((j) => j.id));
      return;
    }
    final fresh = jobs.where((j) => _seenJobIds.add(j.id));
    for (final job in fresh.where((j) => j.status == 'SCHEDULED')) {
      _alertJob(RideAlert.fromJob(job));
    }
  }

  // ---------------- Socket handlers ----------------

  static Json? _payload(dynamic raw) {
    if (raw is List && raw.isNotEmpty) raw = raw.first;
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return null;
  }

  void _onSocketNewJob(dynamic raw) {
    final obj = _payload(raw);
    if (obj == null) {
      _pollJobs().catchError((_) {});
      return;
    }
    final id = str(obj, 'id');
    if (id.isEmpty) return;
    final isRebroadcast = obj['broadcastedAt'] != null;
    final forceRing = boolOf(obj, 'forceRing');
    final scheduledAt = strOrNull(obj, 'scheduledAt');
    if (!forceRing &&
        scheduledAt != null &&
        scheduledAt.isNotEmpty &&
        !Format.isToday(scheduledAt)) {
      debugPrint('Skipping ring for $id — not scheduled today');
      return;
    }
    if (isRebroadcast) {
      _seenJobIds.remove(id);
      _unsilence(id);
      final alert = RideAlert.fromSocket(obj);
      if (forceRing) {
        // Admin "Re-ring" — ring right now even if this job is already tracked.
        if (alertEligible) _forceRingNow(alert);
      } else {
        _enqueueRebroadcast(alert);
      }
      return;
    }
    if (!_seenJobIds.add(id)) return;
    _alertJob(RideAlert.fromSocket(obj));
  }

  void _onSocketJobAssigned(dynamic raw) {
    final obj = _payload(raw);
    if (obj == null) return;
    final id = str(obj, 'id').isNotEmpty ? str(obj, 'id') : str(obj, 'jobId');
    if (id.isEmpty) return;
    final alert = RideAlert.fromSocket(obj);
    if (boolOf(obj, 'forceRing')) {
      // Failure offer — ring now. The job stays unclaimed until they accept.
      _seenJobIds.remove(id);
      _unsilence(id);
      _forceRingNow(alert);
      return;
    }
    // Admin hand-picked this rider — ring if eligible, never silence.
    _alertJob(alert);
  }

  void _onSocketJobClaimed(dynamic raw) {
    final obj = _payload(raw);
    if (obj == null) return;
    final id = str(obj, 'id').isNotEmpty ? str(obj, 'id') : str(obj, 'jobId');
    if (id.isNotEmpty) _silenceJob(id);
  }

  void _onSocketOrderCancelled(dynamic raw) {
    final obj = _payload(raw);
    if (obj == null) return;
    orderCancelled(jobId: str(obj, 'jobId'), orderId: str(obj, 'orderId'), orderNumber: str(obj, 'orderNumber'));
  }

  // ---------------- Entry points (socket, FCM, UI) ----------------

  /// Same as DriverAlertService.alertJob — used by FCM pushes too.
  void alertJob(RideAlert alert) => _alertJob(alert);

  /// Manual admin re-ring via FCM.
  void forceRing(RideAlert alert) {
    if (alertEligible) _forceRingNow(alert);
  }

  /// A stop on the active ride was cancelled. Dedicated tone + heads-up notification —
  /// never the looping new-job alert, and never gated by [alertEligible].
  void orderCancelled({required String jobId, required String orderId, required String orderNumber}) {
    if (orderId.isEmpty) return;
    // Socket and FCM both deliver this; only alert once per order.
    if (!_alertedCancellations.add(orderId)) return;
    if (_alertedCancellations.length > 200) {
      _alertedCancellations
        ..clear()
        ..add(orderId);
    }
    if (!_pendingCancellations.any((c) => c.orderId == orderId)) {
      _pendingCancellations.add(CancelledOrderAlert(jobId: jobId, orderId: orderId, orderNumber: orderNumber));
    }
    BcNotifications.notifyOrderCancelled(orderId, orderNumber);
    BcNotifications.vibrateCancel();
    _startCancelSound();
    if (jobId.isNotEmpty) JobRefreshBus.refresh(jobId);
    notifyListeners();
  }

  void acknowledgeCancellation(String orderId) {
    _pendingCancellations.removeWhere((c) => c.orderId == orderId);
    BcNotifications.cancelOrderCancelled(orderId);
    notifyListeners();
  }

  void silenceJob(String jobId) => _silenceJob(jobId);

  void clearSeen(String jobId) {
    _seenJobIds.remove(jobId);
    _unsilence(jobId);
    _activeAlerts.remove(jobId);
    BcNotifications.cancelJob(jobId);
    _onAlertRemoved(jobId);
    notifyListeners();
  }

  void setAlertEligible(bool eligible) {
    alertEligible = eligible;
    if (!eligible) {
      // Pause ringing while actively delivering — keep alerts queued so ringing resumes later,
      // and pull any new-ride notifications already posted so nothing invites a second claim.
      _pauseRingCycle();
      for (final id in _activeAlerts.keys) {
        BcNotifications.cancelJob(id);
      }
      _queuedNotifiedJobId = null;
    } else {
      _promoteFrontIfNeeded();
    }
    notifyListeners();
  }

  Future<void> startTracking(String jobId) async {
    if (jobId.isEmpty) return;
    _trackingJobId = jobId;
    socket.connect();
    await locationTracker.start(jobId);
    await DutyService.start(trackingActive: true);
  }

  Future<void> stopTracking() async {
    _trackingJobId = null;
    await locationTracker.stop();
    if (_running) await DutyService.start(trackingActive: false);
  }

  void beginPostRejectHold(String jobId, String storeId) {
    _lastRejectedJobId = jobId.isEmpty ? null : jobId;
    _lastRejectedStoreId = storeId.isEmpty ? null : storeId;
    _pauseRingCycle();
    _postRejectTimer?.cancel();
    _postRejectHoldUntil = DateTime.now().add(_postRejectHold);
    notifyListeners();
    _postRejectTimer = Timer(_postRejectHold, () {
      _postRejectHoldUntil = null;
      notifyListeners();
      _promoteFrontIfNeeded();
    });
  }

  void cancelPostRejectHold() {
    _postRejectTimer?.cancel();
    _postRejectTimer = null;
    _postRejectHoldUntil = null;
    _lastRejectedJobId = null;
    _lastRejectedStoreId = null;
    notifyListeners();
  }

  bool get _isPostRejectHoldActive {
    final until = _postRejectHoldUntil;
    return until != null && DateTime.now().isBefore(until);
  }

  // ---------------- Ringing ----------------

  void _alertJob(RideAlert alert) {
    if (alert.jobId.isEmpty) return;
    if (_isSilenced(alert.jobId) || _activeAlerts.containsKey(alert.jobId)) return;
    if (!alertEligible) {
      // Local flag can be stale — verify via jobs list (GET /me often 504 on live).
      jobsRepository
          .listJobs()
          .then((jobs) {
            final blocked = jobs.any((j) => _blockingJobStatuses.contains(j.status));
            if (!blocked) {
              alertEligible = true;
              _ringForJob(alert);
            } else {
              // Hold it silently (hidden by [activeAlerts]) so it can ring once the ride is done.
              debugPrint('Holding ${alert.jobId} — driver has an unfinished ride');
              if (!_isSilenced(alert.jobId)) _activeAlerts[alert.jobId] = alert;
            }
          })
          .catchError((_) {
            _ringForJob(alert);
          });
      return;
    }
    _ringForJob(alert);
  }

  void _ringForJob(RideAlert alert) {
    if (_isSilenced(alert.jobId) || _activeAlerts.containsKey(alert.jobId)) return;
    _activeAlerts[alert.jobId] = alert;
    notifyListeners();
    // Only one unclaimed job rings at a time — others wait as a badge on the Jobs list.
    _promoteFrontIfNeeded();
  }

  /// Reject/admin rebroadcast of a job that may already be tracked. Enqueue, do not jump the queue.
  void _enqueueRebroadcast(RideAlert alert) {
    if (alert.jobId.isEmpty) return;
    _activeAlerts[alert.jobId] = alert;
    notifyListeners();
    // While a ride is unfinished the alert stays hidden — no card, no notification.
    if (alertEligible) _promoteFrontIfNeeded();
  }

  /// Job id of a queued-card notification still on screen (cleared on resume).
  /// Queued rides are no longer notified while a ride is unfinished — they stay hidden
  /// until the rider is eligible again, then ring normally.
  String? _queuedNotifiedJobId;

  /// Queued-card counterpart of the ringing hand-off in [didChangeAppLifecycleState].
  void _syncQueuedNotification(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final shown = _queuedNotifiedJobId;
      _queuedNotifiedJobId = null;
      if (shown != null) BcNotifications.cancelJob(shown);
    }
  }

  void _forceRingNow(RideAlert alert) {
    _activeAlerts[alert.jobId] = alert;
    notifyListeners();
    _startRingCycle(alert);
  }

  void _silenceJob(String jobId) {
    _markSilenced(jobId);
    _activeAlerts.remove(jobId);
    BcNotifications.cancelJob(jobId);
    _onAlertRemoved(jobId);
    notifyListeners();
  }

  void _onAlertRemoved(String jobId) {
    if (_queuedNotifiedJobId == jobId) _queuedNotifiedJobId = null;
    if (_ringingJobId == jobId) _pauseRingCycle();
    _promoteFrontIfNeeded();
  }

  /// Ensure the next unclaimed job (if any) is the one actively ringing.
  void _promoteFrontIfNeeded() {
    if (_isPostRejectHoldActive) return;
    if (!alertEligible) {
      _pauseRingCycle();
      return;
    }
    final next = pickNextRideAlert(_activeAlerts.values, _lastRejectedJobId, _lastRejectedStoreId);
    if (next == null) {
      _pauseRingCycle();
      return;
    }
    if (_ringingJobId == next.jobId && (_ringBurstTimer?.isActive ?? false)) return;
    if (_ringingJobId == next.jobId && (_ringGapTimer?.isActive ?? false)) return;
    _startRingCycle(next);
  }

  /// Ring ~30s, then wait ~3min and ring again while the job is still open.
  void _startRingCycle(RideAlert alert) {
    // Covers forced rings (admin re-ring, failure offers) too: nothing pops up mid-ride.
    if (!alertEligible) return;
    _ringBurstTimer?.cancel();
    _ringGapTimer?.cancel();
    final current = _activeAlerts[alert.jobId];
    if (current == null) return;
    _ringingJobId = alert.jobId;
    _ringingAlert = current;
    notifyListeners();
    _incoming.add(current);
    if (!_appInForeground) {
      // In the foreground the full-screen takeover is the alert; a banner on top would overlap it.
      BcNotifications.notifyNewJob(current);
      try {
        FlutterForegroundTask.wakeUpScreen();
      } catch (_) {}
    }
    _startAlertSound();
    _ringBurstTimer = Timer(ringDuration, () {
      _stopAlertSound();
      if (_activeAlerts.containsKey(alert.jobId)) {
        _ringGapTimer = Timer(_ringGap, () {
          _ringingJobId = null;
          _promoteFrontIfNeeded();
        });
      }
    });
  }

  void _pauseRingCycle() {
    _ringBurstTimer?.cancel();
    _ringGapTimer?.cancel();
    _ringBurstTimer = null;
    _ringGapTimer = null;
    _ringingJobId = null;
    if (_ringingAlert != null) {
      _ringingAlert = null;
      notifyListeners();
    }
    _stopAlertSound();
  }

  Future<void> _startAlertSound() async {
    if (!alertEligible) return;
    if (_alertPlayer != null) return;
    try {
      final player = AudioPlayer(playerId: 'new_job_alert');
      _alertPlayer = player;
      await player.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            usageType: AndroidUsageType.alarm,
            contentType: AndroidContentType.sonification,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
          iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
        ),
      );
      await player.setReleaseMode(ReleaseMode.loop);
      await player.play(AssetSource('sounds/new_job_alert.wav'));
    } catch (e) {
      debugPrint('Could not start looping job alert: $e');
    }
  }

  void _stopAlertSound() {
    final p = _alertPlayer;
    _alertPlayer = null;
    if (p != null) {
      p.stop().whenComplete(p.dispose);
    }
  }

  Future<void> _startCancelSound() async {
    _stopCancelSound();
    try {
      final player = AudioPlayer(playerId: 'order_cancelled_alert');
      _cancelPlayer = player;
      await player.setAudioContext(
        AudioContext(
          android: const AudioContextAndroid(
            usageType: AndroidUsageType.notificationEvent,
            contentType: AndroidContentType.sonification,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
          iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
        ),
      );
      await player.setReleaseMode(ReleaseMode.stop);
      await player.play(AssetSource('sounds/order_cancelled_alert.wav'));
      // Hard stop in case the clip is longer than a cancellation alert warrants.
      Timer(_cancelTone, _stopCancelSound);
    } catch (e) {
      debugPrint('Could not play cancellation tone: $e');
    }
  }

  void _stopCancelSound() {
    final p = _cancelPlayer;
    _cancelPlayer = null;
    if (p != null) {
      p.stop().whenComplete(p.dispose);
    }
  }

  // ---------------- Silenced job ids (persisted) ----------------

  bool _isSilenced(String jobId) => (_prefs?.getStringList(_silencedKey) ?? const []).contains(jobId);

  void _markSilenced(String jobId) {
    final ids = List<String>.of(_prefs?.getStringList(_silencedKey) ?? const []);
    if (ids.contains(jobId)) return;
    ids.add(jobId);
    if (ids.length > 500) ids.removeAt(0);
    _prefs?.setStringList(_silencedKey, ids);
  }

  void _unsilence(String jobId) {
    final ids = List<String>.of(_prefs?.getStringList(_silencedKey) ?? const []);
    if (ids.remove(jobId)) _prefs?.setStringList(_silencedKey, ids);
  }

  /// Exposed for screens that receive a JobSummary list (badge state on the Jobs tab).
  bool isAlerting(JobSummary job) => _activeAlerts.containsKey(job.id);
}
