import '../data/local/secure_store.dart';
import '../data/network/api_client.dart';
import '../data/repositories/auth_repository.dart';
import '../data/repositories/jobs_repository.dart';
import '../data/repositories/route_repository.dart';
import '../tracking/delivery_socket.dart';
import '../tracking/location_tracker.dart';
import 'alert_service.dart';
import 'app_lock.dart';
import 'device_requirements.dart';
import 'events.dart';
import 'inbox.dart';
import 'offer_outcomes.dart';
import 'push.dart';
import 'runtime_config.dart';

/// Manual dependency container — port of AppContainer.kt. Created once in main().
class AppContainer {
  AppContainer._(this.secureStore) {
    apiClient = ApiClient(secureStore, sessionInvalidator);
    authRepository = AuthRepository(apiClient, secureStore);
    jobsRepository = JobsRepository(apiClient);
    routeRepository = RouteRepository(apiClient);
    deliverySocket = DeliverySocket(secureStore, sessionInvalidator);
    locationTracker = LocationTracker(jobsRepository, deliverySocket);
    alertService = AlertService(
      store: secureStore,
      authRepository: authRepository,
      jobsRepository: jobsRepository,
      socket: deliverySocket,
      locationTracker: locationTracker,
    );
    pushTokens = PushTokens(secureStore, jobsRepository);
  }

  static Future<AppContainer> create() async {
    final store = SecureStore();
    await store.init();
    final container = AppContainer._(store);
    await container.appLock.init();
    await NotificationInbox.instance.load();
    await OfferOutcomes.instance.load();
    return container;
  }

  final SecureStore secureStore;
  final SessionInvalidator sessionInvalidator = SessionInvalidator();
  final DeviceRequirements deviceRequirements = DeviceRequirements();
  final AppLock appLock = AppLock();

  late final ApiClient apiClient;
  late final AuthRepository authRepository;
  late final JobsRepository jobsRepository;
  late final RouteRepository routeRepository;
  late final DeliverySocket deliverySocket;
  late final LocationTracker locationTracker;
  late final AlertService alertService;
  late final PushTokens pushTokens;

  /// Persist new API hosts and rebuild the HTTP clients + disconnect any live
  /// socket so the next login/request uses the new base URLs.
  void applyServerUrls(String coreUrl, String deliveryUrl, String? storeId) {
    final rc = RuntimeConfig.instance;
    rc.coreApiBaseUrl = coreUrl;
    rc.deliveryApiBaseUrl = deliveryUrl;
    rc.storeId = storeId;
    deliverySocket.disconnect();
    apiClient.rebuild();
  }

  Future<void> resetServerUrlsToDefaults() async {
    await RuntimeConfig.instance.resetToBuildDefaults();
    deliverySocket.disconnect();
    apiClient.rebuild();
  }
}
