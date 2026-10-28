import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/cart_item.dart';
import '../models/order.dart';
import '../models/product.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/loyalty_provider.dart';
import '../providers/order_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/loyalty_utils.dart';
import '../utils/order_receipt_utils.dart';
import '../widgets/order_product_image.dart';
import '../widgets/order_receipt_modal.dart';
import '../widgets/pickup_qr_modal.dart';

class OrderTrackingScreen extends ConsumerStatefulWidget {
  final String orderId;

  const OrderTrackingScreen({
    super.key,
    required this.orderId,
  });

  @override
  ConsumerState<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends ConsumerState<OrderTrackingScreen> {
  int _rating = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(orderProvider.notifier).fetchOrderDetails(widget.orderId);
      ref.read(orderProvider.notifier).startTrackingOrder(widget.orderId);
    });
  }

  @override
  void dispose() {
    ref.read(orderProvider.notifier).stopTrackingOrder();
    super.dispose();
  }

  Order? _resolveOrder(OrderState orderState) {
    if (orderState.activeOrder?.id == widget.orderId) return orderState.activeOrder;
    for (final order in orderState.orderHistory) {
      if (order.id == widget.orderId) return order;
    }
    return orderState.activeOrder;
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
        /* skip */
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

  Future<void> _openDirections(Order order) async {
    final lat = order.deliveryLat;
    final lng = order.deliveryLng;
    Uri uri;
    if (lat != null && lng != null) {
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    } else {
      final q = Uri.encodeComponent(
        [order.storeName, order.storeAddressLine].whereType<String>().join(', '),
      );
      if (q.isEmpty) return;
      uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$q');
    }
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orderState = ref.watch(orderProvider);
    final order = _resolveOrder(orderState);
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    if (orderState.isLoading && order == null) {
      return Scaffold(
        backgroundColor: bc.pageBg,
        appBar: _appBar(context),
        body: const Center(child: CircularProgressIndicator(color: BcColors.brand)),
      );
    }

    if (order == null) {
      return Scaffold(
        backgroundColor: bc.pageBg,
        appBar: _appBar(context),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 60, color: BcColors.error),
                const SizedBox(height: 16),
                Text(
                  'Order not found',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: onSurface),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.go('/orders'),
                  child: const Text('View Orders'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final isPickup = order.orderMode == 'TAKEAWAY';
    final settings =
        ref.watch(loyaltyProvider).summary?.settings ?? const LoyaltySettings();
    final pointsEarned = estimateLoyaltyPointsEarned(order.total, settings);

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: _appBar(context),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              child: isPickup
                  ? _PickupOrderDetails(
                      order: order,
                      pointsEarned: pointsEarned,
                      onDirections: () => _openDirections(order),
                      onShowCode: () => PickupQrModal.show(context, order),
                    )
                  : _DeliveryOrderDetails(
                      order: order,
                      pointsEarned: pointsEarned,
                      rating: _rating,
                      onRate: (v) => setState(() => _rating = v),
                    ),
            ),
          ),
          _BottomActions(
            order: order,
            isPickup: isPickup,
            onReorder: () => _reorder(order),
            onShowCode: () => PickupQrModal.show(context, order),
            onTrackMap: () => context.push('/track/${order.id}/live-map'),
            onHelp: () => context.push('/profile/support'),
            onReceipt: () => OrderReceiptModal.show(context, order),
          ),
        ],
      ),
    );
  }

  PreferredSizeWidget _appBar(BuildContext context) {
    return AppBar(
      backgroundColor: context.bc.pageBg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      title: Text(
        'Order Details',
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 18,
          color: Theme.of(context).colorScheme.onSurface,
        ),
      ),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
        onPressed: () => context.canPop() ? context.pop() : context.go('/orders'),
      ),
    );
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

String _fmtTime(DateTime dt) => DateFormat('h:mm a').format(dt.toLocal());
String _fmtDateTime(DateTime dt) =>
    DateFormat('d MMM yyyy · h:mm a').format(dt.toLocal());

String _pickupCode(Order order) {
  if (order.queuePosition != null) return 'A${order.queuePosition}';
  final n = order.orderNumber;
  if (n.length >= 3) return n.substring(n.length - 3).toUpperCase();
  return n.toUpperCase();
}

