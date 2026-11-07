import '../entities/admin.dart';
import '../entities/admin_notification.dart';
import '../entities/admin_session.dart';
import '../entities/dashboard.dart';
import '../entities/delivery.dart';
import '../entities/menu.dart';
import '../entities/order.dart';
import '../entities/stock.dart';
import '../logic/counter_payment.dart';
import '../logic/menu_access.dart';
import '../logic/order_query.dart';
import '../logic/period.dart';

/// Contracts the presentation layer depends on. Implementations live in
/// data/repositories and talk to the backend's staff API.

abstract interface class AuthRepository {
  /// Session saved on this device, if any (not yet verified with the server).
  AdminSession? get current;

  Future<AdminSession> login(String email, String password);

  /// Re-validates the saved session on launch (refreshing cookies when needed).
  /// Returns null when the cashier must sign in again.
  Future<AdminSession?> restore();

  Future<void> logout();

  /// Short-lived access JWT for the Socket.IO handshake.
  Future<String?> socketToken();
}

abstract interface class MenuRepository {
  Future<List<MenuCategory>> categories();
  Future<List<Product>> products(String storeId);
  Future<List<StoreOption>> stores();
}

/// Item change sent to `PUT /orders/:id/items`.
sealed class OrderItemChange {
  const OrderItemChange();
  Map<String, dynamic> toJson();
}

class ExistingItemChange extends OrderItemChange {
  const ExistingItemChange(this.orderItemId, this.quantity);
  final String orderItemId;
  final int quantity;

  @override
  Map<String, dynamic> toJson() => {'orderItemId': orderItemId, 'quantity': quantity};
}

class NewItemChange extends OrderItemChange {
  const NewItemChange({required this.productId, required this.quantity, this.toppingIds = const []});
  final String productId;
  final int quantity;
  final List<String> toppingIds;

  @override
  Map<String, dynamic> toJson() => {
    'productId': productId,
    'size': 'REGULAR',
    'sugarLevel': 'HUNDRED',
    'iceLevel': 'REGULAR',
    'toppingIds': toppingIds,
    'quantity': quantity,
  };
}

abstract interface class OrderRepository {
  Future<Paged<OrderSummary>> list(OrderQuery query, int page);
  Future<int> count(Map<String, String> params);
  Future<OrderDetail> get(String orderKey);
  Future<OrderConversation?> conversation(String orderKey);

  Future<void> updateStatus(String orderId, String status, {String? cancelReason, String? note});

  /// Hand a READY pickup order to the customer, collecting payment or balance at the counter.
  Future<OrderDetail?> completeTakeaway(
    String orderId, {
    required bool collectPayment,
    required bool collectBalance,
    CounterPaymentMethod? method,
    int? cashReceived,
  });

  Future<OrderDetail?> updateItems(String orderId, List<OrderItemChange> items);

  /// Active takeaway orders in pickup-queue order (branch-scoped for staff).
  Future<List<OrderSummary>> takeawayQueue();

  /// Saves a new queue order; ids are the whole queue, top first.
  Future<void> reorderTakeawayQueue(List<String> orderIds);

  Future<List<CashierOption>> cashiers();

  /// `GET /orders` with raw query params (All Orders filters, order lifecycle report).
  Future<Paged<OrderSummary>> listRaw(Map<String, String> params);
}

abstract interface class DashboardRepository {
  Future<DashboardStats> stats(PeriodFilter period);
}

/// Branch stock (read-only for cashiers — every write route is branch-admin only).
abstract interface class StockRepository {
  Future<({String storeName, List<StockItem> items})> stock(String storeId, {String? search, String? category});
  Future<List<StockBatch>> productBatches(String productId, String storeId);
  Future<List<StockBatch>> branchBatches(String storeId);
  Future<StockLedger> ledger({required String storeId, required String from, required String to, String? productId});
  Future<StockPricing?> pricing({
    required String storeId,
    required String productId,
    required String from,
    required String to,
  });

  // Branch-admin writes (web ReceiveStockModal / StockAdjustModal / StockSettingsDrawer).

  /// Next batch number the server will assign (`RESET` → R-…, `EMERGENCY` → E-…).
  Future<String?> batchPreview({required String storeId, required String batchType, required DateTime receivedAt});

  /// Receives a batch; returns the new on-hand quantity.
  Future<int> receiveBatch({
    required String storeId,
    required String productId,
    required int qty,
    required DateTime receivedAt,
    required String batchType,
    String? note,
  });

  /// Manual +/- correction; returns the new on-hand quantity.
  Future<int> adjust({required String storeId, required String productId, required int delta, String? note});

  Future<void> setAvailable({required String storeId, required String productId, required bool available});

  Future<void> saveSettings({
    required String storeId,
    required String productId,
    required int weeklyTargetQty,
    int? lowStockThreshold,
    int? onlineOutOfStockThreshold,
  });
}

