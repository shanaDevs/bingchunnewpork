import 'package:shared_preferences/shared_preferences.dart';

abstract class AppMetaStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class PrefsMetaStore implements AppMetaStore {
  PrefsMetaStore({SharedPreferencesAsync? prefs})
      : _prefs = prefs ?? SharedPreferencesAsync();

  final SharedPreferencesAsync _prefs;

  @override
  Future<String?> read(String key) => _prefs.getString(key);

  @override
  Future<void> write(String key, String value) => _prefs.setString(key, value);
}

class MemoryMetaStore implements AppMetaStore {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }
}