String _itemMeta(OrderItem item) {
  final parts = <String>[formatSize(item.size), ...item.toppings];
  return parts.join(' · ');
}

String _paymentShort(Order order) {
  switch (order.paymentMethod) {
    case 'PAYHERE':
    case 'CARD':
      return 'Card';
    case 'CASH_ON_DELIVERY':
      return 'Cash on delivery';
    case 'CASH_AT_COUNTER':
      return 'Cash at counter';
    default:
      return paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod;
  }
}

String _statusMessage(Order order) {
  switch (order.status) {
    case 'DELIVERED':
      return order.orderMode == 'DELIVERY'
          ? 'Your order was delivered successfully.'
          : 'Your order was picked up successfully.';
    case 'OUT_FOR_DELIVERY':
      return 'Your order is on the way.';
    case 'READY':
      return 'Your order is ready for pickup.';
    case 'PREPARING':
      return 'Our kitchen is crafting your order.';
    case 'CANCELLED':
      return 'This order was cancelled.';
    case 'RECEIVED':
      return 'Your order has been placed. Waiting for the store to confirm.';
    default:
      return 'Your order has been placed.';
  }
}

List<_TimelineStep> _deliverySteps(Order order) {
  final created = order.createdAt.toLocal();
  final status = order.status;
  // RECEIVED = placed only. Confirmed starts when the store moves to PREPARING.
  final rank = switch (status) {
    'RECEIVED' => 0,
    'PREPARING' => 2,
    'READY' => 2,
    'OUT_FOR_DELIVERY' => 3,
    'DELIVERED' => 4,
    'CANCELLED' => -1,
    _ => 0,
  };
  return [
    _TimelineStep('Placed', created, rank >= 0, isCurrent: status == 'RECEIVED'),
    _TimelineStep(
      'Confirmed',
      created.add(const Duration(minutes: 1)),
      rank >= 1,
      isCurrent: false,
    ),
    _TimelineStep(
      'Preparing',
      created.add(const Duration(minutes: 5)),
      rank >= 2,
      isCurrent: status == 'PREPARING' || status == 'READY',
    ),
    _TimelineStep(
      'On the Way',
      created.add(Duration(minutes: order.estimatedMinutes ~/ 2)),
      rank >= 3,
      isCurrent: status == 'OUT_FOR_DELIVERY',
    ),
    _TimelineStep(
      'Delivered',
      created.add(Duration(minutes: order.estimatedMinutes)),
      rank >= 4,
      isCurrent: status == 'DELIVERED',
    ),
  ];
}

List<_TimelineStep> _pickupSteps(Order order) {
  final created = order.createdAt.toLocal();
  final status = order.status;
  // RECEIVED = placed only. Confirmed starts when the store moves to PREPARING.
  final rank = switch (status) {
    'RECEIVED' => 0,
    'PREPARING' => 2,
    'READY' => 3,
    'OUT_FOR_DELIVERY' => 3,
    'DELIVERED' => 3,
    'CANCELLED' => -1,
    _ => 0,
  };
  return [
    _TimelineStep('Placed', created, rank >= 0, isCurrent: status == 'RECEIVED'),
    _TimelineStep(
      'Confirmed',
      created.add(const Duration(minutes: 1)),
      rank >= 1,
    ),
    _TimelineStep(
      'Preparing',
      created.add(const Duration(minutes: 5)),
      rank >= 2,
      isCurrent: status == 'PREPARING',
    ),
    _TimelineStep(
      'Ready for Pickup',
      created.add(Duration(minutes: order.estimatedMinutes)),
      rank >= 3,
      isCurrent: status == 'READY' || status == 'DELIVERED',
    ),
  ];
}

class _TimelineStep {
  final String label;
  final DateTime at;
  final bool done;
  final bool isCurrent;

  const _TimelineStep(this.label, this.at, this.done, {this.isCurrent = false});
}

// ─── Delivery layout ──────────────────────────────────────────────────────────

class _DeliveryOrderDetails extends StatelessWidget {
  final Order order;
  final int pointsEarned;
  final int rating;
  final ValueChanged<int> onRate;

