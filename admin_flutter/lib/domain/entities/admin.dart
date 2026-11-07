// Shapes for the admin-only pages (super admin + branch admin). Field names follow
// the web admin types so the ports read the same. Money is LKR unless a name says Cents.

/// (label, value) point for bar / line charts.
class NamedValue {
  const NamedValue(this.label, this.value, {this.count});
  final String label;
  final double value;
  final int? count;
}

// ---------------------------------------------------------------- Dashboards

/// Branch row of `orderSummaryByBranch` (revenue per channel).
class BranchChannelRow {
  const BranchChannelRow({
    required this.label,
    required this.delivery,
    required this.pickupCash,
    required this.pickupOnline,
    required this.pickupCard,
    this.orderCount,
    this.grossSales,
  });
  final String label;
  final double delivery;
  final double pickupCash;
  final double pickupOnline;
  final double pickupCard;
  final int? orderCount;
  final double? grossSales;

  double get pickup => pickupCash + pickupOnline + pickupCard;
  double get total => grossSales ?? delivery + pickup;
}

class RiderRank {
  const RiderRank({
    required this.name,
    required this.orders,
    required this.jobs,
    this.distanceKm = 0,
    this.onlineMinutes = 0,
    this.photoUrl,
  });
  final String name;

  /// Distinct orders delivered.
  final int orders;
  final int jobs;
  final double distanceKm;
  final int onlineMinutes;
  final String? photoUrl;
}

class DiscountsByParty {
  const DiscountsByParty({required this.slices, required this.total});
  final List<NamedValue> slices;
  final double total;
}

/// Super admin dashboard — the four `/admin/dashboard?tier=` payloads merged
/// (summary, charts, charts-wallet, details), like useTieredDashboardStats.
class SuperDashboard {
  const SuperDashboard({
    this.periodRevenue = 0,
    this.periodRefundAmount = 0,
    this.jasonInvestedAmount = 0,
    this.periodOrders = 0,
    this.cancelledOrders = 0,
    this.onlineWalletBalance = 0,
    this.totalPayable = 0,
    this.pickupCash = 0,
    this.pickupCard = 0,
    this.pickupOnline = 0,
    this.deliveryOnline = 0,
    this.deliveryOrders = 0,
    this.takeawayOrders = 0,
    this.monthly = const [],
    this.outflowByMethod = const [],
    this.topRefundBranches = const [],
    this.topRiders = const [],
    this.topProducts = const [],
    this.discountsByParty,
  });

  final double periodRevenue;
  final double periodRefundAmount;
  final double jasonInvestedAmount;
  final int periodOrders;
  final int cancelledOrders;

  /// LKR (the API sends both in cents).
  final double onlineWalletBalance;
  final double totalPayable;
  final double pickupCash;
  final double pickupCard;
  final double pickupOnline;
  final double deliveryOnline;
  final int deliveryOrders;
  final int takeawayOrders;

  /// (month, revenue, outflow, orders).
  final List<({String month, double revenue, double outflow, int orders})> monthly;
  final List<NamedValue> outflowByMethod;
  final List<NamedValue> topRefundBranches;
  final List<RiderRank> topRiders;
  final List<({String name, int quantity, double revenue, String? imageUrl})> topProducts;
  final DiscountsByParty? discountsByParty;
}

/// Branch performance row (`branchPerformance` in brand analytics / reports).
class BranchPerformance {
  const BranchPerformance({
    required this.storeId,
    required this.branchName,
    required this.totalOrders,
    required this.grossSales,
    this.tier,
    this.deliveryEnabled,
    this.growthPercent,
    this.deliveryPercent,
    this.netTakeHome,
    this.commission,
  });
  final String storeId;
  final String branchName;
  final int totalOrders;
  final double grossSales;
  final String? tier;
  final bool? deliveryEnabled;
  final double? growthPercent;
  final double? deliveryPercent;
  final double? netTakeHome;
  final double? commission;
}

