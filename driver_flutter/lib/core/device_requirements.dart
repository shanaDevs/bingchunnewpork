import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// Live GPS + internet requirements for the rider app — port of DeviceRequirements.kt.
///
/// The app locks when GPS is off, location permission is denied, or there is no internet.
@immutable
class DeviceRequirementState {
  final bool gpsOn;
  final bool internetOn;
  final bool locationPermission;

  const DeviceRequirementState({this.gpsOn = false, this.internetOn = false, this.locationPermission = false});

  /// True when the rider may use the app.
  bool get isSatisfied => gpsOn && internetOn && locationPermission;
  bool get needsGps => !gpsOn || !locationPermission;
  bool get needsInternet => !internetOn;

  @override
  bool operator ==(Object other) =>
      other is DeviceRequirementState &&
      other.gpsOn == gpsOn &&
      other.internetOn == internetOn &&
      other.locationPermission == locationPermission;

  @override
  int get hashCode => Object.hash(gpsOn, internetOn, locationPermission);
}

class DeviceRequirements extends ChangeNotifier {
  // Assume satisfied until the first read so the lock never flashes on launch.
  DeviceRequirementState _state = const DeviceRequirementState(gpsOn: true, internetOn: true, locationPermission: true);
  DeviceRequirementState get state => _state;

  StreamSubscription<ServiceStatus>? _gpsSub;
  StreamSubscription<List<ConnectivityResult>>? _netSub;
  bool _started = false;

  /// Begin listening for GPS / connectivity changes. Safe to call more than once.
  void start() {
    if (_started) {
      refresh();
      return;
    }
    _started = true;
    _gpsSub = Geolocator.getServiceStatusStream().listen((_) => refresh(), onError: (_) {});
    _netSub = Connectivity().onConnectivityChanged.listen((_) => refresh(), onError: (_) {});
    refresh();
  }

  /// Re-read GPS, permission, and internet. Call on resume as a safety net.
  Future<void> refresh() async {
    final next = DeviceRequirementState(
      gpsOn: await _gpsOn(),
      internetOn: await _internetOn(),
      locationPermission: await _hasPermission(),
    );
    if (next != _state) {
      _state = next;
      notifyListeners();
    }
  }

  Future<bool> _gpsOn() async {
    try {
      return await Geolocator.isLocationServiceEnabled();
    } catch (_) {
      return false;
    }
  }

  Future<bool> _hasPermission() async {
    try {
      final p = await Geolocator.checkPermission();
      return p == LocationPermission.always || p == LocationPermission.whileInUse;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _internetOn() async {
    try {
      final r = await Connectivity().checkConnectivity();
      return r.isNotEmpty && !r.contains(ConnectivityResult.none);
    } catch (_) {
      return false;
    }
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    _netSub?.cancel();
    super.dispose();
  }
}
