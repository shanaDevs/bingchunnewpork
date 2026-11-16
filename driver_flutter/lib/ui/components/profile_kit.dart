import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../theme/bc_theme.dart';
import 'qd_kit.dart';

export 'empty_state.dart';

/// Shared building blocks for the Profile tab and its linked pages (QuickDrop
/// `ListItem`, `Button`, `Avatar`, `Screen`).

/// Pushed-page scaffold: white [QdAppBar] over a scrolling body on the page background.
class QdPage extends StatelessWidget {
  const QdPage({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
    this.footer,
    this.onRefresh,
    this.actions = const [],
    this.fill,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;
  final Widget? footer;
  final Future<void> Function()? onRefresh;
  final List<Widget> actions;

  /// Shown centred in the space left under [children] (e.g. a [BcEmptyState]).
  final Widget? fill;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    const physics = AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics());
    final Widget list = fill == null
        ? ListView(physics: physics, padding: const EdgeInsets.fromLTRB(10, 12, 10, 28), children: children)
        : CustomScrollView(
            physics: physics,
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(10, 12, 10, 0),
                sliver: SliverList.list(children: children),
              ),
              SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 28),
                  child: Center(child: fill),
                ),
              ),
            ],
          );
    return Scaffold(
      backgroundColor: c.background,
      body: Column(
        children: [
          QdAppBar(title: title, subtitle: subtitle, actions: actions, onBack: () => Navigator.of(context).pop()),
          Expanded(child: onRefresh == null ? list : RefreshIndicator(color: c.primary, onRefresh: onRefresh!, child: list)),
          if (footer != null)
            Container(
              padding: EdgeInsets.fromLTRB(10, 10, 10, 10 + MediaQuery.paddingOf(context).bottom),
              decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
              child: footer,
            ),
        ],
      ),
    );
  }
}

/// Card holding [QdRow]s separated by inset hairlines.
class QdGroup extends StatelessWidget {
  const QdGroup({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BcRadius.lg),
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
      ),
    );
  }
}

/// Round soft tile with an icon (QuickDrop list-item icon).
class QdIconTile extends StatelessWidget {
  const QdIconTile(this.icon, {super.key, this.size = 44, this.bg, this.tint});
  final IconData icon;
  final double size;
  final Color? bg;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: bg ?? c.primarySoft, shape: BoxShape.circle),
      child: Icon(icon, color: tint ?? c.primaryStrong, size: size * 0.5),
    );
  }
}

/// One row: icon tile, bold title, muted subtitle, trailing widget or chevron.
class QdRow extends StatelessWidget {
  const QdRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.disabled = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: InkWell(
        onTap: disabled || onTap == null
            ? null
            : () {
                BcFeedback.tap();
                onTap!();
              },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              QdIconTile(icon),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground)),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(subtitle!, style: TextStyle(fontSize: 13, color: c.mutedForeground, height: 1.35)),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 10),
                trailing!,
              ] else if (onTap != null) ...[
                const SizedBox(width: 10),
                Icon(Icons.chevron_right_rounded, color: c.iconMuted, size: 24),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum QdPillStyle { primary, outline, dangerOutline, soft }

/// Full-width pill button (QuickDrop `Button`).
class QdPillButton extends StatelessWidget {
  const QdPillButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.style = QdPillStyle.primary,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final QdPillStyle style;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final enabled = onPressed != null && !loading;
    final (Color bg, Color fg, Color? border) = switch (style) {
      QdPillStyle.primary => (c.action, c.actionForeground, null),
      QdPillStyle.soft => (c.primarySoft, c.primaryStrong, null),
      QdPillStyle.outline => (Colors.transparent, c.foreground, c.border),
      QdPillStyle.dangerOutline => (Colors.transparent, c.errorStrong, c.error),
    };
    return Opacity(
      opacity: enabled || loading ? 1 : 0.5,
      child: Material(
        color: bg,
        shape: StadiumBorder(side: border == null ? BorderSide.none : BorderSide(color: border, width: 1.5)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled
              ? () {
                  BcFeedback.tap();
                  onPressed!();
                }
              : null,
          child: SizedBox(
            height: 54,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (loading)
                  SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: fg))
                else ...[
                  if (icon != null) ...[Icon(icon, size: 20, color: fg), const SizedBox(width: 10)],
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: fg),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Round initials avatar (primarySoft background) with optional network photo.
class QdAvatar extends StatelessWidget {
  const QdAvatar({super.key, required this.name, this.photoUrl, this.size = 72});
  final String name;
  final String? photoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final initials = parts.isEmpty
        ? 'D'
        : (parts.length == 1 ? parts.first.substring(0, 1) : parts.first.substring(0, 1) + parts.last.substring(0, 1))
              .toUpperCase();
    final fallback = Center(
      child: Text(initials, style: TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w800, color: c.primaryStrong)),
    );
    final url = photoUrl?.trim();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: c.primarySoft),
      clipBehavior: Clip.antiAlias,
      child: (url == null || url.isEmpty)
          ? fallback
          : CachedNetworkImage(imageUrl: url, fit: BoxFit.cover, placeholder: (_, _) => fallback, errorWidget: (_, _, _) => fallback),
    );
  }
}

/// Round soft icon button (QuickDrop `IconButton` soft variant).
class QdSoftIconButton extends StatelessWidget {
  const QdSoftIconButton({super.key, required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: c.primarySoft,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {
            BcFeedback.tap();
            onTap();
          },
          child: SizedBox(width: 44, height: 44, child: Icon(icon, color: c.primaryStrong, size: 20)),
        ),
      ),
    );
  }
}

/// Footnote text under a card.
class QdFootnote extends StatelessWidget {
  const QdFootnote(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
    child: Text(text, style: TextStyle(fontSize: 13, color: context.bc.mutedForeground, height: 1.4)),
  );
}

String? nonBlank(String? s) => (s == null || s.trim().isEmpty) ? null : s;

/// The rider's branches: accessible stores from the profile, else home store / login data.
List<StoreRef> riderBranches(JobsController vm, AuthController auth) {
  final fromProfile = vm.profile?.accessibleStores ?? const <StoreRef>[];
  if (fromProfile.isNotEmpty) return fromProfile;
  final d = auth.driver;
  return [
    if (vm.profile?.store != null) vm.profile!.store!,
    if (d?.storeName != null) StoreRef(id: d?.storeId ?? '', name: d!.storeName!, city: d.storeCity),
  ];
}

/// Vehicle summary: type · colour · number.
String riderVehicleLine(DriverProfile? p) =>
    [nonBlank(p?.vehicleType), nonBlank(p?.vehicleColor), nonBlank(p?.vehicleNumber)].whereType<String>().join(' · ');

/// Name shown everywhere: local override, else profile, else login data.
String riderDisplayName(String? local, DriverProfile? p, AuthController auth) =>
    nonBlank(local) ?? nonBlank(p?.name) ?? nonBlank(auth.driver?.name) ?? tr('Driver');