  const _DeliveryOrderDetails({
    required this.order,
    required this.pointsEarned,
    required this.rating,
    required this.onRate,
  });

  @override
  Widget build(BuildContext context) {
    final steps = _deliverySteps(order);
    final done = order.status == 'DELIVERED';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _DeliveryHeroBanner(order: order),
        const SizedBox(height: 14),
        _HorizontalTimeline(steps: steps),
        const SizedBox(height: 14),
        _DeliveryInfoCard(order: order),
        const SizedBox(height: 14),
        _ItemsSection(order: order),
        const SizedBox(height: 14),
        _PriceSummaryCard(order: order, showDeliveryFee: true),
        const SizedBox(height: 12),
        _PaymentRewardsRow(order: order, pointsEarned: pointsEarned),
        if (done) ...[
          const SizedBox(height: 14),
          _FeedbackCard(rating: rating, onRate: onRate),
        ],
      ],
    );
  }
}

class _DeliveryHeroBanner extends StatelessWidget {
  final Order order;

  const _DeliveryHeroBanner({required this.order});

  @override
  Widget build(BuildContext context) {
    final cancelled = order.status == 'CANCELLED';
    final bg = cancelled ? BcColors.error : BcColors.brand;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        gradient: cancelled
            ? null
            : const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF4B8FF5), Color(0xFF307EF2), Color(0xFF1A5CD4)],
              ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -10,
            bottom: -20,
            child: Icon(
              Icons.waves_rounded,
              size: 120,
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  cancelled
                      ? Icons.close_rounded
                      : (order.status == 'DELIVERED'
                          ? Icons.check_rounded
                          : Icons.local_shipping_outlined),
                  color: bg,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.statusDisplay,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _statusMessage(order),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 13,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '#${order.orderNumber}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _fmtDateTime(order.createdAt),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.8),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HorizontalTimeline extends StatelessWidget {
  final List<_TimelineStep> steps;

  const _HorizontalTimeline({required this.steps});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return _CardShell(
      child: Column(
        children: [
          Row(
            children: [
              for (var i = 0; i < steps.length; i++) ...[
                if (i > 0)
                  Expanded(
                    child: Container(
                      height: 2,
                      color: steps[i].done || steps[i - 1].done
                          ? BcColors.brand
                          : bc.border,
                    ),
                  ),
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: steps[i].done ? BcColors.brand : Colors.transparent,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: steps[i].done || steps[i].isCurrent
                          ? BcColors.brand
                          : bc.border,
                      width: 2,
                    ),
                  ),
                  child: steps[i].done
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : null,
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final step in steps)
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        step.label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: step.done || step.isCurrent
                              ? Theme.of(context).colorScheme.onSurface
                              : bc.mutedText,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _fmtTime(step.at),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 9, color: bc.mutedText),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DeliveryInfoCard extends StatelessWidget {
  final Order order;

  const _DeliveryInfoCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final address = [
      order.deliveryAddressLine,
      order.deliveryCity,
    ].whereType<String>().where((s) => s.trim().isNotEmpty).join(', ');

    return _CardShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.location_on_rounded, color: BcColors.brandDark, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.status == 'DELIVERED' ? 'Delivered to' : 'Delivering to',
                      style: TextStyle(fontSize: 12, color: bc.mutedText),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      order.customerName?.trim().isNotEmpty == true
                          ? order.customerName!
                          : 'Customer',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: onSurface,
                      ),
                    ),
                    if (address.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        address,
                        style: TextStyle(fontSize: 13, color: bc.mutedText, height: 1.3),
                      ),
                    ],
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: bc.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.home_outlined, size: 14, color: bc.mutedText),
                    const SizedBox(width: 4),
                    Text(
                      'Home',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Divider(height: 1, color: bc.border),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Icon(Icons.person_outline_rounded, size: 18, color: bc.mutedText),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Courier', style: TextStyle(fontSize: 11, color: bc.mutedText)),
                          Text(
                            order.storeName ?? 'Bing Chun',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Container(width: 1, height: 32, color: bc.border),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: Row(
                    children: [
                      Icon(Icons.schedule_rounded, size: 18, color: bc.mutedText),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Delivery time', style: TextStyle(fontSize: 11, color: bc.mutedText)),
                          Text(
                            '${order.estimatedMinutes} min',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: onSurface,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FeedbackCard extends StatelessWidget {
  final int rating;
  final ValueChanged<int> onRate;

  const _FeedbackCard({required this.rating, required this.onRate});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return _CardShell(
      child: Column(
        children: [
          Text(
            'How was your order?',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final star = i + 1;
              return IconButton(
                onPressed: () => onRate(star),
                icon: Icon(
                  star <= rating ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: BcColors.brand,
                  size: 32,
                ),
              );
            }),
          ),
          Text(
            'Your feedback helps us improve.',
            style: TextStyle(fontSize: 12, color: bc.mutedText),
          ),
        ],
      ),
    );
  }
}

// ─── Pickup layout ────────────────────────────────────────────────────────────

class _PickupOrderDetails extends StatelessWidget {
  final Order order;
  final int pointsEarned;
  final VoidCallback onDirections;
  final VoidCallback onShowCode;

  const _PickupOrderDetails({
    required this.order,
    required this.pointsEarned,
    required this.onDirections,
    required this.onShowCode,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final steps = _pickupSteps(order);
    final pickupAt = order.createdAt.toLocal().add(Duration(minutes: order.estimatedMinutes));
    final isToday = DateUtils.isSameDay(pickupAt, DateTime.now());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: bc.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: order.status == 'READY' || order.status == 'DELIVERED'
                        ? const Color(0xFF22C55E)
                        : BcColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  order.statusDisplay,
                  style: const TextStyle(
                    color: BcColors.brand,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Text(
              '#${order.orderNumber}',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: onSurface,
              ),
            ),
            const Spacer(),
            Text(
              _fmtDateTime(order.createdAt),
              style: TextStyle(fontSize: 12, color: bc.mutedText),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _InfoMiniCard(
                icon: Icons.calendar_today_outlined,
                label: 'Pickup Time',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isToday ? 'Today' : DateFormat('EEE, d MMM').format(pickupAt),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: onSurface,
                      ),
                    ),
                    Text(
                      order.pickupTime ?? _fmtTime(pickupAt),
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                        color: BcColors.brand,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _InfoMiniCard(
                icon: Icons.storefront_outlined,
                label: 'Store',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.storeName ?? 'Bing Chun',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: onSurface,
                      ),
                    ),
                    if (order.storeAddressLine != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        order.storeAddressLine!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: bc.mutedText),
                      ),
                    ],
                    const SizedBox(height: 6),
                    GestureDetector(
                      onTap: onDirections,
                      child: const Text(
                        'Get Directions →',
                        style: TextStyle(
                          color: BcColors.brand,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: onShowCode,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            decoration: BoxDecoration(
              color: BcColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BcColors.brand.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Text(
                  'PICKUP CODE',
                  style: TextStyle(
                    color: BcColors.brand,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    letterSpacing: 0.6,
                  ),
                ),
                Expanded(
                  child: Text(
                    _pickupCode(order),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: BcColors.brandDark,
                      fontWeight: FontWeight.w900,
                      fontSize: 36,
                      letterSpacing: 1,
                    ),
                  ),
                ),
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: bc.border),
                  ),
                  child: const Icon(Icons.qr_code_2_rounded, color: BcColors.brand),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        _VerticalTimeline(steps: steps),
        const SizedBox(height: 16),
        Text(
          'Order Items',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 16,
            color: onSurface,
          ),
        ),
        const SizedBox(height: 10),
        _ItemsSection(order: order, showTitle: false),
        const SizedBox(height: 14),
        _PickupTotalsStrip(order: order),
        const SizedBox(height: 12),
        _PaymentRewardsRow(order: order, pointsEarned: pointsEarned),
      ],
    );
  }
}

