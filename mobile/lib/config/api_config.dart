import '../core/config/env.dart';

/// API base URL for the Bing Chun backend.
///
/// Production is the default. Override for local dev:
/// `--dart-define=API_BASE_URL=http://<your-ip>:4000/api`
///
/// @deprecated Prefer [Env] directly for new code — kept for existing
/// call sites during the Clean Architecture migration.
class ApiConfig {
  static const String productionBaseUrl = Env.productionCoreBaseUrl;

  static String get baseUrl => Env.coreApiBaseUrl;

  /// Optional branch ID for PIN login when multiple branches share the same app build.
  static String? get storeId => Env.storeId;
}
