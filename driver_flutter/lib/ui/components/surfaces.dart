import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// White card with a hairline border and a soft drop shadow on light, border-only
/// on dark — port of Surfaces.kt BcCard.
class BcCard extends StatelessWidget {
  const BcCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(BcSpacing.lg),
    this.onTap,
    this.margin,
    this.borderColor,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? margin;
  final Color? borderColor;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final radius = BorderRadius.circular(BcRadius.card);
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? c.card,
        borderRadius: radius,
        border: Border.all(color: borderColor ?? c.border),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 20, offset: const Offset(0, 6))],
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          splashFactory: onTap == null ? NoSplash.splashFactory : null,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Status → (label, color), shared by chips and list rows.
(String, Color) statusLabel(BuildContext context, String status) {
  final c = context.bc;
  switch (status.toUpperCase()) {
    case 'SCHEDULED':
      return (tr('Scheduled'), c.info);
    case 'ASSIGNED':
      return (tr('Assigned'), c.brand);
    case 'TO_OUTLET':
    case 'PICKUP':
      return (tr('Pickup'), c.info);
    case 'PICKED_UP':
      return (tr('Picked up'), c.success);
    case 'QUEUED':
      return (tr('Queued'), c.info);
    case 'IN_PROGRESS':
      return (tr('On run'), c.accent);
    case 'RETURNING':
      return (tr('Returning'), c.warning);
    case 'COMPLETED':
      return (tr('Completed'), c.success);
    case 'CANCELLED':
      return (tr('Cancelled'), c.danger);
    case 'VEHICLE_FAILURE':
      return (tr('Vehicle failure'), c.danger);
    case 'ABANDONED':
    case 'PARTIALLY_COMPLETED':
      return (tr('Incomplete'), c.warning);
    case 'DELIVERED':
      return (tr('✓ Delivered'), c.success);
    case 'OUT_FOR_DELIVERY':
      return (tr('Out for delivery'), c.brand);
    case 'READY':
      return (tr('Ready'), c.success);
    case 'NEXT':
      return (tr('Next'), c.brand);
    case 'FAILED':
    case 'DELIVERY_FAILED':
      return (tr('Failed'), c.danger);
    default:
      final s = status.replaceAll('_', ' ').toLowerCase();
      return (s.isEmpty ? s : s[0].toUpperCase() + s.substring(1), c.textMuted);
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = statusLabel(context, status);
    return InfoBadge(label, color: color);
  }
}

class InfoBadge extends StatelessWidget {
  const InfoBadge(this.label, {super.key, this.color, this.icon});

  final String label;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final col = color ?? context.bc.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: col.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(BcRadius.full),
        border: Border.all(color: col.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: col), const SizedBox(width: 4)],
          Flexible(
            child: Text(
              label,
              style: BcType.tiny.copyWith(color: col),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shimmering placeholder block.
class BcSkeleton extends StatefulWidget {
  const BcSkeleton({super.key, this.width, this.height = 14});
  final double? width;
  final double height;

  @override
  State<BcSkeleton> createState() => _BcSkeletonState();
}

class _BcSkeletonState extends State<BcSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
    ..repeat();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final t = _ctrl.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BcRadius.md),
            gradient: LinearGradient(
              begin: Alignment(-1 + 2 * t - 0.6, 0),
              end: Alignment(-1 + 2 * t + 0.6, 0),
              colors: [c.surfacePill, c.border, c.surfacePill],
            ),
          ),
        );
      },
    );
  }
}

class BcSkeletonCard extends StatelessWidget {
  const BcSkeletonCard({super.key});

  @override
  Widget build(BuildContext context) {
    return BcCard(
      child: LayoutBuilder(
        builder: (context, box) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const BcSkeleton(height: 18),
            const SizedBox(height: 10),
            BcSkeleton(width: box.maxWidth * 0.7),
            const SizedBox(height: 10),
            BcSkeleton(width: box.maxWidth * 0.45),
          ],
        ),
      ),
    );
  }
}
