import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/app_container.dart';
import '../core/events.dart';
import '../data/json.dart';
import '../data/models/delivery_job.dart';
import '../data/models/driver.dart';
import '../data/network/api_exception.dart';
import '../tracking/location_tracker.dart';
import '../l10n/l10n.dart';

/// Pre-pickup vehicle/order failure is blocked — reject the claimed job instead.
const rejectJobBeforeFailureMessage = 'reject job if you want to remove the accepted job';

const _heldStatuses = {'IN_PROGRESS', 'ASSIGNED', 'RETURNING', 'QUEUED'};
const _blockingStatuses = {'IN_PROGRESS', 'ASSIGNED', 'QUEUED'};

/// Branch-geofenced actions (pickup, complete) must send the rider's position.
Future<DriverFix> requireFix(AppContainer c) async {
  final fix = await c.locationTracker.getCurrentLocation();
  if (fix == null) throw StateError(tr('Can\'t read your location. Turn on GPS and try again.'));
  return fix;
}

/// New-job rings stay muted while any job is ASSIGNED/IN_PROGRESS/QUEUED.
Future<void> refreshAlertEligibility(AppContainer c) async {
  bool blocked;
  try {
    blocked = (await c.jobsRepository.listJobs()).any((j) => _blockingStatuses.contains(j.status));
  } catch (_) {
    blocked = false;
  }
  c.alertService.setAlertEligible(!blocked);
}

/// Port of JobsListViewModel — jobs list, duty toggle, history, Me-tab actions.
class JobsController extends ChangeNotifier {
  JobsController(this._c) {
    _c.deliverySocket.on('newDeliveryJob', _onNewJob);
    _c.deliverySocket.on('jobAssignedToDriver', _onJobAssigned);
    _c.deliverySocket.on('deliveryJobClaimed', _onJobClaimed);
    _refreshSub = JobRefreshBus.events.listen((_) => load());
  }

  static const queuedNotice = 'Job queued — it starts once your current run is finished.';

  final AppContainer _c;
  StreamSubscription<String>? _refreshSub;
  Timer? _pollTimer;
  bool _disposed = false;

  bool loading = false;
  bool dutyLoading = false;
  String? claimingId;
  List<JobSummary> jobs = const [];
  DriverProfile? profile;
  String? error;
  String? banner;

  /// Non-fatal note that survives a background [load].
  String? notice;
  bool historyLoading = false;
  List<JobHistoryItem> history = const [];
  String? historyError;
  bool historyLoaded = false;
  DeliveryJobDetail? activeJobDetail;

  final _newJobEvents = StreamController<void>.broadcast();

  /// Fires when a new job lands while the app is open, for in-app sound + banner.
  Stream<void> get newJobEvents => _newJobEvents.stream;

  bool get isOnline => profile?.isOnline ?? false;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  void _onNewJob(dynamic _) {
    // Prefer full refresh — payload date shapes vary and missed joins are common.
    _newJobEvents.add(null);
    load();
  }

  void _onJobAssigned(dynamic _) => load();

  void _onJobClaimed(dynamic raw) {
    try {
      final payload = raw is List && raw.isNotEmpty ? raw.first : raw;
      if (payload is Map) {
        final obj = asJson(payload);
        final jobId = str(obj, 'jobId');
        final driverId = str(obj, 'driverId');
        if (jobId.isNotEmpty && driverId != profile?.id) {
          jobs = jobs.where((j) => j.id != jobId).toList();
          _emit();
          return;
        }
      }
    } catch (_) {}
    load();
  }

  Future<void> load() async {
    loading = true;
    error = null;
    _emit();
    try {
      DriverProfile? p;
      try {
        p = await _c.authRepository.getMe();
      } catch (_) {
        p = profile;
      }
      final list = await _c.jobsRepository.listJobs();
      final active = list.where((j) => _heldStatuses.contains(j.status)).firstOrNull;
      DeliveryJobDetail? detail;
      if (active != null) {
        try {
          detail = await _c.jobsRepository.getJob(active.id);
        } catch (_) {
          detail = activeJobDetail;
        }
      }
      loading = false;
      jobs = list;
      activeJobDetail = detail;
      profile = p;
      banner = (p != null && !p.isOnline) ? tr('Go online to receive jobs') : null;
      _emit();
      if (p != null && p.isOnline) {
        _ensureSocketPool(p);
        _c.alertService.start();
      }
    } catch (e) {
      loading = false;
      error = errorMessage(e, tr('Failed to load jobs'));
      _emit();
    }
  }