class KpiChange {
  const KpiChange({required this.current, required this.previous, required this.changePercent});
  final double current;
  final double previous;
  final double changePercent;
}

class TopCustomer {
  const TopCustomer({required this.rank, required this.name, required this.orders, required this.totalSpend, this.phone, this.homeBranch});
  final int rank;
  final String name;
  final String? phone;
  final int orders;
  final double totalSpend;
  final String? homeBranch;
}

class ProductSale {
  const ProductSale({required this.name, required this.quantity, required this.revenue, this.imageUrl});
  final String name;
  final int quantity;
  final double revenue;
  final String? imageUrl;
}

class ChannelBreakdown {
  const ChannelBreakdown({
    this.pickupCashTotal = 0,
    this.pickupCashCount = 0,
    this.pickupCardTotal = 0,
    this.pickupCardCount = 0,
    this.pickupOnlineTotal = 0,
    this.pickupOnlineCount = 0,
    this.deliveryOnlineTotal = 0,
    this.deliveryOnlineCount = 0,
  });
  final double pickupCashTotal;
  final int pickupCashCount;
  final double pickupCardTotal;
  final int pickupCardCount;
  final double pickupOnlineTotal;
  final int pickupOnlineCount;
  final double deliveryOnlineTotal;
  final int deliveryOnlineCount;
}

class StoreRef {
  const StoreRef({required this.id, required this.name, this.deliveryEnabled, this.tier});
  final String id;
  final String name;
  final bool? deliveryEnabled;
  final String? tier;

  bool get isTopTier => deliveryEnabled == true || tier == 'top';
}

/// `GET /admin/reports/brand-analytics` (and branch-tier-analytics) — the super admin Sales page.
class BrandAnalytics {
  const BrandAnalytics({
    this.grossSales = 0,
    this.totalOrders = 0,
    this.totalCups = 0,
    this.deliveryRevenue = 0,
    this.convenienceRevenue = 0,
    this.netRevenue,
    this.deliveryOrders = 0,
    this.pickupOrders = 0,
    this.comparison = const {},
    this.revenueDelivery = 0,
    this.revenuePickup = 0,
    this.statusCompleted = 0,
    this.statusPreparing = 0,
    this.statusPending = 0,
    this.statusCancelled = 0,
    this.salesOverview = const [],
    this.branchPerformance = const [],
    this.leastPerforming = const [],
    this.channels = const ChannelBreakdown(),
    this.topProducts = const [],
    this.leastProducts = const [],
    this.topCustomers = const [],
    this.hourly = const [],
    this.stores = const [],
    this.webOrders = 0,
    this.mobileOrders = 0,
    this.firstTimeBuyers = 0,
    this.loyalCustomers = 0,
    this.orderSummaryByBranch = const [],
  });

  final double grossSales;
  final int totalOrders;
  final int totalCups;
  final double deliveryRevenue;
  final double convenienceRevenue;
  final double? netRevenue;
  final int deliveryOrders;
  final int pickupOrders;

  /// grossSales / totalOrders / totalCups / averageOrderValue → change vs previous period.
  final Map<String, KpiChange> comparison;
  final double revenueDelivery;
  final double revenuePickup;
  final int statusCompleted;
  final int statusPreparing;
  final int statusPending;
  final int statusCancelled;
  final List<NamedValue> salesOverview;
  final List<BranchPerformance> branchPerformance;
  final List<BranchPerformance> leastPerforming;
  final ChannelBreakdown channels;
  final List<ProductSale> topProducts;
  final List<ProductSale> leastProducts;
  final List<TopCustomer> topCustomers;
  final List<NamedValue> hourly;
  final List<StoreRef> stores;
  final int webOrders;
  final int mobileOrders;
  final int firstTimeBuyers;
  final int loyalCustomers;
  final List<BranchChannelRow> orderSummaryByBranch;
}

