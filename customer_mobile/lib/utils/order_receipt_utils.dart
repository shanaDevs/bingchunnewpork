import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/order.dart';

const paymentMethodLabels = {
  'CARD': 'Card',
  'PAYHERE': 'PayHere Online',
  'CASH_ON_DELIVERY': 'Cash on Delivery',
  'CASH_AT_COUNTER': 'Cash at Counter',
};

String formatReceiptDate(DateTime date) {
  return DateFormat('EEE, d MMM yyyy · HH:mm').format(date.toLocal());
}

String formatMoney(int amount) => 'LKR ${NumberFormat('#,##0').format(amount)}';

String formatSize(String size) {
  if (size.isEmpty) return size;
  return size[0] + size.substring(1).toLowerCase().replaceAll('_', ' ');
}

String itemOptionLine(OrderItem item) {
  return formatSize(item.size);
}

String paymentStatusLabel(Order order) {
  if (order.paymentStatus == 'PAID') return 'Paid';
  if (order.paymentStatus == 'FAILED') return 'Payment failed';
  if (order.paymentMethod == 'PAYHERE') return 'Pending payment';
  if (order.paymentMethod == 'CASH_ON_DELIVERY') return 'Pay on delivery';
  if (order.paymentMethod == 'CASH_AT_COUNTER') return 'Pay at counter';
  return order.paymentStatus;
}

String formatOrderListTimestamp(Order order) {
  final local = order.createdAt.toLocal();
  if (order.isActive) {
    final est = local.add(Duration(minutes: order.estimatedMinutes));
    return 'Est. ${DateFormat('d MMM yyyy').format(est)} · ${DateFormat('HH:mm').format(est)}';
  }
  return '${DateFormat('d MMM yyyy').format(local)} · ${DateFormat('HH:mm').format(local)}';
}

Color orderStatusColor(String status) {
  switch (status) {
    case 'DELIVERED':
      return const Color(0xFF22C55E);
    case 'CANCELLED':
      return const Color(0xFFEF4444);
    default:
      return const Color(0xFF5C9AF5);
  }
}
