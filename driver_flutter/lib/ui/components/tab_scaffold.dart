import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/bc_theme.dart';
import 'scenery.dart';

/// Shared layout for the four home tabs.
///
/// A large gradient hero (title, subtitle, optional extra content) scrolls away and a
/// compact gradient bar stays pinned, so content never slides underneath the header.
/// Body content always starts below the hero's curve — nothing overlaps it.
class BcTabScaffold extends StatefulWidget {
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
  });

  final String title;
  final String? subtitle;

  /// Shown left of the title in the hero (e.g. the driver avatar).
  final Widget? leading;
  final List<Widget> actions;

  /// Extra hero content under the subtitle (e.g. period chips).
  final Widget? heroExtra;

  /// Optional trailing title word drawn in the light-blue accent (e.g. "Stats").
  final String? titleAccent;

  /// Paints the skyline / route / rider illustration behind the hero text.
  final bool heroArt;

  /// Short white underline beneath the hero title.
  final bool titleBar;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  @override
  State<BcTabScaffold> createState() => _BcTabScaffoldState();
}

class _BcTabScaffoldState extends State<BcTabScaffold> {
  final _scroll = ScrollController();
  double _collapse = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final t = (_scroll.offset / 90).clamp(0.0, 1.0);
      if ((t - _collapse).abs() > 0.02 || (t == 1 && _collapse != 1) || (t == 0 && _collapse != 0)) {
        setState(() => _collapse = t);
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final top = MediaQuery.paddingOf(context).top;
    final barHeight = top + 56;
    final scroll = CustomScrollView(
      controller: _scroll,
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      slivers: [
        // One continuous gradient from the status bar down: the hero sits under the
        // (initially transparent) top bar, so there is no seam between the two.
        SliverToBoxAdapter(
          child: _Hero(widget: widget, topInset: barHeight),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          sliver: SliverList.list(children: widget.children),
        ),
      ],
    );
    final body = widget.onRefresh == null
        ? scroll
        : RefreshIndicator(edgeOffset: barHeight, color: c.brand, onRefresh: widget.onRefresh!, child: scroll);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: ColoredBox(
        color: c.background,
        child: Stack(
          children: [
            Positioned.fill(child: body),
            // Pinned bar: once the hero scrolls away, a compact floating header fades in using the
            // same blue gradient as the hero, with rounded bottom corners and a two-tone title.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: barHeight,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: IgnorePointer(
                      child: Opacity(
                        opacity: _collapse,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
                              stops: const [0, 0.5, 1],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
                            boxShadow: [
                              BoxShadow(
                                color: c.brand.withValues(alpha: c.isDark ? 0.18 : 0.28),
                                blurRadius: 18,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
                            child: CustomPaint(painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.07))),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 20,
                    right: 10,
                    bottom: 2,
                    height: 54,
                    child: Row(
                      children: [
                        Expanded(
                          child: Opacity(
                            opacity: _collapse,
                            child: Transform.translate(
                              offset: Offset(0, 8 * (1 - _collapse)),
                              child: Row(
                                children: [
                                  Container(
                                    width: 4,
                                    height: 18,
                                    decoration: BoxDecoration(
                                      color: c.brandLight,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Flexible(
                                    child: Text.rich(
                                      TextSpan(
                                        children: [
                                          TextSpan(text: widget.title),
                                          if (widget.titleAccent != null)
                                            TextSpan(
                                              text: ' ${widget.titleAccent}',
                                              style: TextStyle(color: c.brandLight),
                                            ),
                                        ],
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.1,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        ...widget.actions,
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.widget, required this.topInset});
  final BcTabScaffold widget;
  final double topInset;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final width = MediaQuery.sizeOf(context).width;
    final art = widget.heroArt;
    final titleStyle = BcType.title.copyWith(
      color: Colors.white,
      fontSize: art ? 28 : null,
      fontWeight: FontWeight.w800,
    );
    final title = widget.titleAccent == null
        ? Text(widget.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: titleStyle)
        // Two-tone titles stay on one line at full size; the title may run over the artwork.
        : FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '${widget.title} '),
                  TextSpan(
                    text: widget.titleAccent,
                    style: TextStyle(color: c.brandLight),
                  ),
                ],
              ),
              maxLines: 1,
              style: titleStyle,
            ),
          );
    final content = Container(
      width: double.infinity,
      // With art the title shares the top bar's row (beside the action button) to keep the hero compact.
      padding: EdgeInsets.fromLTRB(20, art ? topInset - 40 : topInset, 20, art ? 48 : 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.zero,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                if (widget.leading != null) ...[widget.leading!, const SizedBox(width: 14)],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      title,
                      if (widget.titleBar)
                        Container(
                          margin: const EdgeInsets.only(top: 6),
                          width: 44,
                          height: 4,
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99)),
                        ),
                      if (widget.subtitle != null && widget.subtitle!.trim().isNotEmpty) ...[
                        SizedBox(height: art ? 8 : 4),
                        Padding(
                          // The subtitle stays clear of the rider illustration; the title may overlap it.
                          padding: EdgeInsets.only(right: art ? width * 0.36 : 0),
                          child: Text(
                            widget.subtitle!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: BcType.caption.copyWith(color: Colors.white.withValues(alpha: 0.82), height: 1.35),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (widget.heroExtra != null) ...[SizedBox(height: art ? 20 : 16), widget.heroExtra!],
        ],
      ),
    );
    return ClipPath(
      clipper: const HeroWaveClipper(depth: 40),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [const Color(0xFF0B3EA8), c.brandDark, c.brand],
            stops: const [0, 0.45, 1],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          children: [
            Positioned.fill(child: CustomPaint(painter: HeroSwooshPainter(Colors.white.withValues(alpha: 0.08)))),
            // Art sits above the segmented control so the two never overlap.
            if (art)
              Positioned(
                left: 0,
                right: 0,
                top: topInset - 56,
                bottom: widget.heroExtra != null ? 48 + 44 + 10 : 34,
                child: HeroScenery(riderHeight: width * 0.27, riderRight: 6, riderBottom: 0),
              ),
            content,
          ],
        ),
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
        color: Colors.white.withValues(alpha: 0.14),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
                    Text(subtitle!, style: TextStyle(fontSize: 12.5, color: c.textMuted, height: 1.35)),
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
