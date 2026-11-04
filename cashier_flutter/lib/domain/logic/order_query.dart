import '../entities/order.dart';
import 'period.dart';

enum OrderTab { pickup, delivery }

enum ArchiveView { delivered, cancelled }

/// Filters for `GET /orders`, built exactly like the web Orders page so the
/// cashier sees the same queues on phone and desktop.
class OrderQuery {
  const OrderQuery({
    required this.tab,
    required this.period,
    this.archive,
    this.status = OrderStatus.received,
    this.channel,
    this.processedById,
    this.search = '',
    this.sortDir = 'asc',
  });

  final OrderTab tab;
  final ArchiveView? archive;
  final PeriodFilter period;
  final String status;
  final String? channel;
  final String? processedById;
  final String search;
  final String sortDir;

  static const pageSize = 20;

  /// Archives list newest first; live queues serve the oldest order first.
  static String defaultSortDir(ArchiveView? archive) => archive == null ? 'asc' : 'desc';

  String get _mode => tab == OrderTab.pickup ? OrderMode.takeaway : OrderMode.delivery;
  String get _queue => tab == OrderTab.pickup ? 'pickup' : 'delivery';

  Map<String, String> _shared() {
    final range = period.orderRange;
    return {
      if (range.startDate != null) 'startDate': range.startDate!,
      if (range.endDate != null) 'endDate': range.endDate!,
      if (channel != null) 'channel': channel!,
      if (processedById != null) 'processedById': processedById!,
    };
  }

  Map<String, String> listParams(int page) {
    final p = <String, String>{'page': '$page', 'limit': '$pageSize', 'sortDir': sortDir};
    if (archive == null) {
      p['status'] = status;
      p['orderMode'] = _mode;
      p['fulfillmentQueue'] = _queue;
      if (tab == OrderTab.pickup) p['sortBy'] = 'pickup';
      if (search.isNotEmpty) {
        p['search'] = search;
        if (tab == OrderTab.pickup) p['searchBy'] = 'token';
      }
    } else {
      p['status'] = archive == ArchiveView.delivered ? OrderStatus.delivered : OrderStatus.cancelled;
      if (search.isNotEmpty) p['search'] = search;
    }
    return {...p, ..._shared()};
  }

  /// Badge on the Pickup / Delivery capsule: everything still in that queue.
  Map<String, String> tabCountParams(OrderTab forTab) => {
    'page': '1',
    'limit': '1',
    'excludeStatus': 'DELIVERED,OUT_FOR_DELIVERY,CANCELLED',
    'orderMode': forTab == OrderTab.pickup ? OrderMode.takeaway : OrderMode.delivery,
    'fulfillmentQueue': forTab == OrderTab.pickup ? 'pickup' : 'delivery',
    ..._shared(),
  };

  /// Badge on a Received / Preparing / Ready tab.
  Map<String, String> statusCountParams(String forStatus) => {
    'page': '1',
    'limit': '1',
    'status': forStatus,
    'orderMode': _mode,
    'fulfillmentQueue': _queue,
    ..._shared(),
  };

  OrderQuery copyWith({
    OrderTab? tab,
    ArchiveView? archive,
    bool clearArchive = false,
    PeriodFilter? period,
    String? status,
    String? channel,
    bool clearChannel = false,
    String? processedById,
    bool clearProcessedBy = false,
    String? search,
    String? sortDir,
  }) => OrderQuery(
    tab: tab ?? this.tab,
    archive: clearArchive ? null : (archive ?? this.archive),
    period: period ?? this.period,
    status: status ?? this.status,
    channel: clearChannel ? null : (channel ?? this.channel),
    processedById: clearProcessedBy ? null : (processedById ?? this.processedById),
    search: search ?? this.search,
    sortDir: sortDir ?? this.sortDir,
  );
}
