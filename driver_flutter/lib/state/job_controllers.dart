import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/app_container.dart';
import '../core/events.dart';
import '../core/local_profile.dart';
import '../core/offer_outcomes.dart';
import '../data/models/delivery_job.dart';
import '../data/models/delivery_route.dart';
import '../data/network/api_exception.dart';
import 'jobs_controller.dart';
import '../l10n/l10n.dart';

/// Port of JobDetailViewModel.
class JobDetailController extends ChangeNotifier {
  JobDetailController(this._c) {
    _sub = JobRefreshBus.events.listen((id) {
      if (id == _loadedId) load(id, force: true);
    });
  }

  final AppContainer _c;
  StreamSubscription<String>? _sub;
  String? _loadedId;
  bool _disposed = false;

  bool loading = false;
  bool acting = false;
  bool routeLoading = false;
  DeliveryJobDetail? job;
  DeliveryRoute? route;
  String? error;

  /// Set when an action was refused because an earlier ride was never completed.
  JobSummary? previousRide;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load(String jobId, {bool force = false}) async {
    if (!force && _loadedId == jobId && job != null) return;
    _loadedId = jobId;
    loading = true;
    error = null;
    _emit();
    try {
      final j = await _c.jobsRepository.getJob(jobId);
      loading = false;
      job = j;
      final wantsRoute = j.isActive || j.canAssign || j.isHistorySnapshot;
      // Flag the route as pending in the same frame the job appears, so the
      // summary never flashes the stored estimate before the real route.
      if (wantsRoute) routeLoading = true;
      _emit();
      if (j.isActive) _beginTracking(jobId);
      if (wantsRoute) {
        try {
          route = await _c.jobsRepository.getJobRoute(jobId, j);
        } catch (_) {}
        routeLoading = false;
        _emit();
      }
    } catch (e) {
      loading = false;
      error = errorMessage(e, tr('Failed to load job'));
      _emit();
    }
  }

  Future<bool> assign(String jobId) => _act(() => _c.jobsRepository.assignJob(jobId));
  Future<bool> claim(String jobId) => _act(() async {
    await ensureNoUnfinishedRide(_c, claimingJobId: jobId);
    final j = await _c.jobsRepository.claimJob(jobId);
    OfferOutcomes.instance.record(jobId, OfferOutcome.accepted);
    return j;
  });
  Future<bool> start(String jobId) => _act(() async {
    await ensurePreviousRideCompleted(_c, jobId);
    return _c.jobsRepository.startJob(jobId);
  });
  Future<bool> pickup(String jobId) => _act(() async {
    await ensurePreviousRideCompleted(_c, jobId);
    final fix = await requireFix(_c);
    return _c.jobsRepository.pickupJob(jobId, fix.lat, fix.lng);
  });

  void _beginTracking(String jobId) {
    _c.deliverySocket.connect();
    _c.alertService.startTracking(jobId);
    refreshAlertEligibility(_c);
  }

  Future<bool> reject(String jobId, String reason) async {
    if (acting) return false;
    acting = true;
    error = null;
    _emit();
    _c.alertService.beginPostRejectHold(jobId, job?.store.id ?? '');
    try {
      await _c.jobsRepository.rejectJob(jobId, reason);
      OfferOutcomes.instance.record(jobId, OfferOutcome.declined);
      await _c.alertService.stopTracking();
      _c.alertService.clearSeen(jobId);
      refreshAlertEligibility(_c);
      acting = false;
      job = null;
      _emit();
      JobRefreshBus.refresh(jobId);
      return true;
    } catch (e) {
      _c.alertService.cancelPostRejectHold();
      acting = false;
      error = errorMessage(e, tr('Reject failed'));
      _emit();
      return false;
    }
  }

