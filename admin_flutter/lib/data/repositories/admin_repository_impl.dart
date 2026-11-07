import 'package:dio/dio.dart';

import '../../domain/entities/admin.dart';
import '../../domain/entities/order.dart';
import '../../domain/logic/period.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/admin_mappers.dart';
import '../network/api_client.dart';

class AdminRepositoryImpl implements AdminRepository {
  AdminRepositoryImpl(this._api);
  final ApiClient _api;

  Dio get _dio => _api.dio;
  String _id(String v) => Uri.encodeComponent(v);

  Future<T> _get<T>(String path, T Function(Object? d) parse, [Map<String, dynamic>? query, Duration? timeout]) =>
      _api.call(
        () => _dio.get<dynamic>(
          path,
          queryParameters: query,
          options: timeout == null ? null : Options(receiveTimeout: timeout),
        ),
        parse,
      );

  /// Analytics and report aggregations can take far longer than the 20 s default
  /// (the web waits indefinitely); the wallet overview is the slowest of all.
  static const _analytics = Duration(seconds: 90);
  static const _walletTimeout = Duration(minutes: 3);

  /// Lists that come back as `{ data, meta: { total, page, pages } }`.
  Future<Paged<T>> _paged<T>(String path, Map<String, String> query, T Function(Json) parse) async {
    final body = await _api.envelope(() => _dio.get<dynamic>(path, queryParameters: query));
    final meta = objOrNull(body, 'meta') ?? const <String, dynamic>{};
    final items = listFrom(body['data'], parse);
    return Paged(
      items: items,
      total: intOf(meta, 'total', items.length),
      page: intOf(meta, 'page', 1),
      pages: intOf(meta, 'pages', 1),
    );
  }

  /// Delivery-service lists: `{ rows, total, page, pageSize }` or a bare array.
  Paged<T> _opsPage<T>(Object? d, int page, int pageSize, T Function(Json) parse) {
    if (d is Map && d['rows'] is List) {
      final j = asJson(d);
      final rows = listFrom(j['rows'], parse);
      final total = intOf(j, 'total', rows.length);
      final size = intOf(j, 'pageSize', pageSize);
      return Paged(items: rows, total: total, page: intOf(j, 'page', page), pages: (total / size).ceil().clamp(1, 1 << 30));
    }
    final rows = listFrom(d, parse);
    return Paged(items: rows, total: rows.length, page: 1, pages: 1);
  }

  Map<String, String> _period(PeriodFilter p) => p.dashboardQuery;

  // ---------------------------------------------------------------- Dashboards

  @override
  Future<SuperDashboard> superDashboard(PeriodFilter period) async {
    // The web loads four tiers in parallel and merges them (useTieredDashboardStats).
    const tiers = ['summary', 'charts', 'charts-wallet', 'details'];
    final parts = await Future.wait([
      for (final tier in tiers)
        _get('admin/dashboard', asJson, {..._period(period), 'tier': tier}, _analytics).catchError((_) => <String, dynamic>{}),
    ]);
    final merged = <String, dynamic>{for (final p in parts) ...p};
    if (merged.isEmpty) {
      // Every tier failed — surface the real error from a plain call.
      return _get('admin/dashboard', (d) => superDashboardFromJson(asJson(d)), _period(period), _analytics);
    }
    return superDashboardFromJson(merged);
  }

  @override
  Future<BrandAnalytics> brandAnalytics(PeriodFilter period, {String? tier, String? storeId}) => _get(
    tier == null ? 'admin/reports/brand-analytics' : 'admin/reports/branch-tier-analytics',
    (d) => brandAnalyticsFromJson(asJson(d)),
    {..._period(period), 'tier': ?tier, 'storeId': ?storeId},
    _analytics,
  );

  @override
  Future<BranchAnalytics> branchAnalytics(PeriodFilter period) =>
      _get('admin/reports/branch-analytics', (d) => branchAnalyticsFromJson(asJson(d)), _period(period), _analytics);

  @override
  Future<int> periodCups(PeriodFilter period) =>
      _get('admin/dashboard', (d) => intOf(asJson(d), 'periodCups'), _period(period));

  // ---------------------------------------------------------------- Refunds

  @override
  Future<Paged<RefundRow>> refunds(Map<String, String> params) => _paged('refunds', params, refundFromJson);

  @override
  Future<int> refundCount(Map<String, String> params) async {
    final body = await _api.envelope(
      () => _dio.get<dynamic>('refunds', queryParameters: {...params, 'page': '1', 'limit': '1'}),
    );
    return intOf(objOrNull(body, 'meta') ?? const {}, 'total');
  }

  @override
  Future<RefundSummary> refundSummary(Map<String, String> params) =>
      _get('refunds/summary', (d) => refundSummaryFromJson(asJson(d)), params);

