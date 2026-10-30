import '../entities/admin_session.dart';

/// One menu permission row from `GET /admin/me/permissions`.
class MenuPermission {
  const MenuPermission({required this.read, required this.any});
  final bool read;

  /// Any of create / read / update / delete granted.
  final bool any;
}

/// App pages, in bottom-bar order.
enum AppPage { dashboard, orders, delivery, liveDrivers, stock }

/// Which pages a staff member may open — port of the web admin layout rules
/// (CASHIER_NAV_HREFS + hasMenuReadAccess + pickup-only delivery hiding).
class MenuAccess {
  const MenuAccess(this._perms, this._session);

  /// Before permissions load: the pages every cashier gets.
  const MenuAccess.base(AdminSession session) : this(const {}, session);

  final Map<String, MenuPermission> _perms;
  final AdminSession _session;

  bool canRead(String menu) {
    if (_session.isSuperAdmin) return true;
    if (menu == 'LIVE_DRIVERS') {
      // A LIVE_DRIVERS row with any grant wins; otherwise it follows DELIVERY.
      final live = _perms['LIVE_DRIVERS'];
      if (live != null && live.any) return live.read;
      return _perms['DELIVERY']?.read ?? false;
    }
    return _perms[menu]?.read ?? false;
  }

  bool allows(AppPage page) {
    final pickupOnly = _session.isPickupOnly;
    return switch (page) {
      // Cashier base nav (web CASHIER_NAV_HREFS); the app has no POS page.
      AppPage.dashboard || AppPage.orders => true,
      AppPage.delivery => !pickupOnly && canRead('DELIVERY'),
      AppPage.liveDrivers => !pickupOnly && canRead('LIVE_DRIVERS'),
      AppPage.stock => canRead('STOCK'),
    };
  }

  List<AppPage> get pages => AppPage.values.where(allows).toList();
}