  /// Completed runs for the History tab. Cached after the first load; pass force to refresh.
  Future<void> loadHistory({bool force = false}) async {
    if (historyLoading) return;
    if (historyLoaded && !force) return;
    historyLoading = true;
    historyError = null;
    _emit();
    try {
      history = await _c.jobsRepository.listJobHistory();
      historyLoaded = true;
    } catch (e) {
      historyError = errorMessage(e, tr('Failed to load history'));
    }
    historyLoading = false;
    _emit();
  }

  /// True while the rider holds a claimed/active run — sign-out is blocked until it ends.
  /// Asks the server so a ride claimed elsewhere still counts; falls back to the cached list offline.
  Future<bool> hasHeldJob() async {
    try {
      return (await _c.jobsRepository.listJobs()).any((j) => _heldStatuses.contains(j.status));
    } catch (_) {
      return jobs.any((j) => _heldStatuses.contains(j.status));
    }
  }

  Future<List<BranchOption>> listStoresForBranchRequest() => _c.authRepository.listStores();

  Future<List<DriverBranchRequest>> listMyBranchRequests() => _c.authRepository.listBranchRequests();

  Future<List<DriverShiftEntry>> getShiftHistory() => _c.authRepository.getShiftHistory();

  /// Throws on failure so the sheet can show the message.
  Future<void> createBranchRequest(String type, String toStoreId, String? reason) async {
    await _c.authRepository.createBranchRequest(type, toStoreId, reason: reason);
    load();
  }

  /// Driver's vehicle broke down mid-ride — flag it (with location) so admin can send a replacement.
  Future<void> reportVehicleFailure(String? note) async {
    final active = await _c.jobsRepository.getActiveJob();
    if (active?.canReject ?? false) throw StateError(rejectJobBeforeFailureMessage);
    final fix = await _c.locationTracker.getCurrentLocation();
    if (fix == null) throw StateError(tr('Could not get your location. Enable GPS and try again.'));
    final activeJobId =
        active?.id ??
        jobs
            .where((j) => j.status == 'IN_PROGRESS' || j.status == 'ASSIGNED' || j.status == 'RETURNING')
            .firstOrNull
            ?.id;
    await _c.jobsRepository.reportVehicleFailure(fix.lat, fix.lng, note: note);
    if (activeJobId != null) {
      jobs = jobs.where((j) => j.id != activeJobId).toList();
      _emit();
    }
    await _c.alertService.stopTracking();
    load();
    loadHistory(force: true);
    if (activeJobId != null) {
      JobRefreshBus.refresh(activeJobId);
      JobRefreshBus.dropRide(activeJobId);
    }
  }