  @override
  Future<RefundRow> refund(String id) => _get('refunds/${_id(id)}', (d) => refundFromJson(asJson(d)));

  @override
  Future<RefundRow> updateRefund(String id, {required String status, String? adminNotes}) => _api.call(
    () => _dio.put<dynamic>('refunds/${_id(id)}/status', data: compact({'status': status, 'adminNotes': adminNotes})),
    (d) => refundFromJson(asJson(d)),
  );

  @override
  Future<AppSettingsInfo> appSettings() => _get('settings/app', (d) => appSettingsFromJson(asJson(d)));

  // ---------------------------------------------------------------- JASON

  @override
  Future<JasonLedger> jason({String? type}) => _get('admin/jason', (d) => jasonFromJson(asJson(d)), {'type': ?type});

  @override
  Future<void> addJason({
    required String type,
    required double amount,
    required String description,
    required String occurredAt,
  }) => _api.call(
    () => _dio.post<dynamic>(
      'admin/jason',
      data: {'type': type, 'amount': amount, 'description': description, 'occurredAt': occurredAt},
    ),
    (_) {},
  );

  // ---------------------------------------------------------------- Menu

  @override
  Future<List<AdminProduct>> products({bool? available}) => _get(
    'menu/products',
    (d) => listFrom(d is Map ? asJson(d)['data'] ?? asJson(d)['products'] : d, adminProductFromJson),
    available == null ? {'all': 'true'} : {'available': '$available'},
  );

  @override
  Future<List<AdminTopping>> toppings() =>
      _get('menu/toppings', (d) => listFrom(d, adminToppingFromJson), {'all': 'true'});

  @override
  Future<void> saveProduct(String? id, Map<String, dynamic> body) => _api.call(
    () => id == null ? _dio.post<dynamic>('menu/products', data: body) : _dio.put<dynamic>('menu/products/${_id(id)}', data: body),
    (_) {},
  );

  @override
  Future<void> setProductAvailable(String id, bool available) =>
      _api.call(() => _dio.put<dynamic>('menu/products/${_id(id)}', data: {'isAvailable': available}), (_) {});

  @override
  Future<String?> uploadProductImage(String path) => _api.call(
    () => _dio.post<dynamic>(
      'menu/products/upload',
      data: FormData.fromMap({'image': MultipartFile.fromFileSync(path, filename: path.split(RegExp(r'[\\/]')).last)}),
      options: Options(contentType: 'multipart/form-data'),
    ),
    (d) => strOrNull(asJson(d), 'imageUrl'),
  );

  @override
  Future<void> saveTopping(String? id, {required String name, required double extraPrice, required bool isAvailable}) {
    final body = {'name': name, 'extraPrice': extraPrice, 'isAvailable': isAvailable};
    return _api.call(
      () => id == null ? _dio.post<dynamic>('menu/toppings', data: body) : _dio.put<dynamic>('menu/toppings/${_id(id)}', data: body),
      (_) {},
    );
  }

  // ---------------------------------------------------------------- Wallet

  @override
  Future<WalletOverview> walletOverview({String? from, String? to}) => _get(
    'admin/wallet',
    (d) => walletOverviewFromJson(asJson(d)),
    from != null && to != null ? {'from': from, 'to': to} : null,
    _walletTimeout,
  );

  @override
  Future<Paged<Withdrawal>> withdrawals({int page = 1, String? from, String? to, String? status}) async {
    final data = await _get('admin/wallet/withdrawals', asJson, {
      'page': '$page',
      'limit': '10',
      'from': ?from,
      'to': ?to,
      'status': ?status,
    });
    final rows = listFrom(data['items'] ?? data['withdrawals'], withdrawalFromJson);
    final pg = objOrNull(data, 'pagination') ?? const <String, dynamic>{};
    return Paged(items: rows, total: intOf(pg, 'total', rows.length), page: intOf(pg, 'page', page), pages: intOf(pg, 'pages', 1));
  }

  @override
  Future<WalletTxnPage> walletTransactions(String storeId, {int page = 1, String? from, String? to, String? direction}) async {
    final data = await _get('admin/wallet/${_id(storeId)}/transactions', asJson, {
      'page': '$page',
      'limit': '15',
      'from': ?from,
      'to': ?to,
      'direction': ?direction,
    });
    final pg = objOrNull(data, 'pagination') ?? const <String, dynamic>{};
    final summary = objOrNull(data, 'summary');
    return WalletTxnPage(
      items: listOf(data, 'transactions', walletTxnFromJson),
      summary: summary == null ? null : walletTxnSummaryFromJson(summary),
      page: intOf(pg, 'page', page),
      pages: intOf(pg, 'pages', 1),
    );
  }

