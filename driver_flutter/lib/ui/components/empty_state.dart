import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import '../../core/feedback.dart';

/// Colour family for an empty state's illustration.
enum BcEmptyTone { brand, success, warning, neutral }

/// Shared "nothing here yet" state used across the rider app.
///
/// Full size: a layered halo illustration (soft rings, a raised icon disc, scattered
/// accent dots and an optional corner badge), a headline, a helper line and up to two
/// actions. Put it in a page's `fill` slot so it centres in the free space.
///
/// [compact]: a quiet bordered card for empty sections inside a longer page.
class BcEmptyState extends StatelessWidget {
  const BcEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.badgeIcon,
    this.tone = BcEmptyTone.brand,
    this.actionLabel,
    this.actionIcon,
    this.onAction,
    this.secondaryLabel,
    this.onSecondary,
    this.footer,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String? message;

  /// Small icon in a chip on the illustration's lower-right (e.g. a search-off glyph).
  final IconData? badgeIcon;
  final BcEmptyTone tone;
  final String? actionLabel;
  final IconData? actionIcon;
  final VoidCallback? onAction;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  /// Extra widget under the actions (a note, a status badge...).
  final Widget? footer;
  final bool compact;

  ({Color soft, Color strong, Color base}) _palette(BcColors c) => switch (tone) {
    BcEmptyTone.brand => (soft: c.primarySoft, strong: c.primaryStrong, base: c.primary),
    BcEmptyTone.success => (soft: c.successSoft, strong: c.successStrong, base: c.success),
    BcEmptyTone.warning => (soft: c.warningSoft, strong: c.warningStrong, base: c.warning),
    BcEmptyTone.neutral => (soft: c.muted, strong: c.mutedForeground, base: c.iconMuted),
  };

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final p = _palette(c);
    final content = compact ? _compact(c, p) : _full(context, c, p);
    if (MediaQuery.of(context).disableAnimations) return content;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      builder: (_, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, 14 * (1 - t)), child: child),
      ),
      child: content,
    );
  }

  Widget _full(BuildContext context, BcColors c, ({Color soft, Color strong, Color base}) p) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 340),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Halo(icon: icon, badgeIcon: badgeIcon, soft: p.soft, strong: p.strong, base: p.base),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: BcType.subtitle.copyWith(color: c.foreground),
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, height: 1.45, color: c.mutedForeground),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () {
                  BcFeedback.tap();
                  onAction!();
                },
                style: FilledButton.styleFrom(
                  backgroundColor: c.action,
                  foregroundColor: c.actionForeground,
                  minimumSize: const Size(200, 50),
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  shape: const StadiumBorder(),
                  elevation: 0,
                ),
                icon: Icon(actionIcon ?? Icons.arrow_forward_rounded, size: 20),
                label: Text(actionLabel!, style: BcType.button),
              ),
            ],
            if (secondaryLabel != null && onSecondary != null) ...[
              const SizedBox(height: 6),
              TextButton(
                onPressed: () {
                  BcFeedback.tap();
                  onSecondary!();
                },
                style: TextButton.styleFrom(foregroundColor: c.primaryStrong, shape: const StadiumBorder()),
                child: Text(secondaryLabel!, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ],
            if (footer != null) ...[const SizedBox(height: 16), footer!],
          ],
        ),
      ),
    );
  }

  Widget _compact(BcColors c, ({Color soft, Color strong, Color base}) p) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BcRadius.lg),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: p.soft, shape: BoxShape.circle),
            child: Icon(icon, size: 24, color: p.strong),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: BcType.section.copyWith(color: c.foreground),
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13.5, height: 1.4, color: c.mutedForeground),
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                BcFeedback.tap();
                onAction!();
              },
              style: TextButton.styleFrom(foregroundColor: c.primaryStrong, shape: const StadiumBorder()),
              child: Text(actionLabel!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Concentric soft rings around a raised icon disc, with a few accent dots.
class _Halo extends StatelessWidget {
  const _Halo({required this.icon, required this.soft, required this.strong, required this.base, this.badgeIcon});

  final IconData icon;
  final IconData? badgeIcon;
  final Color soft;
  final Color strong;
  final Color base;

  static const double _size = 156;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    Widget ring(double d, double alpha) => Container(
      width: d,
      height: d,
      decoration: BoxDecoration(shape: BoxShape.circle, color: soft.withValues(alpha: alpha)),
    );
    Widget dot(double d, Color color) => Container(
      width: d,
      height: d,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );

    return SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          ring(_size, 0.45),
          ring(_size * 0.74, 0.9),
          // Raised disc holding the glyph.
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: c.surface,
              boxShadow: [
                BoxShadow(color: base.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 8)),
              ],
            ),
            child: Icon(icon, size: 36, color: strong),
          ),
          // Scattered accents.
          Positioned(top: 14, right: 22, child: dot(10, c.highlight)),
          Positioned(top: 40, left: 6, child: dot(7, base.withValues(alpha: 0.55))),
          Positioned(bottom: 18, left: 26, child: dot(6, c.accent.withValues(alpha: 0.7))),
          Positioned(
            top: 4,
            left: 34,
            child: Icon(Icons.auto_awesome_rounded, size: 14, color: base.withValues(alpha: 0.5)),
          ),
          if (badgeIcon != null)
            Positioned(
              right: 30,
              bottom: 30,
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: strong,
                  border: Border.all(color: c.surface, width: 3),
                ),
                child: Icon(badgeIcon, size: 16, color: c.surface),
              ),
            ),
        ],
      ),
    );
  }
}
