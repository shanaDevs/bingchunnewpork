import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';
import 'qd_kit.dart';

/// Shared building blocks for the active-run and order screens: gradient top bar,
/// soft cards with an icon header, gradient/outline actions, and the run step tracker.

/// QuickDrop-style detail header: brand surface, glass back circle, ink title,
/// optional trailing status and extra content underneath.
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
    // Plain QuickDrop app bar (white, hairline, centred title) unless extra header content
    // (stepper / tags) needs the brand surface.
    if (bottom == null) {
      return QdAppBar(
        title: title,
        subtitle: subtitle,
        onBack: onBack,
        trailing: trailing == null ? null : _OnSurface(child: trailing!),
      );
    }
    return QdBrandHeader(
      padding: EdgeInsets.fromLTRB(14, MediaQuery.paddingOf(context).top + 6, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Material(
                color: Colors.white.withValues(alpha: 0.2),
                shape: CircleBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.28))),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onBack ?? () => Navigator.of(context).maybePop(),
                  child: Tooltip(
                    message: tr('Back'),
                    child: SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(Icons.arrow_back_rounded, color: c.heroTitle, size: 22),
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
                      style: BcType.title.copyWith(color: c.heroTitle, fontSize: 22, fontWeight: FontWeight.w800),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: c.heroSubtitle, fontSize: 13, fontWeight: FontWeight.w600),
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
    );
  }
}

class _OnSurface extends InheritedWidget {
  const _OnSurface({required super.child});
  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_OnSurface>() != null;
  @override
  bool updateShouldNotify(_OnSurface old) => false;
}

/// Translucent pill for the top bar (status with a live dot).
class BcTopBarPill extends StatelessWidget {
  const BcTopBarPill({super.key, required this.label, this.dotColor});
  final String label;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dot = dotColor ?? c.success;
    final onSurface = _OnSurface.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 12, 6),
      decoration: BoxDecoration(
        color: onSurface ? c.muted : Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: onSurface ? c.border : Colors.white.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: dot,
              boxShadow: [BoxShadow(color: dot.withValues(alpha: 0.6), blurRadius: 6)],
            ),
          ),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: onSurface ? c.foreground : c.heroTitle, fontSize: 12, fontWeight: FontWeight.w700)),
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
    this.padding = const EdgeInsets.all(12),
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
    if (borderColor == null) return QdCard(padding: padding, color: color, child: child);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surface,
        borderRadius: BorderRadius.circular(BcRadius.lg),
        border: Border.all(color: borderColor!, width: 1.5),
        boxShadow: bcShadow(c),
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
          decoration: BoxDecoration(color: bg ?? c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
          child: Icon(icon, color: tint ?? c.primaryStrong, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: BcType.subtitle.copyWith(color: c.foreground),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: BcType.caption.copyWith(color: c.mutedForeground)),
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
    final col = color ?? c.primaryStrong;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: col.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(BcRadius.md)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: col, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: c.foreground, fontSize: 13, height: 1.4)),
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

  /// Optional override fill: the first colour is used as the pill fill.
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final showLock = locked && !active && !loading;
    final fill = colors?.first ?? c.action;
    final fg = colors == null ? c.actionForeground : Colors.white;
    final radius = BorderRadius.circular(BcRadius.full);
    final red = c.errorStrong;
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading || showLock ? 1 : 0.5,
      child: AnimatedContainer(
        duration: BcMotion.standard,
        height: 54,
        decoration: BoxDecoration(
          borderRadius: radius,
          color: showLock ? c.errorSoftBg : fill,
          border: showLock ? Border.all(color: c.error.withValues(alpha: 0.4)) : null,
          boxShadow: active ? [BoxShadow(color: fill.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 6))] : null,
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
                  ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: fg))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (showLock || icon != null) ...[
                          Icon(showLock ? Icons.lock_outline_rounded : icon, color: showLock ? red : fg, size: 19),
                          const SizedBox(width: 8),
                        ],
                        Flexible(
                          child: Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: BcType.button.copyWith(fontSize: 15, color: showLock ? red : fg),
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
    final col = color ?? c.primaryStrong;
    final active = enabled && onPressed != null;
    return Opacity(
      opacity: active ? 1 : 0.45,
      child: Material(
        color: c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BcRadius.full),
          side: BorderSide(color: col.withValues(alpha: 0.6), width: 1.5),
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

/// Pickup / Deliver / Return tracker (QuickDrop segmented stepper). [step] is 0, 1 or 2.
class RunStepper extends StatelessWidget {
  const RunStepper({super.key, required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final steps = [
      (Icons.storefront_rounded, tr('Pickup')),
      (Icons.two_wheeler_rounded, tr('Deliver')),
      (Icons.flag_rounded, tr('Return')),
    ];
    return Row(
      children: [
        for (var i = 0; i < steps.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedContainer(
                  duration: BcMotion.standard,
                  height: 6,
                  decoration: BoxDecoration(
                    color: i <= step ? c.heroTitle : c.heroTitle.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      i < step ? Icons.check_circle_rounded : steps[i].$1,
                      size: 15,
                      color: c.heroTitle.withValues(alpha: i == step ? 1 : 0.7),
                    ),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        steps[i].$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: c.heroTitle.withValues(alpha: i == step ? 1 : 0.7),
                          fontSize: 12,
                          fontWeight: i == step ? FontWeight.w800 : FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ],
    );
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
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(BcRadius.sm)),
            child: Icon(icon, color: tint, size: 18),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(color: c.foreground, fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.mutedForeground, fontSize: 12, fontWeight: FontWeight.w500),
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
