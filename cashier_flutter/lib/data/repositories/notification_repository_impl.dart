import '../../domain/entities/admin_notification.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/mappers.dart';
import '../network/api_client.dart';

class NotificationRepositoryImpl implements NotificationRepository {
  NotificationRepositoryImpl(this._api);
  final ApiClient _api;

  @override
  Future<List<AdminNotice>> unread({int limit = 20}) => _api.call(
    () => _api.dio.get<dynamic>('admin/notifications', queryParameters: {'unread': 'true', 'limit': '$limit'}),
    (d) => listOf(asJson(d), 'notifications', noticeFromJson),
  );

  @override
  Future<void> markRead(String id) =>
      _api.call(() => _api.dio.patch<dynamic>('admin/notifications/$id/read', data: <String, dynamic>{}), (_) {});

  @override
  Future<void> markAllRead() =>
      _api.call(() => _api.dio.post<dynamic>('admin/notifications/read-all', data: <String, dynamic>{}), (_) {});
}
