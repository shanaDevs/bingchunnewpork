/// Bing Chun backend addresses — change them here and nowhere else.
///
/// Which backend a build uses:
///   * release builds → [productionApi]
///   * debug builds   → [localApi] (this PC via `adb reverse tcp:4000 tcp:4000`)
///   * any build      → `--dart-define=API_BASE_URL=…` wins (e.g. the dedicated POS API host)
///   * debug only     → the Server URL dialog (tap the logo 5 times on sign-in) can override at runtime
abstract final class Endpoints {
  /// Production core API (includes `/api`). Serves every cashier route while the
  /// dedicated `bing-chun-pos` host is rolled out (docs/35_Shop_Pos_Admin_Architecture.md).
  static const productionApi = 'https://bing-chun-core.bc.dartcodes.com/api';

  /// Local backend on this PC (debug). Needs `adb reverse tcp:4000 tcp:4000`.
  static const localApi = 'http://127.0.0.1:4000/api';
}
