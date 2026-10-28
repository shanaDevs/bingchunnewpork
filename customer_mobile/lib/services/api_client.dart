import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';

class ApiException implements Exception {
  final String message;
  final int status;

  ApiException(this.message, {this.status = 0});

  @override
  String toString() => message;
}

class ApiClient {
  final http.Client _client;
  final Duration timeout;
  final FlutterSecureStorage _storage;

  void Function()? onUnauthenticated;

  ApiClient({
    http.Client? client,
    this.timeout = const Duration(seconds: 20),
    FlutterSecureStorage? storage,
  })  : _client = client ?? http.Client(),
        _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'bc_customer_token';
  static const _refreshTokenKey = 'bc_customer_refresh_token';

  String? _cachedToken;
  String? _cachedRefreshToken;

  Future<String?> _getToken() async {
    if (_cachedToken != null) return _cachedToken;
    _cachedToken = await _storage.read(key: _tokenKey);
    return _cachedToken;
  }

  Future<bool> hasAuthToken() async {
    final token = await _getToken();
    return token != null && token.isNotEmpty;
  }

  Future<String?> readAccessToken() => _getToken();

  Future<void> saveToken(String token) async {
    _cachedToken = token;
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<void> saveRefreshToken(String token) async {
    _cachedRefreshToken = token;
    await _storage.write(key: _refreshTokenKey, value: token);
  }

  Future<void> clearToken() async {
    _cachedToken = null;
    _cachedRefreshToken = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }

  Future<T> post<T>(
    String path,
    Map<String, dynamic> body, {
    bool requireAuth = true,
    Map<String, String>? extraHeaders,
    T Function(Map<String, dynamic> json)? parser,
    T Function(List<dynamic> jsonList)? listParser,
  }) async {
    return _request(
      'POST',
      path,
      body: body,
      requireAuth: requireAuth,
      extraHeaders: extraHeaders,
      parser: parser,
      listParser: listParser,
    );
  }

  Future<T> get<T>(
    String path, {
    bool requireAuth = true,
    T Function(Map<String, dynamic> json)? parser,
    T Function(List<dynamic> jsonList)? listParser,
    T Function(Map<String, dynamic> payload)? fullParser,
  }) async {
    return _request(
      'GET',
      path,
      requireAuth: requireAuth,
      parser: parser,
      listParser: listParser,
      fullParser: fullParser,
    );
  }

  Future<T> put<T>(
    String path,
    Map<String, dynamic> body, {
    bool requireAuth = true,
    T Function(Map<String, dynamic> json)? parser,
    T Function(List<dynamic> jsonList)? listParser,
  }) async {
    return _request('PUT', path, body: body, requireAuth: requireAuth, parser: parser, listParser: listParser);
  }

  Future<T> patch<T>(
    String path, {
    Map<String, dynamic>? body,
    bool requireAuth = true,
    T Function(Map<String, dynamic> json)? parser,
  }) async {
    return _request('PATCH', path, body: body, requireAuth: requireAuth, parser: parser);
  }

  Future<T> delete<T>(
    String path, {
    bool requireAuth = true,
    Map<String, dynamic>? body,
    T Function(Map<String, dynamic> json)? parser,
  }) async {
    return _request('DELETE', path, body: body, requireAuth: requireAuth, parser: parser);
  }

  Future<bool> _attemptTokenRefresh() async {
    if (_cachedRefreshToken == null) {
      _cachedRefreshToken = await _storage.read(key: _refreshTokenKey);
    }
    final refreshToken = _cachedRefreshToken;
    if (refreshToken == null) return false;

    try {
      final uri = Uri.parse('${ApiConfig.baseUrl}/auth/refresh');
      final res = await _client.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ).timeout(timeout);

      if (res.statusCode == 200) {
        final payload = jsonDecode(res.body) as Map<String, dynamic>;
        final data = payload['data'] as Map<String, dynamic>;
        final newToken = data['token'] as String;
        await saveToken(newToken);
        return true;
      }

      // Only log out if the server explicitly rejected the refresh token.
      // Network errors / timeouts should NOT force a logout.
      if (res.statusCode == 401 || res.statusCode == 403) {
        onUnauthenticated?.call();
      }
    } catch (_) {
      // Network / timeout error — do NOT call onUnauthenticated.
    }
    return false;
  }

  Future<T> _request<T>(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool requireAuth = true,
    Map<String, String>? extraHeaders,
    T Function(Map<String, dynamic> json)? parser,
    T Function(List<dynamic> jsonList)? listParser,
    T Function(Map<String, dynamic> payload)? fullParser,
  }) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (extraHeaders != null) {
      headers.addAll(extraHeaders);
    }

    if (requireAuth) {
      final token = await _getToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    late http.Response res;
    try {
      switch (method) {
        case 'GET':
          res = await _client.get(uri, headers: headers).timeout(timeout);
          break;
        case 'PUT':
          res = await _client.put(uri, headers: headers, body: jsonEncode(body)).timeout(timeout);
          break;
        case 'PATCH':
          res = await _client.patch(uri, headers: headers, body: body != null ? jsonEncode(body) : null).timeout(timeout);
          break;
        case 'DELETE':
          res = await _client.delete(uri, headers: headers, body: body != null ? jsonEncode(body) : null).timeout(timeout);
          break;
        default:
          res = await _client.post(uri, headers: headers, body: jsonEncode(body)).timeout(timeout);
      }
    } catch (_) {
      throw ApiException(
        'Cannot reach server. Is the API running?',
      );
    }

    // Intercept 401 and try to refresh token (except on login/refresh endpoints)
    if (res.statusCode == 401 &&
        path != '/auth/refresh' &&
        path != '/auth/login' &&
        path != '/auth/phone/login' &&
        path != '/auth/otp/verify') {
      final refreshed = await _attemptTokenRefresh();
      if (refreshed) {
        final token = await _getToken();
        if (token != null) {
          headers['Authorization'] = 'Bearer $token';
        }
        try {
          switch (method) {
            case 'GET':
              res = await _client.get(uri, headers: headers).timeout(timeout);
              break;
            case 'PUT':
              res = await _client.put(uri, headers: headers, body: jsonEncode(body)).timeout(timeout);
              break;
            case 'PATCH':
              res = await _client.patch(uri, headers: headers, body: body != null ? jsonEncode(body) : null).timeout(timeout);
              break;
            case 'DELETE':
              res = await _client.delete(uri, headers: headers).timeout(timeout);
              break;
            default:
              res = await _client.post(uri, headers: headers, body: jsonEncode(body)).timeout(timeout);
          }
        } catch (_) {
          throw ApiException(
            'Cannot reach server. Is the API running?',
          );
        }
      } else {
        // onUnauthenticated is now handled inside _attemptTokenRefresh
        // when the server explicitly rejects the refresh token.
        throw ApiException('Authentication failed', status: 401);
      }
    }

    Map<String, dynamic> payload;
    try {
      payload = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Invalid response from server', status: res.statusCode);
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(
        payload['message'] as String? ?? 'Request failed',
        status: res.statusCode,
      );
    }

    if (fullParser != null) {
      return fullParser(payload);
    }

    final data = payload['data'];
    if (parser != null) {
      if (data is Map<String, dynamic>) return parser(data);
      throw ApiException('Unexpected response shape: expected object', status: res.statusCode);
    }
    if (listParser != null) {
      if (data is List<dynamic>) return listParser(data);
      throw ApiException('Unexpected response shape: expected list', status: res.statusCode);
    }
    
    return data as T;
  }
}
