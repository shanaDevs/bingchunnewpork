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
import 'dashboard_screen.dart';
import 'delivery_screen.dart';
import 'live_drivers_screen.dart';
import 'more_screen.dart';
import 'notifications_screen.dart';
import 'orders_screen.dart';
import 'stock_screen.dart';

/// Signed-in shell: Dashboard / Orders / POS / More — the cashier's web nav
/// (`/admin`, `/admin/orders`, `/admin/pos`) as a bottom bar in the sidebar's indigo.
class HomeShell extends StatelessWidget {
  const HomeShell({super.key, required this.session});
  final AdminSession session;

  @override
  Widget build(BuildContext context) {
    final c = context.read<AppContainer>();
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => OrderAlertsController(c, session)),
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
  /// Selected bar slot; null is More.
  AppPage? _page = AppPage.dashboard;
  late MenuAccess _access = MenuAccess.base(widget.session);
  late final OrderAlertsController _alerts;

  /// A phone bar fits five slots; pages past that are listed on More.
  /// Bar slots (incl. More): five on phones, every page on tablets.
  int get _maxBarSlots => MediaQuery.sizeOf(context).width >= Breakpoints.tablet ? 7 : 5;

  @override
  void initState() {
    super.initState();
    _alerts = context.read<OrderAlertsController>()..addListener(_onAlert);
    _loadAccess();
  }

  /// Menu permissions decide Delivery / Live Drivers / Branch Stock, like the web sidebar.
  Future<void> _loadAccess() async {
    try {
      final perms = await context.read<AppContainer>().permissionRepository.menus();
      if (mounted) setState(() => _access = MenuAccess(perms, widget.session));
    } catch (_) {
      // Keep the base cashier pages.
    }
  }

  List<AppPage> get _barPages {
    final pages = _access.pages;
    return pages.length + 1 <= _maxBarSlots ? pages : pages.take(_maxBarSlots - 1).toList();
  }

  List<AppPage> get _overflowPages => _access.pages.skip(_barPages.length).toList();

  Widget _pageBody(AppPage page) => switch (page) {
    AppPage.dashboard => DashboardScreen(session: widget.session, onOpenOrders: () => _select(AppPage.orders)),
    AppPage.orders => const OrdersScreen(),
    AppPage.delivery => const DeliveryPage(),
    AppPage.liveDrivers => const LiveDriversPage(),
    AppPage.stock => const StockPage(),
  };

  /// Pages that don't fit the bar open full screen from More.
  void _openOverflow(AppPage page) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        // The page draws its own title, so the bar only carries Back.
        builder: (_) => Scaffold(appBar: AppBar(toolbarHeight: 48), body: _pageBody(page)),
      ),
    );
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
              AppRoutes.openOrder(context, key);
            },
    );
  }

  void _select(AppPage? page) {
    PosFeedback.tap();
    if (page != null && !_barPages.contains(page)) {
      _openOverflow(page);
      return;
    }
    setState(() => _page = page);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final bar = _barPages;
    final tablet = isTablet(context);
    final unread = context.select<OrderAlertsController, int>((a) => a.unreadCount);
    final connected = context.read<AppContainer>().socket.connected;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 60,
        titleSpacing: PosSpacing.lg,
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(gradient: PosColors.sidebarGradient, borderRadius: BorderRadius.circular(11)),
              child: Image.asset('assets/images/logo.png'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(tr('Cashier Panel'), style: PosType.section.copyWith(color: c.text)),
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
                              widget.session.branchLabel ?? roleLabel(widget.session.role),
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
      ),
      body: IndexedStack(
        index: _page == null ? bar.length : bar.indexOf(_page!).clamp(0, bar.length),
        children: [
          for (final p in bar) _pageBody(p),
          MoreScreen(
            session: widget.session,
            pages: [for (final p in _overflowPages) (pageLabel(p), pageIcon(p), () => _openOverflow(p))],
          ),
        ],
      ),
      bottomNavigationBar: _SidebarNav(
        items: [
          for (final p in bar) (tablet ? pageLabel(p) : pageBarLabel(p), pageIcon(p), pageActiveIcon(p), p),
          (tr('More'), Icons.person_outline_rounded, Icons.person_rounded, null),
        ],
        current: _page,
        onSelect: _select,
      ),
    );
  }
}

String pageLabel(AppPage p) => switch (p) {
  AppPage.dashboard => tr('Dashboard'),
  AppPage.orders => tr('Orders'),
  AppPage.delivery => tr('Delivery'),
  AppPage.liveDrivers => tr('Live Drivers'),
  AppPage.stock => tr('Branch Stock'),
};

/// Short form for the bottom bar, where five labels share one row.
String pageBarLabel(AppPage p) => switch (p) {
  AppPage.liveDrivers => tr('Live'),
  AppPage.stock => tr('Stock'),
  _ => pageLabel(p),
};

IconData pageIcon(AppPage p) => switch (p) {
  AppPage.dashboard => Icons.dashboard_outlined,
  AppPage.orders => Icons.receipt_long_outlined,
  AppPage.delivery => Icons.local_shipping_outlined,
  AppPage.liveDrivers => Icons.sensors_rounded,
  AppPage.stock => Icons.inventory_2_outlined,
};

IconData pageActiveIcon(AppPage p) => switch (p) {
  AppPage.dashboard => Icons.dashboard_rounded,
  AppPage.orders => Icons.receipt_long_rounded,
  AppPage.delivery => Icons.local_shipping_rounded,
  AppPage.liveDrivers => Icons.sensors_rounded,
  AppPage.stock => Icons.inventory_2_rounded,
};

/// Bottom bar styled like the web cashier sidebar: indigo gradient, white active pill.
class _SidebarNav extends StatelessWidget {
  const _SidebarNav({required this.items, required this.current, required this.onSelect});

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