class _InfoMiniCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget child;

  const _InfoMiniCard({
    required this.icon,
    required this.label,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return _CardShell(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: BcColors.brand.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: BcColors.brand, size: 18),
          ),
          const SizedBox(height: 10),
          Text(label, style: TextStyle(fontSize: 11, color: bc.mutedText)),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

class _VerticalTimeline extends StatelessWidget {
  final List<_TimelineStep> steps;

  const _VerticalTimeline({required this.steps});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 24,
                child: Column(
                  children: [
                    Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: steps[i].done ? BcColors.brand : Colors.transparent,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: steps[i].done || steps[i].isCurrent
                              ? BcColors.brand
                              : bc.border,
                          width: 2.5,
                        ),
                      ),
                    ),
                    if (i < steps.length - 1)
                      Container(
                        width: 2.5,
                        height: 36,
                        color: steps[i].done ? BcColors.brand : bc.border,
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: i < steps.length - 1 ? 8 : 0, top: 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          steps[i].label,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: steps[i].done || steps[i].isCurrent
                                ? onSurface
                                : bc.mutedText,
                          ),
                        ),
                      ),
                      Text(
                        _fmtTime(steps[i].at),
                        style: TextStyle(fontSize: 12, color: bc.mutedText),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _PickupTotalsStrip extends StatelessWidget {
  final Order order;

  const _PickupTotalsStrip({required this.order});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final discount = order.discount + order.loyaltyDiscount;

    Widget col(String label, String value, {Color? valueColor}) {
      return Expanded(
        child: Column(
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: bc.mutedText)),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: valueColor ?? onSurface,
              ),
            ),
          ],
        ),
      );
    }

    return _CardShell(
      child: Row(
        children: [
          col('Subtotal', formatMoney(order.subtotal)),
          Container(width: 1, height: 36, color: bc.border),
          col(
            'Discount',
            discount > 0 ? '- ${formatMoney(discount)}' : formatMoney(0),
            valueColor: discount > 0 ? BcColors.error : null,
          ),
          Container(width: 1, height: 36, color: bc.border),
          col('Total', formatMoney(order.total), valueColor: BcColors.brand),
        ],
      ),
    );
  }
}

