import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/counter_payment.dart';
import '../../domain/logic/order_query.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/mappers.dart';
import '../network/api_client.dart';
import '../network/api_exception.dart';

class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl(this._api);
  final ApiClient _api;

  String _key(String k) => Uri.encodeComponent(k);

  @override
  Future<Paged<OrderSummary>> list(OrderQuery query, int page) async {
    final body = await _api.envelope(() => _api.dio.get<dynamic>('orders', queryParameters: query.listParams(page)));
    final meta = objOrNull(body, 'meta') ?? const <String, dynamic>{};
    final items = listFrom(body['data'], orderSummaryFromJson);
    return Paged(
      items: items,
      total: intOf(meta, 'total', items.length),
      page: intOf(meta, 'page', page),
      pages: intOf(meta, 'pages', 1),
    );
  }

  @override
  Future<int> count(Map<String, String> params) async {
    final body = await _api.envelope(() => _api.dio.get<dynamic>('orders', queryParameters: params));
    return intOf(objOrNull(body, 'meta') ?? const {}, 'total');
  }

  @override
  Future<OrderDetail> get(String orderKey) =>
      _api.call(() => _api.dio.get<dynamic>('orders/${_key(orderKey)}'), (d) => orderDetailFromJson(asJson(d)));

  @override
  Future<OrderConversation?> conversation(String orderKey) async {
    try {
      return await _api.call(
        () => _api.dio.get<dynamic>('orders/${_key(orderKey)}/conversation'),
        (d) => conversationFromJson(asJson(d)),
      );
    } on ApiException {
      return null;
    }
  }

  @override
  Future<void> updateStatus(String orderId, String status, {String? cancelReason, String? note}) => _api.call(
    () => _api.dio.put<dynamic>(
      'orders/$orderId/status',
      data: compact({'status': status, 'cancelReason': cancelReason, 'note': note}),
    ),
    (_) {},
  );

  @override
  Future<OrderDetail?> completeTakeaway(
    String orderId, {
    required bool collectPayment,
    required bool collectBalance,
    CounterPaymentMethod? method,
    int? cashReceived,
  }) => _api.call(
    () => _api.dio.post<dynamic>(
      'orders/$orderId/complete-takeaway',
      data: compact({
        'collectPayment': collectPayment,
        'collectBalance': collectBalance,
        'paymentMethod': method?.apiValue,
        'cashReceivedAmount': method == CounterPaymentMethod.cash ? cashReceived : null,
      }),
    ),
    (d) => d is Map ? orderDetailFromJson(asJson(d)) : null,
  );

  @override
  Future<OrderDetail?> updateItems(String orderId, List<OrderItemChange> items) => _api.call(
    () => _api.dio.put<dynamic>('orders/$orderId/items', data: {'items': items.map((i) => i.toJson()).toList()}),
    (d) => d is Map ? orderDetailFromJson(asJson(d)) : null,
  );

  @override
  Future<List<OrderSummary>> takeawayQueue() =>
      _api.call(() => _api.dio.get<dynamic>('orders/takeaway-queue'), (d) => listFrom(d, orderSummaryFromJson));

  @override
  Future<void> reorderTakeawayQueue(List<String> orderIds) =>
      _api.call(() => _api.dio.put<dynamic>('orders/takeaway-queue/reorder', data: {'orderIds': orderIds}), (_) {});

  /// Branch cashiers for the "processed by" filter. Cashier accounts usually
  /// lack CASHIERS read access, so a refusal just hides the filter.
  @override
  Future<List<CashierOption>> cashiers() async {
    try {
      return await _api.call(() => _api.dio.get<dynamic>('admin/cashiers'), (d) {
        final rows = d is Map ? asJson(d)['data'] : d;
        return listFrom(rows, cashierFromJson);
      });
    } on ApiException {
      return const [];
    }
  }
}
