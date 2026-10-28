/// Central environment/config surface for the driver app.
///
/// Override at build/run time with `--dart-define`, e.g.:
/// `flutter run --dart-define=API_BASE_URL=http://192.168.1.50:4000/api \
///   --dart-define=DELIVERY_API_BASE_URL=http://192.168.1.50:4100/delivery-api`
class Env {
  Env._();

  /// Core backend production base (includes `/api`).
  static const String productionCoreBaseUrl =
      'https://bing-chung-b.mp.dartcodes.com/api';

  static const String _envCoreBase = String.fromEnvironment('API_BASE_URL');
  static const String _envDeliveryBase = String.fromEnvironment('DELIVERY_API_BASE_URL');
  static const String _envStoreId = String.fromEnvironment('STORE_ID');
  static const bool isDebug = !bool.fromEnvironment('dart.vm.product');

  /// Core backend base URL, e.g. `https://host/api` or `http://host:4000/api`.
  static String get coreApiBaseUrl =>
      _envCoreBase.isNotEmpty ? _envCoreBase : productionCoreBaseUrl;

  /// Core Socket.IO origin (no `/api` path). GPS and job events go here.
  static String get coreSocketOrigin {
    final uri = Uri.tryParse(coreApiBaseUrl);
    if (uri == null) return coreApiBaseUrl;
    return uri.replace(path: '', query: '').toString().replaceFirst(RegExp(r'/$'), '');
  }

  /// Delivery Service base URL, e.g. `https://host/delivery-api`.
  ///
  /// Resolution order:
  /// 1. `DELIVERY_API_BASE_URL` dart-define (explicit override).
  /// 2. Local HTTP debug (`localhost` / private LAN): same host on port 4100
  ///    with `/delivery-api`.
  /// 3. Hosted / release: same origin as core, swapping `/api` for
  ///    `/delivery-api` (delivery service reverse-proxied on the same host).
  static String get deliveryApiBaseUrl {
    if (_envDeliveryBase.isNotEmpty) return _envDeliveryBase;

    final coreUri = Uri.tryParse(coreApiBaseUrl);
    if (coreUri == null) return coreApiBaseUrl;

    final host = coreUri.host;
    final isLocalHttp = coreUri.scheme == 'http' &&
        (host == 'localhost' ||
            host == '127.0.0.1' ||
            host == '10.0.2.2' ||
            host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            RegExp(r'^172\.(1[6-9]|2\d|3[0-1])\.').hasMatch(host));

    if (isDebug && isLocalHttp) {
      return coreUri.replace(port: 4100, path: '/delivery-api').toString();
    }

    final path = coreUri.path.replaceFirst(RegExp(r'/api/?$'), '/delivery-api');
    return coreUri.replace(path: path).toString();
  }

  /// Delivery Service socket.io origin (no path suffix).
  static String get deliverySocketOrigin {
    final uri = Uri.tryParse(deliveryApiBaseUrl);
    if (uri == null) return deliveryApiBaseUrl;
    return uri.replace(path: '').toString();
  }

  /// Optional branch ID for PIN login when multiple branches share the same app build.
  static String? get storeId => _envStoreId.isNotEmpty ? _envStoreId : null;
}
