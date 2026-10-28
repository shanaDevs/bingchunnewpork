import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Encrypted key/value storage — port of SecureStore.kt. Same logical keys.
///
/// Values are cached in memory after [init] so interceptors can read the token
/// synchronously, like the Kotlin EncryptedSharedPreferences getter.
class SecureStore {
  static const _keyToken = 'bc_delivery_token';
  static const _keyDriver = 'bc_delivery_driver';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _token;
  String? _driverJson;

  Future<void> init() async {
    try {
      _token = await _storage.read(key: _keyToken);
      _driverJson = await _storage.read(key: _keyDriver);
    } catch (_) {
      // Corrupt keystore after a reinstall — start signed out.
      _token = null;
      _driverJson = null;
    }
  }

  String? get token => _token;
  set token(String? value) {
    _token = value;
    value == null ? _storage.delete(key: _keyToken) : _storage.write(key: _keyToken, value: value);
  }

  String? get driverJson => _driverJson;
  set driverJson(String? value) {
    _driverJson = value;
    value == null ? _storage.delete(key: _keyDriver) : _storage.write(key: _keyDriver, value: value);
  }

  Future<void> clear() async {
    _token = null;
    _driverJson = null;
    await _storage.delete(key: _keyToken);
    await _storage.delete(key: _keyDriver);
  }
}
