import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';

import '../../core/events.dart';
import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../json.dart';
import 'api_exception.dart';

/// Staff API client.
///
/// The backend keeps staff JWTs in httpOnly cookies and never returns them in
/// JSON (lib/adminAuthResponse.ts), so this client behaves like the web cashier:
///   * a persistent cookie jar holds `bc_admin_at`, `bc_admin_rt` and `bc_csrf`;
///   * unsafe requests echo `bc_csrf` in `X-CSRF-Token` (double-submit check);
///   * a 401 triggers one shared `POST /auth/admin/refresh`, then the request is retried.
class ApiClient {
  ApiClient(this._jar, this._invalidator) {
    rebuild();
  }

  final PersistCookieJar _jar;
  final SessionInvalidator _invalidator;

  late Dio _dio;
  Dio get dio => _dio;

  /// Called with the refreshed `admin` payload so the saved session stays current.
  void Function(Json data)? onSessionRefreshed;

  /// True while a staff session is saved; 401s without one are plain failures.
  bool Function() hasSession = () => false;

  Future<RefreshOutcome>? _refreshInFlight;

  void rebuild() {
    _dio = _build();
  }

  Dio _build() {
    final dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
      ),
    );
    final retry = _RetryInterceptor();
    dio.interceptors.addAll([
      CookieManager(_jar),
      _CsrfInterceptor(this),
      _RefreshInterceptor(this),
      retry,
      if (kDebugMode) LogInterceptor(requestBody: false, responseBody: false),
    ]);
    retry.dio = dio;
    return dio;
  }

  /// `bc_csrf` cookie for the API host, echoed back on unsafe requests.
  Future<String?> csrfToken() async {
    final cookies = await _jar.loadForRequest(Uri.parse(AppConfig.apiBaseUrl));
    for (final c in cookies) {
      if (c.name == 'bc_csrf') return Uri.decodeComponent(c.value);
    }
    return null;
  }

  Future<void> clearCookies() => _jar.deleteAll();

  // ---------------- Envelope helpers ----------------

  /// Runs a request returning `{ success, data, message, code }` and parses `data`.
  Future<T> call<T>(Future<Response<dynamic>> Function() request, T Function(Object? data) parse) async {
    final body = await envelope(request);
    return parse(body['data']);
  }

  /// Full JSON body after the success check — for responses that carry `meta`.
  Future<Json> envelope(Future<Response<dynamic>> Function() request) async {
    try {
      final res = await request();
      final body = res.data;
      if (body is Map) {
        final j = Map<String, dynamic>.from(body);
        if (j['success'] == false) {
          throw ApiException(strOrNull(j, 'message') ?? tr('Request failed'), code: strOrNull(j, 'code'));
        }
        return j;
      }
      return {'data': body};
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  static ApiException mapDioError(DioException e) {
    final err = e.error;
    if (err is ApiException) return err;
    final res = e.response;
    if (res != null) {
      final status = res.statusCode ?? 0;
      final body = res.data;
      if (body is Map) {
        final j = Map<String, dynamic>.from(body);
        return ApiException(
          strOrNull(j, 'message') ?? _statusMessage(status),
          status: status,
          code: strOrNull(j, 'code'),
        );
      }
      return ApiException(_statusMessage(status), status: status);
    }
    debugPrint('Network error (${e.type}): ${(e.message ?? e.error ?? '').toString().trim()}');
    return ApiException(networkErrorMessage(e.type));
  }

  static String _statusMessage(int status) {
    if (status >= 500) return tr('The server ran into a problem. Please try again shortly.');
    if (status == 404) return tr('Not found');
    if (status == 401 || status == 403) return tr('Session expired. Please sign in again.');
    return tr('Request failed');
  }

  // ---------------- Session refresh ----------------

  /// Single-flight refresh shared by every request that hits a 401.
  Future<RefreshOutcome> refreshSession() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<RefreshOutcome> _doRefresh() async {
    // A bare client on the same jar: the refresh call must not re-enter the refresh interceptor.
    final plain = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl, contentType: Headers.jsonContentType))
      ..interceptors.add(CookieManager(_jar));
    try {
      final csrf = await csrfToken();
      final res = await plain.post<dynamic>(
        'auth/admin/refresh',
        data: <String, dynamic>{},
        options: Options(headers: {'X-CSRF-Token': ?csrf}),
      );
      final data = asJson(asJson(res.data)['data']);
      onSessionRefreshed?.call(data);
      return RefreshOutcome.ok;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) return RefreshOutcome.authFailed;
      return RefreshOutcome.retryableFailed;
    } finally {
      plain.close();
    }
  }

  void _sessionLost(String reason) => _invalidator.notify(reason);
}