  Future<bool> _act(Future<DeliveryJobDetail> Function() block) async {
    if (acting) return false;
    acting = true;
    error = null;
    previousRide = null;
    _emit();
    try {
      final j = await block();
      if (j.isActive) _beginTracking(j.id);
      if (j.isActive) {
        try {
          route = await _c.jobsRepository.getJobRoute(j.id);
        } catch (_) {}
      }
      acting = false;
      job = j;
      _emit();
      JobRefreshBus.refresh(j.id);
      return true;
    } on PreviousRideIncompleteException catch (e) {
      // The screen shows the reminder popup; no inline error needed.
      acting = false;
      previousRide = e.job;
      _emit();
      return false;
    } catch (e) {
      acting = false;
      error = errorMessage(e, tr('Action failed'));
      _emit();
      return false;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}

/// Port of DashboardViewModel — the live run screen.
class DashboardController extends ChangeNotifier {
  /// [seed] is a job detail already in memory (e.g. Home's active job), shown at once
  /// while the fresh copy loads, so the screen never opens blank.
  DashboardController(this._c, {DeliveryJobDetail? seed}) {
    job = seed;
    _sub = JobRefreshBus.events.listen((id) {
      if (id == _loadedId) load(id, force: true);
    });
  }

  final AppContainer _c;
  StreamSubscription<String>? _sub;
  String? _loadedId;
  bool _disposed = false;

  bool loading = false;
  bool acting = false;
  DeliveryJobDetail? job;
  DeliveryRoute? route;
  String? error;

  /// Set when start / pickup was refused because an earlier ride was never completed.
  JobSummary? previousRide;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load(String jobId, {bool force = false}) async {
    if (!force && _loadedId == jobId && job != null) return;
    _loadedId = jobId;
    loading = true;
    error = null;
    _emit();
    try {
      final j = await _c.jobsRepository.getJob(jobId);
      if (j.isActive) _beginTracking(jobId);
      // Show the job as soon as it arrives; the route follows without blocking the screen.
      loading = false;
      job = j;
      _emit();
      try {
        route = await _c.jobsRepository.getJobRoute(jobId, j);
      } catch (_) {
        // keep the previous route, if any
      }
      _emit();
    } catch (e) {
      loading = false;
      error = errorMessage(e, tr('Failed to load dashboard'));
      _emit();
    }
  }

  /// Vehicle broke down mid-run: flag it with the rider's location so support can send a
  /// replacement. Throws a [StateError] with a message to show.
  Future<void> reportVehicleFailure(String jobId, String? note) async {
    final active = await _c.jobsRepository.getActiveJob();
    final notRunning = breakdownBlockedMessage(active);
    if (notRunning != null) throw StateError(notRunning);
    final fix = await _c.locationTracker.getCurrentLocation();
    if (fix == null) throw StateError(tr('Could not get your location. Enable GPS and try again.'));
    await _c.jobsRepository.reportVehicleFailure(fix.lat, fix.lng, note: note);
    await LocalProfile.instance.recordBreakdown(note: note, jobId: jobId);
    await _c.alertService.stopTracking();
    JobRefreshBus.refresh(jobId);
    JobRefreshBus.dropRide(jobId);
  }

  Future<void> start(String jobId) async {
    if (acting) return;
    if (!await _c.locationTracker.hasPermission()) {
      error = tr('Location permission is required for delivery tracking.');
      _emit();
      return;
    }
    if (!await _c.locationTracker.isLocationEnabled()) {
      error = tr('Location is off. Turn it on to start this run.');
      _emit();
      return;
    }
    acting = true;
    error = null;
    previousRide = null;
    _emit();
    try {
      await ensurePreviousRideCompleted(_c, jobId);
      final j = await _c.jobsRepository.startJob(jobId);
      DeliveryRoute? r;
      try {
        r = await _c.jobsRepository.getJobRoute(jobId);
      } catch (_) {
        r = route;
      }
      _beginTracking(jobId);
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final gpsOk = _c.locationTracker.isTracking;
      acting = false;
      job = j;
      route = r;
      error = gpsOk ? null : tr('Run started, but GPS tracking didn\'t start. Check location settings.');
      _emit();
      JobRefreshBus.refresh(jobId);
    } on PreviousRideIncompleteException catch (e) {
      acting = false;
      previousRide = e.job;
      _emit();
    } catch (e) {
      acting = false;
      error = errorMessage(e, tr('Failed to start'));
      _emit();
    }
  }

  Future<void> pickup(String jobId) async {
    if (acting) return;
    acting = true;
    error = null;
    previousRide = null;
    _emit();
    try {
      await ensurePreviousRideCompleted(_c, jobId);
      final fix = await requireFix(_c);
      final j = await _c.jobsRepository.pickupJob(jobId, fix.lat, fix.lng);
      DeliveryRoute? r;
      try {
        r = await _c.jobsRepository.getJobRoute(jobId);
      } catch (_) {
        r = route;
      }
      _beginTracking(jobId);
      acting = false;
      job = j;
      route = r;
      _emit();
      JobRefreshBus.refresh(jobId);
    } on PreviousRideIncompleteException catch (e) {
      acting = false;
      previousRide = e.job;
      _emit();
    } catch (e) {
      acting = false;
      error = errorMessage(e, tr('Failed to confirm pickup'));
      _emit();
    }
  }

  Future<bool> reject(String jobId, String reason) async {
    if (acting) return false;
    acting = true;
    error = null;
    _emit();
    _c.alertService.beginPostRejectHold(jobId, job?.store.id ?? '');
    try {
      await _c.jobsRepository.rejectJob(jobId, reason);
      OfferOutcomes.instance.record(jobId, OfferOutcome.declined);
      _c.alertService.clearSeen(jobId);
      acting = false;
      _emit();
      await _endTracking();
      refreshAlertEligibility(_c);
      return true;
    } catch (e) {
      _c.alertService.cancelPostRejectHold();
      acting = false;
      error = errorMessage(e, tr('Reject failed'));
      _emit();
      return false;
    }
  }

  Future<bool> complete(String jobId, double lat, double lng) async {
    if (acting) return false;
    acting = true;
    error = null;
    _emit();
    try {
      final j = await _c.jobsRepository.completeJob(jobId, lat, lng);
      acting = false;
      job = j;
      _emit();
      JobRefreshBus.refresh(jobId);
      await _endTracking();
      refreshAlertEligibility(_c);
      return true;
    } catch (e) {
      acting = false;
      error = errorMessage(e, tr('Failed to complete'));
      _emit();
      return false;
    }
  }

  /// Locally patch an order after a status update and recompute deliveredCount.
  void applyOrderUpdate(JobOrder updated) {
    final j = job;
    if (j == null) return;
    final orders = j.orders.map((o) => o.orderId == updated.orderId ? updated : o).toList();
    final resolved = orders.where((o) => o.isDelivered || o.isFailed || o.status == 'CANCELLED').length;
    final allDone = resolved == orders.length && orders.isNotEmpty;
    final nextStatus = (allDone && j.status == 'IN_PROGRESS') ? 'RETURNING' : j.status;
    job = j.copyWith(orders: orders, deliveredCount: resolved, status: nextStatus);
    _emit();
    if (nextStatus == 'RETURNING') refreshAlertEligibility(_c);
  }

  void clearError() {
    error = null;
    _emit();
  }

  void _beginTracking(String jobId) {
    _c.deliverySocket.connect();
    _c.alertService.startTracking(jobId);
    refreshAlertEligibility(_c);
  }

  Future<void> _endTracking() => _c.alertService.stopTracking();

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}

/// Port of OrderActionViewModel — one customer stop.
class OrderActionController extends ChangeNotifier {
  OrderActionController(this._c);

  final AppContainer _c;
  bool _disposed = false;

  bool acting = false;
  String? error;
  String? failureError;
  bool otpRequired = false;
  JobOrder? lastUpdated;
  bool sendingCode = false;
  bool codeSent = false;
  bool loading = false;
  JobOrder? order;
  String? loadError;
  bool filingComplaint = false;
  String? complaintError;

  void _emit() {
    if (!_disposed) notifyListeners();
  }

  /// Loads the stop straight from the API; [fallback] covers older backends.
  Future<void> loadOrder(String orderId, JobOrder? Function() fallback) async {
    if (loading) return;
    loading = true;
    loadError = null;
    _emit();
    try {
      order = await _c.jobsRepository.getOrder(orderId);
    } catch (e) {
      final local = fallback();
      order = local;
      loadError = local != null ? null : errorMessage(e, tr('Failed to load order'));
    }
    loading = false;
    _emit();
  }

  void setOrder(JobOrder o) {
    order = o;
    loadError = null;
    _emit();
  }

  Future<JobOrder?> updateStatus(String orderId, String status, {String? otp, String? note, String? outcome}) async {
    if (acting) return null;
    final isFailure = status == 'DELIVERY_FAILED';
    acting = true;
    if (isFailure) {
      failureError = null;
    } else {
      error = null;
    }
    otpRequired = false;
    _emit();
    try {
      final o = await _c.jobsRepository.updateOrderStatus(orderId, status, note: note, otp: otp, outcome: outcome);
      acting = false;
      lastUpdated = o;
      order = o;
      _emit();
      return o;
    } on ApiException catch (e) {
      acting = false;
      if (isFailure) {
        failureError = e.message;
      } else {
        error = e.message;
        otpRequired = e.isOtpRequired;
      }
      _emit();
      return null;
    } catch (e) {
      acting = false;
      final msg = errorMessage(e, tr('Update failed'));
      if (isFailure) {
        failureError = msg;
      } else {
        error = msg;
      }
      _emit();
      return null;
    }
  }

  /// Sends a fresh delivery code to the customer so they can read it back to the driver.
  Future<void> sendCodeToCustomer(String orderId) async {
    if (sendingCode) return;
    sendingCode = true;
    error = null;
    codeSent = false;
    _emit();
    try {
      await _c.jobsRepository.resendOrderOtp(orderId);
      codeSent = true;
    } catch (e) {
      error = errorMessage(e, tr('Could not send the code'));
    }
    sendingCode = false;
    _emit();
  }

  void clearOtpRequired() {
    otpRequired = false;
    _emit();
  }

  void clearError() {
    error = null;
    _emit();
  }

  void clearFailureError() {
    failureError = null;
    _emit();
  }

  void clearComplaintError() {
    complaintError = null;
    _emit();
  }

  Future<bool> fileComplaint(String orderId, String category, String description) async {
    if (filingComplaint) return false;
    filingComplaint = true;
    complaintError = null;
    _emit();
    try {
      await _c.jobsRepository.createComplaint(orderId, category, description);
      filingComplaint = false;
      _emit();
      return true;
    } catch (e) {
      filingComplaint = false;
      complaintError = errorMessage(e, tr('Could not file complaint'));
      _emit();
      return false;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