/// `GET /admin/reports/branch-analytics` — branch admin Sales page and dashboard extras.
class BranchAnalytics {
  const BranchAnalytics({
    this.grossSales = 0,
    this.totalOrders = 0,
    this.deliveryRevenue = 0,
    this.convenienceRevenue = 0,
    this.avgOrderValue = 0,
    this.gatewayFee = 0,
    this.commissionFee = 0,
    this.grossAfterFees = 0,
    this.periodCommission = 0,
    this.totalOwed = 0,
    this.effectiveSlabRate = 0,
    this.orderSummary = const [],
    this.orderMode = const [],
    this.channels = const ChannelBreakdown(),
    this.hourly = const [],
    this.topProducts = const [],
    this.topCustomers = const [],
    this.discountsByMonth = const [],
    this.refundByMonth = const [],
    this.outflowByMethod = const [],
  });

  final double grossSales;
  final int totalOrders;
  final double deliveryRevenue;
  final double convenienceRevenue;
  final double avgOrderValue;
  final double gatewayFee;
  final double commissionFee;
  final double grossAfterFees;
  final double periodCommission;
  final double totalOwed;
  final double effectiveSlabRate;
  final List<BranchChannelRow> orderSummary;

  /// label → (delivery, pickup) order counts.
  final List<({String label, double delivery, double pickup})> orderMode;
  final ChannelBreakdown channels;
  final List<NamedValue> hourly;
  final List<ProductSale> topProducts;
  final List<TopCustomer> topCustomers;
  final List<NamedValue> discountsByMonth;
  final List<NamedValue> refundByMonth;
  final List<NamedValue> outflowByMethod;
}

// ---------------------------------------------------------------- Refunds

abstract final class RefundStatus {
  static const received = 'RECEIVED';
  static const complete = 'COMPLETE';
  static const rejected = 'REJECTED';
}

class RefundRow {
  const RefundRow({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.orderNumber,
    required this.orderKey,
    required this.orderTotal,
    required this.salesTotal,
    required this.deliveryFee,
    required this.convenienceFee,
    required this.cancellationReason,
    required this.cancelledWithinWindow,
    required this.orderMode,
    required this.paymentMethod,
    required this.paymentStatus,
    this.customerName,
    this.customerPhone,
    this.customReasonText,
    this.refundPercentage,
    this.configuredStatusRefundPercentage,
    this.refundAmount,
    this.additionalGatewayFee,
    this.cancelledAtStatus,
    this.submittedBy,
    this.adminNotes,
    this.storeName,
  });

  final String id;
  final String status;
  final DateTime createdAt;
  final String orderNumber;
  final String orderKey;
  final double orderTotal;
  final double salesTotal;
  final double deliveryFee;
  final double convenienceFee;
  final String cancellationReason;
  final bool cancelledWithinWindow;
  final String orderMode;
  final String paymentMethod;
  final String paymentStatus;
  final String? customerName;
  final String? customerPhone;
  final String? customReasonText;
  final double? refundPercentage;
  final double? configuredStatusRefundPercentage;
  final double? refundAmount;
  final double? additionalGatewayFee;
  final String? cancelledAtStatus;

  /// CUSTOMER | BRANCH_ADMIN (cashier cancel).
  final String? submittedBy;
  final String? adminNotes;
  final String? storeName;

  bool get isCashierCancel => submittedBy == 'BRANCH_ADMIN';

  /// Web isFullRefundScenario: a cashier cancel or a cancel inside the window refunds everything.
  bool get isFullRefund => isCashierCancel || cancelledWithinWindow;

  double? get fixedPercentage => refundPercentage ?? configuredStatusRefundPercentage;

  /// Web calculatedRefundAmount.
  double get calculatedAmount {
    if (isFullRefund) return orderTotal;
    if (refundAmount != null) return refundAmount!;
    final pct = fixedPercentage;
    if (pct == null) return 0;
    return (salesTotal * pct / 100).roundToDouble();
  }

