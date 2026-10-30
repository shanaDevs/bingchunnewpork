import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/l10n.dart';
import 'endpoints.dart';

/// Build-time defaults. Override with `--dart-define=API_BASE_URL=...`.
class BuildDefaults {
  static const String _apiOverride = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl =>
      _apiOverride.isNotEmpty ? _apiOverride : (kDebugMode ? Endpoints.localApi : Endpoints.productionApi);

  /// Demo sign-ins from `.env` (`--dart-define-from-file=.env`): slots
  /// DEMO_1_* … DEMO_6_*, each LABEL / NOTE / EMAIL / PASSWORD. Debug builds only.
  /// `String.fromEnvironment` needs constant keys, hence the fixed slots.
  static const List<DemoAccount> _slots = [
    DemoAccount(
      String.fromEnvironment('DEMO_1_LABEL'),
      String.fromEnvironment('DEMO_1_NOTE'),
      String.fromEnvironment('DEMO_1_EMAIL'),
      String.fromEnvironment('DEMO_1_PASSWORD'),
    ),
    DemoAccount(
      String.fromEnvironment('DEMO_2_LABEL'),
      String.fromEnvironment('DEMO_2_NOTE'),
      String.fromEnvironment('DEMO_2_EMAIL'),
      String.fromEnvironment('DEMO_2_PASSWORD'),
    ),
    DemoAccount(
      String.fromEnvironment('DEMO_3_LABEL'),
      String.fromEnvironment('DEMO_3_NOTE'),
      String.fromEnvironment('DEMO_3_EMAIL'),
      String.fromEnvironment('DEMO_3_PASSWORD'),
    ),
    DemoAccount(
      String.fromEnvironment('DEMO_4_LABEL'),
      String.fromEnvironment('DEMO_4_NOTE'),
      String.fromEnvironment('DEMO_4_EMAIL'),
      String.fromEnvironment('DEMO_4_PASSWORD'),
    ),
    DemoAccount(
      String.fromEnvironment('DEMO_5_LABEL'),
      String.fromEnvironment('DEMO_5_NOTE'),
      String.fromEnvironment('DEMO_5_EMAIL'),
      String.fromEnvironment('DEMO_5_PASSWORD'),
    ),
    DemoAccount(
      String.fromEnvironment('DEMO_6_LABEL'),
      String.fromEnvironment('DEMO_6_NOTE'),
      String.fromEnvironment('DEMO_6_EMAIL'),
      String.fromEnvironment('DEMO_6_PASSWORD'),
    ),
  ];

  /// Filled slots, or none in release builds.
  /// Seeded local-dev accounts, shown when `.env` defines no DEMO_ slots
  /// (e.g. a plain `flutter run` without `--dart-define-from-file`).
  static const List<DemoAccount> _builtIn = [
    DemoAccount(
      'Cashier · delivery branch',
      'Dehiwala · all pages (Delivery, Live Drivers, Branch Stock)',
      'dehiwala1.cashier@bingchunsrilanka.lk',
      'Cashier@123',
    ),
    DemoAccount(
      'Cashier · pickup-only branch',
      'Matara · no Delivery / Live Drivers',
      'matara.cashier@bingchunsrilanka.lk',
      'Cashier@123',
    ),
    DemoAccount('Branch Admin', 'Nugegoda · branch manager', 'branch@bingchunsrilanka.lk', 'Branch@123'),
    DemoAccount(
      'Super Admin',
      'All branches · branch picker in POS and Stock',
      'admin@bingchunsrilanka.lk',
      'Admin@123',
    ),
  ];

  /// Debug builds only — release builds never list demo logins.
  static List<DemoAccount> get demoAccounts {
    if (!kDebugMode) return const [];
    final fromEnv = _slots.where((a) => a.email.isNotEmpty && a.password.isNotEmpty).toList();
    return fromEnv.isNotEmpty ? fromEnv : _builtIn;
  }
}

/// One dev-only quick-fill account on the sign-in screen.
class DemoAccount {
  const DemoAccount(this.label, this.note, this.email, this.password);
  final String label;
  final String note;
  final String email;
  final String password;
}

/// Persisted API host override + UX prefs (theme, language, sound, haptics).
class RuntimeConfig extends ChangeNotifier {
  RuntimeConfig._();
  static final RuntimeConfig instance = RuntimeConfig._();

  static const _keyApi = 'api_base_url';
  static const _keyTheme = 'theme_mode';
  static const _keySound = 'sound_enabled';
  static const _keyHaptics = 'haptics_enabled';
  static const _keyLanguage = 'app_language';
  static const _defaultTheme = 'LIGHT';

  SharedPreferences? _prefs;
  SharedPreferences? get prefs => _prefs;

  String _themeMode = _defaultTheme;
  bool _soundEnabled = true;
  bool _hapticsEnabled = true;

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
    _themeMode = _prefs?.getString(_keyTheme) ?? _defaultTheme;
    _soundEnabled = _prefs?.getBool(_keySound) ?? true;
    _hapticsEnabled = _prefs?.getBool(_keyHaptics) ?? true;
    L10n.current = AppLanguage.fromCode(_prefs?.getString(_keyLanguage));
  }

  /// Host overrides are a debug-only tool; release builds always talk to the shipped host.
  bool get overridesAllowed => kDebugMode;

  String get apiBaseUrl {
    final v = _prefs?.getString(_keyApi);
    if (overridesAllowed && v != null && v.trim().isNotEmpty) return v;
    return BuildDefaults.apiBaseUrl;
  }

  set apiBaseUrl(String value) {
    if (!overridesAllowed) return;
    _prefs?.setString(_keyApi, _trimSlash(value));
    notifyListeners();
  }

  bool get hasApiOverride => overridesAllowed && (_prefs?.containsKey(_keyApi) ?? false);

  Future<void> resetApiBaseUrl() async {
    await _prefs?.remove(_keyApi);
    notifyListeners();
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

  /// New-order chime, like the web cashier's branch order audio.
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

  static String _trimSlash(String v) {
    var s = v.trim();
    while (s.endsWith('/')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }
}

/// Central config surface.
class AppConfig {
  static RuntimeConfig get _rc => RuntimeConfig.instance;

  /// Backend base, includes `/api`, always with a trailing slash.
  static String get apiBaseUrl => _withSlash(_rc.apiBaseUrl);

  /// Socket.io origin (no path).
  static String get socketOrigin {
    final base = _rc.apiBaseUrl;
    final schemeEnd = base.indexOf('://');
    if (schemeEnd < 0) return base;
    final pathStart = base.indexOf('/', schemeEnd + 3);
    return pathStart < 0 ? base : base.substring(0, pathStart);
  }

  /// Product photos come back as `/products/foo.png`, served from the API origin.
  static String? resolveAssetUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return '$socketOrigin$url';
    return url;
  }

  static String _withSlash(String s) => s.endsWith('/') ? s : '$s/';
}
