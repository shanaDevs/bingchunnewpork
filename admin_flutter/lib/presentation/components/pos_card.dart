import 'package:flutter/material.dart';

import '../theme/pos_theme.dart';

/// Web `.card`: navy-card fill, hairline navy border, soft shadow on light.
class PosCard extends StatelessWidget {
  const PosCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(PosSpacing.lg),
    this.margin,
    this.onTap,
    this.color,
    this.borderColor,
    this.radius = PosRadius.card,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final r = BorderRadius.circular(radius);
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? c.card,
        borderRadius: r,
        border: Border.all(color: borderColor ?? c.border.withValues(alpha: c.isDark ? 1 : 0.7)),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 18, offset: const Offset(0, 4))],
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: r,
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

/// Raised inset panel inside a card (web `bg-navy-light/40` rows).
class PosInset extends StatelessWidget {
  const PosInset({super.key, required this.child, this.padding = const EdgeInsets.all(PosSpacing.md), this.color});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surface.withValues(alpha: c.isDark ? 0.6 : 1),
        borderRadius: BorderRadius.circular(PosRadius.card - 2),
        border: Border.all(color: c.border.withValues(alpha: 0.7)),
      ),
      child: child,
    );
  }
}