  /// While online, periodically re-fetch so missed socket events still show jobs.
  void startPollingWhileOnline() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) async {
      if (!isOnline) return;
      try {
        final list = await _c.jobsRepository.listJobs();
        if (!setEquals(list.map((j) => j.id).toSet(), jobs.map((j) => j.id).toSet())) {
          jobs = list;
          _emit();
        }
        final p = profile;
        if (p != null) _ensureSocketPool(p);
      } catch (_) {
        // keep previous list
      }
    });
  }

  Future<void> setOnline(bool online) async {
    if (dutyLoading) return;
    dutyLoading = true;
    error = null;
    _emit();
    try {
      final p = await _c.authRepository.setDuty(
        online ? 'ONLINE' : 'OFF_DUTY',
        current: profile,
      );
      dutyLoading = false;
      profile = p;
      banner = p.isOnline ? null : tr('Go online to receive jobs');
      _emit();
      if (online) {
        _ensureSocketPool(p);
        await _c.alertService.start();
        _c.alertService.setAlertEligible(p.alertEligible);
        await _c.locationTracker.startIdle();
      } else {
        await _c.alertService.stopTracking();
        await _c.alertService.stop();
        await _c.locationTracker.stop();
        _c.deliverySocket.disconnect();
      }
    } on ApiException catch (e) {
      dutyLoading = false;
      error = (e.code == 'ACTIVE_JOB' || e.message.toUpperCase().contains('ACTIVE_JOB'))
          ? tr('Cannot go off duty while a delivery run is active. Finish or hand over the run first.')
          : e.message;
      _emit();
    } catch (e) {
      dutyLoading = false;
      error = errorMessage(e, tr('Duty update failed'));
      _emit();
    }
  }

  /// Returns true when the claimed job is live (not queued) so the caller can open it.
  Future<bool> claim(String jobId) async {
    if (!isOnline) {
      error = tr('Go online to claim jobs');
      _emit();
      return false;
    }
    if (jobs.any((j) => _blockingStatuses.contains(j.status))) {
      error = tr('Finish your current delivery before claiming another job');
      _emit();
      return false;
    }
    if (claimingId != null) return false;
    claimingId = jobId;
    error = null;
    notice = null;
    _emit();
    try {
      final job = await _c.jobsRepository.claimJob(jobId);
      final queued = job.status == 'QUEUED';
      claimingId = null;
      notice = queued ? queuedNotice : null;
      _emit();
      // The one extra claim allowed while returning is now used — stop ringing.
      if (queued) _c.alertService.setAlertEligible(false);
      load();
      if (!queued) {
        _c.deliverySocket.connect();
        await _c.alertService.startTracking(jobId);
        // Mute ringing for other jobs immediately.
        _c.alertService.setAlertEligible(false);
        return true;
      }
      return false;
    } on ApiException catch (e) {
      // Claiming a second run while one is live queues it — a success, not a failure.
      if (e.code == 'QUEUED' || e.code == 'JOB_QUEUED') {
        claimingId = null;
        notice = queuedNotice;
        _emit();
        _c.alertService.setAlertEligible(false);
        load();
      } else {
        claimingId = null;
        error = e.message;
        _emit();
      }
      return false;
    } catch (e) {
      claimingId = null;
      error = errorMessage(e, tr('Claim failed'));
      _emit();
      return false;
    }
  }

  Future<bool> rejectJob(String jobId, String reason) async {
    if (claimingId != null) return false;
    claimingId = jobId;
    error = null;
    notice = null;
    _emit();
    final storeId = jobs.where((j) => j.id == jobId).firstOrNull?.storeId ?? '';
    _c.alertService.beginPostRejectHold(jobId, storeId);
    try {
      await _c.jobsRepository.rejectJob(jobId, reason);
      _c.alertService.clearSeen(jobId);
      await refreshAlertEligibility(_c);
      claimingId = null;
      notice = tr('Job rejected.');
      _emit();
      load();
      return true;
    } catch (e) {
      _c.alertService.cancelPostRejectHold();
      claimingId = null;
      error = errorMessage(e, tr('Reject failed'));
      _emit();
      return false;
    }
  }

  Future<bool> pickupJob(String jobId) async {
    if (claimingId != null) return false;
    claimingId = jobId;
    error = null;
    notice = null;
    _emit();
    try {
      final fix = await requireFix(_c);
      await _c.jobsRepository.pickupJob(jobId, fix.lat, fix.lng);
      claimingId = null;
      _emit();
      load();
      return true;
    } catch (e) {
      claimingId = null;
      error = errorMessage(e, tr('Pickup failed'));
      _emit();
      return false;
    }
  }

  void clearNotice() {
    notice = null;
    _emit();
  }

  void clearError() {
    error = null;
    _emit();
  }

  void _ensureSocketPool(DriverProfile p) {
    _c.deliverySocket.connect();
    _c.deliverySocket.joinBranchPool(p.poolStoreIds);
  }

  @override
  void dispose() {
    _disposed = true;
    // Targeted removal so the AlertService listener keeps working.
    _c.deliverySocket.off('newDeliveryJob', _onNewJob);
    _c.deliverySocket.off('jobAssignedToDriver', _onJobAssigned);
    _c.deliverySocket.off('deliveryJobClaimed', _onJobClaimed);
    _refreshSub?.cancel();
    _pollTimer?.cancel();
    _newJobEvents.close();
    super.dispose();
  }
}
