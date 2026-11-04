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
          any: boolOf(p, 'canCreate') || boolOf(p, 'canRead') || boolOf(p, 'canUpdate') || boolOf(p, 'canDelete'),
        ),
    };
  });
}