// ─── Shared sections ──────────────────────────────────────────────────────────

class _ItemsSection extends StatelessWidget {
  final Order order;
  final bool showTitle;

  const _ItemsSection({required this.order, this.showTitle = true});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showTitle) ...[
          Text(
            'Your items',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: onSurface,
            ),
          ),
          const SizedBox(height: 10),
        ],
        for (final item in order.items)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _CardShell(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  OrderProductImage(imageUrl: item.imageUrl, size: 56),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                item.productName,
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: onSurface,
                                ),
                              ),
                            ),
                            Text(
                              '× ${item.quantity}',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: bc.mutedText,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _itemMeta(item),
                          style: TextStyle(fontSize: 12, color: bc.mutedText, height: 1.3),
                        ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Text(
                            formatMoney(item.totalPrice),
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                              color: onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _PriceSummaryCard extends StatelessWidget {
  final Order order;
  final bool showDeliveryFee;

  const _PriceSummaryCard({
    required this.order,
    this.showDeliveryFee = false,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final discount = order.discount + order.loyaltyDiscount;

    Widget row(String label, String value, {bool discount = false, bool total = false}) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: total ? 16 : 13,
                fontWeight: total ? FontWeight.w800 : FontWeight.w500,
                color: total ? onSurface : bc.mutedText,
              ),
            ),
            const Spacer(),
            Text(
              value,
              style: TextStyle(
                fontSize: total ? 18 : 13,
                fontWeight: FontWeight.w800,
                color: discount
                    ? BcColors.error
                    : (total ? BcColors.brand : onSurface),
              ),
            ),
          ],
        ),
      );
    }

    return _CardShell(
      child: Column(
        children: [
          row('Subtotal', formatMoney(order.subtotal)),
          if (showDeliveryFee && order.deliveryFee > 0)
            row('Delivery Fee', formatMoney(order.deliveryFee)),
          if (order.convenientFee > 0)
            row('Convenience fee', formatMoney(order.convenientFee)),
          if (discount > 0) row('Discount', '- ${formatMoney(discount)}', discount: true),
          Divider(height: 20, color: bc.border),
          row('Total', formatMoney(order.total), total: true),
        ],
      ),
    );
  }
}

