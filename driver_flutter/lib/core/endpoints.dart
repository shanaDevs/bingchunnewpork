/// Bing Chun backend addresses — change them here and nowhere else.
///
/// Which backend a build uses:
///   * release builds → [productionCore] / [productionDelivery]
///   * debug builds   → [localCore] / [localDelivery] (this PC via `adb reverse`)
///   * any build      → `--dart-define=CORE_API_BASE_URL=…` / `DELIVERY_API_BASE_URL=…` wins
///   * debug only     → the Server URLs dialog can override at runtime
abstract final class Endpoints {
  /// Production core API (includes `/api`).
  static const productionCore = 'https://bingchunsrilanka.com/api';

  /// Production delivery service (includes `/delivery-api`).
  static const productionDelivery =
      'https://delivery.bingchunsrilanka.com/delivery-api';

  /// Local core API on this PC (debug). Needs `adb reverse tcp:4000 tcp:4000`.
  static const localCore = 'http://127.0.0.1:4000/api';

  /// Local delivery service on this PC (debug). Needs `adb reverse tcp:4100 tcp:4100`.
  static const localDelivery = 'http://127.0.0.1:4100/delivery-api';
}

/// Customer-care line riders are pointed to when sign-in can't find their account.
abstract final class SupportContact {
  static const phone = '+94765466686';
  static const display = '076 546 6686';
  static const intl = '+94 76 546 6686';
  static const whatsapp = 'https://wa.me/94765466686';

  /// Placeholder address - confirm the real support mailbox.
  static const email = 'support@bingchunsrilanka.com';
}
