import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/app_container.dart';
import '../core/events.dart';
import '../core/local_profile.dart';
import '../core/offer_outcomes.dart';
import '../data/json.dart';
import '../data/models/delivery_job.dart';
import '../data/models/driver.dart';
import '../data/network/api_exception.dart';
import '../tracking/location_tracker.dart';
import '../l10n/l10n.dart';

/// Pre-pickup vehicle/order failure is blocked — reject the claimed job instead.
/// The last active-job detail Home loaded, so screens pushed above the shell (which can't
/// see [JobsController]) can open with data instead of a blank spinner.
class ActiveJobCache {
  ActiveJobCache._();
  static DeliveryJobDetail? _detail;
  static void put(DeliveryJobDetail? detail) => _detail = detail;
  static DeliveryJobDetail? peek(String jobId) => _detail?.id == jobId ? _detail : null;
}

const rejectJobBeforeFailureMessage = 'reject job if you want to remove the accepted job';

/// Why a breakdown can't be reported yet, or null when the ride is running (server only
/// accepts IN_PROGRESS / RETURNING rides). [active] is the rider's active job, if any.
String? breakdownBlockedMessage(DeliveryJobDetail? active) {
  if (active == null) return null; // let the server decide (job may be held elsewhere)
  // RETURNING: the server closes the ride even when every stop is done (the rider just
  // can't get back to the branch), so it is always reportable.
  if (active.status == 'RETURNING') return null;
  if (active.status == 'IN_PROGRESS') {
    // Mid-run the server needs at least one stop still to deliver; with none left the ride
    // moves to RETURNING on its own.
    if (active.orders.isNotEmpty && active.orders.every((o) => !o.isPending)) {
      return tr(
        'All stops on this ride are already finished, so there is nothing left to hand over. Return to the branch to complete it.',
      );
    }
    return null;
  }
  if (active.canReject) {
    return tr(
      "You haven't picked up this ride's orders yet, so there is nothing to hand over. Reject the job instead if you can't do it.",
    );
  }
  return tr('Start the delivery run first. A breakdown can only be reported once the ride is in progress.');
}

const _heldStatuses = {'IN_PROGRESS', 'ASSIGNED', 'RETURNING', 'QUEUED'};
const _blockingStatuses = {'IN_PROGRESS', 'ASSIGNED', 'QUEUED'};

/// Branch-geofenced actions (pickup, complete) must send the rider's position.
Future<DriverFix> requireFix(AppContainer c) async {
  final fix = await c.locationTracker.getCurrentLocation();
  if (fix == null) throw StateError(tr('Can\'t read your location. Turn on GPS and try again.'));
  return fix;
}

/// One ride at a time: refuse a new claim while the rider still holds an unfinished ride
/// (ASSIGNED / IN_PROGRESS / QUEUED). The API would otherwise accept it as QUEUED.
/// Checks the server so a ride claimed from another surface (alert card, notification) counts.
Future<void> ensureNoUnfinishedRide(AppContainer c, {String? claimingJobId}) async {
  final held = await c.jobsRepository.listJobs();
  if (held.any((j) => j.id != claimingJobId && _blockingStatuses.contains(j.status))) {
    throw StateError(tr('Finish your current delivery before claiming another job'));
  }
}

/// Thrown when the rider tries to pick up / start a ride while an earlier ride is still
/// RETURNING (all orders handled, but "Complete Ride" never tapped).
class PreviousRideIncompleteException implements Exception {
  const PreviousRideIncompleteException(this.job);
  final JobSummary job;

  @override
  String toString() => tr('Complete your previous ride first');
}

/// Reminder gate for pickup / start of [nextJobId]: throws [PreviousRideIncompleteException]
/// while another of the rider's rides is still RETURNING. A failed lookup never blocks the
/// rider — the server stays the final judge.
Future<void> ensurePreviousRideCompleted(AppContainer c, String nextJobId) async {
  List<JobSummary> held;
  try {
    held = await c.jobsRepository.listJobs();
  } catch (_) {
    return;
  }
  final previous = held.where((j) => j.id != nextJobId && j.status == 'RETURNING').firstOrNull;
  if (previous != null) throw PreviousRideIncompleteException(previous);
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

  /// Detail for every held run (a rider can hold a returning ride and a new pickup at once),
  /// so each Home card shows its own phase. Keyed by job id.
  Map<String, DeliveryJobDetail> activeDetails = const {};

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
      final held = list.where((j) => _heldStatuses.contains(j.status)).toList();
      final fetched = await Future.wait(
        held.map((j) async {
          try {
            return await _c.jobsRepository.getJob(j.id);
          } catch (_) {
            // Keep the last known detail rather than dropping the card back to a guess.
            return activeDetails[j.id] ?? (activeJobDetail?.id == j.id ? activeJobDetail : null);
          }
        }),
      );
      final details = <String, DeliveryJobDetail>{
        for (final d in fetched.nonNulls) d.id: d,
      };
      final active = held.firstOrNull;
      final detail = active == null ? null : details[active.id];
      loading = false;
      jobs = list;
      activeDetails = details;
      activeJobDetail = detail;
      ActiveJobCache.put(detail);
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

  /// Re-fetch just the rider profile (e.g. opening profile details). The licence image
  /// URL is a short-lived signed link, so a profile loaded earlier may point at an
  /// expired one. Keeps the previous profile if the request fails.
  Future<void> refreshProfile() async {
    try {
      profile = await _c.authRepository.getMe();
      _emit();
    } catch (_) {}
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
  Future<void> createBranchRequest(String type, String toStoreId, String? reason, {String? fromStoreId}) async {
    await _c.authRepository.createBranchRequest(type, toStoreId, reason: reason, fromStoreId: fromStoreId);
    load();
  }

  /// Driver's vehicle broke down mid-ride — flag it (with location) so admin can send a replacement.
  Future<void> reportVehicleFailure(String? note) async {
    final active = await _c.jobsRepository.getActiveJob();
    final notRunning = breakdownBlockedMessage(active);
    if (notRunning != null) throw StateError(notRunning);
    final fix = await _c.locationTracker.getCurrentLocation();
    if (fix == null) throw StateError(tr('Could not get your location. Enable GPS and try again.'));
    final runningJobId =
        active?.id ?? jobs.where((j) => j.status == 'IN_PROGRESS' || j.status == 'RETURNING').firstOrNull?.id;
    final result = await _c.jobsRepository.reportVehicleFailure(fix.lat, fix.lng, note: note, jobId: runningJobId);
    final activeJobId = (result?.jobId.isNotEmpty ?? false) ? result!.jobId : runningJobId;
    await LocalProfile.instance.recordBreakdown(note: note, jobId: activeJobId, lat: fix.lat, lng: fix.lng);
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
        _c.deliverySocket.goOnline();
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
      // The cached list can be stale (e.g. a ride just accepted from the alert card).
      await ensureNoUnfinishedRide(_c, claimingJobId: jobId);
      final job = await _c.jobsRepository.claimJob(jobId);
      OfferOutcomes.instance.record(jobId, OfferOutcome.accepted);
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
        OfferOutcomes.instance.record(jobId, OfferOutcome.accepted);
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
      OfferOutcomes.instance.record(jobId, OfferOutcome.declined);
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
    final ids = {...p.poolStoreIds};
    _c.jobsRepository
        .listJobs()
        .then((jobs) {
          for (final j in jobs) {
            if (j.storeId.isNotEmpty) ids.add(j.storeId);
          }
          _c.deliverySocket.joinBranchPool(ids.toList());
        })
        .catchError((_) {
          _c.deliverySocket.joinBranchPool(p.poolStoreIds);
        });
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
