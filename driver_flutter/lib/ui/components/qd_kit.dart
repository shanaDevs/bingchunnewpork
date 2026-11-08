import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/inbox.dart';
import '../../l10n/l10n.dart';
import '../screens/inbox_screens.dart';
import '../theme/bc_theme.dart';

/// Shared QuickDrop building blocks (ports of `BrandHeaderBackground`, `TabHeader`,
/// `Card`, `Badge`, `AvailabilityControl`, `NotificationButton`). New and redesigned
/// screens should be built from these.

extension QdInk on BcColors {
  /// Title ink on the brand header: navy on the bright light blue, white on the dark blue.
  Color get heroTitle => isDark ? const Color(0xFFF8FAFC) : const Color(0xFF061A40);
  Color get heroSubtitle => isDark ? const Color(0xFFDCE9FF) : const Color(0xFF0B2559);
}

/// Brand-blue header surface with rounded bottom corners, a soft ring and glows.
class QdBrandHeader extends StatelessWidget {
  const QdBrandHeader({super.key, required this.child, this.tall = false, this.padding, this.rounded = true});

  final Widget child;
  final bool tall;
  final bool rounded;

  /// Defaults to status-bar inset + 8 at the top, 20 at the sides/bottom.
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final top = MediaQuery.paddingOf(context).top;
    final radius = rounded ? const BorderRadius.vertical(bottom: Radius.circular(BcRadius.xxl)) : BorderRadius.zero;
    final glowA = c.isDark ? const Color(0x2E2997FF) : const Color(0x5938BDF8);
    final glowB = c.isDark ? const Color(0x293B9CFF) : const Color(0x5993C5FD);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          colors: c.brandGradient,
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          children: [
            Positioned(
              top: -110,
              right: -100,
              child: IgnorePointer(
                child: Container(
                  width: 260,
                  height: 260,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: c.isDark ? 0.06 : 0.08), width: 40),
                  ),
                ),
              ),
            ),
            Positioned(
              top: top + 10,
              left: -30,
              child: IgnorePointer(
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: glowA,
                    boxShadow: [BoxShadow(color: glowA, blurRadius: 60, spreadRadius: 20)],
                  ),
                ),
              ),
            ),
            if (tall)
              Positioned(
                top: top + 110,
                right: -20,
                child: IgnorePointer(
                  child: Container(
                    width: 140,
                    height: 140,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: glowB,
                      boxShadow: [BoxShadow(color: glowB, blurRadius: 70, spreadRadius: 25)],
                    ),
                  ),
                ),
              ),
            Padding(
              padding: padding ?? EdgeInsets.fromLTRB(16, top + 6, 16, 12),
              child: child,
            ),
          ],
        ),
      ),
    );
  }
}

/// Frosted round bell button with an unread dot; opens the notification inbox.
class QdBellButton extends StatelessWidget {
  const QdBellButton({super.key});

  @override
  Widget build(BuildContext context) {
    final inbox = NotificationInbox.instance;
    return ListenableBuilder(
      listenable: inbox,
      builder: (context, _) => Semantics(
        button: true,
        label: tr('Notifications'),
        child: GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()));
          },
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.2),
              border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 22),
                if (inbox.unread > 0)
                  Positioned(
                    top: 10,
                    right: 11,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: context.bc.accent,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
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

/// QuickDrop tab header: brand surface, big ink title, bell. Scrolls with the page.
class QdTabHeader extends StatelessWidget {
  const QdTabHeader({super.key, required this.title, this.subtitle, this.leading, this.trailing, this.bottom});

  final String title;
  final String? subtitle;
  final Widget? leading;

  /// Replaces the bell when set.
  final Widget? trailing;

  /// Extra content below the title row (segmented control, chips ...).
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdBrandHeader(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Row(
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 12)],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: BcType.displayHero.copyWith(color: c.heroTitle, fontSize: 26, height: 32 / 26),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                trailing ?? const QdBellButton(),
              ],
            ),
          ),
          if (bottom != null) ...[const SizedBox(height: 4), bottom!],
        ],
      ),
    );
  }
}