/// Delivery runs, live riders and building new runs from READY orders.
abstract interface class DeliveryRepository {
  Future<List<DeliveryJob>> jobs(Map<String, String> query);
  Future<DeliveryJobDetail> job(String jobId, String storeId);
  Future<DeliveryRoute> route(String jobId, String storeId);
  Future<ActualRoute> actualRoute(String jobId, String storeId);
  Future<List<LiveDriver>> liveDrivers(String storeId);
  Future<List<DriverOption>> driverPool(String storeId);

  /// READY delivery orders not yet on a run.
  Future<List<PendingDeliveryOrder>> pendingOrders(String storeId);

  /// Suggested runs split by direction and the cups-per-rider limit.
  Future<ClassifyResult> classify(String storeId, int maxCupsPerRider);

  /// Road route for a group before it is published.
  Future<DeliveryRoute> previewRoute(String storeId, List<String> orderIds, String title);

  /// Publishes a run to the branch riders.
  Future<void> createJob(String storeId, String title, List<String> orderIds);

  /// Rings the branch riders again for an unclaimed run.
  Future<void> reRing(String jobId);

  /// App setting `maxCupsPerRider` (public `/settings/app`).
  Future<int> maxCupsPerRider();
}

/// Staff menu permissions (`GET /admin/me/permissions`).
abstract interface class PermissionRepository {
  /// Menu key → grant, e.g. {STOCK: read}.
  Future<Map<String, MenuPermission>> menus();
}

abstract interface class NotificationRepository {
  Future<List<AdminNotice>> unread({int limit = 20});
  Future<void> markRead(String id);
  Future<void> markAllRead();
}

/// Admin-only pages: super admin analytics, refunds, wallet, JASON, menu,
/// promotions, reports, plus branch admin cashiers, delivery ops and settings.
abstract interface class AdminRepository {
  // Dashboards & sales
  Future<SuperDashboard> superDashboard(PeriodFilter period);
  Future<BrandAnalytics> brandAnalytics(PeriodFilter period, {String? tier, String? storeId});
  Future<BranchAnalytics> branchAnalytics(PeriodFilter period);

  /// `periodCups` from `/admin/dashboard` (branch Sales "Total Cups Sold").
  Future<int> periodCups(PeriodFilter period);

  // Refunds
  Future<Paged<RefundRow>> refunds(Map<String, String> params);
  Future<int> refundCount(Map<String, String> params);
  Future<RefundSummary> refundSummary(Map<String, String> params);
  Future<RefundRow> refund(String id);
  Future<RefundRow> updateRefund(String id, {required String status, String? adminNotes});

  /// App setting `cancelWindowMinutes` (public `/settings/app`).
  Future<AppSettingsInfo> appSettings();

  // JASON ledger
  Future<JasonLedger> jason({String? type});
  Future<void> addJason({required String type, required double amount, required String description, required String occurredAt});

  // Menu
  Future<List<AdminProduct>> products({bool? available});
  Future<List<AdminTopping>> toppings();
  Future<void> saveProduct(String? id, Map<String, dynamic> body);
  Future<void> setProductAvailable(String id, bool available);
  Future<String?> uploadProductImage(String path);
  Future<void> saveTopping(String? id, {required String name, required double extraPrice, required bool isAvailable});

  // Wallet
  Future<WalletOverview> walletOverview({String? from, String? to});
  Future<Paged<Withdrawal>> withdrawals({int page = 1, String? from, String? to, String? status});
  Future<WalletTxnPage> walletTransactions(String storeId, {int page = 1, String? from, String? to, String? direction});

  // Promotions analytics
  Future<PromoReport> promoReport({required String from, required String to});

  // Reports — raw payload; lib/domain/logic/reports.dart turns it into rows.
  Future<Object?> report(String path, Map<String, String> params);

  // Cashiers
  Future<List<CashierAccount>> cashierAccounts();
  Future<Map<String, CashierActivity>> cashierActivity({required String from, required String to});
  Future<void> createCashier({required String name, required String email, required String password});
  Future<void> updateCashier(String id, Map<String, dynamic> body);

  // Delivery ops (branch admin)
  Future<DeliveryOpsDashboard> deliveryDashboard({required String storeId, String? from, String? to});
  Future<Paged<DriverRow>> drivers({required String storeId, int page = 1, String? name, bool? active});
  Future<void> setDriverActive(String id, bool active);
  Future<Paged<DriverComplaint>> complaints({required String storeId, int page = 1});
  Future<void> reviewComplaint(String id, String status);
  Future<Paged<DeliveryFailure>> failures({required String storeId, int page = 1});

  // Branch settings
  Future<BranchHours> branchHours();
  Future<void> saveBranchHours(BranchHours hours);
  Future<BranchOperatingStatus> branchOperatingStatus();
  Future<void> setBranchOpen(bool open);
}
