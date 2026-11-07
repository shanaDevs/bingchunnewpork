import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/admin_session.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/order_query.dart';
import '../../domain/logic/period.dart';
import '../../domain/repositories/repositories.dart';

/// Orders screen state — mirrors the web Orders page: pickup / delivery queues,
/// status tabs with counts, cancelled / complete archives, filters, 30 s refresh.
class OrdersController extends ChangeNotifier {
  OrdersController(this._repo, this.session) {
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      // A typed search stays put, like the web (`refetchInterval: appliedSearch ? false : 30_000`).
      if (query.search.isEmpty) refresh(silent: true);
    });
    refresh();
    _loadCashiers();
  }

  final OrderRepository _repo;
  final AdminSession session;
  late final Timer _timer;

  OrderQuery query = const OrderQuery(tab: OrderTab.pickup, period: PeriodFilter.today());

  List<OrderSummary> orders = [];
  int total = 0;
  int _page = 1;
  bool _hasMore = false;
  bool loading = false;
  bool loadingMore = false;
  String? error;

  Map<OrderTab, int> tabCounts = {OrderTab.pickup: 0, OrderTab.delivery: 0};
  Map<String, int> statusCounts = {for (final s in OrderStatus.queue) s: 0};
  List<CashierOption> cashiers = const [];

  int _request = 0;

  bool get pickupOnly => session.isPickupOnly;
  bool get hasMore => _hasMore;
  bool get showStore => session.isAllBranchView;

  bool get hasActiveFilters =>
      query.search.isNotEmpty ||
      query.archive != null ||
      query.tab == OrderTab.delivery ||
      query.period.preset != PeriodPreset.today ||
      query.status != OrderStatus.received ||
      query.sortDir != OrderQuery.defaultSortDir(query.archive) ||
      query.channel != null ||
      query.processedById != null;

  Future<void> _loadCashiers() async {
    cashiers = await _repo.cashiers();
    notifyListeners();
  }

  /// Reload counts and the first page. [silent] keeps the current list on screen.
  Future<void> refresh({bool silent = false}) async {
    if (!query.period.ready) return;
    final id = ++_request;
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    _loadCounts(id);
    try {
      final page = await _repo.list(query, 1);
      if (id != _request) return;
      orders = page.items;
      total = page.total;
      _page = 1;
      _hasMore = page.hasMore;
      error = null;
    } catch (e) {
      if (id != _request) return;
      if (!silent || orders.isEmpty) error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  Future<void> _loadCounts(int id) async {
    try {
      final tabs = await Future.wait([
        _repo.count(query.tabCountParams(OrderTab.pickup)),
        if (!pickupOnly) _repo.count(query.tabCountParams(OrderTab.delivery)),
      ]);
      final statuses = query.archive == null
          ? await Future.wait(OrderStatus.queue.map((s) => _repo.count(query.statusCountParams(s))))
          : null;
      if (id != _request) return;
      tabCounts = {OrderTab.pickup: tabs[0], OrderTab.delivery: pickupOnly ? 0 : tabs[1]};
      if (statuses != null) {
        statusCounts = {for (var i = 0; i < OrderStatus.queue.length; i++) OrderStatus.queue[i]: statuses[i]};
      }
      notifyListeners();
    } catch (_) {
      // Badges keep their last values.
    }
  }

  Future<void> loadMore() async {
    if (loadingMore || loading || !_hasMore) return;
    final id = _request;
    loadingMore = true;
    notifyListeners();
    try {
      final page = await _repo.list(query, _page + 1);
      if (id != _request) return;
      final known = orders.map((o) => o.id).toSet();
      orders = [...orders, ...page.items.where((o) => !known.contains(o.id))];
      _page = page.page;
      _hasMore = page.hasMore;
      total = page.total;
    } catch (_) {
      _hasMore = false;
    } finally {
      loadingMore = false;
      notifyListeners();
    }
  }

  void _apply(OrderQuery next) {
    query = next;
    orders = [];
    refresh();
  }

  void switchTab(OrderTab tab) {
    if (pickupOnly && tab == OrderTab.delivery) return;
    _apply(
      query.copyWith(
        tab: tab,
        clearArchive: true,
        status: OrderStatus.queue.contains(query.status) ? query.status : OrderStatus.received,
        search: '',
        sortDir: OrderQuery.defaultSortDir(null),
      ),
    );
  }

  void showArchive(ArchiveView view) =>
      _apply(query.copyWith(archive: view, search: '', sortDir: OrderQuery.defaultSortDir(view)));

  void setStatus(String status) => _apply(query.copyWith(status: status));
  void setPeriod(PeriodFilter p) => _apply(query.copyWith(period: p));
  void setSort(String dir) => _apply(query.copyWith(sortDir: dir));
  void setSearch(String text) {
    if (text.trim() == query.search) return;
    _apply(query.copyWith(search: text.trim()));
  }

  void setChannel(String? channel) =>
      _apply(channel == null ? query.copyWith(clearChannel: true) : query.copyWith(channel: channel));

  void setProcessedBy(String? id) =>
      _apply(id == null ? query.copyWith(clearProcessedBy: true) : query.copyWith(processedById: id));

  void resetFilters() => _apply(const OrderQuery(tab: OrderTab.pickup, period: PeriodFilter.today()));

  /// A new order arrived over the socket: refresh counts and the list in place.
  void onNewOrder() => refresh(silent: true);

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }
}
