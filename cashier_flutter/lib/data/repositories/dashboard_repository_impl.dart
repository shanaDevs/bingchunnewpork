import '../../domain/entities/dashboard.dart';
import '../../domain/logic/period.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/mappers.dart';
import '../network/api_client.dart';

class DashboardRepositoryImpl implements DashboardRepository {
  DashboardRepositoryImpl(this._api);
  final ApiClient _api;

  @override
  Future<DashboardStats> stats(PeriodFilter period) => _api.call(
    () => _api.dio.get<dynamic>('admin/dashboard', queryParameters: period.dashboardQuery),
    (d) => dashboardFromJson(asJson(d)),
  );
}
