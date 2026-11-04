import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/runtime_config.dart';
import '../../domain/entities/admin_notification.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/delivery.dart';
import '../json.dart';
import '../mappers/delivery_mappers.dart';
import '../mappers/mappers.dart';

/// Staff Socket.IO connection — port of the web AdminNotificationProvider wiring.
///
/// Handshake auth uses the access JWT from `GET /auth/admin/socket-token`; on
/// connect it joins `admin:<id>` and the branch `store:<storeId>` room, where
/// the shop process announces new orders (`storeNewOrder`).
class AdminSocket {
  AdminSocket(this._tokenProvider);

  final Future<String?> Function() _tokenProvider;

  io.Socket? _socket;
  AdminSession? _session;
  int _authFailures = 0;
  Timer? _authRetry;

  final _notices = StreamController<AdminNotice>.broadcast();
  final _pings = StreamController<DriverPing>.broadcast();
  final _jobUpdates = StreamController<void>.broadcast();
  final _connected = ValueNotifier<bool>(false);

  Stream<AdminNotice> get notices => _notices.stream;

  /// Rider GPS fan-out to the branch room (Live Drivers map).
  Stream<DriverPing> get driverPings => _pings.stream;

  /// A delivery run changed (claimed, started, stop delivered…).
  Stream<void> get jobUpdates => _jobUpdates.stream;
  ValueListenable<bool> get connected => _connected;

  Future<void> connect(AdminSession session) async {
    disconnect();
    _session = session;
    final token = await _tokenProvider();
    if (_session != session) return; // signed out while fetching the token

    final socket = io.io(
      AppConfig.socketOrigin,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': ?token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      _authFailures = 0;
      _connected.value = true;
      socket.emit('joinAdmin', {'adminId': session.id, if (session.storeId != null) 'storeId': session.storeId});
    });
    socket.onDisconnect((_) => _connected.value = false);
    socket.on('socketError', (payload) {
      if (asJson(payload)['code'] == 'UNAUTHORIZED') _retryAuth();
    });
    socket.on('storeNewOrder', (payload) {
      _notices.add(noticeFromJson(asJson(payload), forceType: 'NEW_ORDER'));
    });
    socket.on('adminNotification', (payload) {
      final notice = noticeFromJson(asJson(payload));
      // Product launches and other staff notices are not relevant to the cashier POS.
      if (notice.isNewOrder) _notices.add(notice);
    });
    socket.on('driverLocation', (payload) {
      final ping = driverPingFromJson(asJson(payload));
      if (ping != null) _pings.add(ping);
    });
    socket.on('deliveryJobUpdated', (_) => _jobUpdates.add(null));
    socket.connect();
  }

  /// Access JWT expired mid-session: back off, fetch a fresh one and reconnect.
  void _retryAuth() {
    _authFailures += 1;
    if (_authFailures > 5) {
      _socket?.disconnect();
      return;
    }
    final delay = Duration(milliseconds: (1000 * (1 << (_authFailures.clamp(0, 4)))).clamp(0, 30000));
    _authRetry?.cancel();
    _authRetry = Timer(delay, () async {
      final socket = _socket;
      final token = await _tokenProvider();
      if (token == null || socket == null || socket != _socket) return;
      socket.auth = {'token': token};
      socket
        ..disconnect()
        ..connect();
    });
  }

  void disconnect() {
    _authRetry?.cancel();
    _socket
      ?..clearListeners()
      ..dispose();
    _socket = null;
    _session = null;
    _connected.value = false;
  }
}
