import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/events.dart';
import '../core/runtime_config.dart';
import '../data/local/secure_store.dart';

typedef SocketHandler = void Function(dynamic payload);

/// socket.io connection to the **core** backend (default namespace) — port of DeliverySocket.kt.
///
/// Emits: joinBranchPool, driver:location
/// Listens: newDeliveryJob, jobAssignedToDriver, deliveryJobClaimed, orderCancelled (via [on])
class DeliverySocket {
  DeliverySocket(this._store, this._invalidator);

  static const _joinDebounceMs = 15000;

  final SecureStore _store;
  final SessionInvalidator _invalidator;

  io.Socket? _socket;

  /// Handlers keyed by event. The underlying socket gets one dispatcher per event
  /// which reads this map live, so the UI and the alert service can both listen.
  final Map<String, List<SocketHandler>> _handlers = {};
  final Set<String> _attachedEvents = {};
  final List<void Function()> _connectListeners = [];
  List<String> _pendingStoreIds = const [];
  String? _lastJoinedKey;
  int _lastJoinedAtMs = 0;

  bool get isConnected => _socket?.connected ?? false;

  /// Fired on every socket connect/reconnect (e.g. flush queued GPS).
  void addConnectListener(void Function() listener) => _connectListeners.add(listener);

  void connect([String? token]) {
    if (_socket != null) {
      if (isConnected && _pendingStoreIds.isNotEmpty) _emitJoinBranchPool(_pendingStoreIds);
      return;
    }
    final jwt = token ?? _store.token;
    if (jwt == null || jwt.isEmpty) return;

    final url = AppConfig.coreSocketOrigin;
    final sock = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io')
          .setAuth({'token': jwt})
          .enableReconnection()
          .disableAutoConnect()
          .enableForceNew()
          .build(),
    );
    _socket = sock;
    _attachedEvents.clear();
    for (final event in _handlers.keys) {
      _attachDispatcher(sock, event);
    }
    sock.onConnect((_) {
      debugPrint('Core socket connected');
      _lastJoinedKey = null;
      if (_pendingStoreIds.isNotEmpty) _emitJoinBranchPool(_pendingStoreIds, force: true);
      for (final l in List.of(_connectListeners)) {
        try {
          l();
        } catch (e) {
          debugPrint('Connect listener failed: $e');
        }
      }
    });
    sock.onConnectError((err) {
      debugPrint('Core socket connect error: $err');
      if ('$err'.contains(SessionInvalidator.sessionSuperseded)) {
        _invalidator.notify(SessionInvalidator.sessionSuperseded);
      }
    });
    sock.on('session_revoked', (_) => _invalidator.notify(SessionInvalidator.sessionSuperseded));
    sock.connect();
    debugPrint('Connecting to core socket $url');
  }

  /// Join branch pool rooms so admin-created jobs fan out to this driver.
  void joinBranchPool(List<String> storeIds) {
    final ids = storeIds.map((e) => e.trim()).where((e) => e.isNotEmpty).toSet().toList();
    if (ids.isEmpty) return;
    _pendingStoreIds = ids;
    if (isConnected) {
      _emitJoinBranchPool(ids);
    } else {
      // Join runs on connect.
      connect();
    }
  }

  void _emitJoinBranchPool(List<String> storeIds, {bool force = false}) {
    final key = ([...storeIds]..sort()).join(',');
    final now = DateTime.now().millisecondsSinceEpoch;
    if (!force && key == _lastJoinedKey && now - _lastJoinedAtMs < _joinDebounceMs) return;
    _lastJoinedKey = key;
    _lastJoinedAtMs = now;
    _socket?.emit('joinBranchPool', {'storeIds': storeIds});
  }

  void goOnline() => _socket?.emit('driver:online');

  void goOffline() => _socket?.emit('driver:offline');

  /// [speedKph] in km/h; [recordedAt] ISO-8601.
  void emitLocation({
    required double lat,
    required double lng,
    double? heading,
    double? speedKph,
    String? recordedAt,
    String? jobId,
  }) {
    final at = recordedAt ?? DateTime.now().toUtc().toIso8601String();
    _socket?.emit('driver:location', {
      'lat': lat,
      'lng': lng,
      if (heading != null) 'heading': heading,
      if (speedKph != null) 'speedKph': speedKph,
      if (speedKph != null) 'speed': speedKph, // legacy alias accepted by core
      'recordedAt': at,
      'timestamp': at,
      if (jobId != null) 'jobId': jobId,
    });
  }

  void on(String event, SocketHandler handler) {
    _handlers.putIfAbsent(event, () => []).add(handler);
    final sock = _socket;
    if (sock != null) _attachDispatcher(sock, event);
  }

  /// Remove one handler; other listeners for the same event keep working.
  void off(String event, SocketHandler handler) => _handlers[event]?.remove(handler);

  void _attachDispatcher(io.Socket sock, String event) {
    if (!_attachedEvents.add(event)) return;
    sock.on(event, (data) {
      for (final h in List.of(_handlers[event] ?? const <SocketHandler>[])) {
        try {
          h(data);
        } catch (e) {
          debugPrint('Handler for $event failed: $e');
        }
      }
    });
  }

  void disconnect() {
    _pendingStoreIds = const [];
    final sock = _socket;
    if (sock != null) {
      sock.emit('driver:offline');
      sock.disconnect();
      sock.clearListeners();
      sock.dispose();
    }
    _socket = null;
    _attachedEvents.clear();
  }
}
