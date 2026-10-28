import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../core/events.dart';
import '../../core/runtime_config.dart';
import '../json.dart';
import '../local/secure_store.dart';
import '../models/driver.dart';
import 'api_exception.dart';
import '../../l10n/l10n.dart';

/// Shared Dio stack for the core + delivery hosts — port of ApiClients.kt.
/// Call [rebuild] after RuntimeConfig URLs change.
class ApiClient {
  ApiClient(this._store, this._invalidator) {
    rebuild();
  }

  final SecureStore _store;
  final SessionInvalidator _invalidator;

  late Dio _core;
  late Dio _delivery;

  /// Plain client for external calls (OSRM).
  final Dio raw = Dio(
    BaseOptions(connectTimeout: const Duration(seconds: 12), receiveTimeout: const Duration(seconds: 12)),
  )..interceptors.add(_RetryInterceptor());

  Dio get core => _core;
  Dio get delivery => _delivery;

  void rebuild() {
    _core = _build(AppConfig.coreApiBaseUrl);
    _delivery = _build(AppConfig.deliveryApiBaseUrl);
  }

  Dio _build(String baseUrl) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
      ),
    );
    dio.interceptors.addAll([
      _AuthInterceptor(_store),
      _SessionInterceptor(_store, _invalidator),
      _RetryInterceptor(),
      if (kDebugMode) LogInterceptor(requestBody: false, responseBody: false),
    ]);
    // Retry needs the owning Dio to re-issue the request.
    (dio.interceptors.whereType<_RetryInterceptor>().first).dio = dio;
    return dio;
  }

  // ---------------- Envelope helpers ----------------

  /// Runs a request returning `{ success, data, message, code }` and unwraps `data`.
  /// Maps failures to [ApiException] the same way ApiClients.kt does.
  Future<T> call<T>(Future<Response<dynamic>> Function() request, T Function(Object? data) parse) async {
    final data = await _envelope(request);
    return parse(data);
  }

  /// Like [call] but tolerates a null payload (e.g. GET active job → null).
  Future<T?> callNullable<T>(Future<Response<dynamic>> Function() request, T Function(Object data) parse) async {
    final data = await _envelope(request);
    return data == null ? null : parse(data);
  }

  Future<Object?> _envelope(Future<Response<dynamic>> Function() request) async {
    try {
      final res = await request();
      final body = res.data;
      if (body is Map) {
        final j = Map<String, dynamic>.from(body);
        if (j['success'] == false) {
          throw ApiException(strOrNull(j, 'message') ?? 'Request failed', code: strOrNull(j, 'code'));
        }
        return j['data'];
      }
      return body;
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  static ApiException _mapDioError(DioException e) {
    final res = e.response;
    if (res != null) {
      final status = res.statusCode ?? 0;
      final body = res.data;
      if (body is Map) {
        final j = Map<String, dynamic>.from(body);
        final data = objOrNull(j, 'data');
        final branches = data == null ? null : listOf(data, 'branches', BranchOption.fromJson);
        return ApiException(
          strOrNull(j, 'message') ?? _statusMessage(status),
          status: status,
          code: strOrNull(j, 'code'),
          branches: (branches?.isEmpty ?? true) ? null : branches,
        );
      }
      return ApiException(_statusMessage(status), status: status);
    }
    // Keep the technical detail in the debug log only — riders get a plain sentence.
    debugPrint('Network error (${e.type}): ${(e.message ?? e.error ?? '').toString().trim()}');
    return ApiException(networkErrorMessage(e.type), status: 0);
  }

  /// Plain-language text for a response with no usable message body.
  static String _statusMessage(int status) {
    if (status >= 500) return tr('The server ran into a problem. Please try again shortly.');
    if (status == 404) return tr('Not found');
    if (status == 401 || status == 403) return tr('Session expired. Please sign in again.');
    return tr('Request failed');
  }
}

/// Adds `Authorization: Bearer <token>` when the request doesn't already carry one.
class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._store);
  final SecureStore _store;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _store.token;
    if (!options.headers.containsKey('Authorization') && token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

/// On authenticated 401s (not PIN login), tell [SessionInvalidator] so the
/// rider is signed out. Wrong-PIN 401s on login are ignored.
class _SessionInterceptor extends Interceptor {
  _SessionInterceptor(this._store, this._invalidator);
  final SecureStore _store;
  final SessionInvalidator _invalidator;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final res = err.response;
    if (res?.statusCode == 401 &&
        !err.requestOptions.path.endsWith('auth/delivery/login') &&
        (_store.token?.isNotEmpty ?? false)) {
      final body = res?.data;
      final code = body is Map ? body['code']?.toString() : null;
      _invalidator.notify(code ?? 'UNAUTHORIZED');
    }
    handler.next(err);
  }
}

/// Retries transient network failures with exponential backoff — port of RetryInterceptor.kt.
///
/// - Connection errors (request never reached the server) are retried for every method.
/// - 502/503/504 responses are retried only for GET requests.
class _RetryInterceptor extends Interceptor {
  static const _maxAttempts = 3;
  static const _maxTotalDelayMs = 5000;
  static const _backoffMs = [500, 1000, 2000];
  static const _retryableStatus = {502, 503, 504};

  Dio? dio;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final attempt = (options.extra['retry_attempt'] as int?) ?? 0;
    final totalDelay = (options.extra['retry_delay'] as int?) ?? 0;
    final isLast = attempt >= _maxAttempts - 1;

    final networkFailure =
        err.response == null &&
        (err.type == DioExceptionType.connectionError ||
            err.type == DioExceptionType.connectionTimeout ||
            err.type == DioExceptionType.unknown);
    final retryableStatus =
        options.method.toUpperCase() == 'GET' && _retryableStatus.contains(err.response?.statusCode);

    final client = dio;
    if (isLast || client == null || !(networkFailure || retryableStatus)) {
      return handler.next(err);
    }
    final delay = _backoffMs[attempt.clamp(0, _backoffMs.length - 1)];
    if (totalDelay + delay > _maxTotalDelayMs || !await _isOnline()) {
      return handler.next(err);
    }
    await Future<void>.delayed(Duration(milliseconds: delay));
    options.extra['retry_attempt'] = attempt + 1;
    options.extra['retry_delay'] = totalDelay + delay;
    try {
      final res = await client.fetch<dynamic>(options);
      handler.resolve(res);
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

/// Rider-facing text for a request that never got a response.
String networkErrorMessage(DioExceptionType type) => switch (type) {
  DioExceptionType.connectionTimeout ||
  DioExceptionType.sendTimeout ||
  DioExceptionType.receiveTimeout => tr('The server is taking too long to respond. Please try again.'),
  DioExceptionType.badCertificate => tr('Secure connection failed. Please try again later.'),
  DioExceptionType.cancel => tr('Request was cancelled.'),
  _ => tr("Can't connect to the server. Check your internet connection and try again."),
};
