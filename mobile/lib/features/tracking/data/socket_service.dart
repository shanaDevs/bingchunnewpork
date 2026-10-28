import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../../../core/config/env.dart';
import '../../../core/network/session_invalidator.dart';

/// Realtime connection to the **core** backend default namespace.
///
/// Driver → server events: `driver:location`, `driver:online`, `driver:offline`.
/// Server → driver events (subscribe via [on]): `newDeliveryJob`, `deliveryJobUpdated`.
class SocketService {
  sio.Socket? _socket;

  bool get isConnected => _socket?.connected ?? false;

  /// Connects (or reuses an existing connection) authenticated with the
  /// driver's JWT [token].
  void connect(String token) {
    if (_socket != null) return;

    _socket = sio.io(
      Env.coreSocketOrigin,
      sio.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io')
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .build(),
    );
    _socket!.on('session_revoked', (_) {
      SessionInvalidator.instance.notify(SessionInvalidator.sessionSuperseded);
    });
    _socket!.on('connect_error', (err) {
      final msg = err?.toString() ?? '';
      if (msg.contains(SessionInvalidator.sessionSuperseded)) {
        SessionInvalidator.instance.notify(SessionInvalidator.sessionSuperseded);
      }
    });
  }

  void disconnect() {
    _socket?.emit('driver:offline');
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void goOnline() => _socket?.emit('driver:online');

  void goOffline() => _socket?.emit('driver:offline');

  void emitLocation({
    required double lat,
    required double lng,
    double? heading,
    double? speed,
    String? jobId,
    DateTime? recordedAt,
  }) {
    final at = (recordedAt ?? DateTime.now()).toUtc().toIso8601String();
    _socket?.emit('driver:location', {
      'lat': lat,
      'lng': lng,
      'heading': heading,
      'speed': speed,
      'speedKph': speed,
      'timestamp': at,
      'recordedAt': at,
      'jobId': jobId,
    }..removeWhere((key, value) => value == null));
  }

  void on(String event, void Function(dynamic data) handler) => _socket?.on(event, handler);

  void off(String event) => _socket?.off(event);
}

/// Shared singleton — one realtime connection per app session.
final socketService = SocketService();
