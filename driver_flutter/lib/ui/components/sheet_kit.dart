import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Shared look for the profile-tab bottom sheets: rounded top, drag handle,
/// tinted icon header, and soft grouped cards.
Future<T?> showBcSheet<T>(BuildContext context, {required WidgetBuilder builder, bool dismissible = true}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    isDismissible: dismissible,
    enableDrag: dismissible,
    backgroundColor: context.bc.elevated,
    barrierColor: context.bc.scrim.withValues(alpha: 0.5),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    clipBehavior: Clip.antiAlias,
    builder: builder,
  );
}

/// Scrollable sheet body: handle, [header], then [children] with keyboard-aware padding.
class BcSheetBody extends StatelessWidget {
  const BcSheetBody({super.key, required this.header, required this.children, this.maxHeightFactor = 0.92});

  final Widget header;
  final List<Widget> children;
  final double maxHeightFactor;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final mq = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: mq.size.height * maxHeightFactor),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 10, bottom: 4),
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(99)),
              ),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(10, 8, 10, 10), child: header),
            Flexible(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(10, 4, 10, 14 + mq.padding.bottom),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// QuickDrop sheet header: centred title (+ subtitle). A round close button sits at the
/// right edge only when [onClose] is given. The icon parameters are kept for callers but
/// no longer drawn, matching the reference's plain centred titles.
class BcSheetHeader extends StatelessWidget {
  const BcSheetHeader({
    super.key,
    this.icon,
    this.leading,
    this.iconBg,
    this.iconTint,
    required this.title,
    this.subtitle,
    this.onClose,
  });

  final IconData? icon;
  final Widget? leading;
  final Color? iconBg;
  final Color? iconTint;
  final String title;
  final String? subtitle;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final hasClose = onClose != null;
    return Stack(
      alignment: Alignment.center,
      children: [
        Padding(
          // Keep the centred text clear of the close button on both sides.
          padding: const EdgeInsets.symmetric(horizontal: 44),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                textAlign: TextAlign.center,
                style: BcType.subtitle.copyWith(color: c.foreground),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.4),
                ),
              ],
            ],
          ),
        ),
        if (hasClose)
          Positioned(
            right: 0,
            child: Material(
              color: c.muted,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onClose,
                child: Tooltip(
                  message: tr('Close'),
                  child: SizedBox(width: 36, height: 36, child: Icon(Icons.close_rounded, color: c.mutedForeground, size: 20)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Small uppercase-ish section label inside a sheet.
class BcSheetLabel extends StatelessWidget {
  const BcSheetLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: BcType.section.copyWith(color: c.foreground, fontSize: 15),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// White rounded card used to group sheet content.
class BcSheetCard extends StatelessWidget {
  const BcSheetCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.color,
    this.borderColor,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surface,
        borderRadius: BorderRadius.circular(BcRadius.md + 2),
        border: Border.all(color: borderColor ?? c.border),
      ),
      child: child,
    );
  }
}

/// Status chip: green "done" or amber "action needed".
class BcStatusChip extends StatelessWidget {
  const BcStatusChip({super.key, required this.ok, required this.label});
  final bool ok;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final color = ok ? c.success : c.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(ok ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
          ),
        ],
      ),
    );
  }
}

/// Full-width solid pill primary button used in sheets (c.action fill).
class BcGradientButton extends StatelessWidget {
  const BcGradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.icon,
    this.colors,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool enabled;
  final IconData? icon;

  /// Optional override; the first colour is used as the solid fill.
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final bg = colors?.first ?? c.action;
    final fg = colors == null ? c.actionForeground : c.onBrand;
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.5,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(BcRadius.full),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: active ? onPressed : null,
          child: SizedBox(
            height: 52,
            child: Center(
              child: loading
                  ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: fg))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[Icon(icon, color: fg, size: 19), const SizedBox(width: 8)],
                        Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: fg)),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// QuickDrop SlideToConfirm: pill track, draggable white knob with double chevrons, a
/// lighter fill trailing the knob, and a label that fades as the knob slides over it.
/// Calls [onConfirm] once the knob is dragged past ~85% of the track, then snaps back.
/// Pass [color] / [foreground] for a coloured variant (e.g. the red pickup slide); when
/// disabled it greys out like the QuickDrop slider.
class BcSlideToConfirm extends StatefulWidget {
  const BcSlideToConfirm({
    super.key,
    required this.label,
    required this.onConfirm,
    this.enabled = true,
    this.loading = false,
    this.color,
    this.foreground,
  });

  final String label;
  final VoidCallback onConfirm;
  final bool enabled;
  final bool loading;

  /// Track colour; defaults to the primary action colour.
  final Color? color;

  /// Label colour on the track; defaults to the matching "on" colour.
  final Color? foreground;

  @override
  State<BcSlideToConfirm> createState() => _BcSlideToConfirmState();
}

class _BcSlideToConfirmState extends State<BcSlideToConfirm> {
  static const double _h = 64;
  static const double _pad = 6;
  static const double _knob = _h - _pad * 2;
  double _x = 0;
  bool _drag = false;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final greyed = !widget.enabled;
    final track = greyed ? c.muted : (widget.color ?? c.action);
    final fg = greyed ? c.mutedForeground : (widget.foreground ?? (widget.color == null ? c.actionForeground : c.onBrand));
    final knobFill = greyed ? c.surface : Colors.white;
    final knobIcon = greyed ? c.mutedForeground : (widget.color ?? c.action);
    final on = widget.enabled && !widget.loading;
    return LayoutBuilder(
      builder: (context, box) {
        final max = (box.maxWidth - _knob - _pad * 2).clamp(1.0, double.infinity);
        final progress = (_x / max).clamp(0.0, 1.0);
        return Container(
          height: _h,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: track, borderRadius: BorderRadius.circular(BcRadius.full)),
          child: Stack(
            alignment: Alignment.centerLeft,
            children: [
              if (on)
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: _x + _knob + _pad * 2,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(BcRadius.full),
                    ),
                  ),
                ),
              Center(
                child: Opacity(
                  opacity: (1 - progress * 1.4).clamp(0.0, 1.0),
                  child: widget.loading
                      ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: fg))
                      : Padding(
                          padding: const EdgeInsets.only(left: _knob + _pad),
                          child: Text(
                            widget.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: fg),
                          ),
                        ),
                ),
              ),
              Positioned(
                left: _pad + _x,
                child: GestureDetector(
                  onHorizontalDragStart: on ? (_) => setState(() => _drag = true) : null,
                  onHorizontalDragUpdate: on ? (d) => setState(() => _x = (_x + d.delta.dx).clamp(0.0, max)) : null,
                  onHorizontalDragEnd: on
                      ? (_) {
                          final done = _x >= max * 0.85;
                          setState(() {
                            _drag = false;
                            _x = 0;
                          });
                          if (done) widget.onConfirm();
                        }
                      : null,
                  child: AnimatedContainer(
                    duration: _drag ? Duration.zero : BcMotion.standard,
                    width: _knob,
                    height: _knob,
                    decoration: BoxDecoration(color: knobFill, shape: BoxShape.circle),
                    child: Icon(Icons.keyboard_double_arrow_right_rounded, color: knobIcon, size: 26),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
