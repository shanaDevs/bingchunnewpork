import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';
import 'scenery.dart';

/// Shared building blocks for the active-run and order screens: gradient top bar,
/// soft cards with an icon header, gradient/outline actions, and the run step tracker.

/// Gradient header with rounded bottom corners, a round back button, title/subtitle,
/// an optional trailing widget (status pill) and optional extra content underneath.
class BcDetailTopBar extends StatelessWidget {
  const BcDetailTopBar({super.key, required this.title, this.subtitle, this.trailing, this.bottom, this.onBack});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget? bottom;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const radius = BorderRadius.vertical(bottom: Radius.circular(28));
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
          stops: const [0, 0.5, 1],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: c.brand.withValues(alpha: c.isDark ? 0.18 : 0.26),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: CustomPaint(
          painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.07)),
          child: Padding(
            padding: EdgeInsets.fromLTRB(12, MediaQuery.paddingOf(context).top + 8, 16, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Material(
                      color: Colors.white.withValues(alpha: 0.16),
                      shape: const CircleBorder(),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: onBack ?? () => Navigator.of(context).maybePop(),
                        child: Tooltip(
                          message: tr('Back'),
                          child: const SizedBox(
                            width: 42,
                            height: 42,
                            child: Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800),
                          ),
                          if (subtitle != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              subtitle!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.85),
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (trailing != null) ...[const SizedBox(width: 8), trailing!],
                  ],
                ),
                if (bottom != null) ...[const SizedBox(height: 14), bottom!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Translucent pill for the top bar (status with a live dot).
class BcTopBarPill extends StatelessWidget {
  const BcTopBarPill({super.key, required this.label, this.dotColor = const Color(0xFF4ADE80)});
  final String label;
  final Color dotColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 12, 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: dotColor,
              boxShadow: [BoxShadow(color: dotColor.withValues(alpha: 0.6), blurRadius: 6)],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// White rounded card with soft shadow; optional coloured border for emphasis.
class RunCard extends StatelessWidget {
  const RunCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderColor,
    this.color,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: borderColor ?? c.border, width: borderColor == null ? 1 : 1.4),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 16, offset: const Offset(0, 5))],
      ),
      child: child,
    );
  }
}

/// Icon tile + title/subtitle + optional trailing (pill / badge) for a [RunCard].
class RunCardHeader extends StatelessWidget {
  const RunCardHeader({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.tint,
    this.bg,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Color? tint;
  final Color? bg;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: bg ?? c.brandSubtle, borderRadius: BorderRadius.circular(14)),
          child: Icon(icon, color: tint ?? c.brand, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 16),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: TextStyle(color: c.textMuted, fontSize: 12.5, height: 1.35)),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
      ],
    );
  }
}

