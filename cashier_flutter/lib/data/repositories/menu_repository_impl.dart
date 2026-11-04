import '../../domain/entities/menu.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/mappers.dart';
import '../network/api_client.dart';

class MenuRepositoryImpl implements MenuRepository {
  MenuRepositoryImpl(this._api);
  final ApiClient _api;

  @override
  Future<List<MenuCategory>> categories() =>
      _api.call(() => _api.dio.get<dynamic>('menu/categories'), (d) => listFrom(d, categoryFromJson));

  /// Products available at [storeId] (branch stock and availability applied server-side).
  @override
  Future<List<Product>> products(String storeId) => _api.call(
    () => _api.dio.get<dynamic>('menu/products', queryParameters: {'available': 'true', 'storeId': storeId}),
    (d) => listFrom(d, productFromJson),
  );

  @override
  Future<List<StoreOption>> stores() =>
      _api.call(() => _api.dio.get<dynamic>('stores'), (d) => listFrom(d, storeFromJson));
}
