import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';

import '../data/network/api_client.dart';
import '../data/realtime/admin_socket.dart';
import '../data/repositories/admin_repository_impl.dart';
import '../data/repositories/auth_repository_impl.dart';
import '../data/repositories/dashboard_repository_impl.dart';
import '../data/repositories/delivery_repository_impl.dart';
import '../data/repositories/menu_repository_impl.dart';
import '../data/repositories/notification_repository_impl.dart';
import '../data/repositories/order_repository_impl.dart';
import '../data/repositories/stock_repository_impl.dart';
import '../domain/repositories/repositories.dart';
import 'events.dart';
import 'order_chime.dart';
import 'runtime_config.dart';

/// Manual dependency container, created once in main(). Presentation code only
/// sees the domain repository interfaces.
class AppContainer {
  AppContainer._(PersistCookieJar jar) {
    apiClient = ApiClient(jar, sessionInvalidator);
    authRepository = AuthRepositoryImpl(apiClient, RuntimeConfig.instance.prefs!);
    menuRepository = MenuRepositoryImpl(apiClient);
    orderRepository = OrderRepositoryImpl(apiClient);
    dashboardRepository = DashboardRepositoryImpl(apiClient);
    notificationRepository = NotificationRepositoryImpl(apiClient);
    stockRepository = StockRepositoryImpl(apiClient);
    deliveryRepository = DeliveryRepositoryImpl(apiClient);
    permissionRepository = PermissionRepositoryImpl(apiClient);
    adminRepository = AdminRepositoryImpl(apiClient);
    socket = AdminSocket(authRepository.socketToken);
  }

  static Future<AppContainer> create() async {
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(storage: FileStorage('${dir.path}/cookies/'));
    return AppContainer._(jar);
  }

  final SessionInvalidator sessionInvalidator = SessionInvalidator();
  final OrderChime chime = OrderChime();

  late final ApiClient apiClient;
  late final AuthRepositoryImpl authRepository;
  late final MenuRepository menuRepository;
  late final OrderRepository orderRepository;
  late final DashboardRepository dashboardRepository;
  late final NotificationRepository notificationRepository;
  late final StockRepository stockRepository;
  late final DeliveryRepository deliveryRepository;
  late final PermissionRepository permissionRepository;
  late final AdminRepository adminRepository;
  late final AdminSocket socket;

  /// Point the app at a different backend (debug Server URL dialog).
  Future<void> applyApiBaseUrl(String? url) async {
    final rc = RuntimeConfig.instance;
    if (url == null || url.trim().isEmpty) {
      await rc.resetApiBaseUrl();
    } else {
      rc.apiBaseUrl = url;
    }
    socket.disconnect();
    apiClient.rebuild();
  }
}
