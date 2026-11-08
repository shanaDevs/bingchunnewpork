import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Row of PIN dots that fill as digits are typed and shake when [errorTick] changes.
class PinDots extends StatefulWidget {
  const PinDots({
    super.key,
    required this.length,
    required this.filled,
    this.errorTick = 0,
    this.onDark = false,
    this.boxed = false,
    this.error = false,
  });

  final int length;
  final int filled;

  /// Bump to play the wrong-PIN shake.
  final int errorTick;
  final bool onDark;

  /// Rounded-square boxes (QuickDrop OTP input) instead of bare circles.
  final bool boxed;

  /// Outline the boxes in the error colour.
  final bool error;

  @override
  State<PinDots> createState() => _PinDotsState();
}

class _PinDotsState extends State<PinDots> with SingleTickerProviderStateMixin {
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));

  @override
  void didUpdateWidget(PinDots old) {
    super.didUpdateWidget(old);
    if (widget.errorTick != old.errorTick) _shake.forward(from: 0);
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final on = widget.onDark ? Colors.white : c.action;
    final off = widget.onDark ? Colors.white.withValues(alpha: 0.35) : c.border;
    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) {
        final t = _shake.value;
        final dx = math.sin(t * math.pi * 6) * 12 * (1 - t);
        return Transform.translate(offset: Offset(dx, 0), child: child);
      },
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (widget.boxed)
            for (var i = 0; i < widget.length; i++)
              AnimatedContainer(
                duration: BcMotion.fast,
                margin: const EdgeInsets.symmetric(horizontal: 6),
                width: 56,
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: c.surface,
                  borderRadius: BorderRadius.circular(BcRadius.md),
                  border: Border.all(
                    color: widget.error
                        ? c.error
                        : i == widget.filled
                        ? c.primary
                        : (i < widget.filled ? on : c.border),
                    width: i == widget.filled || widget.error ? 2 : 1.5,
                  ),
                ),
                child: i < widget.filled
                    ? Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: c.foreground),
                      )
                    : null,
              )
          else
            for (var i = 0; i < widget.length; i++)
              AnimatedContainer(
                duration: BcMotion.fast,
                margin: const EdgeInsets.symmetric(horizontal: 10),
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: i < widget.filled ? on : Colors.transparent,
                  border: Border.all(color: i < widget.filled ? on : off, width: 2),
                ),
              ),
        ],
      ),
    );
  }
}

/// 3×4 number pad. [leading] fills the bottom-left slot (e.g. a fingerprint key).
class PinKeypad extends StatelessWidget {
  const PinKeypad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.leading,
    this.enabled = true,
    this.onDark = false,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final Widget? leading;
  final bool enabled;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fg = onDark ? Colors.white : c.text;
    final bg = onDark ? Colors.white.withValues(alpha: 0.12) : c.surface;

    Widget key(String d) => _Key(
      enabled: enabled,
      background: bg,
      semanticLabel: d,
      onTap: () {
        HapticFeedback.selectionClick();
        onDigit(d);
      },
      child: Text(
        d,
        style: TextStyle(fontFamily: BcFonts.heading, fontSize: 26, fontWeight: FontWeight.w700, color: fg),
      ),
    );

    Widget row(List<Widget> keys) =>
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [for (final k in keys) k]);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        row([key('1'), key('2'), key('3')]),
        const SizedBox(height: 14),
        row([key('4'), key('5'), key('6')]),
        const SizedBox(height: 14),
        row([key('7'), key('8'), key('9')]),
        const SizedBox(height: 14),
        row([
          SizedBox(width: _Key.size, height: _Key.size, child: leading),
          key('0'),
          _Key(
            enabled: enabled,
            semanticLabel: tr('Delete'),
            onTap: () {
              BcFeedback.tap();
              onBackspace();
            },
            child: Icon(Icons.backspace_outlined, color: fg, size: 24),
          ),
        ]),
      ],
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({
    required this.child,
    required this.onTap,
    required this.enabled,
    required this.semanticLabel,
    this.background,
  });

  static const double size = 74;

  final Widget child;
  final VoidCallback onTap;
  final bool enabled;
  final String semanticLabel;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semanticLabel,
      child: SizedBox(
        width: size,
        height: size,
        child: Material(
          color: background ?? Colors.transparent,
          shape: CircleBorder(side: background == null ? BorderSide.none : BorderSide(color: context.bc.border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onTap : null,
            child: Center(child: child),
          ),
        ),
      ),
    );
  }
}