/// Small rounded pill (distance, counts).
class RunPill extends StatelessWidget {
  const RunPill({super.key, required this.label, required this.color, this.icon});
  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 13, color: color), const SizedBox(width: 4)],
          Text(
            label,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Tinted info strip (icon + text) used for geofence and gating hints.
class RunNote extends StatelessWidget {
  const RunNote({super.key, required this.icon, required this.text, this.color});
  final IconData icon;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final col = color ?? c.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: col.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: col, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: c.text, fontSize: 12.5, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

/// Full-width primary action. [locked] shows a red lock state (e.g. outside the geofence).
class RunPrimaryButton extends StatelessWidget {
  const RunPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.enabled = true,
    this.loading = false,
    this.locked = false,
    this.colors,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool enabled;
  final bool loading;
  final bool locked;
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final showLock = locked && !active && !loading;
    final grad = colors ?? [c.brandLight, c.brand, c.brandDark];
    final radius = BorderRadius.circular(BcRadius.button + 2);
    final red = c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626);
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading || showLock ? 1 : 0.5,
      child: AnimatedContainer(
        duration: BcMotion.standard,
        height: 52,
        decoration: BoxDecoration(
          borderRadius: radius,
          gradient: showLock ? null : LinearGradient(colors: grad),
          color: showLock ? red.withValues(alpha: 0.10) : null,
          border: showLock ? Border.all(color: red.withValues(alpha: 0.35)) : null,
          boxShadow: active
              ? [BoxShadow(color: grad[1].withValues(alpha: 0.32), blurRadius: 14, offset: const Offset(0, 6))]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: active
                ? () {
                    BcFeedback.tap();
                    onPressed!();
                  }
                : null,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          showLock ? Icons.lock_outline_rounded : icon,
                          color: showLock ? red : Colors.white,
                          size: 19,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                              color: showLock ? red : Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Outlined secondary action (tinted border + label).
class RunOutlineButton extends StatelessWidget {
  const RunOutlineButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.color,
    this.enabled = true,
    this.height = 48,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? color;
  final bool enabled;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final col = color ?? c.brand;
    final active = enabled && onPressed != null;
    return Opacity(
      opacity: active ? 1 : 0.45,
      child: Material(
        color: col.withValues(alpha: 0.06),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BcRadius.button),
          side: BorderSide(color: col.withValues(alpha: 0.55), width: 1.3),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: active
              ? () {
                  BcFeedback.tap();
                  onPressed!();
                }
              : null,
          child: SizedBox(
            height: height,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, color: col, size: 18), const SizedBox(width: 7)],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: col, fontWeight: FontWeight.w700, fontSize: 14),
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

/// Pickup → Deliver → Return tracker for the active run hero. [step] is 0, 1 or 2.
class RunStepper extends StatelessWidget {
  const RunStepper({super.key, required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    final steps = [
      (Icons.storefront_rounded, tr('Pickup')),
      (Icons.two_wheeler_rounded, tr('Deliver')),
      (Icons.flag_rounded, tr('Return')),
    ];
    Widget dot(int i) {
      final done = i < step;
      final current = i == step;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: BcMotion.standard,
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done || current ? Colors.white : Colors.white.withValues(alpha: 0.18),
              border: current
                  ? Border.all(
                      color: Colors.white.withValues(alpha: 0.45),
                      width: 4,
                      strokeAlign: BorderSide.strokeAlignOutside,
                    )
                  : null,
            ),
            child: Icon(
              done ? Icons.check_rounded : steps[i].$1,
              size: 18,
              color: done || current ? const Color(0xFF1A5CD4) : Colors.white.withValues(alpha: 0.8),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            steps[i].$2,
            style: TextStyle(
              color: Colors.white.withValues(alpha: current ? 1 : 0.75),
              fontSize: 11.5,
              fontWeight: current ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
        ],
      );
    }

    Widget line(int i) => Expanded(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Container(
          height: 3,
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: i < step ? Colors.white : Colors.white.withValues(alpha: 0.25),
            borderRadius: BorderRadius.circular(99),
          ),
        ),
      ),
    );

    return Row(children: [dot(0), line(0), dot(1), line(1), dot(2)]);
  }
}

/// Compact stat tile (icon chip, value, label) — used in rows of 3–4 on ride screens.
class RunFactTile extends StatelessWidget {
  const RunFactTile({super.key, required this.icon, required this.tint, required this.value, required this.label});
  final IconData icon;
  final Color tint;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return RunCard(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
      child: Column(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon, color: tint, size: 18),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(color: c.text, fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.textMuted, fontSize: 11.5, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

/// Lays out [RunFactTile]s evenly in one row.
class RunFactRow extends StatelessWidget {
  const RunFactRow({super.key, required this.tiles});
  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) {
    if (tiles.isEmpty) return const SizedBox.shrink();
    return Row(
      children: [
        for (var i = 0; i < tiles.length; i++) ...[if (i > 0) const SizedBox(width: 8), Expanded(child: tiles[i])],
      ],
    );
  }
}
