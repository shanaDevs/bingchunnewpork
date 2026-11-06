import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/admin_session.dart';
import '../../domain/entities/delivery.dart';
import '../../domain/entities/menu.dart';
import '../../domain/logic/delivery_selection.dart';
import '../../domain/repositories/repositories.dart';

/// Building delivery runs from READY orders — port of the web
/// AdminDeliveryClassificationTable (pick orders by hand, 10 per page, cup
/// limit per rider) and the "Classify orders" FAB count. Polls every 15 s
/// while the Orders → Delivery tab is on screen.
class DeliveryGroupingController extends ChangeNotifier {
  DeliveryGroupingController(this._repo, this._menu, this.session) {
    _init();
  }

  static const pageSize = 10;

  final DeliveryRepository _repo;
  final MenuRepository _menu;
  final AdminSession session;

  Timer? _timer;
  bool _visible = false;
  bool _disposed = false;

  int maxCups = defaultMaxCupsPerRider;
  List<StoreOption> stores = const [];
  String? storeId;

  List<PendingDeliveryOrder> pending = const [];
  bool loading = false;
  bool loaded = false;
  String? error;

  DeliverySelection selection = {};
  int page = 1;

  /// Super Admin picks the branch, like the web dropdown.
  bool get pickStore => session.isAllBranchView;

  int get selectedCount => selection.length;
  int get selectedCups => selectionTotalCups(selection);
  bool get overLimit => groupOverLimit(selectedCups, selectedCount, maxCups);
  bool get canCreate => isValidDeliveryGroup(selectedCups, selectedCount, maxCups);

  int get totalPages => pending.isEmpty ? 1 : (pending.length / pageSize).ceil();
  List<PendingDeliveryOrder> get pageOrders {
    final start = (page - 1) * pageSize;
    if (start >= pending.length) return const [];
    return pending.sublist(start, (start + pageSize).clamp(0, pending.length));
  }

  bool get allPageSelected => pageOrders.isNotEmpty && pageOrders.every((o) => selection.containsKey(o.orderId));

  Future<void> _init() async {
    storeId = session.storeId;
    maxCups = await _repo.maxCupsPerRider();
    if (pickStore) {
      try {
        stores = await _menu.stores();
        storeId ??= stores.firstOrNull?.id;
      } catch (_) {}
    }
    _notify();
    if (_visible) refresh();
  }

  /// Start / stop polling with the Delivery tab, like the web `visible` prop.
  void setVisible(bool visible) {
    if (visible == _visible) return;
    _visible = visible;
    _timer?.cancel();
    if (visible) {
      _timer = Timer.periodic(const Duration(seconds: 15), (_) => refresh(silent: true));
      refresh();
    } else {
      selection = {};
      page = 1;
    }
  }

  Future<void> refresh({bool silent = false}) async {
    final id = storeId;
    if (id == null) return;
    if (!silent) {
      loading = true;
      error = null;
      _notify();
    }
    try {
      pending = await _repo.pendingOrders(id);
      // Orders that left the READY list can't stay selected.
      final ids = {for (final o in pending) o.orderId};
      selection = {
        for (final e in selection.entries)
          if (ids.contains(e.key)) e.key: e.value,
      };
      if (page > totalPages) page = totalPages;
      error = null;
    } catch (e) {
      if (!silent || pending.isEmpty) error = e.toString();
    }
    loading = false;
    loaded = true;
    _notify();
  }

  void selectStore(String id) {
    if (id == storeId) return;
    storeId = id;
    selection = {};
    page = 1;
    pending = const [];
    loaded = false;
    refresh();
  }

  int cupsOf(PendingDeliveryOrder o) => orderCupCount(o.items.map((i) => i.quantity));

  /// Whether [o] can't be added without passing the cup limit.
  bool addBlocked(PendingDeliveryOrder o) =>
      !selection.containsKey(o.orderId) && !canAddOrderToSelection(selection, cupsOf(o), maxCups).ok;

  /// Returns the cup total that blocked the add, or null when it went through.
  int? toggle(PendingDeliveryOrder o, bool checked) {
    if (!checked) {
      selection = {...selection}..remove(o.orderId);
      _notify();
      return null;
    }
    final cups = cupsOf(o);
    final check = canAddOrderToSelection(selection, cups, maxCups);
    if (!check.ok) return check.newTotal;
    selection = {...selection, o.orderId: (orderNumber: o.orderNumber, cups: cups)};
    _notify();
    return null;
  }

  /// Web select-all: adds this page's orders until the cup limit stops it.
  void toggleAllOnPage() {
    if (allPageSelected) {
      selection = {...selection}..removeWhere((k, _) => pageOrders.any((o) => o.orderId == k));
    } else {
      final next = {...selection};
      for (final o in pageOrders) {
        if (next.containsKey(o.orderId)) continue;
        final cups = cupsOf(o);
        if (!canAddOrderToSelection(next, cups, maxCups).ok) break;
        next[o.orderId] = (orderNumber: o.orderNumber, cups: cups);
      }
      selection = next;
    }
    _notify();
  }

  void clearSelection() {
    selection = {};
    _notify();
  }

  void setPage(int p) {
    page = p.clamp(1, totalPages);
    _notify();
  }

  String get groupTitle => deliveryGroupTitle(selectedCount, selectedCups);

  Future<DeliveryRoute> previewSelection() => _repo.previewRoute(storeId!, selection.keys.toList(), groupTitle);

  Future<void> createJob(String title, List<String> orderIds) async {
    await _repo.createJob(storeId!, title, orderIds);
    selection = {};
    await refresh(silent: true);
  }

  // ------------------------------------------------ suggested runs (FAB modal)

  ClassifyResult? suggestions;
  bool classifying = false;

  /// Web AdminDeliveryClassificationPanel `classify`.
  Future<ClassifyResult?> classify() async {
    final id = storeId;
    if (id == null) return null;
    classifying = true;
    _notify();
    try {
      suggestions = await _repo.classify(id, maxCups);
      return suggestions;
    } finally {
      classifying = false;
      _notify();
    }
  }

  Future<DeliveryRoute> routeFor(DeliveryCluster cluster) async =>
      cluster.route ?? await _repo.previewRoute(storeId!, cluster.orderIds, cluster.label);

  Future<void> createFromCluster(DeliveryCluster cluster) async {
    await _repo.createJob(storeId!, cluster.label, cluster.orderIds);
    suggestions = suggestions?.without(cluster.id);
    await refresh(silent: true);
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}
