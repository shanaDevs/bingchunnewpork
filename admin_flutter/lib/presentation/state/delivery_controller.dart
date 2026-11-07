import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/format.dart';
import '../../data/realtime/admin_socket.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/delivery.dart';
import '../../domain/logic/delivery_rules.dart';
import '../../domain/repositories/repositories.dart';

/// Delivery Jobs as a cashier sees them — port of the web `/admin/delivery`
/// cashier mode: today's runs in Active / Complete / Incomplete, rider filter,
/// 20 s refresh plus `deliveryJobUpdated` pushes.
class DeliveryController extends ChangeNotifier {
  DeliveryController(this._repo, this._socket, this.session) {
    _sub = _socket.jobUpdates.listen((_) => refresh(silent: true));
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => refresh(silent: true));
    _loadRiders();
    refresh();
  }

  final DeliveryRepository _repo;
  final AdminSocket _socket;
  final AdminSession session;
  late final StreamSubscription<void> _sub;
  late final Timer _timer;

  DeliveryJobsTab tab = DeliveryJobsTab.active;
  String? driverId;
  List<DriverOption> riders = const [];

  final Map<DeliveryJobsTab, List<DeliveryJob>> _jobs = {};
  bool loading = true;
  String? error;
  int _request = 0;

  String? get storeId => session.storeId;

  /// Branch admins can widen the schedule range (cashiers: today only).
  String? dateFrom;
  String? dateTo;

  bool get canPickDates => session.isBranchAdmin;

  void setRange(String? from, String? to) {
    dateFrom = from;
    dateTo = to;
    refresh();
  }

  List<DeliveryJob> jobsFor(DeliveryJobsTab t) {
    final list = _jobs[t] ?? const [];
    // Past-due held jobs carry a displayStatus and belong on Incomplete only.
    return t == DeliveryJobsTab.active ? list.where(isActiveDeliveryJob).toList() : list;
  }

  int countFor(DeliveryJobsTab t) => jobsFor(t).length;

  Future<void> _loadRiders() async {
    final id = storeId;
    if (id == null) return;
    try {
      riders = await _repo.driverPool(id);
      notifyListeners();
    } catch (_) {}
  }

  /// All three lists load together so the tab counts are always current.
  Future<void> refresh({bool silent = false}) async {
    final id = storeId;
    if (id == null) {
      loading = false;
      notifyListeners();
      return;
    }
    final request = ++_request;
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    final today = colomboToday();
    try {
      final results = await Future.wait([
        for (final t in DeliveryJobsTab.values)
          _repo.jobs(
            deliveryJobsQuery(tab: t, storeId: id, today: today, driverId: driverId, from: dateFrom, to: dateTo),
          ),
      ]);
      if (request != _request) return;
      for (var i = 0; i < DeliveryJobsTab.values.length; i++) {
        _jobs[DeliveryJobsTab.values[i]] = results[i];
      }
      error = null;
    } catch (e) {
      if (request != _request) return;
      if (!silent || _jobs.isEmpty) error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void setTab(DeliveryJobsTab t) {
    tab = t;
    notifyListeners();
  }

  void setDriver(String? id) {
    driverId = id;
    refresh();
  }

  @override
  void dispose() {
    _timer.cancel();
    _sub.cancel();
    super.dispose();
  }
}

/// Job drawer: run summary, stops and the planned route (live jobs re-poll).
class DeliveryJobController extends ChangeNotifier {
  DeliveryJobController(this._repo, this._socket, this.jobId, this.storeId) {
    load();
    _sub = _socket.jobUpdates.listen((_) => load(silent: true));
    _pingSub = _socket.driverPings.listen(_onPing);
  }

  final DeliveryRepository _repo;
  final AdminSocket _socket;
  final String jobId;
  final String storeId;
  late final StreamSubscription<void> _sub;
  late final StreamSubscription<DriverPing> _pingSub;

  DeliveryJobDetail? job;
  DeliveryRoute? route;
  String? error;
  bool loading = true;

  /// Latest rider position for this run (live map).
  GeoPoint? rider;

  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      job = await _repo.job(jobId, storeId);
      try {
        route = await _repo.route(jobId, storeId);
      } catch (_) {
        // Map falls back to the stop pins.
      }
      error = null;
    } catch (e) {
      if (!silent || job == null) error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void _onPing(DriverPing p) {
    if (p.jobId != jobId) return;
    rider = p.location;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub.cancel();
    _pingSub.cancel();
    super.dispose();
  }
}

/// Planned or actual route full-screen view.
class RouteViewController extends ChangeNotifier {
  RouteViewController(this._repo, this.jobId, this.storeId, {required this.actual}) {
    load();
  }

  final DeliveryRepository _repo;
  final String jobId;
  final String storeId;
  final bool actual;

  DeliveryRoute? planned;
  ActualRoute? driven;
  bool loading = true;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      if (actual) {
        driven = await _repo.actualRoute(jobId, storeId);
      } else {
        planned = await _repo.route(jobId, storeId);
      }
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }
}
