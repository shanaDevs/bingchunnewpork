import '../../core/format.dart';
import '../../data/json.dart';
import '../../domain/logic/period.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../labels.dart';

/// The web report hub (app/admin/reports + branch-reports) as data: each report
/// names its endpoint, how the period is sent, its columns and summary chips.
/// The Reports screen renders any of them and exports CSV / PDF.

enum ReportGroup { sales, payments, orders }

/// How a report endpoint takes its date range.
enum ReportRange {
  /// `period=today|month|year|custom&from&to` (buildPeriodQuery).
  period,

  /// `from=yyyy-MM-dd&to=yyyy-MM-dd`.
  dates,

  /// `from=…T00:00:00.000Z&to=…T23:59:59.000Z` (Global Business Overview).
  isoDates,

  /// `startDate` / `endDate` (`/orders`).
  orderDates,

  /// No date filter (Low Stock).
  none,
}

class ReportColumn {
  const ReportColumn(this.label, this.cell, {this.numeric = false, this.csv, this.flex = 1});
  final String label;

  /// Display / PDF text for a row (index is the row position, for rank columns).
  final String Function(Json row, int index) cell;

  /// Raw CSV value (numbers unformatted); defaults to [cell].
  final Object? Function(Json row, int index)? csv;
  final bool numeric;
  final int flex;
}

class ReportDef {
  const ReportDef({
    required this.id,
    required this.title,
    required this.description,
    required this.path,
    required this.range,
    required this.columns,
    required this.rows,
    this.extra = const {},
    this.summary,
    this.superOnly = false,
    this.branchOnly = false,
    this.superGroup,
    this.branchGroup,
    this.needsStore = false,
  });

  final String id;
  final String title;
  final String description;
  final String path;
  final ReportRange range;
  final Map<String, String> extra;
  final List<ReportColumn> columns;
  final List<Json> Function(Object? data) rows;
  final List<(String, String)> Function(Object? data, List<Json> rows)? summary;
  final bool superOnly;
  final bool branchOnly;
  final ReportGroup? superGroup;
  final ReportGroup? branchGroup;

  /// Sends the branch's storeId (Low Stock reads `/admin/stock`).
  final bool needsStore;

  ReportGroup groupFor(bool superAdmin) => (superAdmin ? superGroup : branchGroup) ?? ReportGroup.sales;

  Map<String, String> params(PeriodFilter period, {String? storeId}) {
    final r = period.orderRange;
    final range = switch (this.range) {
      ReportRange.period => period.dashboardQuery,
      ReportRange.dates => {'from': ?r.startDate, 'to': ?r.endDate},
      ReportRange.isoDates => {
        if (r.startDate != null) 'from': '${r.startDate}T00:00:00.000Z',
        if (r.endDate != null) 'to': '${r.endDate}T23:59:59.000Z',
      },
      ReportRange.orderDates => {'startDate': ?r.startDate, 'endDate': ?r.endDate},
      ReportRange.none => const <String, String>{},
    };
    return {...extra, ...range, 'storeId': ?storeId};
  }
}

// ---------------------------------------------------------------- helpers

List<Json> _list(Object? data, [String? key]) {
  if (key == null) return listFrom(data, (j) => j);
  return listFrom(asJson(data)[key], (j) => j);
}

String _money(Json j, String key) => formatMoneyAmount(dbl(j, key));
String _count(Json j, String key) => formatCount(intOf(j, key));
String _date(Json j, String key) {
  final d = dateOrNull(j, key);
  return d == null ? '—' : formatShortDate(toColombo(d));
}

String _dash(String? v) => (v == null || v.trim().isEmpty) ? '—' : v;

double _sum(List<Json> rows, String key) => rows.fold<double>(0, (s, r) => s + dbl(r, key));

