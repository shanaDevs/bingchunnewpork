import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../../../core/network/dio_client.dart';
import 'socket_service.dart';

class LocationPoint {
  const LocationPoint({
    required this.lat,
    required this.lng,
    this.heading,
    this.speed,
    required this.capturedAt,
  });

  final double lat;
  final double lng;
  final double? heading;
  /// Speed in km/h (converted from Geolocator m/s).
  final double? speed;
  final DateTime capturedAt;

  Map<String, dynamic> toJson() => {
        'lat': lat,
        'lng': lng,
        if (heading != null) 'heading': heading,
        if (speed != null) 'speed': speed,
        if (speed != null) 'speedKph': speed,
        'capturedAt': capturedAt.toUtc().toIso8601String(),
        'recordedAt': capturedAt.toUtc().toIso8601String(),
      };
}

/// Tracks the driver's GPS position while a job is `IN_PROGRESS`.
///
/// Points stream to the **core** backend in realtime via [SocketService]
/// when connected; otherwise they queue in memory and are drained by
/// [flushBatch] (on a timer while tracking, and on [stopTracking]) via
/// `POST /delivery/locations/batch`.
class LocationService {
  LocationService({DioClient? client, SocketService? socket})
      : _client = client ?? DioClient.core(),
        _socket = socket ?? socketService;

  final DioClient _client;
  final SocketService _socket;
  StreamSubscription<Position>? _positionSub;
  Timer? _flushTimer;
  final List<LocationPoint> _queue = [];
  String? _activeJobId;

  static const _flushInterval = Duration(seconds: 15);

  bool get isTracking => _positionSub != null;
  List<LocationPoint> get queuedPoints => List.unmodifiable(_queue);

  Future<bool> _ensurePermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.always || permission == LocationPermission.whileInUse;
  }

  /// Starts streaming GPS for [jobId]. Idempotent — a second call while
  /// already tracking updates [jobId] and is otherwise a no-op.
  Future<void> startTracking(String jobId) async {
    _activeJobId = jobId;
    if (_positionSub != null) return;

    final granted = await _ensurePermission();
    if (!granted) return;

    const settings = LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 15);
    _positionSub = Geolocator.getPositionStream(locationSettings: settings).listen(
      _onPosition,
      onError: (_) {},
      cancelOnError: false,
    );
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(_flushInterval, (_) {
      unawaited(flushBatch());
    });
  }

  Future<void> stopTracking() async {
    _flushTimer?.cancel();
    _flushTimer = null;
    await _positionSub?.cancel();
    _positionSub = null;
    await flushBatch();
    _activeJobId = null;
  }

  void _onPosition(Position position) {
    final speedKph = position.speed.isFinite && position.speed >= 0 ? position.speed * 3.6 : null;
    final point = LocationPoint(
      lat: position.latitude,
      lng: position.longitude,
      heading: position.heading,
      speed: speedKph,
      capturedAt: DateTime.now(),
    );

    if (_socket.isConnected) {
      _socket.emitLocation(
        lat: point.lat,
        lng: point.lng,
        heading: point.heading,
        speed: point.speed,
        jobId: _activeJobId,
        recordedAt: point.capturedAt,
      );
    } else {
      _queue.add(point);
    }
  }

  /// Sends any queued points to `POST /delivery/locations/batch`. Points stay queued
  /// on failure so the next flush attempt retries them.
  Future<void> flushBatch() async {
    if (_queue.isEmpty) return;
    final batch = List<LocationPoint>.from(_queue);
    try {
      await _client.post<dynamic>('/delivery/locations/batch', {
        if (_activeJobId != null) 'jobId': _activeJobId,
        'points': batch.map((p) => p.toJson()).toList(),
      });
      _queue.removeRange(0, batch.length);
    } catch (_) {
      // Left queued for the next flush/stop attempt.
    }
  }
}

/// Shared singleton — one tracking session per app run.
final locationService = LocationService();
