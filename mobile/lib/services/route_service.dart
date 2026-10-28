import '../models/delivery_route.dart';
import 'api_client.dart';
import 'auth_service.dart';

class RouteService {
  RouteService({
    ApiClient? api,
    AuthService? auth,
  })  : _api = api ?? ApiClient(),
        _auth = auth ?? AuthService();

  final ApiClient _api;
  final AuthService _auth;

  Future<DeliveryRoute> fetchOptimizedRoute() async {
    final token = await _auth.getToken();
    if (token == null) throw ApiException('Not signed in', status: 401);

    return _api.get<DeliveryRoute>(
      '/delivery/route',
      token: token,
      parser: DeliveryRoute.fromJson,
    );
  }
}
