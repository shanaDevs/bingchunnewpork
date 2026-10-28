import 'dart:convert';

import '../../../core/config/env.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../models/driver_session.dart';

/// Data-layer repository for driver authentication against the core
/// backend's `/auth/delivery/*` endpoints.
///
/// This is the Clean Architecture home for auth I/O; `services/auth_service.dart`
/// now delegates to this class so existing Riverpod providers keep working.
class AuthRepository {
  AuthRepository({DioClient? client, SecureStorage? storage})
      : _client = client ?? DioClient.core(),
        _storage = storage ?? secureStorage;

  final DioClient _client;
  final SecureStorage _storage;

  Future<DriverSession> login(String pin, {String? storeId}) async {
    final body = <String, dynamic>{'pin': pin};
    final branchId = storeId ?? Env.storeId;
    if (branchId != null && branchId.isNotEmpty) body['storeId'] = branchId;

    final data = await _client.post<Map<String, dynamic>>('/auth/delivery/login', body);

    final token = data['token'] as String;
    final driver = DriverSession.fromJson(data['driver'] as Map<String, dynamic>);

    await _storage.writeToken(token);
    await _storage.writeDriver(jsonEncode(driver.toJson()));

    return driver;
  }

  Future<String?> getToken() => _storage.readToken();

  Future<DriverSession?> getStoredDriver() async {
    final raw = await _storage.readDriver();
    if (raw == null) return null;
    try {
      return DriverSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() => _storage.clear();
}
