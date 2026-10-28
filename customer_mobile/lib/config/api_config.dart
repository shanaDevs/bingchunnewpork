class ApiConfig {
  static const int apiPort = 4000;

  static const String productionBaseUrl =
      'https://bing-chung-b.mp.dartcodes.com/api';

  static const String _envBase = String.fromEnvironment('API_BASE_URL');

  /// Online backend by default. Override for local testing with
  /// `--dart-define=API_BASE_URL=http://<lan-ip>:4000/api`
  static String get baseUrl {
    if (_envBase.isNotEmpty) return _envBase;
    return productionBaseUrl;
  }

  /// Derive socket URL or static assets URL by stripping '/api'
  static String get serverBaseUrl {
    final base = baseUrl;
    if (base.endsWith('/api')) {
      return base.substring(0, base.length - 4);
    }
    return base;
  }

  /// API server root (no `/api`) — product images and mascots are served here.
  static String get assetBaseUrl => serverBaseUrl;

  /// Turn `/products/foo.png` or `/mascots/bar.png` into a full URL.
  static String? resolveAssetUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return '$assetBaseUrl$url';
    return url;
  }

  /// Network URL for mascot art on the web frontend (fallback for remote loads).
  static String mascotUrl(String filename) => '$frontendUrl/mascots/$filename';

  /// Web app origin (order tracking pages, etc.)
  static String get frontendUrl {
    final base = baseUrl;
    if (base.contains('bing-chung-b.mp.dartcodes.com')) {
      return 'https://bing-chung.mp.dartcodes.com';
    }

    try {
      final uri = Uri.parse(base);
      final host = uri.host;
      final scheme = uri.scheme;
      final port = uri.port;

      if (host.isNotEmpty) {
        if (port == apiPort) {
          // Local dev: Next.js on 3000; emulator uses 10.0.2.2 for host too
          final webHost = host == '10.0.2.2' ? '10.0.2.2' : host;
          return '$scheme://$webHost:3000';
        }
        return '$scheme://$host';
      }
    } catch (_) {}

    return 'https://bing-chung.mp.dartcodes.com';
  }
}
