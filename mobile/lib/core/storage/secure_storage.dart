import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Thin wrapper around [FlutterSecureStorage] with the driver-session keys
/// used across the app (auth token, cached driver profile).
///
/// Kept as a single small surface so the Dio auth interceptor and the auth
/// repository read/write the same keys without duplicating string literals.
class SecureStorage {
  SecureStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const tokenKey = 'bc_delivery_token';
  static const driverKey = 'bc_delivery_driver';

  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: tokenKey);

  Future<void> writeToken(String token) => _storage.write(key: tokenKey, value: token);

  Future<String?> readDriver() => _storage.read(key: driverKey);

  Future<void> writeDriver(String json) => _storage.write(key: driverKey, value: json);

  Future<void> clear() async {
    await _storage.delete(key: tokenKey);
    await _storage.delete(key: driverKey);
  }
}

/// Shared singleton — the app only ever needs one secure storage instance.
final secureStorage = SecureStorage();
