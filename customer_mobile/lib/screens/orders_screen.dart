import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models/cart_item.dart';
import '../models/order.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../providers/orders_list_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/order_receipt_utils.dart';
import '../utils/shell_layout.dart';
import '../widgets/order_product_image.dart';
import '../widgets/order_receipt_modal.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  final _searchFocus = FocusNode();
  String? _expandedOrderId;
  bool _searchExpanded = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    Future.microtask(() => ref.read(ordersListProvider.notifier).refresh());
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _searchController.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final max = _scrollController.position.maxScrollExtent;
    if (_scrollController.offset >= max - 200) {
      ref.read(ordersListProvider.notifier).loadMore();
    }
  }

  Future<void> _reorder(Order order) async {
    final api = ref.read(apiClientProvider);
    final cart = ref.read(cartProvider.notifier);
    var added = 0;

    for (final item in order.items) {
      try {
        final product = await api.get<Product>(
          '/menu/products/${item.productId}',
          parser: Product.fromJson,
        );
        if (!product.isAvailable) continue;
        final size = item.size.toUpperCase() == 'LARGE'
            ? ProductSize.LARGE
            : ProductSize.REGULAR;
        final ok = await cart.addToCart(
          product,
          size: size,
          toppings: const [],
          quantity: item.quantity,
        );
        if (ok) added++;
      } catch (_) {
        /* skip unavailable */
      }
    }

    if (!mounted) return;
    if (added > 0) {
      showAppToast(
        context,
        '$added item${added > 1 ? 's' : ''} added to your cup',
        isError: false,
      );
      context.go('/cart');
    } else {
      showAppToast(context, 'No items available for reorder');
    }
  }

  Map<String, List<Order>> _groupByDate(List<Order> orders) {
    final map = <String, List<Order>>{};
    final fmt = DateFormat('d MMMM yyyy');
    for (final order in orders) {
      final key = fmt.format(order.createdAt.toLocal());
      map.putIfAbsent(key, () => []).add(order);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final listState = ref.watch(ordersListProvider);
    final fulfillment = ref.watch(fulfillmentProvider);
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final orders = listState.visibleOrders;
    final scrollBottomInset = shellMenuScrollBottomInset(context);
    final grouped = _groupByDate(orders);
    final lastOrder = listState.orders.isNotEmpty
        ? listState.orders.first
        : null;

    return Scaffold(
      backgroundColor: bc.pageBg,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: BcColors.brand,
          onRefresh: () => ref.read(ordersListProvider.notifier).refresh(),
          child: CustomScrollView(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _OrdersHeader(
                  orderCount: listState.countAll > 0
                      ? listState.countAll
                      : listState.total,
                  searchExpanded: _searchExpanded,
                  searchController: _searchController,
                  searchFocus: _searchFocus,
                  onBack: () {
                    if (context.canPop()) {
                      context.pop();
                    } else {
                      context.go('/home');
                    }
                  },
                  onToggleSearch: () {
                    setState(() {
                      _searchExpanded = !_searchExpanded;
                      if (_searchExpanded) {
                        Future.microtask(() => _searchFocus.requestFocus());
                      } else {
                        _searchController.clear();
                        ref.read(ordersListProvider.notifier).setSearchQuery('');
                      }
                    });
                  },
                  onSearchChanged: (q) =>
                      ref.read(ordersListProvider.notifier).setSearchQuery(q),
                  onAvatarTap: () => context.go('/profile'),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: _FulfillmentBanner(
                    fulfillment: fulfillment,
                    onChange: () {
                      final mode = fulfillment.orderMode ?? 'DELIVERY';
                      context.push('/fulfillment-setup?mode=$mode');
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: _StatusTabs(
                    selected: listState.filter,
                    countAll: listState.countAll > 0
                        ? listState.countAll
                        : listState.total,
                    countActive: listState.countActive,
                    countCompleted: listState.countCompleted,
                    countCancelled: listState.countCancelled,
                    onChanged: (f) =>
                        ref.read(ordersListProvider.notifier).setFilter(f),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: _SummaryCard(
                    total: listState.filter == OrdersListFilter.all
                        ? (listState.countAll > 0
                            ? listState.countAll
                            : listState.total)
                        : orders.length,
                    filter: listState.filter,
                    lastOrder: lastOrder,
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: _SearchFilterRow(
                    searchController: _searchController,
                    modeFilter: listState.modeFilter,
                    sort: listState.sort,
                    onSearchChanged: (q) =>
                        ref.read(ordersListProvider.notifier).setSearchQuery(q),
                    onModeChanged: (m) =>
                        ref.read(ordersListProvider.notifier).setModeFilter(m),
                    onSortChanged: (s) =>
                        ref.read(ordersListProvider.notifier).setSort(s),
                  ),
                ),
              ),
              if (listState.isLoading && listState.orders.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: CircularProgressIndicator(color: BcColors.brand),
                  ),
                )
              else if (listState.errorMessage != null && listState.orders.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _ErrorState(
                    message: listState.errorMessage!,
                    onRetry: () =>
                        ref.read(ordersListProvider.notifier).refresh(),
                  ),
                )
              else if (orders.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyState(filter: listState.filter),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final entries = grouped.entries.toList();
                        // Flatten: date header + orders as virtual list
                        var cursor = 0;
                        for (final entry in entries) {
                          if (index == cursor) {
                            return Padding(
                              padding: EdgeInsets.only(
                                bottom: 10,
                                top: cursor == 0 ? 0 : 8,
                              ),
                              child: Text(
                                entry.key,
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: onSurface,
                                ),
                              ),
                            );
                          }
                          cursor++;
                          for (var i = 0; i < entry.value.length; i++) {
                            if (index == cursor) {
                              final order = entry.value[i];
                              final isLastInDay = i == entry.value.length - 1;
                              final isLastGroup =
                                  entry.key == entries.last.key;
                              return _TimelineOrderCard(
                                order: order,
                                expanded: _expandedOrderId == order.id,
                                showLineBelow: !(isLastInDay && isLastGroup),
                                onToggle: () {
                                  setState(() {
                                    _expandedOrderId =
                                        _expandedOrderId == order.id
                                            ? null
                                            : order.id;
                                  });
                                },
                                onViewDetails: () =>
                                    context.push('/track/${order.id}'),
                                onReceipt: () =>
                                    OrderReceiptModal.show(context, order),
                                onReorder: () => _reorder(order),
                              );
                            }
                            cursor++;
                          }
                        }
                        return const SizedBox.shrink();
                      },
                      childCount: grouped.entries.fold<int>(
                        0,
                        (sum, e) => sum + 1 + e.value.length,
                      ),
                    ),
                  ),
                ),
              if (listState.isLoadingMore)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: BcColors.brand,
                        ),
                      ),
                    ),
                  ),
                )
              else if (orders.isNotEmpty && !listState.hasMore)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    child: Text(
                      'You\'ve reached the end',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: bc.mutedText, fontSize: 12),
                    ),
                  ),
                ),
              SliverToBoxAdapter(child: SizedBox(height: scrollBottomInset)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Header ───────────────────────────────────────────────────────────────────

class _OrdersHeader extends StatelessWidget {
  final int orderCount;
  final bool searchExpanded;
  final TextEditingController searchController;
  final FocusNode searchFocus;
  final VoidCallback onBack;
  final VoidCallback onToggleSearch;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onAvatarTap;

  const _OrdersHeader({
    required this.orderCount,
    required this.searchExpanded,
    required this.searchController,
    required this.searchFocus,
    required this.onBack,
    required this.onToggleSearch,
    required this.onSearchChanged,
    required this.onAvatarTap,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: onSurface),
          ),
          Expanded(
            child: searchExpanded
                ? TextField(
                    controller: searchController,
                    focusNode: searchFocus,
                    onChanged: onSearchChanged,
                    decoration: InputDecoration(
                      hintText: 'Search orders',
                      isDense: true,
                      filled: true,
                      fillColor: bc.cardBg,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: bc.border),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: bc.border),
                      ),
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Order history',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: onSurface,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$orderCount order${orderCount == 1 ? '' : 's'}',
                        style: TextStyle(
                          fontSize: 13,
                          color: bc.mutedText,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
          ),
          IconButton(
            onPressed: onToggleSearch,
            icon: Icon(
              searchExpanded ? Icons.close_rounded : Icons.search_rounded,
              color: onSurface,
            ),
          ),
          GestureDetector(
            onTap: onAvatarTap,
            child: ClipOval(
              child: Image.asset(
                'assets/brand/customer-avatar.png',
                width: 36,
                height: 36,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => CircleAvatar(
                  radius: 18,
                  backgroundColor: BcColors.brand.withValues(alpha: 0.15),
                  child: const Icon(Icons.person, color: BcColors.brand, size: 20),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Fulfillment banner ───────────────────────────────────────────────────────

class _FulfillmentBanner extends StatelessWidget {
  final FulfillmentState fulfillment;
  final VoidCallback onChange;

  const _FulfillmentBanner({
    required this.fulfillment,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final isDelivery = fulfillment.orderMode != 'TAKEAWAY';
    final label = isDelivery
        ? (fulfillment.deliveryAddress?.trim().isNotEmpty == true
            ? fulfillment.deliveryAddress!
            : 'Set delivery address')
        : (fulfillment.storeName?.trim().isNotEmpty == true
            ? fulfillment.storeName!
            : 'Choose a store');
    final modeLabel = isDelivery ? 'Delivery' : 'Pickup';

    return Material(
      color: bc.cardBg,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onChange,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: BcColors.brand.withValues(alpha: 0.35)),
          ),
          child: Row(
            children: [
              Icon(
                isDelivery
                    ? Icons.local_shipping_outlined
                    : Icons.storefront_outlined,
                color: BcColors.brand,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '$modeLabel • $label',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ),
              Text(
                'Change',
                style: TextStyle(
                  color: BcColors.brand,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Status tabs ──────────────────────────────────────────────────────────────

class _StatusTabs extends StatelessWidget {
  final OrdersListFilter selected;
  final int countAll;
  final int countActive;
  final int countCompleted;
  final int countCancelled;
  final ValueChanged<OrdersListFilter> onChanged;

  const _StatusTabs({
    required this.selected,
    required this.countAll,
    required this.countActive,
    required this.countCompleted,
    required this.countCancelled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final tabs = [
      (OrdersListFilter.all, 'All', countAll),
      (OrdersListFilter.active, 'Active', countActive),
      (OrdersListFilter.completed, 'Completed', countCompleted),
      (OrdersListFilter.cancelled, 'Cancelled', countCancelled),
    ];

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: bc.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: bc.border),
      ),
      child: Row(
        children: [
          for (final t in tabs)
            Expanded(
              child: Material(
                color: selected == t.$1 ? BcColors.brand : Colors.transparent,
                borderRadius: BorderRadius.circular(9),
                child: InkWell(
                  onTap: () => onChanged(t.$1),
                  borderRadius: BorderRadius.circular(9),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      '${t.$2} ${t.$3}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: selected == t.$1
                            ? Colors.white
                            : Theme.of(context).colorScheme.onSurface,
                      ),
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

// ─── Summary card ─────────────────────────────────────────────────────────────

class _SummaryCard extends StatelessWidget {
  final int total;
  final OrdersListFilter filter;
  final Order? lastOrder;

  const _SummaryCard({
    required this.total,
    required this.filter,
    required this.lastOrder,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final lastLabel = lastOrder != null
        ? 'Last order • ${DateFormat('MMM d').format(lastOrder!.createdAt.toLocal())}'
        : 'No orders yet';

    String title;
    IconData icon;
    switch (filter) {
      case OrdersListFilter.active:
        title = '$total active order${total == 1 ? '' : 's'}';
        icon = Icons.local_cafe_rounded;
      case OrdersListFilter.completed:
        title = '$total completed order${total == 1 ? '' : 's'}';
        icon = Icons.check_circle_outline_rounded;
      case OrdersListFilter.cancelled:
        title = '$total cancelled order${total == 1 ? '' : 's'}';
        icon = Icons.cancel_outlined;
      case OrdersListFilter.all:
        title = '$total total order${total == 1 ? '' : 's'}';
        icon = Icons.receipt_long_rounded;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: BcColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BcColors.brand.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: BcColors.brand,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  lastLabel,
                  style: TextStyle(fontSize: 12, color: bc.mutedText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Search + type + sort row ─────────────────────────────────────────────────

class _SearchFilterRow extends StatelessWidget {
  final TextEditingController searchController;
  final OrdersModeFilter modeFilter;
  final OrdersListSort sort;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<OrdersModeFilter> onModeChanged;
  final ValueChanged<OrdersListSort> onSortChanged;

  const _SearchFilterRow({
    required this.searchController,
    required this.modeFilter,
    required this.sort,
    required this.onSearchChanged,
    required this.onModeChanged,
    required this.onSortChanged,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Column(
      children: [
        Container(
          height: 42,
          decoration: BoxDecoration(
            color: bc.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: bc.border),
          ),
          child: TextField(
            controller: searchController,
            onChanged: onSearchChanged,
            style: TextStyle(fontSize: 13, color: onSurface),
            decoration: InputDecoration(
              hintText: 'Search orders',
              hintStyle: TextStyle(color: bc.mutedText, fontSize: 13),
              prefixIcon: Icon(Icons.search_rounded, size: 18, color: bc.mutedText),
              border: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 11),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _FilterChipButton(
                icon: Icons.view_list_rounded,
                label: switch (modeFilter) {
                  OrdersModeFilter.all => 'All types',
                  OrdersModeFilter.delivery => 'Delivery',
                  OrdersModeFilter.takeaway => 'Takeaway',
                },
                onTap: () => _showModeMenu(context),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _FilterChipButton(
                icon: Icons.swap_vert_rounded,
                label: sort == OrdersListSort.newest ? 'Newest' : 'Oldest',
                onTap: () => _showSortMenu(context),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _showModeMenu(BuildContext context) async {
    final choice = await showModalBottomSheet<OrdersModeFilter>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('All types'),
              trailing: modeFilter == OrdersModeFilter.all
                  ? const Icon(Icons.check, color: BcColors.brand)
                  : null,
              onTap: () => Navigator.pop(ctx, OrdersModeFilter.all),
            ),
            ListTile(
              title: const Text('Delivery'),
              trailing: modeFilter == OrdersModeFilter.delivery
                  ? const Icon(Icons.check, color: BcColors.brand)
                  : null,
              onTap: () => Navigator.pop(ctx, OrdersModeFilter.delivery),
            ),
            ListTile(
              title: const Text('Takeaway'),
              trailing: modeFilter == OrdersModeFilter.takeaway
                  ? const Icon(Icons.check, color: BcColors.brand)
                  : null,
              onTap: () => Navigator.pop(ctx, OrdersModeFilter.takeaway),
            ),
          ],
        ),
      ),
    );
    if (choice != null) onModeChanged(choice);
  }

  Future<void> _showSortMenu(BuildContext context) async {
    final choice = await showModalBottomSheet<OrdersListSort>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Newest'),
              trailing: sort == OrdersListSort.newest
                  ? const Icon(Icons.check, color: BcColors.brand)
                  : null,
              onTap: () => Navigator.pop(ctx, OrdersListSort.newest),
            ),
            ListTile(
              title: const Text('Oldest'),
              trailing: sort == OrdersListSort.oldest
                  ? const Icon(Icons.check, color: BcColors.brand)
                  : null,
              onTap: () => Navigator.pop(ctx, OrdersListSort.oldest),
            ),
          ],
        ),
      ),
    );
    if (choice != null) onSortChanged(choice);
  }
}

class _FilterChipButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _FilterChipButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return Material(
      color: bc.cardBg,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 42,
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: bc.border),
          ),
          child: Row(
            children: [
              Icon(icon, size: 16, color: bc.mutedText),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ),
              Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: bc.mutedText),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Timeline order card ──────────────────────────────────────────────────────

class _TimelineOrderCard extends StatelessWidget {
  final Order order;
  final bool expanded;
  final bool showLineBelow;
  final VoidCallback onToggle;
  final VoidCallback onViewDetails;
  final VoidCallback onReceipt;
  final VoidCallback onReorder;

  const _TimelineOrderCard({
    required this.order,
    required this.expanded,
    required this.showLineBelow,
    required this.onToggle,
    required this.onViewDetails,
    required this.onReceipt,
    required this.onReorder,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final statusLabel = switch (order.status) {
      'CANCELLED' => 'Cancelled',
      'DELIVERED' => 'Completed',
      'OUT_FOR_DELIVERY' => 'On the way',
      'READY' => 'Ready',
      'PREPARING' => 'Preparing',
      'RECEIVED' => 'Placed',
      _ => order.statusDisplay,
    };
    final statusColor = orderStatusColor(order.status);
    final isDelivery = order.orderMode == 'DELIVERY';
    final timeLabel = DateFormat('h:mm a').format(order.createdAt.toLocal());
    final storeLabel = order.storeName?.trim().isNotEmpty == true
        ? order.storeName!
        : 'Bing Chun';
    final firstItem = order.items.isNotEmpty ? order.items.first : null;
    final itemPreview = firstItem != null
        ? '${firstItem.productName} ×${firstItem.quantity}'
        : '${order.itemCount} item${order.itemCount == 1 ? '' : 's'}';

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 22,
            child: Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.only(top: 22),
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: statusColor.withValues(alpha: 0.35),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
                if (showLineBelow)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: bc.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Material(
                color: bc.cardBg,
                elevation: 0,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  onTap: onToggle,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: bc.border),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _StatusBadge(
                              label: statusLabel,
                              color: statusColor,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '#${order.orderNumber}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: onSurface,
                                ),
                              ),
                            ),
                            Icon(
                              expanded
                                  ? Icons.keyboard_arrow_up_rounded
                                  : Icons.chevron_right_rounded,
                              color: bc.mutedText,
                              size: 22,
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Wrap(
                                    crossAxisAlignment: WrapCrossAlignment.center,
                                    spacing: 6,
                                    runSpacing: 4,
                                    children: [
                                      Text(
                                        timeLabel,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: bc.mutedText,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      Icon(
                                        isDelivery
                                            ? Icons.local_shipping_outlined
                                            : Icons.storefront_outlined,
                                        size: 14,
                                        color: BcColors.brand,
                                      ),
                                      Text(
                                        isDelivery ? 'Delivery' : 'Takeaway',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: bc.mutedText,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      Text(
                                        '•',
                                        style: TextStyle(color: bc.mutedText),
                                      ),
                                      Text(
                                        storeLabel,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: bc.mutedText,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (!expanded) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      itemPreview,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: onSurface.withValues(alpha: 0.8),
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              formatMoney(order.total),
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: BcColors.brand,
                              ),
                            ),
                          ],
                        ),
                        if (expanded) ...[
                          const SizedBox(height: 12),
                          if (order.items.isNotEmpty)
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: BcColors.brand.withValues(alpha: 0.07),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Column(
                                children: [
                                  for (final item in order.items.take(3))
                                    Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 4),
                                      child: Row(
                                        children: [
                                          OrderProductImage(
                                            imageUrl: item.imageUrl,
                                            size: 40,
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(
                                              '${item.productName} ×${item.quantity}',
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600,
                                                color: onSurface,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  if (order.items.length > 3)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        '+${order.items.length - 3} more',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: bc.mutedText,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          const SizedBox(height: 10),
                          GestureDetector(
                            onTap: onViewDetails,
                            child: Row(
                              children: [
                                Text(
                                  'View details',
                                  style: TextStyle(
                                    color: BcColors.brand,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(width: 2),
                                const Icon(
                                  Icons.chevron_right_rounded,
                                  size: 18,
                                  color: BcColors.brand,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              OutlinedButton.icon(
                                onPressed: onReceipt,
                                icon: const Icon(Icons.download_outlined, size: 18),
                                label: const Text('Download Receipt'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: BcColors.brand,
                                  side: const BorderSide(color: BcColors.brand),
                                  minimumSize: const Size.fromHeight(46),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  textStyle: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              FilledButton.icon(
                                onPressed: onReorder,
                                icon: const Icon(Icons.replay_rounded, size: 18),
                                label: const Text('Reorder'),
                                style: FilledButton.styleFrom(
                                  backgroundColor: BcColors.brand,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size.fromHeight(46),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  textStyle: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
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

class _StatusBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// ─── Empty / error ────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final OrdersListFilter filter;

  const _EmptyState({required this.filter});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final message = switch (filter) {
      OrdersListFilter.active => 'No active orders right now.',
      OrdersListFilter.completed => 'Completed orders will show up here.',
      OrdersListFilter.cancelled => 'No cancelled orders.',
      OrdersListFilter.all =>
        'Place an order and it will show up in your history.',
    };

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.receipt_long_outlined, size: 64, color: bc.mutedText),
        const SizedBox(height: 16),
        Text(
          'No orders yet',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: onSurface,
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: bc.mutedText),
          ),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: BcColors.error),
          const SizedBox(height: 12),
          Text(
            'Could not load orders',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: bc.mutedText, fontSize: 12),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
