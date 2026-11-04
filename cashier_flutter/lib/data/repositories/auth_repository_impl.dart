import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/entities/admin_session.dart';
import '../../domain/repositories/repositories.dart';
import '../json.dart';
import '../mappers/mappers.dart';
import '../network/api_client.dart';
import '../network/api_exception.dart';

/// Staff sign-in against `/auth/admin/*`. Tokens live in the cookie jar; only the
/// public session profile is kept in preferences (like the web `bc_admin` key).
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._api, this._prefs) {
    _current = _load();
    _api.hasSession = () => _current != null;
    _api.onSessionRefreshed = (data) {
      final admin = objOrNull(data, 'admin');
      if (admin != null) _save(sessionFromJson(admin), intOrNull(data, 'accessExpiresAt'));
    };
  }

  final ApiClient _api;
  final SharedPreferences _prefs;

  static const _keySession = 'bc_admin';
  static const _keyAccessExp = 'bc_admin_access_exp';

  /// Refresh this long before the access cookie expires (web ADMIN_ACCESS_REFRESH_BUFFER_MS).
  static const _refreshBuffer = Duration(minutes: 2);

  AdminSession? _current;

  @override
  AdminSession? get current => _current;

  AdminSession? _load() {
    final raw = _prefs.getString(_keySession);
    if (raw == null) return null;
    try {
      return sessionFromJson(asJson(jsonDecode(raw)));
    } catch (_) {
      return null;
    }
  }

  void _save(AdminSession session, int? accessExpiresAt) {
    _current = session;
    _prefs.setString(_keySession, jsonEncode(sessionToJson(session)));
    if (accessExpiresAt != null) _prefs.setInt(_keyAccessExp, accessExpiresAt);
  }

  Future<void> _clear() async {
    _current = null;
    await _prefs.remove(_keySession);
    await _prefs.remove(_keyAccessExp);
    await _api.clearCookies();
  }

  @override
  Future<AdminSession> login(String email, String password) async {
    final data = await _api.call(
      () => _api.dio.post<dynamic>('auth/admin/login', data: {'email': email.trim(), 'password': password}),
      asJson,
    );
    final admin = objOrNull(data, 'admin');
    if (admin == null || str(admin, 'role').isEmpty) {
      throw const ApiException('Unexpected login response from server');
    }
    final session = sessionFromJson(admin);
    _save(session, intOrNull(data, 'accessExpiresAt'));
    return session;
  }

  @override
  Future<AdminSession?> restore() async {
    final saved = _current;
    if (saved == null) return null;
    final exp = _prefs.getInt(_keyAccessExp);
    final needsRefresh =
        exp == null || DateTime.fromMillisecondsSinceEpoch(exp).difference(DateTime.now()) < _refreshBuffer;
    if (!needsRefresh) return saved;
    switch (await _api.refreshSession()) {
      case RefreshOutcome.ok:
        return _current;
      case RefreshOutcome.authFailed:
        await _clear();
        return null;
      case RefreshOutcome.retryableFailed:
        // Offline at launch: keep the saved session; requests refresh once the network is back.
        return saved;
    }
  }

  @override
  Future<void> logout() async {
    try {
      await _api.dio.post<dynamic>('auth/admin/logout', data: <String, dynamic>{});
    } catch (_) {
      // Best effort — the server also revokes on refresh-token version bump.
    }
    await _clear();
  }

  /// Clears the local session after the server rejected it (no logout call).
  Future<void> dropSession() => _clear();

  @override
  Future<String?> socketToken() async {
    try {
      final data = await _api.call(() => _api.dio.get<dynamic>('auth/admin/socket-token'), asJson);
      return strOrNull(data, 'token');
    } on ApiException {
      return null;
    }
  }
}