  /// What the customer gets back for the list column.
  double get displayAmount => status == RefundStatus.rejected ? 0 : (refundAmount ?? calculatedAmount);
}

class RefundSummary {
  const RefundSummary({this.count = 0, this.customer = 0, this.branch = 0, this.delivery = 0, this.platform = 0});
  final int count;
  final double customer;
  final double branch;
  final double delivery;
  final double platform;
}

// ---------------------------------------------------------------- JASON

class JasonEntry {
  const JasonEntry({
    required this.id,
    required this.type,
    required this.amount,
    required this.description,
    required this.occurredAt,
    required this.isActive,
    this.storeWithdrawalId,
  });
  final String id;

  /// INVESTMENT | EXPENSE
  final String type;
  final double amount;
  final String description;
  final DateTime? occurredAt;
  final bool isActive;
  final String? storeWithdrawalId;

  bool get isInvestment => type == 'INVESTMENT';
}

class JasonLedger {
  const JasonLedger({required this.entries, required this.totalInvestments, required this.totalExpenses, required this.net});
  final List<JasonEntry> entries;
  final double totalInvestments;
  final double totalExpenses;
  final double net;
}

// ---------------------------------------------------------------- Menu

class AdminProduct {
  const AdminProduct({
    required this.id,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.basePrice,
    required this.cost,
    required this.isAvailable,
    required this.isDeliveryAvailable,
    required this.toppingIds,
    required this.imageUrls,
    this.description,
    this.ingredients,
    this.tag,
  });
  final String id;
  final String name;
  final String categoryId;
  final String categoryName;
  final double basePrice;
  final double cost;
  final bool isAvailable;
  final bool isDeliveryAvailable;
  final List<String> toppingIds;

  /// Saved image paths as stored (first is the cover).
  final List<String> imageUrls;
  final String? description;
  final String? ingredients;
  final String? tag;
}

class AdminTopping {
  const AdminTopping({required this.id, required this.name, required this.extraPrice, required this.isAvailable});
  final String id;
  final String name;
  final double extraPrice;
  final bool isAvailable;
}

// ---------------------------------------------------------------- Wallet

class StoreWallet {
  const StoreWallet({
    required this.storeId,
    required this.storeName,
    required this.city,
    required this.isActive,
    required this.balanceCents,
    required this.transactionCount,
  });
  final String storeId;
  final String storeName;
  final String city;
  final bool isActive;

  /// Web branchCardPayableBalanceCents (all-time available, else balance).
  final double balanceCents;
  final int transactionCount;
}

class WalletDashboard {
  const WalletDashboard({
    this.earningsTotalCents = 0,
    this.pickupOnlineInCents = 0,
    this.deliveryOnlineInCents = 0,
    this.toBranchCents = 0,
    this.toPlatformCents = 0,
    this.toDeliveryLkr = 0,
    this.liveEarningsCents = 0,
    this.refundsLkr = 0,
  });
  final double earningsTotalCents;
  final double pickupOnlineInCents;
  final double deliveryOnlineInCents;
  final double toBranchCents;
  final double toPlatformCents;
  final double toDeliveryLkr;
  final double liveEarningsCents;
  final double refundsLkr;

  double get totalPaymentsLkr => toBranchCents / 100 + toPlatformCents / 100 + toDeliveryLkr;
}

class WalletSummary {
  const WalletSummary({
    this.currentBalanceCents = 0,
    this.totalEarningsCents = 0,
    this.totalWithdrawnCents = 0,
    this.pendingWithdrawalCents = 0,
    this.availableBalanceCents = 0,
  });
  final double currentBalanceCents;
  final double totalEarningsCents;
  final double totalWithdrawnCents;
  final double pendingWithdrawalCents;
  final double availableBalanceCents;
}

class WalletOverview {
  const WalletOverview({required this.wallets, this.dashboard, this.summary});
  final List<StoreWallet> wallets;
  final WalletDashboard? dashboard;
  final WalletSummary? summary;
}

