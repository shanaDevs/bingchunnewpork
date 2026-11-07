import 'order.dart';

class TopProduct {
  const TopProduct({required this.productName, required this.quantity, required this.revenue, this.imageUrl});
  final String productName;
  final int quantity;
  final double revenue;
  final String? imageUrl;
}

/// Needs-attention chip. [label] is the server's English text (translated by the UI).
class AttentionItem {
  const AttentionItem({required this.type, required this.label, required this.count});
  final String type;
  final String label;
  final int count;
}

/// One hour bucket of the Peak Hours chart.
class HourPoint {
  const HourPoint({required this.hour, required this.label, required this.orders, required this.revenue});
  final int hour;
  final String label;
  final int orders;
  final double revenue;
}

/// One month of the Revenue Overview chart (`"May 2026"`).
class MonthPoint {
  const MonthPoint({required this.month, required this.revenue, required this.outflow, required this.orders});
  final String month;
  final double revenue;
  final double outflow;
  final int orders;

  /// "May 2026" → "May".
  String get shortMonth => month.split(' ').first;
}

/// Branch dashboard from `GET /admin/dashboard` — what the web BranchAdminDashboard
/// shows in cashier mode.
class DashboardStats {
  const DashboardStats({
    this.periodOrders = 0,
    this.periodCups = 0,
    this.cancelledOrders = 0,
    this.periodRevenue = 0,
    this.periodRefundAmount = 0,
    this.onlineWalletBalance = 0,
    this.pickupCash = 0,
    this.pickupCard = 0,
    this.pickupOnline = 0,
    this.deliveryOnline = 0,
    this.topProducts = const [],
    this.recentOrders = const [],
    this.needsAttention = const [],
    this.peakHours = const [],
    this.monthlyOverview = const [],
  });

  final int periodOrders;
  final int periodCups;
  final int cancelledOrders;
  final double periodRevenue;
  final double periodRefundAmount;

  /// In LKR (the API sends cents).
  final double onlineWalletBalance;

  /// Revenue by channel (web "Total Revenue & Operations" tiles).
  final double pickupCash;
  final double pickupCard;
  final double pickupOnline;
  final double deliveryOnline;
  final List<TopProduct> topProducts;
  final List<OrderSummary> recentOrders;
  final List<AttentionItem> needsAttention;
  final List<HourPoint> peakHours;
  final List<MonthPoint> monthlyOverview;
}