enum RefreshOutcome { ok, authFailed, retryableFailed }

bool _isAuthRoute(String path) => RegExp(r'auth/admin/(login|refresh|logout|password/)').hasMatch(path);

/// Echo `bc_csrf` on unsafe methods. Always overwrites, since a refresh rotates the token.
class _CsrfInterceptor extends Interceptor {
  _CsrfInterceptor(this._client);
  final ApiClient _client;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final method = options.method.toUpperCase();
    if (method != 'GET' && method != 'HEAD') {
      final csrf = await _client.csrfToken();
      if (csrf != null) options.headers['X-CSRF-Token'] = csrf;
    }
    handler.next(options);
  }
}

/// On a 401, refresh the cookies once and replay the request (port of the web installAdminFetch).
class _RefreshInterceptor extends Interceptor {
  _RefreshInterceptor(this._client);
  final ApiClient _client;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final retried = options.extra['refresh_retried'] == true;
    if (err.response?.statusCode != 401 || retried || _isAuthRoute(options.path) || !_client.hasSession()) {
      return handler.next(err);
    }
    final outcome = await _client.refreshSession();
    if (outcome == RefreshOutcome.ok) {
      options.extra['refresh_retried'] = true;
      try {
        final res = await _client.dio.fetch<dynamic>(options);
        return handler.resolve(res);
      } on DioException catch (e) {
        return handler.next(e);
      }
    }
    if (outcome == RefreshOutcome.authFailed) {
      _client._sessionLost('Session expired. Please sign in again.');
    }
    handler.next(err);
  }
}

/// Retries transient network failures with exponential backoff.
///
/// - Connection errors (request never reached the server) are retried for every method.
/// - 502/503/504 responses are retried only for GET requests.
class _RetryInterceptor extends Interceptor {
  static const _maxAttempts = 3;
  static const _backoffMs = [500, 1000, 2000];
  static const _retryableStatus = {502, 503, 504};

  Dio? dio;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final attempt = (options.extra['retry_attempt'] as int?) ?? 0;
    final networkFailure =
        err.response == null &&
        (err.type == DioExceptionType.connectionError ||
            err.type == DioExceptionType.connectionTimeout ||
            err.type == DioExceptionType.unknown);
    final retryableStatus =
        options.method.toUpperCase() == 'GET' && _retryableStatus.contains(err.response?.statusCode);

    final client = dio;
    if (attempt >= _maxAttempts - 1 || client == null || !(networkFailure || retryableStatus) || !await _isOnline()) {
      return handler.next(err);
    }
    await Future<void>.delayed(Duration(milliseconds: _backoffMs[attempt]));
    options.extra['retry_attempt'] = attempt + 1;
    try {
      handler.resolve(await client.fetch<dynamic>(options));
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  Future<bool> _isOnline() async {
    try {
      final result = await Connectivity().checkConnectivity();
      return !result.contains(ConnectivityResult.none);
    } catch (_) {
      return true;
    }
  }
}

/// Cashier-facing text for a request that never got a response.
String networkErrorMessage(DioExceptionType type) => switch (type) {
  DioExceptionType.connectionTimeout ||
  DioExceptionType.sendTimeout ||
  DioExceptionType.receiveTimeout => tr('The server is taking too long to respond. Please try again.'),
  DioExceptionType.badCertificate => tr('Secure connection failed. Please try again later.'),
  DioExceptionType.cancel => tr('Request was cancelled.'),
  _ => tr("Can't connect to the server. Check your internet connection and try again."),
};