class Withdrawal {
  const Withdrawal({
    required this.id,
    required this.amountCents,
    required this.status,
    required this.createdAt,
    this.periodFrom,
    this.periodTo,
    this.paymentMethod,
    this.remarks,
    this.rejectionReason,
    this.reviewedAt,
  });
  final String id;
  final double amountCents;

  /// PENDING | APPROVED | REJECTED | CANCELLED
  final String status;
  final DateTime createdAt;
  final DateTime? periodFrom;
  final DateTime? periodTo;
  final String? paymentMethod;
  final String? remarks;
  final String? rejectionReason;
  final DateTime? reviewedAt;
}

class WalletTxn {
  const WalletTxn({
    required this.id,
    required this.type,
    required this.direction,
    required this.amountCents,
    required this.createdAt,
    this.description,
    this.reference,
  });
  final String id;
  final String type;

  /// IN | OUT
  final String direction;
  final double amountCents;
  final DateTime createdAt;
  final String? description;
  final String? reference;

  bool get isIn => direction.toUpperCase() == 'IN' || direction.toUpperCase() == 'CREDIT';
}

class WalletTxnSummary {
  const WalletTxnSummary({this.totalIn = 0, this.deliveryIn = 0, this.pickupOnlineIn = 0, this.pickupStoreIn = 0, this.totalOut = 0});
  final double totalIn;
  final double deliveryIn;
  final double pickupOnlineIn;
  final double pickupStoreIn;
  final double totalOut;
}

class WalletTxnPage {
  const WalletTxnPage({required this.items, required this.summary, required this.page, required this.pages});
  final List<WalletTxn> items;
  final WalletTxnSummary? summary;
  final int page;
  final int pages;
}

// ---------------------------------------------------------------- Promotions

class PromoMoney {
  const PromoMoney({
    this.orderSales = 0,
    this.totalDiscount = 0,
    this.discountPct = 0,
    this.branchShare = 0,
    this.platformShare = 0,
    this.usageCount = 0,
  });
  final double orderSales;
  final double totalDiscount;
  final double discountPct;
  final double branchShare;
  final double platformShare;
  final int usageCount;
}

class PromoLine {
  const PromoLine({required this.code, required this.title, required this.ownership, required this.money, this.children = const []});
  final String code;
  final String? title;

  /// BRANCH | SHARED | PLATFORM
  final String ownership;
  final PromoMoney money;
  final List<PromoBranchLine> children;

  String get label => (title?.trim().isNotEmpty ?? false) ? title!.trim() : code;
}

class PromoBranchLine {
  const PromoBranchLine({
    required this.storeId,
    required this.storeName,
    required this.orderCount,
    required this.grossSales,
    required this.money,
    this.promos = const [],
  });
  final String storeId;
  final String storeName;
  final int orderCount;
  final double grossSales;
  final PromoMoney money;
  final List<PromoLine> promos;
}

class PromoReport {
  const PromoReport({
    required this.from,
    required this.to,
    required this.orderCount,
    required this.grossSales,
    required this.totals,
    required this.byBranch,
    required this.byPromo,
  });
  final String from;
  final String to;
  final int orderCount;
  final double grossSales;
  final PromoMoney totals;
  final List<PromoBranchLine> byBranch;
  final List<PromoLine> byPromo;
}

// ---------------------------------------------------------------- Staff

class CashierAccount {
  const CashierAccount({required this.id, required this.name, required this.email, required this.isActive, this.lastLoginAt});
  final String id;
  final String name;
  final String email;
  final bool isActive;
  final DateTime? lastLoginAt;
}

class CashierActivity {
  const CashierActivity({required this.ordersProcessed, required this.cashCollected, required this.cancels});
  final int ordersProcessed;
  final double cashCollected;
  final int cancels;
}

// ---------------------------------------------------------------- Delivery ops