enum QdTone { neutral, primary, accent, success, warning, error }

/// Compact status pill (soft or solid), with optional dot and icon.
class QdBadge extends StatelessWidget {
  const QdBadge(this.label, {super.key, this.tone = QdTone.neutral, this.solid = false, this.dot = false, this.icon});

  final String label;
  final QdTone tone;
  final bool solid;
  final bool dot;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final (soft, strong, fill, onFill) = switch (tone) {
      QdTone.neutral => (c.muted, c.mutedForeground, c.mutedForeground, c.surface),
      QdTone.primary => (c.primarySoft, c.primaryStrong, c.primary, c.primaryForeground),
      QdTone.accent => (c.accentSoft, c.accentStrong, c.inverse, c.accent),
      QdTone.success => (c.successSoft, c.successStrong, c.success, c.successForeground),
      QdTone.warning => (c.warningSoft, c.warningStrong, c.warning, c.warningForeground),
      QdTone.error => (c.errorSoftBg, c.errorStrong, c.error, c.errorForeground),
    };
    final fg = solid ? onFill : strong;
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: solid ? fill : soft, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(width: 6, height: 6, decoration: BoxDecoration(color: solid ? Colors.white : fill, shape: BoxShape.circle)),
            const SizedBox(width: 6),
          ] else if (icon != null) ...[
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 5),
          ],
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
        ],
      ),
    );
  }
}

/// QuickDrop card: surface, 20 radius, soft ring + shadow (light) or lifted surface (dark).
class QdCard extends StatelessWidget {
  const QdCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.onTap,
    this.muted = false,
    this.outlined = false,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  /// Recessed fill for grouping inside other surfaces.
  final bool muted;
  final bool outlined;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final radius = BorderRadius.circular(BcRadius.lg);
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? (muted ? c.muted : c.surface),
        borderRadius: radius,
        border: (outlined || c.isDark) && !muted ? Border.all(color: c.border) : null,
        boxShadow: muted || outlined ? null : bcShadow(c),
      ),
      child: child,
    );
    if (onTap == null) return box;
    return Material(
      color: Colors.transparent,
      borderRadius: radius,
      child: InkWell(borderRadius: radius, onTap: onTap, child: box),
    );
  }
}

