import 'dart:async';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/order.dart';
import '../models/cart_item.dart';
import '../services/api_client.dart';
import '../services/notification_service.dart';
import '../services/order_socket_service.dart';
import 'auth_provider.dart';

class OrderState {
  final List<Order> orderHistory;
  final Order? activeOrder;
  final bool isLoading;
  final String? errorMessage;

  OrderState({
    required this.orderHistory,
    this.activeOrder,
    this.isLoading = false,
    this.errorMessage,
  });

  factory OrderState.initial() => OrderState(orderHistory: []);

  Order? get latestActiveOrder {
    final active = orderHistory.where((o) => o.isActive).toList();
    if (active.isEmpty) return activeOrder?.isActive == true ? activeOrder : null;
    active.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return active.first;
  }

  /// Prefer fully-loaded active order (with QR) for dashboard hero.
  Order? get dashboardActiveOrder {
    if (activeOrder?.isActive == true) return activeOrder;
    return latestActiveOrder;
  }

  OrderState copyWith({
    List<Order>? orderHistory,
    Order? activeOrder,
    bool? isLoading,
    String? errorMessage,
  }) {
    return OrderState(
      orderHistory: orderHistory ?? this.orderHistory,
      activeOrder: activeOrder ?? this.activeOrder,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

final orderProvider = StateNotifierProvider<OrderNotifier, OrderState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = OrderNotifier(api);

  // Listen to auth changes side-effects safely to start/stop timers
  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated) {
      notifier.startGlobalTracking();
      notifier.connectRealtime(userId: next.user?.id);
    } else {
      notifier.stopGlobalTracking();
      notifier.disconnectRealtime();
    }
  }, fireImmediately: true);

  return notifier;
});

class OrderNotifier extends StateNotifier<OrderState> {
  final ApiClient _api;
  Timer? _trackingTimer;
  Timer? _globalTimer;
  String? _checkoutIdempotencyKey;

  OrderNotifier(this._api) : super(OrderState.initial());

  void resetCheckoutIdempotency() {
    _checkoutIdempotencyKey = null;
  }

  String _idempotencyKeyForCheckout() {
    _checkoutIdempotencyKey ??= _newIdempotencyKey();
    return _checkoutIdempotencyKey!;
  }