class DriverRow {
  const DriverRow({
    required this.id,
    required this.name,
    required this.isActive,
    required this.dutyStatus,
    required this.completedJobs,
    required this.totalDeliveryFees,
    this.phone,
    this.vehicleType,
    this.vehicleNumber,
    this.photoUrl,
    this.rating,
    this.ratingCount = 0,
    this.homeBranch,
    this.meritStatus,
    this.lastLoginAt,
  });
  final String id;
  final String name;
  final bool isActive;

  /// ONLINE | ON_DELIVERY | OFF_DUTY …
  final String dutyStatus;
  final int completedJobs;
  final double totalDeliveryFees;
  final String? phone;
  final String? vehicleType;
  final String? vehicleNumber;
  final String? photoUrl;
  final double? rating;
  final int ratingCount;
  final String? homeBranch;
  final String? meritStatus;
  final DateTime? lastLoginAt;
}

class DriverComplaint {
  const DriverComplaint({
    required this.id,
    required this.category,
    required this.description,
    required this.status,
    required this.createdAt,
    this.driverName,
    this.orderNumber,
    this.customerName,
    this.resolvedByName,
  });
  final String id;
  final String category;
  final String description;

  /// OPEN | CONFIRMED | DISMISSED | RESOLVED
  final String status;
  final DateTime createdAt;
  final String? driverName;
  final String? orderNumber;
  final String? customerName;
  final String? resolvedByName;
}

class DeliveryFailure {
  const DeliveryFailure({
    required this.id,
    required this.outcome,
    required this.attemptNo,
    required this.createdAt,
    this.note,
    this.driverName,
    this.orderNumber,
    this.customerName,
    this.reassignmentStatus,
  });
  final String id;
  final String outcome;
  final int attemptNo;
  final DateTime createdAt;
  final String? note;
  final String? driverName;
  final String? orderNumber;
  final String? customerName;
  final String? reassignmentStatus;
}

class DeliveryOpsDashboard {
  const DeliveryOpsDashboard({
    this.online = 0,
    this.onDelivery = 0,
    this.offDuty = 0,
    this.jobsInProgress = 0,
    this.completedJobs = 0,
    this.distinctOrders = 0,
    this.totalDistanceKm = 0,
    this.onlineMinutes = 0,
    this.avgMinutesPerOrder,
    this.avgStationMinutes,
    this.topRiders = const [],
    this.activeJobs = const [],
  });
  final int online;
  final int onDelivery;
  final int offDuty;
  final int jobsInProgress;
  final int completedJobs;
  final int distinctOrders;
  final double totalDistanceKm;
  final int onlineMinutes;
  final double? avgMinutesPerOrder;
  final double? avgStationMinutes;
  final List<RiderRank> topRiders;
  final List<({String riderName, String status, int orderCount, double? distanceKm})> activeJobs;
}

// ---------------------------------------------------------------- Settings

class BranchHours {
  const BranchHours({
    required this.storeName,
    required this.openTime,
    required this.closeTime,
    this.onlineStart,
    this.onlineStop,
    this.pickupCutoffMinutes = 50,
  });
  final String storeName;
  final String openTime;
  final String closeTime;
  final String? onlineStart;
  final String? onlineStop;
  final int pickupCutoffMinutes;
}

/// The public `/settings/app` fields the branch settings page shows.
class AppSettingsInfo {
  const AppSettingsInfo({
    this.pickupAllowAddItemsPaidOnline = false,
    this.pickupAllowEditCashUnpaid = false,
    this.weeklyResetDay,
    this.maxCupsPerRider = 20,
    this.cancelWindowMinutes = 10,
  });
  final bool pickupAllowAddItemsPaidOnline;
  final bool pickupAllowEditCashUnpaid;
  final int? weeklyResetDay;
  final int maxCupsPerRider;
  final int cancelWindowMinutes;
}

class BranchOperatingStatus {
  const BranchOperatingStatus({this.closedAt});
  final DateTime? closedAt;
  bool get isClosed => closedAt != null;
}