/// Section title row: bold heading, optional trailing link ("View all >").
class QdSectionTitle extends StatelessWidget {
  const QdSectionTitle(this.title, {super.key, this.actionLabel, this.onAction, this.topGap = 20});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final double topGap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: EdgeInsets.only(top: topGap, bottom: 10, left: 2, right: 2),
      child: Row(
        children: [
          Expanded(child: Text(title, style: BcType.section.copyWith(color: c.foreground))),
          if (actionLabel != null)
            GestureDetector(
              onTap: onAction,
              behavior: HitTestBehavior.opaque,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(actionLabel!, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.primaryStrong)),
                  Icon(Icons.chevron_right_rounded, size: 18, color: c.primaryStrong),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Slide-to-go-online switch (QuickDrop `AvailabilityControl`): knob left on a grey track
/// when offline, right on a yellow track when online. The slide itself is the confirmation.
class QdSlideToggle extends StatefulWidget {
  const QdSlideToggle({
    super.key,
    required this.online,
    required this.onGoOnline,
    required this.onGoOffline,
    this.enabled = true,
    this.busy = false,
    this.offlineLabel,
    this.onlineLabel,
  });

  final bool online;
  final bool enabled;
  final bool busy;
  final VoidCallback onGoOnline;
  final VoidCallback onGoOffline;
  final String? offlineLabel;
  final String? onlineLabel;

  @override
  State<QdSlideToggle> createState() => _QdSlideToggleState();
}

class _QdSlideToggleState extends State<QdSlideToggle> {
  static const _h = 60.0;
  static const _pad = 5.0;
  static const _knob = _h - _pad * 2;
  double? _drag; // 0..1 while dragging

  double get _rest => widget.online ? 1 : 0;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final offTrack = c.isDark ? const Color(0xFF0B1D36) : const Color(0xFFE4E7EC);
    final offKnob = c.isDark ? const Color(0xFF8FA5C4) : const Color(0xFFB9C0CC);
    final offText = c.isDark ? const Color(0xFFA9BFDE) : const Color(0xFF475467);
    return LayoutBuilder(
      builder: (context, box) {
        final max = (box.maxWidth - _knob - _pad * 2).clamp(1.0, 9999.0);
        final p = _drag ?? _rest;
        final track = Color.lerp(offTrack, c.online, p)!;
        final knobColor = Color.lerp(offKnob, c.onlineKnob, p)!;
        void finish() {
          final v = _drag ?? _rest;
          setState(() => _drag = null);
          if (!widget.online && v >= 0.55) {
            HapticFeedback.mediumImpact();
            widget.onGoOnline();
          } else if (widget.online && v <= 0.45) {
            HapticFeedback.lightImpact();
            widget.onGoOffline();
          }
        }

        return Semantics(
          toggled: widget.online,
          label: tr('Availability'),
          onTap: widget.enabled ? (widget.online ? widget.onGoOffline : widget.onGoOnline) : null,
          child: Opacity(
            opacity: widget.enabled ? 1 : 0.6,
            child: GestureDetector(
              onHorizontalDragUpdate: widget.enabled && !widget.busy
                  ? (d) => setState(() => _drag = ((_drag ?? _rest) + d.delta.dx / max).clamp(0.0, 1.0))
                  : null,
              onHorizontalDragEnd: widget.enabled && !widget.busy ? (_) => finish() : null,
              child: Container(
                height: _h,
                decoration: BoxDecoration(color: track, borderRadius: BorderRadius.circular(_h / 2)),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: Opacity(
                        opacity: (1 - p * 2).clamp(0.0, 1.0),
                        child: Padding(
                          padding: const EdgeInsets.only(left: _knob + _pad * 2, right: 16),
                          child: Center(
                            child: Text(
                              widget.offlineLabel ?? tr('Slide to go online'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: offText),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Opacity(
                        opacity: ((p - 0.5) * 2).clamp(0.0, 1.0),
                        child: Padding(
                          padding: const EdgeInsets.only(left: 16, right: _knob + _pad * 2),
                          child: Center(
                            child: Text(
                              widget.onlineLabel ?? tr("You're online"),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: c.onlineForeground),
                            ),
                          ),
                        ),
                      ),
                    ),
                    AnimatedPositioned(
                      duration: _drag == null ? BcMotion.standard : Duration.zero,
                      curve: Curves.easeOutCubic,
                      left: _pad + max * p,
                      top: _pad,
                      child: Container(
                        width: _knob,
                        height: _knob,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: knobColor,
                          boxShadow: const [BoxShadow(color: Color(0x2E101828), blurRadius: 8, offset: Offset(0, 2))],
                        ),
                        child: widget.busy
                            ? const Padding(
                                padding: EdgeInsets.all(15),
                                child: CircularProgressIndicator(strokeWidth: 2.5, color: Color(0xFF101828)),
                              )
                            : Icon(
                                widget.online ? Icons.keyboard_double_arrow_left_rounded : Icons.keyboard_double_arrow_right_rounded,
                                color: const Color(0xFF101828),
                                size: 26,
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// QuickDrop bottom navigation: docked surface bar with rounded top corners, a short blue
/// indicator on the edge above the active tab, filled icon + bold blue label when active.
class QdTabBar extends StatelessWidget {
  const QdTabBar({super.key, required this.current, required this.onSelect, required this.items, this.badges = const {}});

  final int current;
  final ValueChanged<int> onSelect;

  /// (label, outlined icon, filled icon)
  final List<(String, IconData, IconData)> items;

  /// Tab index → badge count.
  final Map<int, int> badges;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, bottom < 8 ? 8 : bottom),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(BcRadius.xl)),
        border: Border(
          top: BorderSide(color: c.border),
          left: BorderSide(color: c.border),
          right: BorderSide(color: c.border),
        ),
        boxShadow: [
          BoxShadow(
            color: c.isDark ? const Color(0x80020814) : const Color(0x1F101828),
            blurRadius: 28,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth / items.length;
          return Stack(
            clipBehavior: Clip.none,
            children: [
              AnimatedPositioned(
                duration: BcMotion.standard,
                curve: Curves.easeOutCubic,
                top: -11,
                left: current * w + (w - 32) / 2,
                child: Container(
                  width: 32,
                  height: 4,
                  decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(99)),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < items.length; i++)
                    Expanded(
                      child: Semantics(
                        button: true,
                        selected: i == current,
                        label: tr(items[i].$1),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => onSelect(i),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 56,
                                  height: 32,
                                  child: Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      Icon(
                                        i == current ? items[i].$3 : items[i].$2,
                                        size: 24,
                                        color: i == current ? c.primary : c.iconMuted,
                                      ),
                                      if ((badges[i] ?? 0) > 0)
                                        Positioned(
                                          top: 0,
                                          right: 6,
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                            decoration: BoxDecoration(color: c.error, borderRadius: BorderRadius.circular(99)),
                                            child: Text('${badges[i]}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: c.errorForeground)),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                Text(
                                  tr(items[i].$1),
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: i == current ? FontWeight.w800 : FontWeight.w600,
                                    color: i == current ? c.primaryStrong : c.iconMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Round "<" back button (QuickDrop `BackButton`): `soft` on surface bars, `glass` on blue.
class QdBackButton extends StatelessWidget {
  const QdBackButton({super.key, this.onTap, this.glass = false});

  final VoidCallback? onTap;
  final bool glass;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      label: tr('Back'),
      child: GestureDetector(
        onTap: onTap ?? () => Navigator.of(context).maybePop(),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: glass ? Colors.white.withValues(alpha: 0.2) : c.primarySoft,
            border: glass ? Border.all(color: Colors.white.withValues(alpha: 0.28)) : null,
          ),
          child: Icon(Icons.chevron_left_rounded, size: 30, color: glass ? Colors.white : c.primaryStrong),
        ),
      ),
    );
  }
}

/// QuickDrop pushed-screen app bar (`AppHeader`): surface bar with a hairline and soft
/// shadow, soft round back button on the left, centred title (+ subtitle), actions on the
/// right. Use as the first child of a Column above an Expanded body.
class QdAppBar extends StatelessWidget {
  const QdAppBar({super.key, required this.title, this.subtitle, this.onBack, this.actions = const [], this.trailing, this.bottom});

  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final List<Widget> actions;
  final Widget? trailing;

  /// Optional extra row under the title (stepper, tabs ...).
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      padding: EdgeInsets.only(top: top),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(bottom: BorderSide(color: c.border)),
        boxShadow: bcShadow(c),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  SizedBox(width: 56, child: Align(alignment: Alignment.centerLeft, child: QdBackButton(onTap: onBack))),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: BcType.subtitle.copyWith(color: c.foreground, fontSize: 22, height: 30 / 22),
                          ),
                          if (subtitle != null && subtitle!.trim().isNotEmpty)
                            Text(
                              subtitle!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: c.mutedForeground),
                            ),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 56,
                    child: Row(mainAxisAlignment: MainAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [...actions, ?trailing]),
                  ),
                ],
              ),
            ),
          ),
          ?bottom,
        ],
      ),
    );
  }
}
