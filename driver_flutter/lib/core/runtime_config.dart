import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/l10n.dart';
import 'endpoints.dart';

/// Build-time defaults. Override with `--dart-define=CORE_API_BASE_URL=...` etc.
///
/// Debug builds default to 127.0.0.1 so `adb reverse tcp:4000 tcp:4000` and
/// `adb reverse tcp:4100 tcp:4100` make the phone talk to this PC (same as the
/// Kotlin debug build). Release builds default to the hosted backend.
class BuildDefaults {
  static const String _coreOverride = String.fromEnvironment('CORE_API_BASE_URL');
  static const String _deliveryOverride = String.fromEnvironment('DELIVERY_API_BASE_URL');
  static const String storeId = String.fromEnvironment('STORE_ID');

  // Host / local addresses are defined once in endpoints.dart.
  static String get coreApiBaseUrl =>
      _coreOverride.isNotEmpty ? _coreOverride : (kDebugMode ? Endpoints.localCore : Endpoints.productionCore);

  static String get deliveryApiBaseUrl => _deliveryOverride.isNotEmpty
      ? _deliveryOverride
      : (kDebugMode ? Endpoints.localDelivery : Endpoints.productionDelivery);
}

/// Persisted overrides for API hosts + UX prefs (theme, sound, haptics).
/// Port of RuntimeConfig.kt.
class RuntimeConfig extends ChangeNotifier {
  RuntimeConfig._();
  static final RuntimeConfig instance = RuntimeConfig._();

  static const _keyCore = 'core_api_base_url';
  static const _keyDelivery = 'delivery_api_base_url';
  static const _keyStore = 'store_id';
  static const _keyTheme = 'theme_mode';
  static const _keySound = 'sound_enabled';
  static const _keyHaptics = 'haptics_enabled';
  static const _keyFullScreenAlerts = 'full_screen_alerts_enabled';
  static const _keyFullScreenAlertsReset = 'full_screen_alerts_reset_v1';
  static const _keyLanguage = 'app_language';
  static const _defaultTheme = 'LIGHT';

  SharedPreferences? _prefs;

  String _themeMode = _defaultTheme;
  bool _soundEnabled = true;
  bool _hapticsEnabled = true;
  bool _fullScreenAlertsEnabled = true;

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
    _themeMode = _prefs?.getString(_keyTheme) ?? _defaultTheme;
    _soundEnabled = _prefs?.getBool(_keySound) ?? true;
    _hapticsEnabled = _prefs?.getBool(_keyHaptics) ?? true;
    // Riders who switched full-screen alerts off never saw new rides over the lock screen.
    // Turn it back on once after this update; a later choice to switch it off is kept.
    if (!(_prefs?.getBool(_keyFullScreenAlertsReset) ?? false)) {
      await _prefs?.setBool(_keyFullScreenAlerts, true);
      await _prefs?.setBool(_keyFullScreenAlertsReset, true);
    }
    _fullScreenAlertsEnabled = _prefs?.getBool(_keyFullScreenAlerts) ?? true;
    L10n.current = AppLanguage.fromCode(_prefs?.getString(_keyLanguage));
  }

  /// Host overrides are a debug-only tool; release builds always talk to the shipped hosts.
  bool get _overridesAllowed => kDebugMode;

  String get coreApiBaseUrl {
    final v = _prefs?.getString(_keyCore);
    if (_overridesAllowed && v != null && v.trim().isNotEmpty) return v;
    return BuildDefaults.coreApiBaseUrl;
  }

  set coreApiBaseUrl(String value) {
    if (!_overridesAllowed) return;
    _prefs?.setString(_keyCore, _trimSlash(value));
  }

  String get deliveryApiBaseUrl {
    final v = _prefs?.getString(_keyDelivery);
    if (_overridesAllowed && v != null && v.trim().isNotEmpty) return v;
    return BuildDefaults.deliveryApiBaseUrl;
  }

  set deliveryApiBaseUrl(String value) {
    if (!_overridesAllowed) return;
    _prefs?.setString(_keyDelivery, _trimSlash(value));
  }

  String? get storeId {
    final override = _prefs?.getString(_keyStore);
    if (override != null) return override.trim().isEmpty ? null : override;
    return BuildDefaults.storeId.isEmpty ? null : BuildDefaults.storeId;
  }

  set storeId(String? value) {
    if (value == null || value.trim().isEmpty) {
      _prefs?.remove(_keyStore);
    } else {
      _prefs?.setString(_keyStore, value.trim());
    }
  }

  String get themeMode => _themeMode;
  set themeMode(String value) {
    _themeMode = value;
    _prefs?.setString(_keyTheme, value);
    notifyListeners();
  }

  AppLanguage get language => L10n.current;
  set language(AppLanguage value) {
    if (value == L10n.current) return;
    L10n.current = value;
    _prefs?.setString(_keyLanguage, value.code);
    notifyListeners();
  }

  bool get soundEnabled => _soundEnabled;
  set soundEnabled(bool value) {
    _soundEnabled = value;
    _prefs?.setBool(_keySound, value);
    notifyListeners();
  }

  bool get hapticsEnabled => _hapticsEnabled;
  set hapticsEnabled(bool value) {
    _hapticsEnabled = value;
    _prefs?.setBool(_keyHaptics, value);
    notifyListeners();
  }

  /// Rider's in-app choice; the Android permission is checked separately.
  bool get fullScreenAlertsEnabled => _fullScreenAlertsEnabled;
  set fullScreenAlertsEnabled(bool value) {
    _fullScreenAlertsEnabled = value;
    _prefs?.setBool(_keyFullScreenAlerts, value);
    notifyListeners();
  }

  /// Reads the saved choice straight from disk — the FCM background isolate never runs [init].
  static Future<bool> readFullScreenAlertsEnabled() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.reload();
      return prefs.getBool(_keyFullScreenAlerts) ?? true;
    } catch (_) {
      return true;
    }
  }

  bool get hasOverrides =>
      _overridesAllowed &&
      ((_prefs?.containsKey(_keyCore) ?? false) ||
          (_prefs?.containsKey(_keyDelivery) ?? false) ||
          (_prefs?.containsKey(_keyStore) ?? false));

  Future<void> resetToBuildDefaults() async {
    await _prefs?.remove(_keyCore);
    await _prefs?.remove(_keyDelivery);
    await _prefs?.remove(_keyStore);
  }

  static String _trimSlash(String v) {
    var s = v.trim();
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }
}

/// Central config surface — port of AppConfig.kt.
class AppConfig {
  static RuntimeConfig get _rc => RuntimeConfig.instance;

  /// Core backend base, includes `/api`, always with a trailing slash.
  static String get coreApiBaseUrl => _withSlash(_rc.coreApiBaseUrl);

  /// Delivery service base (optional / legacy).
  static String get deliveryApiBaseUrl => _withSlash(_rc.deliveryApiBaseUrl);

  /// Core socket.io origin (no path).
  static String get coreSocketOrigin => _originOf(_rc.coreApiBaseUrl);

  static String get deliverySocketOrigin => _originOf(_rc.deliveryApiBaseUrl);

  static String? get storeId => _rc.storeId;

  static String _originOf(String base) {
    final schemeEnd = base.indexOf('://');
    if (schemeEnd < 0) return base;
    final pathStart = base.indexOf('/', schemeEnd + 3);
    return pathStart < 0 ? base : base.substring(0, pathStart);
  }

  static String _withSlash(String s) => s.endsWith('/') ? s : '$s/';
}
