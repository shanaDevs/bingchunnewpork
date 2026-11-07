import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/format.dart';
import '../../data/realtime/admin_socket.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/delivery.dart';
import '../../domain/logic/delivery_rules.dart';
import '../../domain/repositories/repositories.dart';

/// Live Drivers — port of the web `/admin/delivery/live`: today's runs and the
/// branch riders polled every 10 s, with `driverLocation` pings moving the pins live.
class LiveDriversController extends ChangeNotifier {
  LiveDriversController(this._repo, this._socket, this.session) {
    _pingSub = _socket.driverPings.listen(_onPing);
    _jobSub = _socket.jobUpdates.listen((_) => refresh(silent: true));
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => refresh(silent: true));
    refresh();
  }

  final DeliveryRepository _repo;
  final AdminSocket _socket;
  final AdminSession session;
  late final StreamSubscription<DriverPing> _pingSub;
  late final StreamSubscription<void> _jobSub;
  late final Timer _timer;

  Map<String, LiveDriver> _drivers = {};
  List<DeliveryJob> jobs = const [];
  bool loading = true;
  String? error;
  String? selectedDriverId;

  /// Bumped when the map should fly to the selected rider.
  int focusNonce = 0;

  List<LiveDriver> get drivers {
    final list = _drivers.values.toList()
      ..sort((a, b) {
        // Riders with a position first, then on-duty, then by name.
        final pa = a.location == null ? 1 : 0;
        final pb = b.location == null ? 1 : 0;
        if (pa != pb) return pa - pb;
        return a.name.compareTo(b.name);
      });
    return list;
  }

  List<LiveDriver> get onMap => drivers.where((d) => d.location != null).toList();

  /// Runs with a rider on the road right now.
  List<DeliveryJob> get liveRuns => jobs.where((j) => liveRunStatuses.contains(j.status)).toList();

  DeliveryJob? jobFor(LiveDriver d) => jobs.where((j) => j.id == d.jobId || j.driverId == d.driverId).firstOrNull;

  Future<void> refresh({bool silent = false}) async {
    final id = session.storeId;
    if (id == null) {
      loading = false;
      notifyListeners();
      return;
    }
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      final today = colomboToday();
      final results = await Future.wait([
        _repo.liveDrivers(id),
        _repo.jobs({'storeId': id, 'scheduledAtFrom': today, 'scheduledAtTo': today}),
      ]);
      final fresh = results[0] as List<LiveDriver>;
      jobs = results[1] as List<DeliveryJob>;
      _drivers = {for (final d in fresh) d.driverId: _mergeTrail(d, _drivers[d.driverId])};
      error = null;
    } catch (e) {
      if (!silent || _drivers.isEmpty) error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  /// Keep pings received between polls when the API trail is older.
  LiveDriver _mergeTrail(LiveDriver api, LiveDriver? local) {
    if (local == null || local.location == null) return api;
    final apiAt = api.updatedAt;
    final localAt = local.updatedAt;
    if (apiAt != null && localAt != null && localAt.isAfter(apiAt)) {
      return LiveDriver(
        driverId: api.driverId,
        name: api.name,
        dutyStatus: api.dutyStatus,
        storeName: api.storeName,
        location: local.location,
        heading: local.heading,
        updatedAt: localAt,
        jobId: api.jobId ?? local.jobId,
        trail: local.trail,
      );
    }
    return api.trail.isEmpty
        ? LiveDriver(
            driverId: api.driverId,
            name: api.name,
            dutyStatus: api.dutyStatus,
            storeName: api.storeName,
            location: api.location,
            heading: api.heading,
            updatedAt: api.updatedAt,
            jobId: api.jobId,
            trail: local.trail,
          )
        : api;
  }

  void _onPing(DriverPing p) {
    final id = p.driverId ?? _drivers.values.where((d) => d.jobId != null && d.jobId == p.jobId).firstOrNull?.driverId;
    final d = id == null ? null : _drivers[id];
    if (d == null) return;
    _drivers = {..._drivers, d.driverId: d.moved(p.location, heading: p.heading, at: p.at, jobId: p.jobId)};
    notifyListeners();
  }

  void select(String? driverId) {
    selectedDriverId = driverId;
    focusNonce++;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer.cancel();
    _pingSub.cancel();
    _jobSub.cancel();
    super.dispose();
  }
}
