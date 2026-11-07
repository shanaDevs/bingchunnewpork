import 'package:flutter/material.dart';

import '../../domain/entities/order.dart';
import '../../domain/logic/order_rules.dart';
import '../labels.dart';
import '../theme/pos_theme.dart';

/// Tinted pill (web `adminBadgeClass`).
class PosBadge extends StatelessWidget {
  const PosBadge({super.key, required this.label, required this.color, this.solid = false, this.icon});

  final String label;
  final Color color;
  final bool solid;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final fg = solid ? Colors.white : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: solid ? color : color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(PosRadius.pill),
        border: solid ? null : Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 11, color: fg), const SizedBox(width: 4)],
          Text(label, style: PosType.label.copyWith(color: fg, letterSpacing: 0.2, fontSize: 10.5)),
        ],
      ),
    );
  }
}

class OrderStatusBadge extends StatelessWidget {
  const OrderStatusBadge({super.key, required this.order});
  final OrderSummary order;

  @override
  Widget build(BuildContext context) => PosBadge(
    label: orderStatusLabel(order.status, mode: order.orderMode),
    color: orderStatusColor(context, order.status),
  );
}

/// Paid (green) / Failed (red) / Unpaid (amber).
class PaymentStateBadge extends StatelessWidget {
  const PaymentStateBadge({super.key, required this.order, this.long = false});
  final OrderSummary order;
  final bool long;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final color = isOrderPaid(order)
        ? c.successText
        : order.paymentStatus == 'FAILED'
        ? c.dangerText
        : c.warningText;
    return PosBadge(label: long ? paymentStateLong(order) : paymentStateShort(order), color: color);
  }
}

class PaymentMethodBadge extends StatelessWidget {
  const PaymentMethodBadge({super.key, required this.method});
  final String method;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final color = method == PaymentMethod.cashAtCounter ? c.accent : c.brand;
    return PosBadge(label: paymentMethodLabel(method), color: color);
  }
}

class ModeBadge extends StatelessWidget {
  const ModeBadge({super.key, required this.mode});
  final String mode;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return PosBadge(
      label: modeLabel(mode).toUpperCase(),
      color: mode == OrderMode.delivery ? c.accent : c.brand,
      icon: mode == OrderMode.delivery ? Icons.delivery_dining_rounded : Icons.shopping_bag_outlined,
    );
  }
}

class ChannelBadge extends StatelessWidget {
  const ChannelBadge({super.key, required this.channel});
  final String? channel;

  @override
  Widget build(BuildContext context) => PosBadge(label: channelLabel(channel), color: context.pos.textMuted);
}

/// Big round queue number (web `.pickup-token-badge`).
class PickupTokenBadge extends StatelessWidget {
  const PickupTokenBadge({super.key, required this.token, this.size = 44});
  final int? token;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: token == null ? c.surface : c.brand,
        borderRadius: BorderRadius.circular(PosRadius.button + 2),
        boxShadow: token == null
            ? null
            : [BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Text(
        token?.toString() ?? '—',
        style: PosType.heading.copyWith(
          color: token == null ? c.textMuted : Colors.white,
          fontSize: size * 0.4,
          fontFeatures: PosType.tabular,
        ),
      ),
    );
  }
}

/// Count bubble on tabs; [alert] gives it the solid colour (queue has work waiting).
class CountBubble extends StatelessWidget {
  const CountBubble({super.key, required this.count, required this.color, this.active = false, this.alert = false});

  final int count;
  final Color color;
  final bool active;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    final solid = active || alert;
    return AnimatedContainer(
      duration: PosMotion.standard,
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: active ? Colors.white : (alert ? color : color.withValues(alpha: 0.14)),
        borderRadius: BorderRadius.circular(PosRadius.pill),
      ),
      child: Text(
        '$count',
        textAlign: TextAlign.center,
        style: PosType.label.copyWith(
          color: active ? color : (solid ? Colors.white : color),
          letterSpacing: 0,
          fontSize: 11,
          fontFeatures: PosType.tabular,
        ),
      ),
    );
  }
}
