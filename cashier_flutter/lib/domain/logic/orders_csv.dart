import '../entities/order.dart';

/// Web Orders "Export" (`exportCsv` in app/admin/orders/page.tsx): the orders
/// currently loaded, with the store column for all-branch views.
String ordersCsv(List<OrderSummary> orders, {required bool showStore, required String Function(DateTime) formatDate}) {
  final header = showStore
      ? 'Order Number,Mode,Store,Delivery Location,Total,Status,Date'
      : 'Order Number,Mode,Delivery Location,Total,Status,Date';
  final rows = [
    for (final o in orders)
      [
        _cell(o.orderNumber),
        o.isDelivery ? 'Delivery' : 'Pick up',
        if (showStore) _cell(o.storeName ?? ''),
        '"${(o.deliveryAddressLine ?? '').replaceAll('"', '""')}"',
        _number(o.total),
        o.status,
        _cell(formatDate(o.createdAt)),
      ].join(','),
  ];
  return [header, ...rows].join('\n');
}

/// Quotes a cell only when it would break the row.
String _cell(String v) => v.contains(RegExp('[",\n]')) ? '"${v.replaceAll('"', '""')}"' : v;

String _number(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
