import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../config/api_config.dart';

typedef OrderStatusHandler = void Function(Map<String, dynamic> payload);
typedef QueueUpdateHandler = void Function(Map<String, dynamic> payload);
typedef DriverLocationHandler = void Function(Map<String, dynamic> payload);
typedef EtaUpdateHandler = void Function(Map<String, dynamic> payload);

/// Realtime order status from the core backend socket (same rooms as the web app).
class OrderSocketService {
  sio.Socket? _socket;
  String? _userId;
  final Set<String> _trackedOrders = {};
  OrderStatusHandler? onOrderStatus;
  QueueUpdateHandler? onQueueUpdate;
  DriverLocationHandler? onDriverLocation;
  EtaUpdateHandler? onEtaUpdate;

  bool get isConnected => _socket?.connected ?? false;

  void connect({String? token, String? userId}) {
    _userId = userId;

    if (_socket != null) {
      if (userId != null) _socket!.emit('joinUser', userId);
      for (final orderId in _trackedOrders) {
        _socket!.emit('trackOrder', orderId);
      }
      return;
    }

    final options = sio.OptionBuilder()
        .setTransports(['websocket', 'polling'])
        .setPath('/socket.io')
        .enableAutoConnect()
        .enableReconnection();
    if (token != null && token.isNotEmpty) {
      options.setAuth({'token': token});
    }
    _socket = sio.io(ApiConfig.serverBaseUrl, options.build());

    _socket!.onConnect((_) {
      if (_userId != null) _socket!.emit('joinUser', _userId);
      for (final orderId in _trackedOrders) {
        _socket!.emit('trackOrder', orderId);
      }
    });

    _socket!.on('orderStatus', (dynamic data) {
      if (data is Map) onOrderStatus?.call(Map<String, dynamic>.from(data));
    });

    _socket!.on('orderStatusUpdate', (dynamic data) {
      if (data is Map) onOrderStatus?.call(Map<String, dynamic>.from(data));
    });

    _socket!.on('queueUpdate', (dynamic data) {
      if (data is Map) onQueueUpdate?.call(Map<String, dynamic>.from(data));
    });

    _socket!.on('driverLocation', (dynamic data) {
      if (data is Map) onDriverLocation?.call(Map<String, dynamic>.from(data));
    });

    _socket!.on('etaUpdate', (dynamic data) {
      if (data is Map) onEtaUpdate?.call(Map<String, dynamic>.from(data));
    });
  }

  void trackOrder(String orderIdentifier) {
    if (orderIdentifier.isEmpty) return;
    _trackedOrders.add(orderIdentifier);
    _socket?.emit('trackOrder', orderIdentifier);
  }

  void untrackOrder(String orderIdentifier) {
    _trackedOrders.remove(orderIdentifier);
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _trackedOrders.clear();
    _userId = null;
  }
}

final orderSocketService = OrderSocketService();
