import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/order.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../providers/order_provider.dart';
import '../providers/spin_provider.dart';
import '../services/spin_storage.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/floating_fab_layout.dart';
import '../utils/shell_layout.dart';
import '../widgets/cup_icon.dart';
import '../widgets/product_add_sheet.dart';
import '../widgets/product_radial_image.dart';
import '../widgets/spin_wheel_modal.dart';
import '../widgets/wishlist_heart_button.dart';

const _pageBackground = Color(0xFFFAFBFD);
const _heroNavy = Color(0xFF0B1739);
const _gold = Color(0xFFD9A441);
const _ink = Color(0xFF111B36);
const _muted = Color(0xFF68728A);
const _border = Color(0xFFE7EBF2);

void _openProduct(BuildContext context, Product product) {
  if (!product.canOrder) {
    showAppToast(
      context,
      product.isComingSoon
          ? 'Sorry, this item is coming soon.'
          : 'Sorry, this item is out of stock.',
      isError: true,
    );
    return;
  }
  showProductAddSheet(context, product);
}

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  List<Product> _products = [];
  bool _loading = false;
  String? _loadError;
  String _orderMode = 'DELIVERY';
  bool _spinAutoOpened = false;

  @override
  void initState() {
    super.initState();
    _orderMode = ref.read(fulfillmentProvider).orderMode ?? 'DELIVERY';
    Future.microtask(_loadHome);
    Future.microtask(_maybeAutoOpenSpin);
  }

  Future<void> _maybeAutoOpenSpin() async {
    if (_spinAutoOpened || !mounted) return;
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted || _spinAutoOpened) return;

    await ref.read(spinProvider.notifier).refresh();
    if (!mounted || _spinAutoOpened) return;

    final spin = ref.read(spinProvider);
    if (!spin.canShowTrigger) return;
    if (!await SpinStorage.shouldShowPopup()) return;

    _spinAutoOpened = true;
    if (!mounted) return;
    await showSpinWheelModal(context, startAtIntro: false);
  }

  Future<void> _loadHome() async {
    if (!mounted) return;
    setState(() {
      _loading = _products.isEmpty;
      _loadError = null;
    });

    final api = ref.read(apiClientProvider);
    final fulfillment = ref.read(fulfillmentProvider);
    final storeQuery = fulfillment.storeId == null
        ? ''
        : '?storeId=${Uri.encodeQueryComponent(fulfillment.storeId!)}';

    unawaited(
      ref.read(orderProvider.notifier).fetchLatestActiveOrder(silent: true),
    );

    List<Product> parseProducts(List<dynamic> list) {
      final products = <Product>[];
      for (final value in list) {
        try {
          if (value is Map<String, dynamic>) {
            products.add(Product.fromJson(value));
          } else if (value is Map) {
            products.add(Product.fromJson(Map<String, dynamic>.from(value)));
          }
        } catch (_) {
          // Ignore malformed catalogue rows while keeping the rest visible.
        }
      }
      return products;
    }

    try {
      final products = await api.get<List<Product>>(
        '/menu/products$storeQuery',
        requireAuth: false,
        listParser: parseProducts,
      );

      if (!mounted) return;
      setState(() {
        _products = products;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      final message = error.toString();
      final isNetwork =
          message.contains('Cannot reach server') ||
          message.contains('SocketException') ||
          message.contains('HandshakeException') ||
          message.contains('TimeoutException');
      setState(() {
        _loading = false;
        if (_products.isEmpty) {
          _loadError = isNetwork
              ? 'No internet connection'
              : 'We could not load the menu';
        }
      });
    }
  }

  List<Product> get _popularProducts {
    int priority(Product product) {
      final tag = (product.tag ?? '').toLowerCase();
      if (tag.contains('popular')) return 0;
      if (tag.contains('best')) return 1;
      if (tag.contains('signature')) return 2;
      if (tag.contains('classic')) return 3;
      return 4;
    }

    final products = [..._products];
    products.sort((a, b) {
      final availability = (b.canOrder ? 1 : 0).compareTo(a.canOrder ? 1 : 0);
      if (availability != 0) return availability;
      return priority(a).compareTo(priority(b));
    });
    return products.take(8).toList();
  }

  Order? _lastCompletedOrder(OrderState state) {
    final completed =
        state.orderHistory
            .where(
              (order) =>
                  !order.isActive &&
                  order.status != 'CANCELLED' &&
                  order.items.isNotEmpty,
            )
            .toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return completed.firstOrNull;
  }

  void _selectMode(String mode) {
    if (_orderMode != mode) {
      setState(() => _orderMode = mode);
    }
    context.push('/fulfillment-setup?mode=$mode');
  }

  void _startOrder(FulfillmentState fulfillment) {
    if (!fulfillment.hasCompletedSetup) {
      context.push('/fulfillment-setup?mode=$_orderMode&required=1');
      return;
    }
    context.go('/menu');
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final cart = ref.watch(cartProvider);
    final fulfillment = ref.watch(fulfillmentProvider);
    final orderState = ref.watch(orderProvider);

    ref.listen<FulfillmentState>(fulfillmentProvider, (previous, next) {
      if (previous?.orderMode != next.orderMode && next.orderMode != null) {
        setState(() => _orderMode = next.orderMode!);
      }
      if (previous?.storeId != next.storeId) {
        _loadHome();
      }
    });

    final rawName = auth.user?.name.trim() ?? '';
    final firstName = rawName.isEmpty
        ? 'Guest'
        : rawName.split(RegExp(r'\s+')).first;
    final cartCount = cart.items.fold<int>(
      0,
      (total, item) => total + item.quantity,
    );
    final activeOrder = orderState.dashboardActiveOrder;
    final lastOrder = _lastCompletedOrder(orderState);
    final popular = _popularProducts;
    final bottomPadding =
        shellContentBottomInset(context) + FloatingFabLayout.cupSize + 16;

    return Theme(
      data: BcTheme.light,
      child: Scaffold(
        backgroundColor: _pageBackground,
        body: RefreshIndicator(
          color: BcColors.brand,
          onRefresh: _loadHome,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _HomeHeader(
                  firstName: firstName,
                  points: auth.user?.loyaltyPoints ?? 0,
                  cartCount: cartCount,
                  onAvatarTap: () => context.go('/profile'),
                  onPointsTap: () => context.go('/rewards'),
                  onNotificationTap: () => context.push('/notifications'),
                  onCartTap: () => context.go('/cart'),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: _FulfillmentCard(
                    orderMode: _orderMode,
                    location: _locationLabel(fulfillment),
                    eta: _etaLabel(fulfillment),
                    onModeChanged: _selectMode,
                    onChangeTap: () =>
                        context.push('/fulfillment-setup?mode=$_orderMode'),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: _CinematicHero(
                    onOrderNow: () => _startOrder(fulfillment),
                    onViewMenu: () => context.go('/menu'),
                  ),
                ),
              ),
              if (activeOrder != null && activeOrder.isActive)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: _ActiveOrderStrip(
                      order: activeOrder,
                      onTap: () => context.push('/track/${activeOrder.id}'),
                    ),
                  ),
                ),
              if (lastOrder != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: _OrderAgainCard(
                      order: lastOrder,
                      onTap: () => context.go('/menu'),
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: _SectionTitle(
                  title: 'Popular near you',
                  onViewAll: () => context.go('/menu'),
                ),
              ),
              if (_loading && _products.isEmpty)
                const SliverToBoxAdapter(child: _PopularSkeleton())
              else if (_loadError != null && _products.isEmpty)
                SliverToBoxAdapter(
                  child: _LoadErrorCard(
                    message: _loadError!,
                    onRetry: _loadHome,
                  ),
                )
              else if (popular.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, bottomPadding),
                    child: _EmptyMenuCard(onBrowse: () => context.go('/menu')),
                  ),
                )
              else
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: bottomPadding),
                    child: SizedBox(
                      height: 292,
                      child: ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        scrollDirection: Axis.horizontal,
                        itemCount: popular.length,
                        separatorBuilder: (_, _) => const SizedBox(width: 12),
                        itemBuilder: (context, index) => _PopularProductCard(
                          product: popular[index],
                          onTap: () => _openProduct(context, popular[index]),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _locationLabel(FulfillmentState fulfillment) {
    if (!fulfillment.hasCompletedSetup) return 'Choose your location';
    if (fulfillment.orderMode == 'DELIVERY') {
      final address = fulfillment.deliveryAddress?.trim();
      if (address == null || address.isEmpty) return 'Delivery location';
      return address.split(',').first.trim();
    }
    var name = (fulfillment.storeName ?? '').trim();
    name = name
        .replaceFirst(
          RegExp(r'^bing\s*chun\s*[-–—:|]?\s*', caseSensitive: false),
          '',
        )
        .trim();
    return name.isEmpty ? 'Pickup store' : name;
  }

  String _etaLabel(FulfillmentState fulfillment) {
    if (!fulfillment.hasCompletedSetup) return 'Set up to see ETA';
    final eta = fulfillment.estimatedMinutes;
    if (fulfillment.orderMode == 'TAKEAWAY') return 'Ready in ~$eta min';
    final lower = (eta - 10).clamp(10, eta);
    return '$lower–$eta min';
  }
}

class _HomeHeader extends StatelessWidget {
  final String firstName;
  final int points;
  final int cartCount;
  final VoidCallback onAvatarTap;
  final VoidCallback onPointsTap;
  final VoidCallback onNotificationTap;
  final VoidCallback onCartTap;

  const _HomeHeader({
    required this.firstName,
    required this.points,
    required this.cartCount,
    required this.onAvatarTap,
    required this.onPointsTap,
    required this.onNotificationTap,
    required this.onCartTap,
  });

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, top + 10, 8, 4),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: 'Open profile',
            child: InkWell(
              onTap: onAvatarTap,
              customBorder: const CircleBorder(),
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFFE9F1FF),
                  border: Border.all(color: Colors.white, width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: _heroNavy.withValues(alpha: 0.09),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Image.asset(
                  'assets/brand/customer-avatar.png',
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) =>
                      const Icon(Icons.person_rounded, color: BcColors.brand),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _greeting,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: _muted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  firstName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: _ink,
                    height: 1.12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                InkWell(
                  onTap: onPointsTap,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Text(
                      '$points points',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: BcColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          _HeaderAction(
            tooltip: 'Notifications',
            onTap: onNotificationTap,
            child: const Icon(
              Icons.notifications_none_rounded,
              color: _ink,
              size: 25,
            ),
          ),
          _HeaderAction(
            tooltip: cartCount == 0
                ? 'Your cup is empty'
                : '$cartCount items in your cup',
            onTap: onCartTap,
            child: CupIcon.fromCount(
              itemCount: cartCount,
              size: CupIconSize.sm,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  final String tooltip;
  final VoidCallback onTap;
  final Widget child;

  const _HeaderAction({
    required this.tooltip,
    required this.onTap,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: tooltip,
      child: Tooltip(
        message: tooltip,
        child: InkResponse(
          onTap: onTap,
          radius: 24,
          child: SizedBox(width: 48, height: 48, child: Center(child: child)),
        ),
      ),
    );
  }
}

class _FulfillmentCard extends StatelessWidget {
  final String orderMode;
  final String location;
  final String eta;
  final ValueChanged<String> onModeChanged;
  final VoidCallback onChangeTap;

  const _FulfillmentCard({
    required this.orderMode,
    required this.location,
    required this.eta,
    required this.onModeChanged,
    required this.onChangeTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
        boxShadow: [
          BoxShadow(
            color: _heroNavy.withValues(alpha: 0.055),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Container(
            height: 48,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: const Color(0xFFF4F6FA),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _ModeTab(
                    label: 'Delivery',
                    icon: Icons.delivery_dining_rounded,
                    selected: orderMode == 'DELIVERY',
                    onTap: () => onModeChanged('DELIVERY'),
                  ),
                ),
                Expanded(
                  child: _ModeTab(
                    label: 'Pickup',
                    icon: Icons.shopping_bag_outlined,
                    selected: orderMode == 'TAKEAWAY',
                    onTap: () => onModeChanged('TAKEAWAY'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onChangeTap,
              borderRadius: BorderRadius.circular(12),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 54),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: const Color(0xFFEAF2FF),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.location_on_outlined,
                        color: BcColors.brand,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            location,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: _ink,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                          Text(
                            eta,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(
                              context,
                            ).textTheme.bodySmall?.copyWith(color: _muted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Change',
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: BcColors.brand,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: BcColors.brand,
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeTab extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ModeTab({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 160),
            decoration: BoxDecoration(
              color: selected ? BcColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: BcColors.brand.withValues(alpha: 0.22),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 20, color: selected ? Colors.white : _muted),
                const SizedBox(width: 7),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: selected ? Colors.white : _ink,
                      fontWeight: FontWeight.w600,
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
}

class _CinematicHero extends StatelessWidget {
  final VoidCallback onOrderNow;
  final VoidCallback onViewMenu;

  const _CinematicHero({required this.onOrderNow, required this.onViewMenu});

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(1);
    final height = 300.0 + ((scale - 1).clamp(0, 1) * 88);

    return Semantics(
      container: true,
      label: 'Bing Chun. Your cup, your way. Bubble Tea and Ice Cream.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 360;
          return Container(
            height: height,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: _heroNavy,
              borderRadius: BorderRadius.circular(22),
              boxShadow: [
                BoxShadow(
                  color: _heroNavy.withValues(alpha: 0.2),
                  blurRadius: 24,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  'assets/promos/home-banner-brownsugar.jpg',
                  fit: BoxFit.cover,
                  alignment: compact
                      ? const Alignment(0.35, 0)
                      : const Alignment(0.2, 0),
                  errorBuilder: (_, _, _) => const ColoredBox(color: _heroNavy),
                ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        _heroNavy,
                        _heroNavy,
                        Color(0xFA0B1739),
                        Color(0xB30B1739),
                        Color(0x260B1739),
                      ],
                      stops: [0, 0.32, 0.5, 0.68, 1],
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(compact ? 16 : 20, 18, 12, 12),
                  child: FractionallySizedBox(
                    widthFactor: scale > 1.3
                        ? (compact ? 0.92 : 0.82)
                        : (compact ? 0.72 : 0.66),
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: _gold),
                          ),
                          child: Text(
                            'SINCE 2012',
                            maxLines: 1,
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: const Color(0xFFF2C45C),
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.4,
                                ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Your cup,\nyour way',
                            maxLines: 2,
                            style: Theme.of(context).textTheme.headlineMedium
                                ?.copyWith(
                                  color: Colors.white,
                                  height: 1.04,
                                  fontSize: compact ? 30 : 34,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -1,
                                ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Bubble Tea & Ice Cream',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Colors.white.withValues(alpha: 0.86),
                                fontWeight: FontWeight.w500,
                              ),
                        ),
                        const Spacer(),
                        SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            onPressed: onOrderNow,
                            style: ElevatedButton.styleFrom(
                              padding: EdgeInsets.symmetric(
                                horizontal: compact ? 14 : 18,
                              ),
                              backgroundColor: BcColors.brand,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Order now',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                SizedBox(width: 6),
                                Icon(Icons.arrow_forward_rounded, size: 18),
                              ],
                            ),
                          ),
                        ),
                        SizedBox(
                          height: 48,
                          child: TextButton(
                            onPressed: onViewMenu,
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 2,
                              ),
                            ),
                            child: const Text('View menu'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ActiveOrderStrip extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  const _ActiveOrderStrip({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final pickup = order.orderMode == 'TAKEAWAY';
    final showTrackLabel = MediaQuery.textScalerOf(context).scale(1) <= 1.4;
    return Semantics(
      button: true,
      label: '${order.statusDisplay}. Order ${order.orderNumber}. Track order.',
      child: Material(
        color: const Color(0xFFF0F6FF),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(minHeight: 68),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BcColors.brand.withValues(alpha: 0.22)),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    pickup
                        ? Icons.storefront_outlined
                        : Icons.delivery_dining_rounded,
                    color: BcColors.brand,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: ExcludeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          order.statusDisplay,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: _ink,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        Text(
                          'Order #${order.orderNumber}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(
                            context,
                          ).textTheme.bodySmall?.copyWith(color: _muted),
                        ),
                      ],
                    ),
                  ),
                ),
                if (showTrackLabel) ...[
                  const SizedBox(width: 8),
                  Text(
                    'Track',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: BcColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                const Icon(Icons.chevron_right_rounded, color: BcColors.brand),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderAgainCard extends StatelessWidget {
  final Order order;
  final VoidCallback onTap;

  const _OrderAgainCard({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final firstItem = order.items.first;
    final extraItems = order.items.length - 1;
    final detail = [
      firstItem.productName,
      if (extraItems > 0) '+ $extraItems more',
    ].join(' ');

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _border),
          boxShadow: [
            BoxShadow(
              color: _heroNavy.withValues(alpha: 0.04),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 58,
                height: 58,
                child: _OrderItemImage(url: firstItem.imageUrl),
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Order again',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: _muted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: _ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    'LKR ${order.total}',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: BcColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: onTap,
                style: FilledButton.styleFrom(
                  backgroundColor: BcColors.brand,
                  padding: const EdgeInsets.symmetric(horizontal: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Reorder'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderItemImage extends StatelessWidget {
  final String? url;

  const _OrderItemImage({required this.url});

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) {
      return const ColoredBox(
        color: Color(0xFFF0F5FD),
        child: Icon(Icons.local_cafe_rounded, color: BcColors.brand),
      );
    }
    return ColoredBox(
      color: const Color(0xFFF4F7FB),
      child: Image.network(
        url!,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) =>
            const Icon(Icons.local_cafe_rounded, color: BcColors.brand),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final VoidCallback onViewAll;

  const _SectionTitle({required this.title, required this.onViewAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 10, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: _ink,
                fontSize: 19,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          TextButton(
            onPressed: onViewAll,
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 48),
              foregroundColor: BcColors.brand,
            ),
            child: const Row(
              children: [
                Text('View all'),
                SizedBox(width: 2),
                Icon(Icons.chevron_right_rounded, size: 19),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PopularProductCard extends StatelessWidget {
  final Product product;
  final VoidCallback onTap;

  const _PopularProductCard({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '${product.name}, LKR ${product.basePrice}',
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            width: 206,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: _border),
              boxShadow: [
                BoxShadow(
                  color: _heroNavy.withValues(alpha: 0.045),
                  blurRadius: 14,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 168,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: ProductRadialImage(
                          imageUrl: product.imageUrl,
                          expand: true,
                          borderRadius: BorderRadius.circular(13),
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                        ),
                      ),
                      Positioned(
                        top: 5,
                        right: 5,
                        child: WishlistHeartButton(productId: product.id),
                      ),
                      if (product.canOrder &&
                          (product.displayTag ?? '').isNotEmpty)
                        Positioned(
                          left: 6,
                          top: 7,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.92),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: _border),
                            ),
                            child: Text(
                              product.displayTag!,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: BcColors.brand,
                                    fontWeight: FontWeight.w700,
                                  ),
                            ),
                          ),
                        ),
                      if (!product.canOrder)
                        Positioned(
                          left: 6,
                          bottom: 7,
                          child: _ProductStockStatusBadge(
                            label: product.isComingSoon
                                ? 'COMING SOON'
                                : 'OUT OF STOCK',
                            color: product.isComingSoon
                                ? const Color(0xFF93C5FD)
                                : BcColors.error,
                            textColor: product.isComingSoon
                                ? const Color(0xFF1E3A8A)
                                : Colors.white,
                          ),
                        )
                      else if (product.isLowStock)
                        const Positioned(
                          left: 6,
                          bottom: 7,
                          child: _ProductStockStatusBadge(
                            label: 'LOW STOCK',
                            color: Color(0xFFF59E0B),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: _ink,
                    height: 1.2,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'LKR ${product.basePrice}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: BcColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: 'Add ${product.name}',
                      child: SizedBox(
                        width: 48,
                        height: 48,
                        child: IconButton.filled(
                          onPressed: onTap,
                          style: IconButton.styleFrom(
                            backgroundColor: product.canOrder
                                ? BcColors.brand
                                : const Color(0xFF9AA5B8),
                            foregroundColor: Colors.white,
                          ),
                          icon: Icon(
                            product.canOrder ? Icons.add_rounded : Icons.block,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductStockStatusBadge extends StatelessWidget {
  const _ProductStockStatusBadge({
    required this.label,
    required this.color,
    this.textColor = Colors.white,
  });

  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.only(
          topRight: Radius.circular(10),
          bottomLeft: Radius.circular(4),
        ),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: textColor,
          fontSize: 8,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _PopularSkeleton extends StatelessWidget {
  const _PopularSkeleton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 292,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: 2,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (_, _) => Container(
          width: 206,
          decoration: BoxDecoration(
            color: const Color(0xFFF0F3F8),
            borderRadius: BorderRadius.circular(18),
          ),
          alignment: Alignment.center,
          child: const CircularProgressIndicator(
            color: BcColors.brand,
            strokeWidth: 2,
          ),
        ),
      ),
    );
  }
}

class _LoadErrorCard extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _LoadErrorCard({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _border),
        ),
        child: Column(
          children: [
            const Icon(Icons.wifi_off_rounded, size: 38, color: _muted),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: _ink,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: onRetry,
                child: const Text('Try again'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyMenuCard extends StatelessWidget {
  final VoidCallback onBrowse;

  const _EmptyMenuCard({required this.onBrowse});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _border),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.local_cafe_outlined,
            color: BcColors.brand,
            size: 34,
          ),
          const SizedBox(width: 12),
          const Expanded(child: Text('Popular drinks will appear here.')),
          TextButton(onPressed: onBrowse, child: const Text('Menu')),
        ],
      ),
    );
  }
}
