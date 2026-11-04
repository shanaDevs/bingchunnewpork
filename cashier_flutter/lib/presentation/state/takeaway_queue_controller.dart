import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../domain/entities/order.dart';
import '../../domain/logic/takeaway_queue.dart';
import '../../domain/repositories/repositories.dart';

/// Takeaway pickup queue — port of the web AdminTakeawayQueuePanel: queue order
/// with up / down moves, ordered-time sorts, forward-only status, 12 s refresh
/// while the Orders page is on screen.
class TakeawayQueueController extends ChangeNotifier {
  TakeawayQueueController(this._repo, {this.onChanged});

  final OrderRepository _repo;

  /// Called after a reorder or status change so the order list can refresh too.
  final VoidCallback? onChanged;
  Timer? _timer;
  bool _visible = false;

  /// Panel open (the header row stays visible when collapsed).
  bool expanded = true;

  List<OrderSummary> _queue = const [];
  bool loading = true;
  String? error;
  QueueSort sort = QueueSort.queue;
  bool reordering = false;
  String? busyId;
  bool _disposed = false;

  List<OrderSummary> get displayed => sortQueue(_queue, sort);
  int get count => _queue.length;
  bool get canReorder => sort == QueueSort.queue && !reordering;

  void setVisible(bool visible) {
    if (visible == _visible) return;
    _visible = visible;
    _timer?.cancel();
    if (visible) {
      _timer = Timer.periodic(const Duration(seconds: 12), (_) => refresh(silent: true));
      refresh(silent: _queue.isNotEmpty);
    }
  }

  void toggleExpanded() {
    expanded = !expanded;
    _notify();
  }

  Future<void> refresh({bool silent = false}) async {
    if (!silent) {
      loading = true;
      error = null;
      _notify();
    }
    try {
      _queue = await _repo.takeawayQueue();
      error = null;
    } catch (e) {
      if (!silent || _queue.isEmpty) error = e.toString();
    }
    loading = false;
    _notify();
  }

  void setSort(QueueSort next) {
    sort = next;
    _notify();
  }

  /// Swaps an order with its neighbour; throws the API error for the toast.
  Future<void> move(int index, int direction) async {
    if (!canReorder) return;
    final ids = moveInQueue(_queue, index, direction);
    if (ids == null) return;
    reordering = true;
    _notify();
    try {
      await _repo.reorderTakeawayQueue(ids);
      await refresh(silent: true);
      onChanged?.call();
    } finally {
      reordering = false;
      _notify();
    }
  }

  Future<void> setStatus(OrderSummary order, String status) async {
    if (isQueueStatusDisabled(order.status, status) || status == order.status) return;
    busyId = order.id;
    _notify();
    try {
      await _repo.updateStatus(order.id, status);
      await refresh(silent: true);
      onChanged?.call();
    } finally {
      busyId = null;
      _notify();
    }
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
