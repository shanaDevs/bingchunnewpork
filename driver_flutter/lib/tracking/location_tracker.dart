import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../core/format.dart';
import '../data/json.dart';
import '../data/repositories/jobs_repository.dart';
import 'delivery_socket.dart';

/// Last GPS fix with optional travel heading (0 = north, clockwise).
class DriverFix {
  final double lat;
  final double lng;
  final double? heading;

  const DriverFix({required this.lat, required this.lng, this.heading});
}

/// GPS tracking while a job is IN_PROGRESS, plus a low-frequency idle mode that runs
/// whenever the driver is ONLINE so dispatch can still see where they are.
/// Port of LocationTracker.kt.
///
/// Streams to the core socket in realtime when connected; otherwise queues
/// points and drains them via POST /delivery/locations/batch on stop / reconnect.
class LocationTracker extends ChangeNotifier {
  LocationTracker(this._jobs, this._socket) {
    _socket.addConnectListener(flushBatch);
  }

  static const _activeIntervalMs = 5000;
  static const _activeMinDistanceM = 15;
  static const _idleIntervalMs = 30000;
  static const _idleMinDistanceM = 50;
  static const _currentFixTimeout = Duration(seconds: 12);

  final JobsRepository _jobs;
  final DeliverySocket _socket;

  final List<Json> _queue = [];
  StreamSubscription<Position>? _sub;
  String? _activeJobId;
  bool _tracking = false;
  bool _idleMode = false;
  DriverFix? _lastFix;
  DriverFix? _previousFix;
  bool _runTracking = false;
  bool _flushing = false;

  /// Last fix. Null when tracking is off — never a synthetic coordinate.
  DriverFix? get lastFix => _lastFix;

  /// True only during an in-progress run (not idle duty pings).
  bool get runTracking => _runTracking;

  bool get isTracking => _tracking;

  Future<bool> hasPermission() async {
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  Future<bool> isLocationEnabled() => Geolocator.isLocationServiceEnabled();

  /// One-off current position, independent of whether continuous tracking is running.
  /// Falls back to the last known fix (or null) if a fresh fix can't be obtained.
  Future<DriverFix?> getCurrentLocation() async {
    final cached = _lastFix;
    if (!await hasPermission()) return cached;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: _currentFixTimeout),
      );
      return DriverFix(lat: pos.latitude, lng: pos.longitude);
    } catch (_) {
      try {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null) return DriverFix(lat: last.latitude, lng: last.longitude);
      } catch (_) {}
      return cached;
    }
  }

  /// High-frequency tracking for a run that is under way.
  Future<void> start(String? jobId) => _beginUpdates(jobId, idle: false);

  /// Battery-friendly tracking while the driver is online but not delivering.
  Future<void> startIdle() => _beginUpdates(null, idle: true);

  Future<void> _beginUpdates(String? jobId, {required bool idle}) async {
    if (!await hasPermission()) return;
    // Never downgrade an in-progress run back to the idle cadence.
    if (idle && _tracking && !_idleMode) return;
    if (_tracking && _idleMode == idle && _activeJobId == jobId) return;
    if (_tracking) await _stopUpdates();

    _activeJobId = jobId;
    _idleMode = idle;
    _tracking = true;
    _runTracking = !idle;
    notifyListeners();

    final settings = _settingsFor(idle);
    _sub = Geolocator.getPositionStream(locationSettings: settings)
        .listen(_applyFix, onError: (Object e) => debugPrint('Location stream error: $e'));
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) _applyFix(last);
    } catch (_) {}
  }

  LocationSettings _settingsFor(bool idle) {
    final interval = Duration(milliseconds: idle ? _idleIntervalMs : _activeIntervalMs);
    final distance = idle ? _idleMinDistanceM : _activeMinDistanceM;
    final accuracy = idle ? LocationAccuracy.medium : LocationAccuracy.high;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(accuracy: accuracy, distanceFilter: distance, intervalDuration: interval);
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: accuracy,
        distanceFilter: distance,
        activityType: ActivityType.automotiveNavigation,
        pauseLocationUpdatesAutomatically: false,
        allowBackgroundLocationUpdates: !idle,
        showBackgroundLocationIndicator: !idle,
      );
    }
    return LocationSettings(accuracy: accuracy, distanceFilter: distance);
  }

  Future<void> stop() async {
    if (!_tracking && _queue.isEmpty) return;
    await _stopUpdates();
    _tracking = false;
    _idleMode = false;
    _runTracking = false;
    _lastFix = null;
    _previousFix = null;
    notifyListeners();
    await flushBatch();
    _activeJobId = null;
  }

  Future<void> _stopUpdates() async {
    await _sub?.cancel();
    _sub = null;
  }

  void _applyFix(Position loc) {
    final gpsHeading = (loc.heading >= 0 && loc.speed > 0.5) ? loc.heading : null;
    final prev = _previousFix;
    double? heading = gpsHeading;
    if (heading == null && prev != null) {
      final moved = haversineMetres(prev.lat, prev.lng, loc.latitude, loc.longitude);
      heading = moved >= 5.0 ? bearingDeg(prev.lat, prev.lng, loc.latitude, loc.longitude) : prev.heading;
    }
    final fix = DriverFix(lat: loc.latitude, lng: loc.longitude, heading: heading);
    _lastFix = fix;
    _previousFix = fix;
    notifyListeners();

    // Position.speed is m/s — convert to km/h for core.
    final speedKph = loc.speed >= 0 ? loc.speed * 3.6 : null;
    final recordedAt = DateTime.now().toUtc().toIso8601String();
    if (_socket.isConnected) {
      _socket.emitLocation(
        lat: loc.latitude,
        lng: loc.longitude,
        heading: heading,
        speedKph: speedKph,
        recordedAt: recordedAt,
        jobId: _activeJobId,
      );
    } else {
      _queue.add(
        compact({
          'lat': loc.latitude,
          'lng': loc.longitude,
          'heading': heading,
          'speedKph': speedKph,
          'recordedAt': recordedAt,
          'jobId': _activeJobId,
        }),
      );
    }
  }

  /// Sends queued points to core; keeps them on failure for the next attempt.
  Future<void> flushBatch() async {
    if (_queue.isEmpty || _flushing) return;
    _flushing = true;
    final batch = List<Json>.of(_queue);
    try {
      final batchJobId = batch
          .map((p) => p['jobId'] as String?)
          .firstWhere((id) => id != null, orElse: () => _activeJobId);
      await _jobs.postLocationBatch(batchJobId, batch);
      _queue.removeRange(0, batch.length.clamp(0, _queue.length));
    } catch (_) {
      // Left queued for the next flush.
    } finally {
      _flushing = false;
    }
  }
}
