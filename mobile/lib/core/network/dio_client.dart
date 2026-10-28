import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/secure_storage.dart';
import 'api_exception.dart';
import 'session_invalidator.dart';

/// Dio-backed HTTP client used by the `features/*/data` repositories.
///
/// Wraps the shared `{ success, data, message, code }` API envelope and
/// throws [ApiException] on any failure, mirroring the previous
/// `http`-based `ApiClient` so callers migrate without behaviour changes.
class DioClient {
  DioClient({
    required String baseUrl,
    Dio? dio,
    SecureStorage? storage,
    Duration timeout = const Duration(seconds: 20),
  })  : _storage = storage ?? secureStorage,
        dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: timeout,
              receiveTimeout: timeout,
              headers: const {'Content-Type': 'application/json'},
            )) {
    this.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (!options.headers.containsKey('Authorization')) {
            final token = await _storage.readToken();
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (err, handler) async {
          try {
            await _maybeInvalidateSession(err);
          } catch (_) {}
          handler.next(err);
        },
      ),
    );
  }

  /// Client pointed at the core backend (`$API_BASE_URL/api`).
  factory DioClient.core({Duration timeout = const Duration(seconds: 20)}) =>
      DioClient(baseUrl: Env.coreApiBaseUrl, timeout: timeout);

  /// Client pointed at the Delivery Service (`$DELIVERY_API_BASE_URL`).
  factory DioClient.delivery({Duration timeout = const Duration(seconds: 20)}) =>
      DioClient(baseUrl: Env.deliveryApiBaseUrl, timeout: timeout);

  final Dio dio;
  final SecureStorage _storage;

  Future<void> _maybeInvalidateSession(DioException err) async {
    if (err.response?.statusCode != 401) return;
    final path = err.requestOptions.path;
    if (path.contains('/auth/delivery/login')) return;
    final token = await _storage.readToken();
    if (token == null || token.isEmpty) return;
    final data = err.response?.data;
    String? code;
    if (data is Map) {
      code = data['code'] as String?;
    }
    SessionInvalidator.instance.notify(code ?? 'UNAUTHORIZED');
  }

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _request('GET', path, query: query, token: token, parser: parser);

  Future<T> post<T>(
    String path,
    Map<String, dynamic> body, {
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _request('POST', path, data: body, token: token, parser: parser);

  Future<T> put<T>(
    String path,
    Map<String, dynamic> body, {
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) => _request('PUT', path, data: body, token: token, parser: parser);

  Future<T> _request<T>(
    String method,
    String path, {
    Map<String, dynamic>? data,
    Map<String, dynamic>? query,
    String? token,
    T Function(Map<String, dynamic> json)? parser,
  }) async {
    Response<dynamic> res;
    try {
      res = await dio.request<dynamic>(
        path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: token != null ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
    } on DioException catch (e) {
      throw _mapDioError(e);
    }

    final payload = res.data;
    if (payload is! Map<String, dynamic>) {
      throw ApiException('Invalid response from server', status: res.statusCode ?? 0);
    }

    if (payload['success'] == false) {
      throw ApiException(
        payload['message'] as String? ?? 'Request failed',
        status: res.statusCode ?? 0,
        code: payload['code'] as String?,
      );
    }

    final resultData = payload['data'];
    if (parser != null) {
      if (resultData is Map<String, dynamic>) return parser(resultData);
      throw ApiException('Unexpected response shape', status: res.statusCode ?? 0);
    }
    return resultData as T;
  }

  ApiException _mapDioError(DioException e) {
    final response = e.response;
    if (response != null) {
      final payload = response.data;
      if (payload is Map<String, dynamic>) {
        return ApiException(
          payload['message'] as String? ?? 'Request failed',
          status: response.statusCode ?? 0,
          code: payload['code'] as String?,
        );
      }
      return ApiException('Request failed', status: response.statusCode ?? 0);
    }
    return ApiException('Cannot reach server. Is the API running at ${dio.options.baseUrl}?');
  }
}