String _customer(Json order) {
  final user = objOrNull(order, 'user') ?? const <String, dynamic>{};
  final name = strOrNull(user, 'name') ?? strOrNull(order, 'guestName') ?? '—';
  final phone = strOrNull(user, 'phone') ?? strOrNull(order, 'guestPhone') ?? '—';
  return '$name / $phone';
}

String _items(Json order) =>
    listOf(order, 'items', (i) => '${str(i, 'productName')} ×${intOf(i, 'quantity', 1)}').join(', ');

String _minutes(Json j, String key) {
  final v = dblOrNull(j, key);
  return v == null ? '—' : '${v.toStringAsFixed(v < 10 ? 1 : 0)} min';
}

// ---------------------------------------------------------------- definitions

/// Built on each read so titles follow the current language.
List<ReportDef> get allReports => [
  // ---------------- Sales
  ReportDef(
    id: 'branch-performance',
    title: tr('Branch Performance Report'),
    description: tr('Top and least selling branches by revenue or order count.'),
    path: 'admin/reports/brand-branch-performance',
    range: ReportRange.period,
    extra: const {'orderMode': 'ALL', 'paymentMethod': 'ALL', 'metric': 'revenue'},
    superOnly: true,
    superGroup: ReportGroup.sales,
    rows: (d) => _list(d, 'branchPerformance'),
    columns: [
      ReportColumn(tr('Rank'), (r, i) => '${intOrNull(r, 'rank') ?? i + 1}'),
      ReportColumn(tr('Branch Name'), (r, _) => shortBranch(str(r, 'branchName')), flex: 2),
      ReportColumn(tr('Location/Region'), (r, _) => _dash(strOrNull(r, 'location'))),
      ReportColumn(tr('Total Orders Count'), (r, _) => _count(r, 'totalOrders'), numeric: true, csv: (r, _) => intOf(r, 'totalOrders')),
      ReportColumn(tr('Total Gross Sales (LKR)'), (r, _) => _money(r, 'grossSales'), numeric: true, csv: (r, _) => dbl(r, 'grossSales')),
      ReportColumn(tr('AOV (LKR)'), (r, _) {
        final orders = intOf(r, 'totalOrders');
        return formatMoneyAmount(dblOrNull(r, 'aov') ?? (orders == 0 ? 0 : (dbl(r, 'grossSales') / orders).roundToDouble()));
      }, numeric: true),
      ReportColumn(tr('Performance Status'), (r, _) => _dash(strOrNull(r, 'performanceStatus'))),
    ],
    summary: (_, rows) => [
      (tr('Branches'), formatCount(rows.length)),
      (tr('Total Orders'), formatCount(_sum(rows, 'totalOrders'))),
      (tr('Total Gross Sales'), formatMoney(_sum(rows, 'grossSales'))),
    ],
  ),
  ReportDef(
    id: 'product-performance',
    title: tr('Product Performance Report'),
    description: tr('Top and least selling products by quantity or revenue.'),
    path: 'admin/reports/top-products',
    range: ReportRange.dates,
    extra: const {'orderMode': 'ALL', 'sortBy': 'top', 'metric': 'quantity', 'limit': '50'},
    superGroup: ReportGroup.sales,
    branchGroup: ReportGroup.sales,
    rows: (d) => _list(d),
    columns: [
      ReportColumn('#', (_, i) => '${i + 1}'),
      ReportColumn(tr('Item Code / SKU'), (r, _) => _dash(strOrNull(r, 'sku'))),
      ReportColumn(tr('Product Name'), (r, _) => str(r, 'productName'), flex: 2),
      ReportColumn(tr('Category'), (r, _) => _dash(strOrNull(r, 'category'))),
      ReportColumn(tr('Total Quantity Sold'), (r, _) => _count(r, 'totalQuantity'), numeric: true, csv: (r, _) => intOf(r, 'totalQuantity')),
      ReportColumn(tr('Pickup Quantity'), (r, _) => _count(r, 'pickupQuantity'), numeric: true, csv: (r, _) => intOf(r, 'pickupQuantity')),
      ReportColumn(tr('Delivery Quantity'), (r, _) => _count(r, 'deliveryQuantity'), numeric: true, csv: (r, _) => intOf(r, 'deliveryQuantity')),
      ReportColumn(tr('Total Revenue (LKR)'), (r, _) => _money(r, 'totalRevenue'), numeric: true, csv: (r, _) => dbl(r, 'totalRevenue')),
    ],
    summary: (_, rows) => [
      (tr('Total Products'), formatCount(rows.length)),
      (tr('Total Quantity Sold'), formatCount(_sum(rows, 'totalQuantity'))),
      (tr('Total Delivery Quantity'), formatCount(_sum(rows, 'deliveryQuantity'))),
      (tr('Total Revenue Generated'), formatMoney(_sum(rows, 'totalRevenue'))),
    ],
  ),
  ReportDef(
    id: 'high-value-customers',
    title: tr('High-Value Customers Ledger'),
    description: tr('Customers ranked by total spend, with their favourite branch and product.'),
    path: 'admin/reports/top-customers',
    range: ReportRange.period,
    extra: const {'sortBy': 'spend', 'limit': '50'},
    superOnly: true,
    superGroup: ReportGroup.sales,
    rows: (d) => _list(d, 'topCustomers'),
    columns: [
      ReportColumn(tr('Customer ID / Rank'), (r, i) {
        final id = strOrNull(r, 'id');
        final rank = intOrNull(r, 'rank') ?? i + 1;
        return id == null ? '$rank' : '$rank / ${id.length > 8 ? id.substring(0, 8) : id}';
      }),
      ReportColumn(tr('Customer Name'), (r, _) => str(r, 'name', '—'), flex: 2),
      ReportColumn(tr('Contact Number'), (r, _) => _dash(strOrNull(r, 'phone'))),
      ReportColumn(tr('Total Orders Placed'), (r, _) => _count(r, 'orders'), numeric: true, csv: (r, _) => intOf(r, 'orders')),
      ReportColumn(tr('Total Amount Spent (LKR)'), (r, _) => _money(r, 'totalSpend'), numeric: true, csv: (r, _) => dbl(r, 'totalSpend')),
      ReportColumn(tr('Favorite Branch'), (r, _) => shortBranch(strOrNull(r, 'homeBranch'))),
      ReportColumn(tr('Most Ordered Product'), (r, _) => _dash(strOrNull(r, 'favoriteProduct'))),
    ],
    summary: (_, rows) => [
      (tr('Customers'), formatCount(rows.length)),
      (tr('Total Orders'), formatCount(_sum(rows, 'orders'))),
      (tr('Total Spend'), formatMoney(_sum(rows, 'totalSpend'))),
    ],
  ),
  ReportDef(
    id: 'customer-loyalty',
    title: tr('Customer Loyalty & Retention Report'),
    description: tr('New vs loyal customers with lifetime orders and value.'),
    path: 'admin/reports/customer-loyalty',
    range: ReportRange.dates,
    extra: const {'customerType': 'ALL', 'loyaltyThreshold': '2', 'limit': '100'},
    superGroup: ReportGroup.sales,
    branchGroup: ReportGroup.sales,
    rows: (d) => _list(d, 'customers'),
    columns: [
      ReportColumn(tr('Customer Name / Phone'), (r, _) => '${str(r, 'name', '—')} / ${str(r, 'phone', '—')}', flex: 2),
      ReportColumn(tr('Registration Date'), (r, _) => _date(r, 'registrationDate')),
      ReportColumn(tr('Customer Type Tag'), (r, _) => str(r, 'customerType', '—')),
      ReportColumn(tr('First Order Date'), (r, _) => _date(r, 'firstOrderDate')),
      ReportColumn(tr('Last Order Date'), (r, _) => _date(r, 'lastOrderDate')),
      ReportColumn(tr('Total Lifespan Orders'), (r, _) => _count(r, 'totalOrders'), numeric: true, csv: (r, _) => intOf(r, 'totalOrders')),
      ReportColumn(tr('Total Lifespan Value (LKR)'), (r, _) => _money(r, 'totalValue'), numeric: true, csv: (r, _) => dbl(r, 'totalValue')),
    ],
    summary: (d, rows) {
      final s = objOrNull(asJson(d), 'summary') ?? const <String, dynamic>{};
      return [
        (tr('Customers'), formatCount(intOf(s, 'total', rows.length))),
        (tr('New'), formatCount(intOf(s, 'newCount'))),
        (tr('Loyal'), formatCount(intOf(s, 'loyalCount'))),
        (tr('Total Value'), formatMoney(_sum(rows, 'totalValue'))),
      ];
    },
  ),
  // ---------------- Payments
  ReportDef(
    id: 'global-overview',
    title: tr('Global Business Overview Sheet'),
    description: tr('Every paid order with discounts, fees and the amount paid.'),
    path: 'admin/reports/sales',
    range: ReportRange.isoDates,
    superGroup: ReportGroup.payments,
    branchGroup: ReportGroup.sales,
    rows: (d) => _list(d, 'orders'),
    columns: [
      ReportColumn(tr('Date'), (r, _) => _date(r, 'createdAt')),
      ReportColumn(tr('Order ID'), (r, _) => str(r, 'orderNumber')),
      ReportColumn(tr('Branch'), (r, _) => shortBranch(strOrNull(objOrNull(r, 'store') ?? const {}, 'name'))),
      ReportColumn(tr('Type'), (r, _) => modeLabel(str(r, 'orderMode'))),
      ReportColumn(tr('Subtotal'), (r, _) => _money(r, 'subtotal'), numeric: true, csv: (r, _) => dbl(r, 'subtotal')),
      ReportColumn(tr('Applied Discount'), (r, _) => _money(r, 'discount'), numeric: true, csv: (r, _) => dbl(r, 'discount')),
      ReportColumn(tr('Loyalty Discount'), (r, _) => _money(r, 'loyaltyDiscount'), numeric: true, csv: (r, _) => dbl(r, 'loyaltyDiscount')),
      ReportColumn(tr('Delivery Fee'), (r, _) => _money(r, 'deliveryFee'), numeric: true, csv: (r, _) => dbl(r, 'deliveryFee')),
      ReportColumn(tr('Conv. Fee'), (r, _) => _money(r, 'convenientFee'), numeric: true, csv: (r, _) => dbl(r, 'convenientFee')),
      ReportColumn(tr('Total Paid'), (r, _) => _money(r, 'total'), numeric: true, csv: (r, _) => dbl(r, 'total')),
    ],
    summary: (d, rows) {
      final j = asJson(d);
      return [
        (tr('Orders'), formatCount(intOf(j, 'count', rows.length))),
        (tr('Applied Discount'), formatMoney(dblOrNull(j, 'totalDiscount') ?? _sum(rows, 'discount'))),
        (tr('Loyalty Discount'), formatMoney(dblOrNull(j, 'totalLoyaltyDiscount') ?? _sum(rows, 'loyaltyDiscount'))),
        (tr('Total Paid'), formatMoney(dblOrNull(j, 'totalRevenue') ?? _sum(rows, 'total'))),
      ];
    },
  ),
  ReportDef(
    id: 'wallet-ledger',
    title: tr('Virtual Wallet Ledger'),
    description: tr('Wallet debits, credits and the running balance.'),
    path: 'admin/reports/wallet-ledger',
    range: ReportRange.dates,
    extra: const {'limit': '300'},
    superGroup: ReportGroup.payments,
    branchGroup: ReportGroup.sales,
    rows: (d) => _list(d, 'ledger'),
    columns: [
      ReportColumn(tr('Date'), (r, _) => _date(r, 'date')),
      ReportColumn(tr('Reference'), (r, _) => str(r, 'referenceId', '—')),
      ReportColumn(tr('Type'), (r, _) {
        final n = intOrNull(r, 'orderCount');
        final t = str(r, 'transactionType');
        return n != null && n > 0 ? '$t ($n)' : t;
      }, flex: 2),
      ReportColumn(tr('Branch'), (r, _) => shortBranch(strOrNull(r, 'branchName'))),
      ReportColumn(tr('Debit'), (r, _) => dbl(r, 'debit') > 0 ? _money(r, 'debit') : '—', numeric: true, csv: (r, _) => dbl(r, 'debit')),
      ReportColumn(tr('Credit'), (r, _) => dbl(r, 'credit') > 0 ? _money(r, 'credit') : '—', numeric: true, csv: (r, _) => dbl(r, 'credit')),
      ReportColumn(tr('Balance'), (r, _) => _money(r, 'runningBalance'), numeric: true, csv: (r, _) => dbl(r, 'runningBalance')),
    ],
    summary: (d, rows) {
      final j = asJson(d);
      return [
        (tr('Brought Forward'), formatMoney(dbl(j, 'broughtForward'))),
        (tr('Total Debit'), formatMoney(_sum(rows, 'debit'))),
        (tr('Total Credit'), formatMoney(_sum(rows, 'credit'))),
        (tr('Closing Balance'), formatMoney(dbl(j, 'closingBalance'))),
      ];
    },
  ),
  ReportDef(
    id: 'branch-settlement',
    title: tr('Branch Payout Settlement Sheet'),
    description: tr('Each 15-day payout cycle: sales, fees, commission and the final payout.'),
    path: 'admin/reports/settlements',
    range: ReportRange.dates,
    superGroup: ReportGroup.payments,
    branchGroup: ReportGroup.payments,
    rows: (d) => _list(d, 'settlements'),
    columns: [
      ReportColumn(tr('Branch'), (r, _) => shortBranch(strOrNull(r, 'branchName'))),
      ReportColumn(tr('Cycle'), (r, _) => '${_date(r, 'cycleFrom')} – ${_date(r, 'cycleTo')}', flex: 2),
      ReportColumn(tr('Gross Sales'), (r, _) => _money(r, 'grossSales'), numeric: true, csv: (r, _) => dbl(r, 'grossSales')),
      ReportColumn(tr('Delivery Fees'), (r, _) => _money(r, 'totalDeliveryFees'), numeric: true, csv: (r, _) => dbl(r, 'totalDeliveryFees')),
      ReportColumn(tr('Online Payment Fees'), (r, _) => _money(r, 'payhereFees'), numeric: true, csv: (r, _) => dbl(r, 'payhereFees')),
      ReportColumn(tr('Commission'), (r, _) => _money(r, 'dartcodesCommission'), numeric: true, csv: (r, _) => dbl(r, 'dartcodesCommission')),
      ReportColumn(tr('Net Share'), (r, _) => _money(r, 'netBranchShare'), numeric: true, csv: (r, _) => dbl(r, 'netBranchShare')),
      ReportColumn(tr('Offline Collected'), (r, _) => _money(r, 'offlineCollected'), numeric: true, csv: (r, _) => dbl(r, 'offlineCollected')),
      ReportColumn(tr('Final Payout'), (r, _) => _money(r, 'finalPayoutAmount'), numeric: true, csv: (r, _) => dbl(r, 'finalPayoutAmount')),
      ReportColumn(tr('Status'), (r, _) => str(r, 'payoutStatus', '—')),
    ],
    summary: (_, rows) => [
      (tr('Cycles'), formatCount(rows.length)),
      (tr('Gross Sales'), formatMoney(_sum(rows, 'grossSales'))),
      (tr('Final Payout'), formatMoney(_sum(rows, 'finalPayoutAmount'))),
    ],
  ),
  // ---------------- Orders
  ReportDef(
    id: 'order-lifecycle',
    title: tr('Order Lifecycle & Status Log'),
    description: tr('Orders with their items, final status and any cancellation reason.'),
    path: 'orders',
    range: ReportRange.orderDates,
    extra: const {'page': '1', 'limit': '100', 'sortDir': 'desc'},
    superOnly: true,
    superGroup: ReportGroup.orders,
    rows: (d) => _list(d is Map ? d['data'] : d),
    columns: [
      ReportColumn(tr('Order ID'), (r, _) => str(r, 'orderNumber')),
      ReportColumn(tr('Date & Time'), (r, _) {
        final d = dateOrNull(r, 'createdAt');
        return d == null ? '—' : formatShortDateTime(d);
      }),
      ReportColumn(tr('Branch Name'), (r, _) => shortBranch(strOrNull(objOrNull(r, 'store') ?? const {}, 'name'))),
      ReportColumn(tr('Customer Name & Phone'), (r, _) => _customer(r), flex: 2),
      ReportColumn(tr('Order Type'), (r, _) => modeLabel(str(r, 'orderMode'))),
      ReportColumn(tr('Items & Qty Summary'), (r, _) => _items(r), flex: 2),
      ReportColumn(tr('Order Status'), (r, _) => orderStatusLabel(str(r, 'status'), mode: str(r, 'orderMode'))),
      ReportColumn(tr('Cancellation/Refund Reason'), (r, _) {
        final cancel = listOf(r, 'statusEvents', (e) => e).where((e) => str(e, 'status') == 'CANCELLED');
        final note = cancel.isEmpty ? null : strOrNull(cancel.first, 'note');
        return note ?? (str(r, 'paymentStatus') == 'REFUNDED' ? tr('Refunded') : '—');
      }, flex: 2),
    ],
    summary: (_, rows) => [
      (tr('Orders'), formatCount(rows.length)),
      (tr('Cancelled'), formatCount(rows.where((r) => str(r, 'status') == 'CANCELLED').length)),
    ],
  ),
  ReportDef(
    id: 'order-fulfillment',
    title: tr('Order Fulfillment & Efficiency Analytics'),
    description: tr('Average preparation and dispatch times, and delayed orders per branch.'),
    path: 'admin/reports/order-fulfillment',
    range: ReportRange.period,
    extra: const {'orderMode': 'ALL', 'delayedOnly': 'false'},
    superOnly: true,
    superGroup: ReportGroup.orders,
    rows: (d) => _list(d, 'branches'),
    columns: [
      ReportColumn(tr('Branch Name'), (r, _) => shortBranch(strOrNull(r, 'branchName')), flex: 2),
      ReportColumn(tr('Total Orders Handled'), (r, _) => _count(r, 'totalOrders'), numeric: true, csv: (r, _) => intOf(r, 'totalOrders')),
      ReportColumn(tr('Avg. Preparation Time'), (r, _) => _minutes(r, 'avgPreparationMinutes'), numeric: true),
      ReportColumn(tr('Avg. Delivery Dispatch Time'), (r, _) => _minutes(r, 'avgDispatchMinutes'), numeric: true),
      ReportColumn(tr('Total Delayed Orders'), (r, _) => _count(r, 'delayedOrders'), numeric: true, csv: (r, _) => intOf(r, 'delayedOrders')),
      ReportColumn(tr('Delay Percentage (%)'), (r, _) => '${dbl(r, 'delayPercentage').toStringAsFixed(1)}%', numeric: true, csv: (r, _) => dbl(r, 'delayPercentage')),
    ],
    summary: (d, rows) => [
      (tr('Branches'), formatCount(rows.length)),
      (tr('Orders'), formatCount(_sum(rows, 'totalOrders'))),
      (tr('Delayed'), formatCount(_sum(rows, 'delayedOrders'))),
      (tr('Delay threshold'), '${intOf(asJson(d), 'delayThresholdMinutes')} min'),
    ],
  ),
  ReportDef(
    id: 'order-cancellations',
    title: tr('Order Cancellation & Issue Log'),
    description: tr('Cancelled orders with who cancelled, why, and the refund status.'),
    path: 'admin/reports/order-cancellations',
    range: ReportRange.period,
    extra: const {'limit': '100'},
    superGroup: ReportGroup.orders,
    branchGroup: ReportGroup.orders,
    rows: (d) => _list(d, 'cancellations'),
    columns: [
      ReportColumn(tr('Order ID'), (r, _) => str(r, 'orderNumber')),
      ReportColumn(tr('Branch Name'), (r, _) => shortBranch(strOrNull(r, 'branchName'))),
      ReportColumn(tr('Order Value (LKR)'), (r, _) => _money(r, 'orderValue'), numeric: true, csv: (r, _) => dbl(r, 'orderValue')),
      ReportColumn(tr('Payment Method'), (r, _) => paymentMethodLabel(str(r, 'paymentMethod'))),
      ReportColumn(tr('Refund Status'), (r, _) => str(r, 'refundStatus', '—')),
      ReportColumn(tr('Cancelled By'), (r, _) => str(r, 'cancelledBy', '—')),
      ReportColumn(tr('Reason For Failure'), (r, _) => str(r, 'reason', '—'), flex: 2),
    ],
    summary: (d, rows) => [
      (tr('Cancellations'), formatCount(intOf(asJson(d), 'count', rows.length))),
      (tr('Order Value'), formatMoney(_sum(rows, 'orderValue'))),
    ],
  ),
  ReportDef(
    id: 'low-stock',
    title: tr('Low Stock Report'),
    description: tr('Products at or below their low-stock level at this branch.'),
    path: 'admin/stock',
    range: ReportRange.none,
    branchOnly: true,
    needsStore: true,
    branchGroup: ReportGroup.orders,
    rows: (d) => _list(d, 'items').where((r) => boolOf(r, 'isLowStock') || boolOf(r, 'isOutOfStock')).toList(),
    columns: [
      ReportColumn(tr('Product Name'), (r, _) => str(r, 'name'), flex: 2),
      ReportColumn(tr('Category'), (r, _) => str(objOrNull(r, 'category') ?? const {}, 'name', '—')),
      ReportColumn(tr('On Hand'), (r, _) => _count(r, 'onHandQty'), numeric: true, csv: (r, _) => intOf(r, 'onHandQty')),
      ReportColumn(tr('Low Stock Level'), (r, _) => _count(r, 'lowStockThreshold'), numeric: true, csv: (r, _) => intOf(r, 'lowStockThreshold')),
      ReportColumn(tr('Weekly Target'), (r, _) => _count(r, 'weeklyTargetQty'), numeric: true, csv: (r, _) => intOf(r, 'weeklyTargetQty')),
      ReportColumn(tr('Status'), (r, _) => boolOf(r, 'isOutOfStock') ? tr('Out of stock') : tr('Low stock')),
    ],
    summary: (_, rows) => [
      (tr('Products'), formatCount(rows.length)),
      (tr('Out of stock'), formatCount(rows.where((r) => boolOf(r, 'isOutOfStock')).length)),
    ],
  ),
];

/// Reports for this role, in web order.
List<ReportDef> reportsFor({required bool superAdmin}) =>
    allReports.where((r) => superAdmin ? !r.branchOnly : !r.superOnly).toList();

String reportGroupLabel(ReportGroup g) => switch (g) {
  ReportGroup.sales => tr('Sales'),
  ReportGroup.payments => tr('Payments'),
  ReportGroup.orders => tr('Orders'),
};

String reportGroupHint(ReportGroup g) => switch (g) {
  ReportGroup.sales => tr('Branches, products & customers'),
  ReportGroup.payments => tr('Wallet, fees & settlements'),
  ReportGroup.orders => tr('Lifecycle, efficiency & issues'),
};
