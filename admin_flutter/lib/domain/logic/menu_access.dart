import '../entities/admin_session.dart';

/// One menu permission row from `GET /admin/me/permissions`.
class MenuPermission {
  const MenuPermission({required this.read, required this.any, this.create = false, this.update = false, this.delete = false});
  final bool read;
  final bool create;
  final bool update;
  final bool delete;

  /// Any of create / read / update / delete granted.
  final bool any;
}

/// Admin app pages, in sidebar order (web ALL_NAV order).
enum AppPage {
  dashboard,
  allOrders,
  orders,
  refunds,
  delivery,
  liveDrivers,
  stock,
  sales,
  wallet,
  jason,
  menu,
  promotions,
  cashiers,
  reports,
  settings,
}

/// Web `DEFAULT_BRANCH_MANAGER_MENUS` — used when the permission list can't be loaded.
const defaultBranchManagerMenus = {
  'DASHBOARD',
  'ORDERS',
  'DELIVERY',
  'LIVE_DRIVERS',
  'STOCK',
  'SALES',
  'WALLET',
  'PAYMENT_HISTORY',
  'CASHIERS',
  'PROMOS',
  'REPORTS',
  'SETTINGS',
};

/// Which pages a signed-in admin may open — port of the web admin layout rules
/// (ALL_NAV superOnly / branchOnly flags + hasMenuReadAccess + pickup-only hiding),
/// narrowed to the page set this app ships for each role.
class MenuAccess {
  const MenuAccess(this._perms, this._session, {this.fallback = false});

  /// Before permissions load: only the dashboard for branch admins, everything for super admins.
  const MenuAccess.base(AdminSession session) : this(const {}, session);

  /// Permissions could not be loaded: the web's default branch manager menus.
  const MenuAccess.defaults(AdminSession session) : this(const {}, session, fallback: true);

  final Map<String, MenuPermission> _perms;
  final AdminSession _session;
  final bool fallback;

  bool _grant(String menu, bool Function(MenuPermission p) pick) {
    if (_session.isSuperAdmin) return true;
    if (fallback) return defaultBranchManagerMenus.contains(menu);
    if (menu == 'LIVE_DRIVERS') {
      // A LIVE_DRIVERS row with any grant wins; otherwise it follows DELIVERY.
      final live = _perms['LIVE_DRIVERS'];
      if (live != null && live.any) return pick(live);
      final delivery = _perms['DELIVERY'];
      return delivery != null && pick(delivery);
    }
    final p = _perms[menu];
    return p != null && pick(p);
  }

  bool canRead(String menu) => _grant(menu, (p) => p.read);
  bool canCreate(String menu) => _grant(menu, (p) => p.create);
  bool canUpdate(String menu) => _grant(menu, (p) => p.update);
  bool canDelete(String menu) => _grant(menu, (p) => p.delete);

  bool allows(AppPage page) {
    if (_session.isSuperAdmin) {
      return switch (page) {
        AppPage.dashboard ||
        AppPage.allOrders ||
        AppPage.refunds ||
        AppPage.sales ||
        AppPage.wallet ||
        AppPage.jason ||
        AppPage.menu ||
        AppPage.promotions ||
        AppPage.reports => true,
        _ => false,
      };
    }
    final pickupOnly = _session.isPickupOnly;
    return switch (page) {
      AppPage.dashboard => true,
      AppPage.orders || AppPage.refunds => canRead('ORDERS'),
      AppPage.delivery => !pickupOnly && canRead('DELIVERY'),
      AppPage.liveDrivers => !pickupOnly && canRead('LIVE_DRIVERS'),
      AppPage.stock => canRead('STOCK'),
      AppPage.sales => canRead('SALES'),
      AppPage.wallet => canRead('WALLET'),
      AppPage.cashiers => canRead('CASHIERS'),
      AppPage.reports => canRead('REPORTS'),
      AppPage.settings => canRead('SETTINGS'),
      AppPage.allOrders || AppPage.jason || AppPage.menu || AppPage.promotions => false,
    };
  }

  List<AppPage> get pages => AppPage.values.where(allows).toList();
}