  static String _newIdempotencyKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    return '${bytes.sublist(0, 4).map(hex).join()}-'
        '${bytes.sublist(4, 6).map(hex).join()}-'
        '${bytes.sublist(6, 8).map(hex).join()}-'
        '${bytes.sublist(8, 10).map(hex).join()}-'
        '${bytes.sublist(10, 16).map(hex).join()}';
  }

  @override
  void dispose() {
    _trackingTimer?.cancel();
    _globalTimer?.cancel();
    super.dispose();
  }

  void startGlobalTracking() {
    _globalTimer?.cancel();
    // Run after frame build completes to avoid build phase state modification error
    Future.microtask(() {
      fetchLatestActiveOrder(silent: true);
    });
    // Slow fallback poll when socket is disconnected
    _globalTimer = Timer.periodic(const Duration(seconds: 30), (timer) {
      if (!orderSocketService.isConnected) {
        fetchLatestActiveOrder(silent: true);
      }
    });
  }

  void stopGlobalTracking() {
    _globalTimer?.cancel();
    _trackingTimer?.cancel();
  }

  Future<void> connectRealtime({String? userId}) async {
    _ensureSocketHandlers();
    final token = await _api.readAccessToken();
    orderSocketService.connect(token: token, userId: userId);

    final active = state.activeOrder ?? state.latestActiveOrder;
    if (active != null) {
      orderSocketService.trackOrder(active.id);
      orderSocketService.trackOrder(active.orderNumber);
    }
  }

  void disconnectRealtime() {
    orderSocketService.disconnect();
  }

  void _ensureSocketHandlers() {
    orderSocketService.onOrderStatus = _handleSocketStatus;
    orderSocketService.onQueueUpdate = _handleSocketQueue;
  }

  Order? _findOrder({String? orderId, String? orderNumber}) {
    for (final order in state.orderHistory) {
      if (orderId != null && order.id == orderId) return order;
      if (orderNumber != null && order.orderNumber == orderNumber) return order;
    }
    final active = state.activeOrder;
    if (active == null) return null;
    if (orderId != null && active.id == orderId) return active;
    if (orderNumber != null && active.orderNumber == orderNumber) return active;
    return null;
  }

  void _handleSocketStatus(Map<String, dynamic> data) {
    final orderId = data['orderId'] as String?;
    final orderNumber = data['orderNumber'] as String?;
    final status = data['status'] as String?;
    if (status == null) return;

    final matched = _findOrder(orderId: orderId, orderNumber: orderNumber);
    if (matched == null) return;

    if (matched.status != status) {
      NotificationService.instance.showOrderStatusUpdate(
        orderId: matched.id,
        orderNumber: matched.orderNumber,
        status: status,
        title: _statusDisplay(status),
        body: 'Order #${matched.orderNumber} — ${_statusDisplay(status)}',
      );
    }

    _applyOrderPatch(matched, status: status);
  }

  void _handleSocketQueue(Map<String, dynamic> data) {
    final orderId = data['orderId'] as String?;
    final orderNumber = data['orderNumber'] as String?;
    final queuePosition = data['queuePosition'] as int?;
    final scheduledPickupAt = data['scheduledPickupAt'] as String?;

    final matched = _findOrder(orderId: orderId, orderNumber: orderNumber) ?? state.activeOrder;
    if (matched == null) return;

    _applyOrderPatch(
      matched,
      queuePosition: queuePosition,
      pickupTime: scheduledPickupAt,
    );
  }

  String _statusDisplay(String status) {
    switch (status) {
      case 'RECEIVED':
        return 'Order Placed';
      case 'PREPARING':
        return 'Preparing';
      case 'READY':
        return 'Ready for Pickup';
      case 'OUT_FOR_DELIVERY':
        return 'Out for Delivery';
      case 'DELIVERED':
        return 'Delivered';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  }

  void _applyOrderPatch(
    Order order, {
    String? status,
    int? queuePosition,
    String? pickupTime,
  }) {
    final updated = order.copyWith(
      status: status,
      queuePosition: queuePosition,
      pickupTime: pickupTime,
    );

    final updatedHistory = state.orderHistory.any((o) => o.id == updated.id)
        ? state.orderHistory.map((o) => o.id == updated.id ? updated : o).toList()
        : state.orderHistory;

    state = state.copyWith(
      activeOrder: state.activeOrder?.id == updated.id ? updated : state.activeOrder,
      orderHistory: updatedHistory,
    );

    if (updated.isActive) {
      startTrackingOrder(updated.id);
    } else {
      _trackingTimer?.cancel();
    }
  }

  Future<void> fetchLatestActiveOrder({bool silent = false}) async {
    await fetchOrderHistory(silent: silent || state.orderHistory.isNotEmpty);
    final latest = state.latestActiveOrder;
    if (latest != null) {
      await fetchOrderDetails(latest.id);
      startTrackingOrder(latest.id);
    }
  }

  Future<void> fetchOrderHistory({bool silent = false}) async {
    if (!silent) {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }
    try {
      final List<Order> orders = await _api.get<List<Order>>(
        '/orders/my?page=1&limit=50&filter=all',
        listParser: (jsonList) => jsonList
            .map((item) => Order.fromJson(item as Map<String, dynamic>))
            .toList(),
      );
      state = state.copyWith(
        orderHistory: orders,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  Future<Map<String, dynamic>?> placeOrder({
    required String orderMode, // 'DELIVERY' or 'TAKEAWAY'
    required String storeId,
    String? deliveryZoneId,
    String? addressId,
    Map<String, dynamic>? deliveryAddress,
    required String paymentMethod, // 'CARD', 'PAYHERE', 'CASH_AT_COUNTER', etc
    String? promoCode,
    int? usePoints,
    String? notes,
    String? pickupTime,
    String? scheduledAt,
    Object? scheduleMode, // 15 | 30 | 45 | 'custom'
    String? frontendOrigin,
    required List<CartItem> items,
  }) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final body = {
        'orderMode': orderMode,
        'storeId': storeId,
        if (deliveryZoneId != null) 'deliveryZoneId': deliveryZoneId,
        if (addressId != null) 'addressId': addressId,
        if (deliveryAddress != null) 'deliveryAddress': deliveryAddress,
        'paymentMethod': paymentMethod,
        if (promoCode != null) 'promoCode': promoCode,
        if (usePoints != null && usePoints > 0) 'usePoints': usePoints,
        if (notes != null) 'notes': notes,
        if (pickupTime != null) 'pickupTime': pickupTime,
        if (scheduledAt != null) 'scheduledAt': scheduledAt,
        if (scheduleMode != null) 'scheduleMode': scheduleMode,
        if (frontendOrigin != null) 'frontendOrigin': frontendOrigin,
        'platform': 1,
        'channel': 'APP',
        'items': items.map((item) => {
          'productId': item.product.id,
          'size': item.size.nameString,
          'toppingIds': item.selectedToppings.map((t) => t.id).toList(),
          'quantity': item.quantity,
        }).toList(),
      };

      final data = await _api.post<Map<String, dynamic>>(
        '/orders',
        body,
        extraHeaders: {'Idempotency-Key': _idempotencyKeyForCheckout()},
      );
      final Order order = Order.fromJson(data['order'] as Map<String, dynamic>);

      resetCheckoutIdempotency();

      state = state.copyWith(
        activeOrder: order,
        orderHistory: [order, ...state.orderHistory],
        isLoading: false,
      );

      // Start tracking immediately
      startTrackingOrder(order.id);

      return data;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
      return null;
    }
  }

  bool _orderChanged(Order? before, Order after) {
    if (before == null) return true;
    if (before.status != after.status ||
        before.queuePosition != after.queuePosition ||
        before.qrCode != after.qrCode ||
        before.estimatedMinutes != after.estimatedMinutes) {
      return true;
    }

    // Detail API adds product thumbnails — merge when they arrive.
    for (var i = 0; i < before.items.length && i < after.items.length; i++) {
      final prevUrl = before.items[i].imageUrl;
      final nextUrl = after.items[i].imageUrl;
      if ((prevUrl == null || prevUrl.isEmpty) &&
          nextUrl != null &&
          nextUrl.isNotEmpty) {
        return true;
      }
    }

    return false;
  }

  Future<void> fetchOrderDetails(String orderId) async {
    try {
      final order = await _api.get<Order>(
        '/orders/$orderId',
        parser: (json) => Order.fromJson(json),
      );

      final current = state.activeOrder?.id == order.id ? state.activeOrder : null;
      if (!_orderChanged(current, order)) return;

      if (current != null && current.status != order.status) {
        NotificationService.instance.showOrderStatusUpdate(
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          title: order.statusDisplay,
          body: 'Order #${order.orderNumber} — ${order.statusDisplay}',
        );
      }

      final updatedHistory = state.orderHistory.any((o) => o.id == order.id)
          ? state.orderHistory.map((o) => o.id == order.id ? order : o).toList()
          : [order, ...state.orderHistory];

      state = state.copyWith(
        activeOrder: order,
        orderHistory: updatedHistory,
      );

      if (!order.isActive) {
        _trackingTimer?.cancel();
      }
    } catch (e) {
      // Fail silently for background updates
    }
  }

  void startTrackingOrder(String orderId) {
    _trackingTimer?.cancel();
    _ensureSocketHandlers();
    orderSocketService.connect();
    orderSocketService.trackOrder(orderId);

    final tracked = state.activeOrder?.id == orderId
        ? state.activeOrder
        : _findOrder(orderId: orderId);
    if (tracked != null) {
      orderSocketService.trackOrder(tracked.orderNumber);
    }

    // Fallback poll only when socket is offline
    _trackingTimer = Timer.periodic(const Duration(seconds: 30), (timer) {
      if (!orderSocketService.isConnected) {
        fetchOrderDetails(orderId);
      }
    });
  }

  void stopTrackingOrder() {
    _trackingTimer?.cancel();
  }
}
