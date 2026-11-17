import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/bc_theme.dart';
import 'qd_kit.dart';

/// Shared layout for the home tabs (QuickDrop style): a brand-blue [QdTabHeader] that
/// scrolls away with the page, then the content cards on the page background.
/// The API is unchanged so every tab picks up the new look.
class BcTabScaffold extends StatelessWidget {
  const BcTabScaffold({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.actions = const [],
    this.heroExtra,
    this.titleAccent,
    this.heroArt = false,
    this.titleBar = false,
    required this.children,
    this.onRefresh,
    this.fill,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;

  /// Extra header buttons shown before the bell.
  final List<Widget> actions;
  final Widget? heroExtra;
  final String? titleAccent;
  final bool heroArt;
  final bool titleBar;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  /// Shown centred in the space left under [children] (e.g. a [BcEmptyState]).
  final Widget? fill;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final scroll = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        SliverToBoxAdapter(
          child: QdTabHeader(
            title: titleAccent == null ? title : '$title $titleAccent',
            subtitle: subtitle,
            leading: leading,
            trailing: actions.isEmpty
                ? null
                : Row(mainAxisSize: MainAxisSize.min, children: [...actions, const SizedBox(width: 8), const QdBellButton()]),
            bottom: heroExtra,
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(10, 12, 10, fill == null ? 24 : 0),
          sliver: SliverList.list(children: children),
        ),
        if (fill != null)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 48),
              child: Center(child: fill),
            ),
          ),
      ],
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: ColoredBox(
        color: c.background,
        child: onRefresh == null ? scroll : RefreshIndicator(color: c.primary, onRefresh: onRefresh!, child: scroll),
      ),
    );
  }
}

/// Translucent round icon button for the gradient header.
class BcHeaderIconButton extends StatelessWidget {
  const BcHeaderIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.badge = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: Material(
        color: Colors.white.withValues(alpha: 0.2),
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Tooltip(
            message: tooltip,
            child: SizedBox(
              width: 40,
              height: 40,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Icon(icon, color: Colors.white, size: 20),
                  if (badge)
                    Positioned(
                      top: 9,
                      right: 10,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: context.bc.danger,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 1.2),
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

/// Section title with optional count badge and trailing caption/action.
class BcSectionHeader extends StatelessWidget {
  const BcSectionHeader({super.key, required this.title, this.count, this.trailing, this.accent, this.topGap = 24});

  final String title;
  final int? count;
  final Widget? trailing;
  final Color? accent;
  final double topGap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final a = accent ?? c.brand;
    return Padding(
      padding: EdgeInsets.only(top: topGap, bottom: 10, left: 2, right: 2),
      child: Row(
        children: [
          Text(
            title,
            style: BcType.section.copyWith(color: c.text, fontSize: 16, fontWeight: FontWeight.w700),
          ),
          if (count != null && count! > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: a.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
              child: Text(
                '$count',
                style: BcType.tiny.copyWith(color: a, fontWeight: FontWeight.w700),
              ),
            ),
          ],
          const Spacer(),
          ?trailing,
        ],
      ),
    );
  }
}

/// Grouped list card: rows separated by inset hairlines (iOS-settings style).
class BcGroupCard extends StatelessWidget {
  const BcGroupCard({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: c.border),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 20, offset: const Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, thickness: 1, indent: 72, color: c.border),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// One row in a [BcGroupCard]: tinted icon square, title/subtitle, trailing widget or chevron.
class BcListRow extends StatelessWidget {
  const BcListRow({
    super.key,
    required this.icon,
    required this.iconBg,
    required this.iconTint,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.titleColor,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconTint;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: iconTint, size: 21),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: titleColor ?? c.text),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: TextStyle(fontSize: 13, color: c.textMuted, height: 1.35)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            trailing ?? (onTap != null ? Icon(Icons.chevron_right, color: c.textMuted, size: 22) : const SizedBox()),
          ],
        ),
      ),
    );
  }
}