class _PaymentRewardsRow extends StatelessWidget {
  final Order order;
  final int pointsEarned;

  const _PaymentRewardsRow({
    required this.order,
    required this.pointsEarned,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final paid = order.paymentStatus == 'PAID';

    return _CardShell(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Text(
                  _paymentShort(order),
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    color: onSurface,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  paid ? 'Paid' : paymentStatusLabel(order),
                  style: TextStyle(
                    color: paid ? const Color(0xFF22C55E) : bc.mutedText,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          if (pointsEarned > 0)
            Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: const BoxDecoration(
                    color: Color(0xFFFBBF24),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.star_rounded, size: 14, color: Colors.white),
                ),
                const SizedBox(width: 6),
                Text(
                  '+$pointsEarned points earned',
                  style: const TextStyle(
                    color: BcColors.brand,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _BottomActions extends StatelessWidget {
  final Order order;
  final bool isPickup;
  final VoidCallback onReorder;
  final VoidCallback onShowCode;
  final VoidCallback onTrackMap;
  final VoidCallback onHelp;
  final VoidCallback onReceipt;

  const _BottomActions({
    required this.order,
    required this.isPickup,
    required this.onReorder,
    required this.onShowCode,
    required this.onTrackMap,
    required this.onHelp,
    required this.onReceipt,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final showPickupCta = isPickup && order.isActive;
    final canTrackLive = !isPickup &&
        (order.status == 'OUT_FOR_DELIVERY' || order.status == 'READY') &&
        order.deliveryLat != null &&
        order.deliveryLng != null;
    final bottom = MediaQuery.paddingOf(context).bottom;

    String primaryLabel;
    IconData primaryIcon;
    VoidCallback primaryAction;
    if (showPickupCta) {
      primaryLabel = 'Show Pickup Code';
      primaryIcon = Icons.qr_code_2_rounded;
      primaryAction = onShowCode;
    } else if (canTrackLive) {
      primaryLabel = 'Track on map';
      primaryIcon = Icons.map_outlined;
      primaryAction = onTrackMap;
    } else {
      primaryLabel = 'Reorder';
      primaryIcon = Icons.replay_rounded;
      primaryAction = onReorder;
    }

    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + bottom),
      decoration: BoxDecoration(
        color: bc.pageBg,
        border: Border(top: BorderSide(color: bc.border.withValues(alpha: 0.6))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            height: 52,
            child: FilledButton.icon(
              onPressed: primaryAction,
              icon: Icon(primaryIcon, size: 20),
              label: Text(primaryLabel),
              style: FilledButton.styleFrom(
                backgroundColor: BcColors.brand,
                foregroundColor: Colors.white,
                textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
          if (canTrackLive && order.status == 'OUT_FOR_DELIVERY') ...[
            const SizedBox(height: 8),
            Text(
              'Live driver location updates while out for delivery',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: bc.mutedText),
            ),
          ],
          const SizedBox(height: 12),
          if (isPickup && showPickupCta)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                  onPressed: onHelp,
                  child: const Text(
                    'Get Help',
                    style: TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700),
                  ),
                ),
                Text('  ·  ', style: TextStyle(color: bc.mutedText)),
                TextButton(
                  onPressed: onReceipt,
                  child: const Text(
                    'Download Receipt',
                    style: TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OutlinedButton.icon(
                  onPressed: onHelp,
                  icon: const Icon(Icons.headset_mic_outlined, size: 18),
                  label: const Text('Get Help'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: BcColors.brand,
                    side: BorderSide(color: bc.border),
                    minimumSize: const Size.fromHeight(46),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: onReceipt,
                  icon: const Icon(Icons.download_outlined, size: 18),
                  label: const Text('Download Receipt'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: BcColors.brand,
                    side: const BorderSide(color: BcColors.brand),
                    minimumSize: const Size.fromHeight(46),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ),
          if (canTrackLive && order.status != 'OUT_FOR_DELIVERY') ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton.icon(
                onPressed: onTrackMap,
                icon: const Icon(Icons.map_outlined, size: 18),
                label: const Text('Preview delivery map'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CardShell extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const _CardShell({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: bc.cardBg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: bc.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}
