import '../../domain/entities/stock.dart';
import '../../domain/logic/menu_access.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/stock_mappers.dart';
import '../network/api_client.dart';
import '../network/api_exception.dart';

class StockRepositoryImpl implements StockRepository {
  StockRepositoryImpl(this._api);
  final ApiClient _api;

  @override
  Future<({String storeName, List<StockItem> items})> stock(String storeId, {String? search, String? category}) =>
      _api.call(
        () => _api.dio.get<dynamic>(
          'admin/stock',
          queryParameters: {
            'storeId': storeId,
            if (search != null && search.isNotEmpty) 'search': search,
            'category': ?category,
          },
        ),
        (d) {
          final j = asJson(d);
          return (
            storeName: str(objOrNull(j, 'store') ?? const {}, 'name'),
            items: listOf(j, 'items', stockItemFromJson),
          );
        },
      );

  @override
  Future<List<StockBatch>> productBatches(String productId, String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/stock/$productId/batches', queryParameters: {'storeId': storeId}),
    (d) => listOf(asJson(d), 'batches', stockBatchFromJson),
  );

  @override
  Future<List<StockBatch>> branchBatches(String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/stock/batches', queryParameters: {'storeId': storeId}),
    (d) => listOf(asJson(d), 'batches', stockBatchFromJson),
  );

  @override
  Future<StockLedger> ledger({required String storeId, required String from, required String to, String? productId}) =>
      _api.call(
        () => _api.dio.get<dynamic>(
          'admin/stock/movement-ledger',
          queryParameters: {'storeId': storeId, 'from': from, 'to': to, 'productId': ?productId},
        ),
        (d) => stockLedgerFromJson(asJson(d)),
      );

  @override
  Future<StockPricing?> pricing({
    required String storeId,
    required String productId,
    required String from,
    required String to,
  }) async {
    try {
      return await _api.call(
        () => _api.dio.get<dynamic>(
          'admin/stock/$productId/pricing',
          queryParameters: {'storeId': storeId, 'from': from, 'to': to},
        ),
        (d) => stockPricingFromJson(asJson(d)),
      );
    } on ApiException {
      // Header falls back to catalog cost / price, like the web.
      return null;
    }
  }

  @override
  Future<String?> batchPreview({required String storeId, required String batchType, required DateTime receivedAt}) async {
    try {
      return await _api.call(
        () => _api.dio.get<dynamic>(
          'admin/stock/batch-preview',
          queryParameters: {
            'storeId': storeId,
            'batchType': batchType,
            'receivedAt': receivedAt.toUtc().toIso8601String(),
          },
        ),
        (d) => strOrNull(asJson(d), 'batchNumber'),
      );
    } on ApiException {
      return null;
    }
  }

  @override
  Future<int> receiveBatch({
    required String storeId,
    required String productId,
    required int qty,
    required DateTime receivedAt,
    required String batchType,
    String? note,
  }) => _api.call(
    () => _api.dio.post<dynamic>(
      'admin/stock/$productId/batches',
      data: compact({
        'storeId': storeId,
        'receivedQty': qty,
        'receivedAt': receivedAt.toUtc().toIso8601String(),
        'note': (note?.trim().isEmpty ?? true) ? null : note!.trim(),
        'batchType': batchType,
      }),
    ),
    (d) => intOf(asJson(d), 'onHand'),
  );

  @override
  Future<int> adjust({required String storeId, required String productId, required int delta, String? note}) =>
      _api.call(
        () => _api.dio.post<dynamic>(
          'admin/stock/$productId/topup',
          data: compact({
            'storeId': storeId,
            'delta': delta,
            'note': (note?.trim().isEmpty ?? true) ? null : note!.trim(),
          }),
        ),
        (d) => intOf(asJson(d), 'weeklyRemainingQty'),
      );

  @override
  Future<void> setAvailable({required String storeId, required String productId, required bool available}) =>
      _api.call(
        () => _api.dio.patch<dynamic>('admin/stock/$productId', data: {'isAvailable': available, 'storeId': storeId}),
        (_) {},
      );

  @override
  Future<void> saveSettings({
    required String storeId,
    required String productId,
    required int weeklyTargetQty,
    int? lowStockThreshold,
    int? onlineOutOfStockThreshold,
  }) => _api.call(
    () => _api.dio.patch<dynamic>(
      'admin/stock/$productId/settings',
      data: {
        'storeId': storeId,
        'weeklyTargetQty': weeklyTargetQty,
        'lowStockThreshold': lowStockThreshold,
        'onlineOutOfStockThreshold': onlineOutOfStockThreshold,
      },
    ),
    (_) {},
  );
}

class PermissionRepositoryImpl implements PermissionRepository {
  PermissionRepositoryImpl(this._api);
  final ApiClient _api;

  @override
  Future<Map<String, MenuPermission>> menus() => _api.call(() => _api.dio.get<dynamic>('admin/me/permissions'), (d) {
    final rows = d is List ? d : asJson(d)['data'];
    return {
      for (final p in listFrom(rows, (j) => j))
        str(p, 'menu'): MenuPermission(
          read: boolOf(p, 'canRead'),
          create: boolOf(p, 'canCreate'),
          update: boolOf(p, 'canUpdate'),
          delete: boolOf(p, 'canDelete'),
          any: boolOf(p, 'canCreate') || boolOf(p, 'canRead') || boolOf(p, 'canUpdate') || boolOf(p, 'canDelete'),
        ),
    };
  });
}
