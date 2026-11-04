import '../../domain/entities/delivery.dart';
import '../../domain/logic/delivery_selection.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/delivery_mappers.dart';
import '../network/api_client.dart';

class DeliveryRepositoryImpl implements DeliveryRepository {
  DeliveryRepositoryImpl(this._api);
  final ApiClient _api;

  String _id(String id) => Uri.encodeComponent(id);

  @override
  Future<List<DeliveryJob>> jobs(Map<String, String> query) => _api.call(
    () => _api.dio.get<dynamic>('admin/delivery-jobs', queryParameters: query),
    (d) => listFrom(d, deliveryJobFromJson),
  );

  @override
  Future<DeliveryJobDetail> job(String jobId, String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/delivery-jobs/${_id(jobId)}', queryParameters: {'storeId': storeId}),
    (d) => deliveryJobDetailFromJson(asJson(d)),
  );

  @override
  Future<DeliveryRoute> route(String jobId, String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/delivery-jobs/${_id(jobId)}/route', queryParameters: {'storeId': storeId}),
    (d) => deliveryRouteFromJson(asJson(d)),
  );

  @override
  Future<ActualRoute> actualRoute(String jobId, String storeId) => _api.call(
    () =>
        _api.dio.get<dynamic>('admin/delivery-jobs/${_id(jobId)}/actual-route', queryParameters: {'storeId': storeId}),
    (d) => actualRouteFromJson(asJson(d)),
  );

  @override
  Future<List<LiveDriver>> liveDrivers(String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/live-drivers', queryParameters: {'storeId': storeId}),
    (d) => listFrom(d, liveDriverFromJson),
  );

  /// Riders who can take this branch's runs (web rider filter on the Jobs tab).
  @override
  Future<List<DriverOption>> driverPool(String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/branches/${_id(storeId)}/driver-pool'),
    (d) => listFrom(d, (j) => DriverOption(id: str(j, 'id'), name: str(j, 'name'))),
  );

  @override
  Future<List<PendingDeliveryOrder>> pendingOrders(String storeId) => _api.call(
    () => _api.dio.get<dynamic>('admin/delivery/pending-orders', queryParameters: {'storeId': storeId}),
    (d) => listFrom(d, pendingDeliveryOrderFromJson),
  );

  @override
  Future<ClassifyResult> classify(String storeId, int maxCupsPerRider) => _api.call(
    () => _api.dio.post<dynamic>(
      'admin/delivery/classify',
      data: {'storeId': storeId, 'maxCupsPerRider': maxCupsPerRider},
    ),
    (d) => classifyResultFromJson(asJson(d)),
  );

  @override
  Future<DeliveryRoute> previewRoute(String storeId, List<String> orderIds, String title) => _api.call(
    () => _api.dio.post<dynamic>(
      'admin/delivery/preview-route',
      data: {'storeId': storeId, 'orderIds': orderIds, 'title': title},
    ),
    (d) => deliveryRouteFromJson(asJson(d)),
  );

  @override
  Future<void> createJob(String storeId, String title, List<String> orderIds) => _api.call(
    () =>
        _api.dio.post<dynamic>('admin/delivery-jobs', data: {'storeId': storeId, 'title': title, 'orderIds': orderIds}),
    (_) {},
  );

  @override
  Future<void> reRing(String jobId) => _api.call(
    () => _api.dio.post<dynamic>('admin/delivery-jobs/${_id(jobId)}/re-ring', data: const <String, dynamic>{}),
    (_) {},
  );

  /// Web useMaxCupsPerRider: 1-100 from settings, else the default.
  @override
  Future<int> maxCupsPerRider() async {
    try {
      return await _api.call(() => _api.dio.get<dynamic>('settings/app'), (d) {
        final v = d is Map ? intOrNull(asJson(d), 'maxCupsPerRider') : null;
        return v != null && v >= 1 && v <= 100 ? v : defaultMaxCupsPerRider;
      });
    } catch (_) {
      return defaultMaxCupsPerRider;
    }
  }
}
