import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../theme/pos_theme.dart';

enum PosButtonVariant { primary, danger, outline, success, ghost }

/// Web `btn-primary` / `btn-outline` / `confirm-dialog__btn-danger` in one widget,
/// with a press scale and a loading spinner.
class PosButton extends StatefulWidget {
  const PosButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = PosButtonVariant.primary,
    this.loading = false,
    this.expand = true,
    this.height = 48,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final PosButtonVariant variant;
  final bool loading;
  final bool expand;
  final double height;

  @override
  State<PosButton> createState() => _PosButtonState();
}

class _PosButtonState extends State<PosButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final active = widget.onPressed != null && !widget.loading;
    final (Color bg, Color fg, Color? border) = switch (widget.variant) {
      PosButtonVariant.primary => (c.brand, Colors.white, null),
      PosButtonVariant.danger => (c.danger, Colors.white, null),
      PosButtonVariant.success => (PosColors.ready, Colors.white, null),
      PosButtonVariant.outline => (c.card, c.text, c.border),
      PosButtonVariant.ghost => (Colors.transparent, c.brand, null),
    };
    final radius = BorderRadius.circular(PosRadius.button);
    final content = widget.loading
        ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: fg))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[Icon(widget.icon, size: 18, color: fg), const SizedBox(width: 8)],
              Flexible(
                child: Text(
                  widget.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: PosType.button.copyWith(color: fg),
                ),
              ),
            ],
          );
    return Semantics(
      button: true,
      enabled: active,
      label: widget.label,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: PosMotion.fast,
        child: AnimatedOpacity(
          opacity: active || widget.loading ? 1 : 0.45,
          duration: PosMotion.fast,
          child: SizedBox(
            height: widget.height,
            width: widget.expand ? double.infinity : null,
            child: Material(
              color: bg,
              shape: RoundedRectangleBorder(
                borderRadius: radius,
                side: border == null ? BorderSide.none : BorderSide(color: border),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: active
                    ? () {
                        PosFeedback.tap();
                        widget.onPressed!();
                      }
                    : null,
                onHighlightChanged: (v) => setState(() => _pressed = v),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Center(child: content),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Square outlined icon button (web `btn-outline p-2.5`).
class PosIconButton extends StatelessWidget {
  const PosIconButton({super.key, required this.icon, required this.onPressed, this.tooltip, this.badge});

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;

  /// Small red count bubble in the corner (notifications).
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final button = Material(
      color: c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button),
        side: BorderSide(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed == null
            ? null
            : () {
                PosFeedback.tap();
                onPressed!();
              },
        child: SizedBox(width: 42, height: 42, child: Icon(icon, size: 19, color: c.text)),
      ),
    );
    final withBadge = (badge ?? 0) <= 0
        ? button
        : Stack(
            clipBehavior: Clip.none,
            children: [
              button,
              Positioned(
                right: -4,
                top: -4,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 18),
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(color: c.danger, borderRadius: BorderRadius.circular(PosRadius.pill)),
                  child: Text(
                    badge! > 99 ? '99+' : '$badge',
                    textAlign: TextAlign.center,
                    style: PosType.label.copyWith(color: Colors.white, letterSpacing: 0, fontSize: 10),
                  ),
                ),
              ),
            ],
          );
    return tooltip == null ? withBadge : Tooltip(message: tooltip!, child: withBadge);
  }
}
