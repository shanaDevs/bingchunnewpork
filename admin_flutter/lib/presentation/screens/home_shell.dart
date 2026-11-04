import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/logic/menu_access.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/language_switch.dart';
import '../components/layout.dart';
import '../components/snack.dart';
import '../labels.dart';
import '../routes.dart';
import '../state/dashboard_controller.dart';
import '../state/delivery_grouping_controller.dart';
import '../state/order_alerts_controller.dart';
import '../state/orders_controller.dart';
import '../state/takeaway_queue_controller.dart';
import '../theme/pos_theme.dart';
import 'all_orders_screen.dart';
import 'branch_insights.dart';
import 'cashiers_screen.dart';
import 'dashboard_screen.dart';
import 'delivery_hub_screen.dart';
import 'jason_screen.dart';
import 'live_drivers_screen.dart';
import 'menu_screen.dart';
import 'more_screen.dart';
import 'notifications_screen.dart';
import 'orders_screen.dart';
import 'promotions_screen.dart';
import 'refunds_screen.dart';
import 'reports_screen.dart';
import 'sales_screens.dart';
import 'settings_screen.dart';
import 'stock_screen.dart';
import 'super_dashboard_screen.dart';
import 'wallet_screen.dart';

/// Signed-in shell for super admins and branch admins — the web admin layout
/// (ALL_NAV sidebar) as a left sidebar on tablets and a bottom bar + More on phones.
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.session});
  final AdminSession session;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => OrderAlertsController(c, session)),
        // Lazy: created only when the branch dashboard / orders pages first read them.
        ChangeNotifierProvider(create: (_) => DashboardController(c.dashboardRepository)),
        ChangeNotifierProvider(create: (_) => OrdersController(c.orderRepository, session)),
        ChangeNotifierProvider(
          create: (ctx) => TakeawayQueueController(
            c.orderRepository,
            onChanged: () => ctx.read<OrdersController>().refresh(silent: true),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => DeliveryGroupingController(c.deliveryRepository, c.menuRepository, session),
        ),
      ],
      child: _ShellView(session: session),
    );
  }
}

class _ShellView extends StatefulWidget {
  const _ShellView({required this.session});
  final AdminSession session;

  @override
  State<_ShellView> createState() => _ShellViewState();
}

class _ShellViewState extends State<_ShellView> {
  /// Selected page; null is the account (More) page.
  AppPage? _page = AppPage.dashboard;
  late MenuAccess _access = widget.session.isSuperAdmin ? MenuAccess(const {}, widget.session) : MenuAccess.base(widget.session);
  late final OrderAlertsController _alerts;

  /// Pages built so far — the rest stay unbuilt until first opened, so the app
  /// doesn't fire every page's requests at launch.
  final Set<AppPage> _visited = {AppPage.dashboard};

  static const _phoneBarPages = 4;

  AdminSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    _alerts = context.read<OrderAlertsController>()..addListener(_onAlert);
    if (!_session.isSuperAdmin) _loadAccess();
  }

  /// Branch admin menu permissions decide the pages, like the web sidebar.
  Future<void> _loadAccess() async {
    try {
      final perms = await context.read<AppContainer>().permissionRepository.menus();
      if (mounted) setState(() => _access = MenuAccess(perms, _session));
    } catch (_) {
      // Fall back to the web's default branch manager menus; the API still enforces access.
      if (mounted) setState(() => _access = MenuAccess.defaults(_session));
    }
  }

  @override
  void dispose() {
    _alerts.removeListener(_onAlert);
    super.dispose();
  }

  /// In-app toast for each new order, with a shortcut to open it.
  void _onAlert() {
    final notice = _alerts.pendingBanner;
    if (notice == null || !mounted) return;
    _alerts.bannerShown();
    final key = notice.orderNumber ?? notice.orderId;
    showPosSnack(
      context,
      noticeHeadline(notice),
      duration: const Duration(seconds: 6),
      actionLabel: key == null ? null : tr('View'),
      onAction: key == null
          ? null
          : () {
              _alerts.markRead(notice);
              AppRoutes.openOrder(context, key, readOnly: _session.isSuperAdmin);
            },
    );
  }

  bool get _tablet => MediaQuery.sizeOf(context).width >= Breakpoints.tablet;

  List<AppPage> get _pages => _access.pages;

  List<AppPage> get _barPages => _pages.take(_phoneBarPages).toList();

  void _select(AppPage? page) {
    PosFeedback.tap();
    if (page != null && !_tablet && !_barPages.contains(page)) {
      _openFull(page);
      return;
    }
    setState(() {
      _page = page;
      if (page != null) _visited.add(page);
    });
  }

  /// On phones, pages that don't fit the bar open full screen from More.
  void _openFull(AppPage page) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(toolbarHeight: 52, title: Text(pageLabel(page, _session))),
          body: TitleInAppBar(child: _pageBody(page)),
        ),
      ),
    );
  }

  Widget _pageBody(AppPage page) {
    final s = _session;
    return switch (page) {
      AppPage.dashboard =>
        s.isSuperAdmin
            ? SuperDashboardScreen(session: s, onOpenReports: _access.allows(AppPage.reports) ? () => _select(AppPage.reports) : null)
            : DashboardScreen(
                session: s,
                onOpenOrders: () => _select(AppPage.orders),
                extra: (period) => BranchInsights(period: period),
              ),
      AppPage.allOrders => const AllOrdersScreen(),
      AppPage.orders => const OrdersScreen(),
      AppPage.refunds => RefundsScreen(session: s, canProcess: s.isBranchAdmin && _access.canUpdate('ORDERS')),
      AppPage.delivery => DeliveryHubScreen(session: s, canUpdate: _access.canUpdate('DELIVERY')),
      AppPage.liveDrivers => const LiveDriversPage(),
      AppPage.stock => const StockPage(),
      AppPage.sales => s.isSuperAdmin ? const BrandSalesScreen() : BranchSalesScreen(session: s),
      AppPage.wallet => WalletScreen(session: s),
      AppPage.jason => const JasonScreen(),
      AppPage.menu => const MenuScreen(),
      AppPage.promotions => const PromotionsScreen(),
      AppPage.cashiers => CashiersScreen(
        session: s,
        canCreate: _access.canCreate('CASHIERS'),
        canUpdate: _access.canUpdate('CASHIERS'),
        canDelete: _access.canDelete('CASHIERS'),
      ),
      AppPage.reports => const ReportsScreen(),
      AppPage.settings => SettingsScreen(session: s, canUpdate: _access.canUpdate('SETTINGS')),
    };
  }

  Widget _more({required List<AppPage> overflow}) => MoreScreen(
    session: _session,
    pages: [for (final p in overflow) (pageLabel(p, _session), pageIcon(p), () => _openFull(p))],
  );

  /// Pages kept alive in an IndexedStack; unvisited ones are placeholders.
  Widget _stack(List<AppPage> pages, Widget more) {
    final current = _page;
    final index = current == null || !pages.contains(current) ? pages.length : pages.indexOf(current);
    return IndexedStack(
      index: index,
      children: [
        for (final p in pages) _visited.contains(p) ? KeyedSubtree(key: ValueKey(p), child: TitleInAppBar(child: _pageBody(p))) : const SizedBox.shrink(),
        more,
      ],
    );
  }

  PreferredSizeWidget _appBar({required bool showLogo}) {
    final c = context.pos;
    final unread = context.select<OrderAlertsController, int>((a) => a.unreadCount);
    final connected = context.read<AppContainer>().socket.connected;
    return AppBar(
      toolbarHeight: 60,
      titleSpacing: PosSpacing.lg,
      automaticallyImplyLeading: false,
      title: Row(
        children: [
          if (showLogo) ...[
            Container(
              width: 36,
              height: 36,
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(gradient: PosColors.sidebarGradient, borderRadius: BorderRadius.circular(11)),
              child: Image.asset('assets/images/logo.png'),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _page == null ? tr('Account') : pageLabel(_page!, _session),
                  style: PosType.section.copyWith(color: c.text),
                ),
                ValueListenableBuilder<bool>(
                  valueListenable: connected,
                  builder: (_, live, _) => Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(color: live ? c.success : c.textSoft, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 5),
                      Flexible(
                        child: Text(
                          [
                            _session.isSuperAdmin ? tr('All branches') : (_session.branchLabel ?? roleLabel(_session.role)),
                            live ? tr('Live') : tr('Offline'),
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        const Center(child: PosLanguageSwitch()),
        const SizedBox(width: PosSpacing.sm),
        Padding(
          padding: const EdgeInsets.only(right: PosSpacing.lg),
          child: PosIconButton(
            icon: Icons.notifications_none_rounded,
            tooltip: tr('Notifications'),
            badge: unread,
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChangeNotifierProvider.value(value: _alerts, child: const NotificationsScreen()),
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = _pages;
    if (_page != null && !pages.contains(_page)) {
      // Permissions removed the page that was open.
      WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? setState(() => _page = AppPage.dashboard) : null);
    }
    if (_tablet) {
      return Scaffold(
        body: Row(
          children: [
            _Sidebar(
              session: _session,
              pages: pages,
              current: _page,
              onSelect: _select,
            ),
            Expanded(
              child: Scaffold(
                appBar: _appBar(showLogo: false),
                body: _stack(pages, _more(overflow: const [])),
              ),
            ),
          ],
        ),
      );
    }
    final bar = _barPages;
    return Scaffold(
      appBar: _appBar(showLogo: true),
      body: _stack(bar, _more(overflow: pages.skip(bar.length).toList())),
      bottomNavigationBar: _BottomNav(
        items: [
          for (final p in bar) (pageBarLabel(p, _session), pageIcon(p), pageActiveIcon(p), p),
          (tr('More'), Icons.menu_rounded, Icons.menu_open_rounded, null),
        ],
        current: _page != null && bar.contains(_page) ? _page : null,
        onSelect: _select,
      ),
    );
  }
}

String pageLabel(AppPage p, AdminSession s) => switch (p) {
  AppPage.dashboard => tr('Dashboard'),
  AppPage.allOrders => tr('All Orders'),
  AppPage.orders => tr('Orders'),
  AppPage.refunds => tr('Refunds'),
  AppPage.delivery => tr('Delivery'),
  AppPage.liveDrivers => tr('Live Drivers'),
  AppPage.stock => tr('Branch Stock'),
  AppPage.sales => s.isSuperAdmin ? tr('Sales Dashboard') : tr('Sales'),
  AppPage.wallet => s.isSuperAdmin ? tr('Wallet Dashboard') : tr('Branch Wallet'),
  AppPage.jason => tr('JASON'),
  AppPage.menu => tr('Menu'),
  AppPage.promotions => tr('Promotions'),
  AppPage.cashiers => tr('Cashiers'),
  AppPage.reports => tr('Reports'),
  AppPage.settings => tr('Settings'),
};

/// Short form for the bottom bar, where five labels share one row.
String pageBarLabel(AppPage p, AdminSession s) => switch (p) {
  AppPage.allOrders => tr('Orders'),
  AppPage.liveDrivers => tr('Live'),
  AppPage.stock => tr('Stock'),
  AppPage.sales => tr('Sales'),
  AppPage.wallet => tr('Wallet'),
  _ => pageLabel(p, s),
};

IconData pageIcon(AppPage p) => switch (p) {
  AppPage.dashboard => Icons.dashboard_outlined,
  AppPage.allOrders => Icons.shopping_bag_outlined,
  AppPage.orders => Icons.receipt_long_outlined,
  AppPage.refunds => Icons.undo_rounded,
  AppPage.delivery => Icons.local_shipping_outlined,
  AppPage.liveDrivers => Icons.sensors_rounded,
  AppPage.stock => Icons.inventory_2_outlined,
  AppPage.sales => Icons.trending_up_rounded,
  AppPage.wallet => Icons.account_balance_wallet_outlined,
  AppPage.jason => Icons.monetization_on_outlined,
  AppPage.menu => Icons.local_cafe_outlined,
  AppPage.promotions => Icons.local_offer_outlined,
  AppPage.cashiers => Icons.badge_outlined,
  AppPage.reports => Icons.bar_chart_rounded,
  AppPage.settings => Icons.settings_outlined,
};

IconData pageActiveIcon(AppPage p) => switch (p) {
  AppPage.dashboard => Icons.dashboard_rounded,
  AppPage.allOrders => Icons.shopping_bag_rounded,
  AppPage.orders => Icons.receipt_long_rounded,
  AppPage.delivery => Icons.local_shipping_rounded,
  AppPage.stock => Icons.inventory_2_rounded,
  AppPage.wallet => Icons.account_balance_wallet_rounded,
  AppPage.jason => Icons.monetization_on_rounded,
  AppPage.menu => Icons.local_cafe_rounded,
  AppPage.promotions => Icons.local_offer_rounded,
  AppPage.cashiers => Icons.badge_rounded,
  AppPage.settings => Icons.settings_rounded,
  _ => pageIcon(p),
};

/// Tablet sidebar — the web `.admin-sidebar`: indigo gradient, brand header,
/// white active pill, profile + account at the bottom.
class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.session, required this.pages, required this.current, required this.onSelect});
  final AdminSession session;
  final List<AppPage> pages;
  final AppPage? current;
  final ValueChanged<AppPage?> onSelect;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width >= Breakpoints.wide ? 248.0 : 216.0;
    Widget item(String label, IconData icon, IconData active, AppPage? page) {
      final selected = page == current;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        child: Material(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(PosRadius.button + 2),
          child: InkWell(
            borderRadius: BorderRadius.circular(PosRadius.button + 2),
            onTap: () => onSelect(page),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(selected ? active : icon, size: 20, color: selected ? PosColors.sidebarActiveText : Colors.white70),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: PosType.bodyStrong.copyWith(
                        fontSize: 13.5,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: selected ? PosColors.sidebarActiveText : Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: width,
      decoration: const BoxDecoration(gradient: PosColors.sidebarGradient),
      child: SafeArea(
        right: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                    child: Image.asset('assets/images/logo.png'),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Bing Chun', style: PosType.section.copyWith(color: Colors.white)),
                        Text(
                          session.isSuperAdmin ? tr('Super Admin Panel') : tr('Branch Admin Panel'),
                          style: PosType.caption.copyWith(color: Colors.white70, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 4),
                children: [for (final p in pages) item(pageLabel(p, session), pageIcon(p), pageActiveIcon(p), p)],
              ),
            ),
            const Divider(color: Colors.white24, height: 1),
            const SizedBox(height: 6),
            item(session.name, Icons.account_circle_outlined, Icons.account_circle_rounded, null),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 18, 12),
              child: Text(
                [roleLabel(session.role), ?session.branchLabel].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: PosType.caption.copyWith(color: Colors.white60, fontSize: 11),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Phone bottom bar styled like the web sidebar: indigo gradient, white active pill.
class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.items, required this.current, required this.onSelect});

  /// (label, icon, active icon, page — null for More).
  final List<(String, IconData, IconData, AppPage?)> items;
  final AppPage? current;
  final ValueChanged<AppPage?> onSelect;

  @override
  Widget build(BuildContext context) {
    final selected = items.indexWhere((x) => x.$4 == current);
    return Container(
      decoration: const BoxDecoration(
        gradient: PosColors.sidebarGradient,
        borderRadius: BorderRadius.vertical(top: Radius.circular(PosRadius.sheet)),
      ),
      padding: EdgeInsets.fromLTRB(10, 8, 10, 8 + MediaQuery.paddingOf(context).bottom),
      child: Row(
        children: [
          for (final (i, (label, icon, activeIcon, page)) in items.indexed)
            Expanded(
              child: Semantics(
                button: true,
                selected: i == selected,
                label: label,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onSelect(page),
                  child: AnimatedContainer(
                    duration: PosMotion.standard,
                    curve: Curves.easeOut,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: i == selected ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(PosRadius.card),
                      boxShadow: i == selected
                          ? const [BoxShadow(color: Color(0x1F0F172A), blurRadius: 10, offset: Offset(0, 2))]
                          : null,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          i == selected ? activeIcon : icon,
                          size: 22,
                          color: i == selected ? PosColors.sidebarActiveText : Colors.white70,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.caption.copyWith(
                            fontSize: 11,
                            fontWeight: i == selected ? FontWeight.w700 : FontWeight.w500,
                            color: i == selected ? PosColors.sidebarActiveText : Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
