import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../domain/entities/order.dart';
import '../../domain/logic/counter_payment.dart';
import '../../domain/logic/order_rules.dart';
import '../../domain/repositories/repositories.dart';

/// Order detail sheet — port of the web AdminOrderDrawer actions:
/// Accept / Reject (RECEIVED), Complete (PREPARING), Confirm pickup (READY).
class OrderDetailController extends ChangeNotifier {
  OrderDetailController(this._repo, this.orderKey) {
    load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  final OrderRepository _repo;
  final String orderKey;
  late final Timer _ticker;

  OrderDetail? order;
  OrderConversation? conversation;
  bool loading = true;
  String? error;
  bool busy = false;

  // Counter payment for READY pickups.
  CounterPaymentMethod method = CounterPaymentMethod.cash;
  final cashController = TextEditingController();

  int cancelWindowSeconds = 0;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      order = await _repo.get(orderKey);
      _tick(notify: false);
      final channel = order!.channel;
      if (channel == 'WHATSAPP' || channel == 'TELEGRAM') {
        conversation = await _repo.conversation(orderKey);
      }
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  void _tick({bool notify = true}) {
    final next = secondsUntil(order?.cancelWindowEndsAt, DateTime.now());
    if (next == cancelWindowSeconds) return;
    cancelWindowSeconds = next;
    if (notify) notifyListeners();
  }

  bool get cancelWindowActive => order != null && isCustomerCancelWindowActive(order!, DateTime.now());

  double get amountDue => order == null ? 0 : counterAmountDue(order!);
  bool get needsCounterPayment => order != null && canConfirmPickup(order!) && amountDue > 0;
  bool get counterPaymentReady => !needsCounterPayment || counterPaymentValid(method, cashController.text, amountDue);

  void setMethod(CounterPaymentMethod m) {
    method = m;
    notifyListeners();
  }

  Future<T> _run<T>(Future<T> Function() action) async {
    busy = true;
    notifyListeners();
    try {
      return await action();
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> accept() => _setStatus(OrderStatus.preparing);
  Future<void> markReady() => _setStatus(OrderStatus.ready);

  Future<void> cancel({CancelReason? reason, String? note}) =>
      _setStatus(OrderStatus.cancelled, cancelReason: reason?.code, note: note);

  Future<void> _setStatus(String status, {String? cancelReason, String? note}) => _run(() async {
    await _repo.updateStatus(order!.id, status, cancelReason: cancelReason, note: note);
  });

  /// Returns how the pickup was settled so the UI can word the toast.
  Future<PickupSettlement> confirmPickup() => _run(() async {
    final o = order!;
    final paid = isOrderPaid(o);
    final balance = orderBalanceDue(o);
    final collectPayment = !paid;
    final collectBalance = paid && balance > 0;
    final updated = await _repo.completeTakeaway(
      o.id,
      collectPayment: collectPayment,
      collectBalance: collectBalance,
      method: needsCounterPayment ? method : null,
      cashReceived: needsCounterPayment && method == CounterPaymentMethod.cash
          ? (parseCash(cashController.text) ?? 0).round()
          : null,
    );
    if (updated != null) order = updated;
    if (collectPayment) return const PickupSettlement.markedPaid();
    if (collectBalance) return PickupSettlement.collected(balance);
    return const PickupSettlement.prepaid();
  });

  void replaceOrder(OrderDetail updated) {
    order = updated;
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker.cancel();
    cashController.dispose();
    super.dispose();
  }
}

class PickupSettlement {
  const PickupSettlement.markedPaid() : kind = 'paid', amount = 0;
  const PickupSettlement.collected(this.amount) : kind = 'balance';
  const PickupSettlement.prepaid() : kind = 'prepaid', amount = 0;
  final String kind;
  final double amount;
}
