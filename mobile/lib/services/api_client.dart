import '../core/network/dio_client.dart';

export '../core/network/api_exception.dart';

/// @deprecated Thin wrapper around [DioClient] kept so existing providers
/// (`auth_provider.dart`, `jobs_provider.dart`) and screens keep working
/// unchanged while the app migrates to `core/network` + `features/*/data`.
///
/// New code should construct a [DioClient] (via `DioClient.core()` or
/// `DioClient.delivery()`) directly instead of adding call sites here.
class ApiClient {
  ApiClient({DioClient? client, Duration timeout = const Duration(seconds: 20)})
      : _client = client ?? DioClient.core(timeout: timeout);

  final DioClient _client;

  Future<T> post<T>(
    String path,
    Map<String, dynamic> body, {
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _client.post<T>(path, body, token: token, parser: parser);

  Future<T> get<T>(
    String path, {
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _client.get<T>(path, token: token, parser: parser);

  Future<T> put<T>(
    String path,
    Map<String, dynamic> body, {
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _client.put<T>(path, body, token: token, parser: parser);
}
