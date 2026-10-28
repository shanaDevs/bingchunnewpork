import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/api_config.dart';
import '../models/order.dart';
import '../providers/fulfillment_provider.dart';
import '../theme/bc_theme.dart';
import 'delivery_status_mascot.dart';
import 'order_qr_code.dart';
import 'pickup_qr_modal.dart';

class DashboardHeroCard extends ConsumerStatefulWidget {
  final Order? activeOrder;
  final VoidCallback? onOrderTap;

  const DashboardHeroCard({
    super.key,
    this.activeOrder,
    this.onOrderTap,
  });

  @override
  ConsumerState<DashboardHeroCard> createState() => _DashboardHeroCardState();
}

class _DashboardHeroCardState extends ConsumerState<DashboardHeroCard> {
  String _selectedMode = 'TAKEAWAY';

  @override
  void initState() {
    super.initState();
    final fulfillment = ref.read(fulfillmentProvider);
    if (fulfillment.orderMode != null) {
      _selectedMode = fulfillment.orderMode!;
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.activeOrder;
    final muted = context.bc.mutedText;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (order != null) ...[
          Text(
            order.orderMode == 'TAKEAWAY' ? 'YOUR PICKUP ORDER' : 'YOUR DELIVERY ORDER',
            style: TextStyle(
              color: muted.withValues(alpha: 0.95),
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          order.orderMode == 'TAKEAWAY'
              ? _buildPickupOrderCard(context, order)
              : _buildDeliveryOrderCard(context, order),
          const SizedBox(height: 16),
        ],
        _buildMethodSelectionCard(context),
      ],
    );
  }

  Widget _buildPickupOrderCard(BuildContext context, Order order) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return _HeroShell(
      onTap: () {
        if (widget.onOrderTap != null) {
          widget.onOrderTap!();
        } else {
          context.push('/track/${order.id}');
        }
      },
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _statusBadge(order.statusDisplay, BcColors.success),
                const SizedBox(height: 10),
                Text(
                  '#${order.orderNumber}',
                  style: TextStyle(
                    color: onSurface,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.3,
                  ),
                ),
                if (order.queuePosition != null && order.isActive) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Queue #${order.queuePosition}',
                    style: const TextStyle(color: BcColors.accent, fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => PickupQrModal.show(context, order),
            child: _buildQrWidget(order),
          ),
        ],
      ),
    );
  }

  Widget _buildDeliveryOrderCard(BuildContext context, Order order) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final bc = context.bc;
    return _HeroShell(
      onTap: () {
        if (widget.onOrderTap != null) {
          widget.onOrderTap!();
        } else {
          context.push('/track/${order.id}');
        }
      },
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _statusBadge(order.statusDisplay, BcColors.brandLight),
                const SizedBox(height: 12),
                Text(
                  'Delivery Order',
                  style: TextStyle(
                    color: onSurface,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '#${order.orderNumber}',
                  style: TextStyle(
                    color: bc.mutedText,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  order.statusDisplay,
                  style: const TextStyle(
                    color: BcColors.brand,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                if (order.isActive) ...[
                  const SizedBox(height: 6),
                  Text(
                    'ETA ~${order.estimatedMinutes} min',
                    style: TextStyle(color: bc.mutedText, fontSize: 12),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  'LKR ${order.total}',
                  style: TextStyle(
                    color: onSurface,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          DeliveryStatusMascot(status: order.status, size: 110),
        ],
      ),
    );
  }

  Widget _buildMethodSelectionCard(BuildContext context) {
    final fulfillment = ref.watch(fulfillmentProvider);
    final isPickup = _selectedMode == 'TAKEAWAY';
    final isModeReady = fulfillment.isInitialized && fulfillment.orderMode == _selectedMode;
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: bc.cardBg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: bc.border),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withOpacity(0.2)
                : Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Image.asset(
                  'assets/brand/logo.png',
                  height: 28,
                  width: 28,
                  errorBuilder: (_, __, ___) => Icon(Icons.icecream, color: isDark ? Colors.white : BcColors.brand, size: 24),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'How would you like to order?',
                    style: TextStyle(
                      color: onSurface,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _MethodTabs(
              selectedMode: _selectedMode,
              onChanged: (mode) => setState(() => _selectedMode = mode),
            ),
            const SizedBox(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isPickup ? 'Pickup' : 'Delivery',
                        style: TextStyle(
                          color: onSurface,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        isPickup
                            ? 'Collect fresh drinks from your nearest branch.'
                            : 'Hot & fresh bubble tea delivered to your door.',
                        style: TextStyle(
                          color: bc.mutedText,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 14),
                      if (isModeReady) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: BcColors.success.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: BcColors.success.withOpacity(0.4)),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                isPickup ? Icons.storefront : Icons.location_on,
                                color: BcColors.success,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  isPickup
                                      ? fulfillment.storeName ?? 'Store selected'
                                      : fulfillment.deliveryAddress ?? 'Address set',
                                  style: TextStyle(color: onSurface, fontSize: 12),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ] else
                        ElevatedButton(
                          onPressed: () => context.push(
                            '/fulfillment-setup?mode=$_selectedMode',
                          ),
                          child: Text(isPickup ? 'Select Pickup Store' : 'Set Delivery Address'),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Icon(
                  isPickup ? Icons.storefront_outlined : Icons.local_shipping_outlined,
                  size: 72,
                  color: bc.mutedText.withOpacity(0.15),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQrWidget(Order order) {
    return OrderQrCode(
      qrCodeBase64: order.qrCode,
      orderNumber: order.orderNumber,
      size: 100,
    );
  }

  Widget _statusBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}

class _HeroShell extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;

  const _HeroShell({required this.child, this.onTap});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: bc.cardBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: bc.border),
          boxShadow: [
            BoxShadow(
              color: isDark
                  ? Colors.black.withOpacity(0.2)
                  : Colors.black.withOpacity(0.04),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        padding: const EdgeInsets.all(20),
        child: child,
      ),
    );
  }
}

class _MethodTabs extends StatelessWidget {
  final String selectedMode;
  final ValueChanged<String> onChanged;

  const _MethodTabs({
    required this.selectedMode,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isDark ? Colors.black.withOpacity(0.25) : bc.secondaryBg,
        borderRadius: BorderRadius.circular(12),
        border: isDark ? null : Border.all(color: bc.border),
      ),
      child: Row(
        children: [
          _tab(context, 'TAKEAWAY', 'Pickup', Icons.storefront),
          _tab(context, 'DELIVERY', 'Delivery', Icons.local_shipping),
        ],
      ),
    );
  }

  Widget _tab(BuildContext context, String mode, String label, IconData icon) {
    final isSelected = selectedMode == mode;
    final bc = context.bc;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(mode),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? BcColors.brand : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: isSelected ? Colors.white : bc.mutedText),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : bc.mutedText,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
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
