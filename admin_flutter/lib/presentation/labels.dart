import 'package:flutter/material.dart';

import '../domain/entities/order.dart';
import '../domain/logic/order_rules.dart';
import '../l10n/l10n.dart';
import 'theme/pos_theme.dart';

/// Display labels shared across screens — ports of the web label maps
/// (orders page STATUS_LABELS, paymentMethodLabels.ts, orderChannel.ts).

/// List/tab label. A delivered pickup order reads "Picked up".
String orderStatusLabel(String status, {String? mode}) {
  switch (status) {
    case OrderStatus.received:
      return tr('Received');
    case OrderStatus.preparing:
      return tr('Preparing');
    case OrderStatus.ready:
      return tr('Ready');
    case OrderStatus.outForDelivery:
      return tr('Out for delivery');
    case OrderStatus.delivered:
      return mode == OrderMode.takeaway ? tr('Picked up') : tr('Delivered');
    case OrderStatus.cancelled:
      return tr('Cancelled');
  }
  return status;
}

/// Activity timeline label (web getStatusLabel).
String orderEventLabel(String status, String mode) {
  if (status == OrderStatus.ready) {
    return mode == OrderMode.takeaway ? tr('Ready for Pickup') : tr('Order Ready');
  }
  return orderStatusLabel(status, mode: mode);
}

Color orderStatusColor(BuildContext context, String status) {
  final c = context.pos;
  switch (status) {
    case OrderStatus.received:
      return PosColors.received;
    case OrderStatus.preparing:
      return PosColors.preparing;
    case OrderStatus.ready:
      return PosColors.ready;
    case OrderStatus.outForDelivery:
      return c.accent;
    case OrderStatus.delivered:
      return c.successText;
    case OrderStatus.cancelled:
      return c.dangerText;
  }
  return c.textMuted;
}

String paymentMethodLabel(String method) {
  switch (method) {
    case PaymentMethod.payhere:
    case PaymentMethod.card:
      return tr('Online Payment');
    case PaymentMethod.cashAtCounter:
      return tr('Cash at Counter');
    case PaymentMethod.loyaltyPoints:
      return tr('Loyalty Points');
    case 'CASH_ON_DELIVERY':
      return tr('Cash on Delivery');
  }
  if (method.isEmpty) return '—';
  return method.replaceAll('_', ' ').toLowerCase();
}

/// Short badge label for the list (Paid / Failed / Unpaid).
String paymentStateShort(OrderSummary o) {
  if (isOrderPaid(o)) return tr('Paid');
  if (o.paymentStatus == 'FAILED') return tr('Failed');
  return tr('Unpaid');
}

/// Long label for the detail header (web getPaymentStatusLabel).
String paymentStateLong(OrderSummary o) {
  if (isOrderPaid(o)) return tr('✓ Paid');
  if (o.paymentStatus == 'FAILED') return tr('Payment failed');
  if (o.paymentMethod == PaymentMethod.payhere || o.paymentMethod == PaymentMethod.card) {
    return tr('Pending payment');
  }
  if (o.paymentMethod == PaymentMethod.cashAtCounter) return tr('Unpaid');
  if (o.paymentMethod == PaymentMethod.loyaltyPoints) return tr('✓ Paid (points)');
  return o.paymentStatus;
}

/// Order channels the backend tags orders with, in web filter order.
const orderChannels = ['WEB', 'POS', 'APP', 'WHATSAPP', 'TELEGRAM'];

String channelLabel(String? channel) {
  final raw = (channel ?? 'WEB').toUpperCase();
  final key = raw == 'ONLINE' ? 'WEB' : (raw == 'COUNTER' ? 'POS' : raw);
  return switch (key) {
    'WEB' => '🌐 ${tr('Website')}',
    'POS' => '🧾 ${tr('POS')}',
    'APP' => '📱 ${tr('App')}',
    'WHATSAPP' => '🟢 WhatsApp',
    'TELEGRAM' => '🔵 Telegram',
    _ => channel ?? '—',
  };
}

String modeLabel(String mode) => mode == OrderMode.delivery ? tr('Delivery') : tr('Pick up');

String cancelledByLabel(OrderSummary o) {
  String map(String v) => switch (v.toLowerCase()) {
    'customer' => tr('Customer'),
    'system' => tr('System'),
    'payment-gateway' => tr('Payment gateway'),
    _ => v,
  };
  final stored = o.cancelledBy?.trim();
  if (stored != null && stored.isNotEmpty) return map(stored);
  final note = _cancelNote(o);
  final match = note == null ? null : RegExp(r'cancelled by[:\s]+([^|.]+)', caseSensitive: false).firstMatch(note);
  final fromNote = match?.group(1)?.trim();
  return fromNote == null || fromNote.isEmpty ? '—' : map(fromNote);
}

String cancelReasonLabel(OrderSummary o) {
  final known = CancelReason.labelFor(o.cancelReason);
  if (known != null) return tr(known);
  if (o.cancelReason != null) return o.cancelReason!;
  final note = _cancelNote(o);
  if (note != null && note.isNotEmpty) return note;
  if (o.paymentStatus == 'REFUNDED') return tr('Refunded');
  return '—';
}

String? _cancelNote(OrderSummary o) {
  for (final e in o.statusEvents) {
    if (e.status == OrderStatus.cancelled) return e.note?.trim();
  }
  return null;
}

String sizeLabel(String size) => size == 'LARGE' ? tr('Large') : tr('Regular');

/// Web DELIVERY_JOB_STATUS_LABEL.
String deliveryStatusLabel(String status) => switch (status) {
  'SCHEDULED' => tr('Scheduled'),
  'ASSIGNED' => tr('Assigned'),
  'QUEUED' => tr('Queued'),
  'IN_PROGRESS' => tr('In progress'),
  'RETURNING' => tr('Returning'),
  'COMPLETED' => tr('Completed'),
  'CANCELLED' => tr('Cancelled'),
  'VEHICLE_FAILURE' => tr('Vehicle failure'),
  'MISSED' => tr('Missed'),
  'ABANDONED' => tr('Abandoned'),
  'PARTIALLY_COMPLETED' => tr('Partially Completed'),
  _ => status.replaceAll('_', ' '),
};

/// Web DELIVERY_JOB_STATUS_BADGE tones.
Color deliveryStatusColor(BuildContext context, String status) {
  final c = context.pos;
  return switch (status) {
    'SCHEDULED' => PosColors.received,
    'ASSIGNED' => c.warningText,
    'QUEUED' => const Color(0xFF8B5CF6),
    'IN_PROGRESS' || 'RETURNING' => PosColors.preparing,
    'COMPLETED' => c.successText,
    'CANCELLED' || 'VEHICLE_FAILURE' || 'MISSED' || 'ABANDONED' => c.dangerText,
    'PARTIALLY_COMPLETED' => c.warningText,
    _ => c.textMuted,
  };
}

String dutyStatusLabel(String s) => switch (s) {
  'ON_DUTY' => tr('On duty'),
  'OFF_DUTY' => tr('Off duty'),
  'ON_RUN' || 'ON_TRIP' => tr('On a run'),
  _ => s.replaceAll('_', ' ').toLowerCase(),
};

String roleLabel(String role) => switch (role) {
  'SYSTEM_ADMIN' => tr('Super Admin'),
  'STORE_MANAGER' => tr('Branch Admin'),
  'CASHIER' => tr('Cashier'),
  'DELIVERY_ADMIN' => tr('Delivery Admin'),
  'REPORT_VIEWER' => tr('Report Viewer'),
  _ => role,
};
