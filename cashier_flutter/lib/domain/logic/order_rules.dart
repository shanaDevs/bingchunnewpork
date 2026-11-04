import '../entities/order.dart';

/// Order rules shared by the list, the detail sheet and the edit screen —
/// ports of the web lib/orderEdit.ts, lib/orderCancel.ts and lib/receipt.ts.

enum OrderEditMode { full, addOnly }

bool isOrderPaid(OrderSummary o) => o.paymentStatus == 'PAID';

bool _isOnlineMethod(String m) => m == PaymentMethod.payhere || m == PaymentMethod.card;

bool canEditOrder(OrderDetail o) =>
    o.canEdit ??
    (o.orderMode == OrderMode.takeaway &&
        o.paymentMethod == PaymentMethod.cashAtCounter &&
        o.paymentStatus == 'PENDING' &&
        o.status != OrderStatus.delivered &&
        o.status != OrderStatus.cancelled);

bool canAddItemsToOrder(OrderDetail o) =>
    o.canAddItems ??
    (o.orderMode == OrderMode.takeaway &&
        o.paymentStatus == 'PAID' &&
        o.status != OrderStatus.delivered &&
        o.status != OrderStatus.cancelled);

OrderEditMode? orderEditMode(OrderDetail o) {
  switch (o.editMode) {
    case 'full':
      return OrderEditMode.full;
    case 'add_only':
      return OrderEditMode.addOnly;
  }
  if (canEditOrder(o)) return OrderEditMode.full;
  if (canAddItemsToOrder(o)) return OrderEditMode.addOnly;
  return null;
}

/// Why the order can't be edited (English key, translated by the UI), or null when it can.
String? orderEditLockedReason(OrderDetail o) {
  if (orderEditMode(o) != null) return null;
  if (o.orderMode != OrderMode.takeaway) return 'Only pickup orders can be edited';
  if (o.status == OrderStatus.delivered || o.status == OrderStatus.cancelled) {
    return 'Completed or cancelled orders cannot be edited';
  }
  if (o.canAddItems == false && _isOnlineMethod(o.paymentMethod) && o.paymentStatus == 'PAID') {
    return 'Adding items to paid online orders is disabled in settings';
  }
  if (o.canEdit == false && o.paymentMethod == PaymentMethod.cashAtCounter && o.paymentStatus == 'PENDING') {
    return 'Cash pickup order editing is disabled in settings';
  }
  if (_isOnlineMethod(o.paymentMethod) && o.paymentStatus != 'PAID') {
    return 'Unpaid online order — wait for payment before adding items';
  }
  return 'This order cannot be edited';
}

double orderBalanceDue(OrderDetail o) {
  if (o.balanceDue != null) return o.balanceDue!;
  if (o.paymentStatus != 'PAID') return 0;
  final remaining = o.total - (o.prepaidAmount ?? 0);
  return remaining < 0 ? 0 : remaining;
}

bool orderWasEditedByAdmin(OrderDetail o) {
  if (orderBalanceDue(o) > 0) return true;
  final note = RegExp('Items (updated|added) by admin');
  return o.statusEvents.any((e) => e.note != null && note.hasMatch(e.note!));
}

/// "New total" once staff changed the items, otherwise "Total" (English key).
String orderTotalLabel(OrderDetail o) => orderWasEditedByAdmin(o) ? 'New total' : 'Total';

/// Amount the cashier must collect when the customer picks up.
double counterAmountDue(OrderDetail o) => isOrderPaid(o) ? orderBalanceDue(o) : o.total;

/// Pickup orders become collectable once READY.
bool canConfirmPickup(OrderDetail o) => o.orderMode == OrderMode.takeaway && o.status == OrderStatus.ready;

int secondsUntil(DateTime? t, DateTime now) {
  if (t == null) return 0;
  final s = (t.difference(now).inMilliseconds / 1000).ceil();
  return s < 0 ? 0 : s;
}

/// While the customer may still cancel, the web hides Accept / Reject.
bool isCustomerCancelWindowActive(OrderSummary o, DateTime now) {
  if (o.status != OrderStatus.received) return false;
  return o.canCancel && secondsUntil(o.cancelWindowEndsAt, now) > 0;
}

/// Edit preview totals. Add-only and cash-pending edits keep the original
/// convenience fee (the server recomputes on save).
double previewOrderTotal(OrderDetail o, double draftSubtotal) {
  final total = draftSubtotal + o.convenientFee + o.deliveryFee - o.discount - o.loyaltyDiscount;
  return total < 0 ? 0 : total;
}

/// Extra to collect at the counter when adding items to a paid order.
double previewBalanceDue(OrderDetail o, double draftSubtotal, OrderEditMode mode) {
  if (mode != OrderEditMode.addOnly || o.paymentStatus != 'PAID') return 0;
  final extra = draftSubtotal - o.subtotal;
  return extra < 0 ? 0 : extra;
}

/// Customer label: guest name, account name, phone, or [fallback].
String customerDisplayName(OrderSummary o, {String fallback = '—'}) {
  for (final v in [o.guestName, o.userName]) {
    if (v != null && v.trim().isNotEmpty) return v.trim();
  }
  final phone = customerPhone(o);
  return phone ?? fallback;
}

String? customerPhone(OrderSummary o) {
  for (final v in [o.guestPhone, o.userPhone]) {
    if (v != null && v.trim().isNotEmpty) return v.trim();
  }
  return null;
}

/// Pickup time column: a fixed time from the customer, else the scheduled slot.
String? pickupTimeLabel(OrderSummary o, String Function(DateTime) formatTime) {
  final relative = RegExp(r'^In \d+ minutes?$');
  final p = o.pickupTime;
  if (p != null && !relative.hasMatch(p) && p != 'As soon as ready') return p;
  if (o.scheduledPickupAt != null) return formatTime(o.scheduledPickupAt!);
  return null;
}

/// Cancel reason codes the backend accepts on `PUT /orders/:id/status`.
enum CancelReason {
  outOfStock('OUT_OF_STOCK', 'Item Out of Stock / Unavailable'),
  customerRequest('CUSTOMER_REQUEST', 'Customer Requested Cancellation'),
  paymentOrSystemIssue('PAYMENT_OR_SYSTEM_ISSUE', 'Payment or System Issue / Duplicate Order');

  const CancelReason(this.code, this.label);
  final String code;

  /// English key; translate with tr().
  final String label;

  static String? labelFor(String? code) {
    for (final r in values) {
      if (r.code == code) return r.label;
    }
    return null;
  }
}