  // ---------------------------------------------------------------- Promotions & reports

  @override
  Future<PromoReport> promoReport({required String from, required String to}) =>
      _get('promos/admin/discount-report', (d) => promoReportFromJson(asJson(d)), {'from': from, 'to': to}, _analytics);

  @override
  Future<Object?> report(String path, Map<String, String> params) => _get(path, (d) => d, params, _analytics);

  // ---------------------------------------------------------------- Cashiers

  @override
  Future<List<CashierAccount>> cashierAccounts() =>
      _get('admin/cashiers', (d) => listFrom(d is Map ? asJson(d)['data'] : d, cashierAccountFromJson));

  @override
  Future<Map<String, CashierActivity>> cashierActivity({required String from, required String to}) => _get(
    'orders/cashier-activity',
    (d) => {
      for (final r in listOf(asJson(d), 'cashiers', (j) => j))
        str(r, 'adminId'): CashierActivity(
          ordersProcessed: intOf(r, 'ordersProcessed'),
          cashCollected: dbl(r, 'cashCollectedAmount'),
          cancels: intOf(r, 'cancels'),
        ),
    },
    {'from': from, 'to': to},
  );

  @override
  Future<void> createCashier({required String name, required String email, required String password}) => _api.call(
    () => _dio.post<dynamic>('admin/cashiers', data: {'name': name, 'email': email, 'password': password}),
    (_) {},
  );

  @override
  Future<void> updateCashier(String id, Map<String, dynamic> body) =>
      _api.call(() => _dio.patch<dynamic>('admin/cashiers/${_id(id)}', data: body), (_) {});

  // ---------------------------------------------------------------- Delivery ops

  @override
  Future<DeliveryOpsDashboard> deliveryDashboard({required String storeId, String? from, String? to}) => _get(
    'admin/delivery-dashboard',
    (d) => deliveryDashboardFromJson(asJson(d)),
    {'storeId': storeId, 'dateFrom': ?from, 'dateTo': ?to},
  );

  @override
  Future<Paged<DriverRow>> drivers({required String storeId, int page = 1, String? name, bool? active}) => _get(
    'admin/branches/${_id(storeId)}/driver-pool',
    (d) => _opsPage(d, page, 20, driverFromJson),
    {
      'page': '$page',
      'pageSize': '20',
      if (name != null && name.isNotEmpty) 'name': name,
      if (active != null) 'isActive': '$active',
    },
  );

  @override
  Future<void> setDriverActive(String id, bool active) =>
      _api.call(() => _dio.patch<dynamic>('admin/drivers/${_id(id)}', data: {'isActive': active}), (_) {});

  @override
  Future<Paged<DriverComplaint>> complaints({required String storeId, int page = 1}) => _get(
    'admin/driver-complaints',
    (d) => _opsPage(d, page, 20, complaintFromJson),
    {'storeId': storeId, 'page': '$page', 'pageSize': '20'},
  );

  @override
  Future<void> reviewComplaint(String id, String status) =>
      _api.call(() => _dio.patch<dynamic>('admin/driver-complaints/${_id(id)}', data: {'status': status}), (_) {});

  @override
  Future<Paged<DeliveryFailure>> failures({required String storeId, int page = 1}) => _get(
    'admin/delivery-failures',
    (d) => _opsPage(d, page, 20, failureFromJson),
    {'storeId': storeId, 'page': '$page', 'pageSize': '20'},
  );

  // ---------------------------------------------------------------- Branch settings

  @override
  Future<BranchHours> branchHours() => _get('settings/branch-ordering-hours', (d) => branchHoursFromJson(asJson(d)));

  @override
  Future<void> saveBranchHours(BranchHours h) => _api.call(
    () => _dio.put<dynamic>(
      'settings/branch-ordering-hours',
      data: {
        'openTime': h.openTime,
        'closeTime': h.closeTime,
        'onlineOrderStartTime': (h.onlineStart?.trim().isEmpty ?? true) ? null : h.onlineStart,
        'onlineOrderStopTime': (h.onlineStop?.trim().isEmpty ?? true) ? null : h.onlineStop,
        'pickupCutoffMinutes': h.pickupCutoffMinutes,
      },
    ),
    (_) {},
  );

  @override
  Future<BranchOperatingStatus> branchOperatingStatus() => _get(
    'admin/branch-operating-status',
    (d) => BranchOperatingStatus(closedAt: dateOrNull(asJson(d), 'branchClosedAt')),
  );

  @override
  Future<void> setBranchOpen(bool open) =>
      _api.call(() => _dio.post<dynamic>(open ? 'admin/branch/open' : 'admin/branch/close', data: <String, dynamic>{}), (_) {});
}
