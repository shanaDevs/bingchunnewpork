import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';

/// Colour family for a dialog's icon badge and primary button.
enum BcDialogTone { brand, danger, warning, success }

extension on BcDialogTone {
  Color color(BcColors c) => switch (this) {
    BcDialogTone.brand => c.brand,
    BcDialogTone.danger => c.isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
    BcDialogTone.warning => c.warning,
    BcDialogTone.success => c.success,
  };

  List<Color> gradient(BcColors c) => switch (this) {
    BcDialogTone.brand => [c.brandLight, c.brand, c.brandDark],
    BcDialogTone.danger => const [Color(0xFFF87171), Color(0xFFDC2626), Color(0xFFB91C1C)],
    BcDialogTone.warning => const [Color(0xFFFBBF24), Color(0xFFF59E0B), Color(0xFFD97706)],
    BcDialogTone.success => const [Color(0xFF34D399), Color(0xFF10B981), Color(0xFF059669)],
  };
}

/// Opens [builder] as a centred dialog with a soft scale + fade entrance.
Future<T?> showBcDialog<T>(BuildContext context, {required WidgetBuilder builder, bool barrierDismissible = true}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: const Color(0x8C0A1530),
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (ctx, _, _) => builder(ctx),
    transitionBuilder: (_, anim, _, child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutBack, reverseCurve: Curves.easeIn);
      return FadeTransition(
        opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
        child: ScaleTransition(scale: Tween(begin: 0.9, end: 1.0).animate(curved), child: child),
      );
    },
  );
}

/// Reusable dialog surface: toned icon badge, centred title/message, optional custom
/// [content], and full-width actions (primary on top, secondary below).
class BcDialog extends StatelessWidget {
  const BcDialog({
    super.key,
    required this.title,
    this.message,
    this.icon,
    this.tone = BcDialogTone.brand,
    this.content,
    this.primaryLabel,
    this.onPrimary,
    this.primaryEnabled = true,
    this.primaryLoading = false,
    this.primaryIcon,
    this.secondaryLabel,
    this.onSecondary,
    this.extraActions = const [],
    this.showClose = false,
    this.maxWidth = 400,
  });

  final String title;
  final String? message;
  final IconData? icon;
  final BcDialogTone tone;
  final Widget? content;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final bool primaryEnabled;
  final bool primaryLoading;
  final IconData? primaryIcon;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  /// Additional low-emphasis text actions shown under the buttons (e.g. "Reset").
  final List<Widget> extraActions;
  final bool showClose;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final accent = tone.color(c);
    final mq = MediaQuery.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 24, 20, 24 + mq.viewInsets.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: mq.size.height * 0.88),
          child: Material(
            color: c.card,
            elevation: 0,
            borderRadius: BorderRadius.circular(28),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                // Soft tinted wash behind the badge.
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 96,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          accent.withValues(alpha: c.isDark ? 0.16 : 0.10),
                          accent.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ),
                SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (icon != null) ...[
                        Center(
                          child: BcDialogBadge(icon: icon!, color: accent),
                        ),
                        const SizedBox(height: 16),
                      ],
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text, height: 1.25),
                      ),
                      if (message != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          message!,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 14, color: c.textMuted, height: 1.45),
                        ),
                      ],
                      if (content != null) ...[const SizedBox(height: 16), content!],
                      if (primaryLabel != null) ...[
                        const SizedBox(height: 22),
                        BcDialogButton(
                          label: primaryLabel!,
                          onPressed: onPrimary,
                          tone: tone,
                          enabled: primaryEnabled,
                          loading: primaryLoading,
                          icon: primaryIcon,
                        ),
                      ],
                      if (secondaryLabel != null) ...[
                        const SizedBox(height: 10),
                        BcDialogButton(label: secondaryLabel!, onPressed: onSecondary, secondary: true),
                      ],
                      if (extraActions.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Row(mainAxisAlignment: MainAxisAlignment.center, children: extraActions),
                      ],
                    ],
                  ),
                ),
                if (showClose)
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Material(
                      color: c.card,
                      shape: CircleBorder(side: BorderSide(color: c.border)),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => Navigator.of(context).maybePop(),
                        child: Tooltip(
                          message: tr('Close'),
                          child: SizedBox(
                            width: 36,
                            height: 36,
                            child: Icon(Icons.close_rounded, color: c.textMuted, size: 19),
                          ),
                        ),
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

/// Circular icon badge with a halo ring.
class BcDialogBadge extends StatelessWidget {
  const BcDialogBadge({super.key, required this.icon, required this.color, this.size = 64});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size + 16,
      height: size + 16,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.10)),
      alignment: Alignment.center,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: 0.16),
          border: Border.all(color: color.withValues(alpha: 0.25), width: 1.5),
        ),
        child: Icon(icon, color: color, size: size * 0.48),
      ),
    );
  }
}

/// Full-width dialog button: gradient primary in the dialog's tone, or a quiet outlined secondary.
class BcDialogButton extends StatelessWidget {
  const BcDialogButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.tone = BcDialogTone.brand,
    this.secondary = false,
    this.enabled = true,
    this.loading = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final BcDialogTone tone;
  final bool secondary;
  final bool enabled;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final radius = BorderRadius.circular(BcRadius.button + 2);
    final grad = tone.gradient(c);
    final fg = secondary ? c.text : Colors.white;
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.5,
      child: Container(
        height: 50,
        decoration: BoxDecoration(
          borderRadius: radius,
          color: secondary ? c.card : null,
          gradient: secondary ? null : LinearGradient(colors: grad),
          border: secondary ? Border.all(color: c.border, width: 1.2) : null,
          boxShadow: !secondary && active
              ? [BoxShadow(color: grad[1].withValues(alpha: 0.30), blurRadius: 14, offset: const Offset(0, 6))]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: active ? onPressed : null,
            child: Center(
              child: loading
                  ? SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: fg))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[Icon(icon, color: fg, size: 19), const SizedBox(width: 8)],
                        Text(
                          label,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: fg),
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

/// Standard confirmation. Returns true only when the primary button is pressed;
/// closing (×, back, tap outside) returns false.
Future<bool> showBcConfirm(
  BuildContext context, {
  required String title,
  String? message,
  required String confirmLabel,
  String? cancelLabel,
  IconData icon = Icons.help_outline_rounded,
  IconData? confirmIcon,
  BcDialogTone tone = BcDialogTone.brand,
  Widget? content,
}) async {
  final result = await showBcDialog<bool>(
    context,
    builder: (ctx) => BcDialog(
      icon: icon,
      tone: tone,
      title: title,
      message: message,
      content: content,
      primaryLabel: confirmLabel,
      primaryIcon: confirmIcon,
      onPrimary: () => Navigator.of(ctx).pop(true),
      // No cancel label → just a close (×) in the corner; a label adds a second button
      // for choices worth spelling out (e.g. "Stay on duty").
      showClose: cancelLabel == null,
      secondaryLabel: cancelLabel,
      onSecondary: cancelLabel == null ? null : () => Navigator.of(ctx).pop(false),
    ),
  );
  return result ?? false;
}

/// Selectable option card used inside dialogs (radio-style choice list).
class BcChoiceTile extends StatelessWidget {
  const BcChoiceTile({super.key, required this.label, required this.selected, required this.onTap, this.tone});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final BcDialogTone? tone;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final accent = (tone ?? BcDialogTone.brand).color(c);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        selected: selected,
        button: true,
        child: Material(
          color: selected ? accent.withValues(alpha: 0.08) : c.card,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: selected ? accent : c.border, width: selected ? 1.5 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: c.text,
                      ),
                    ),
                  ),
                  AnimatedSwitcher(
                    duration: BcMotion.fast,
                    child: Icon(
                      selected ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                      key: ValueKey(selected),
                      color: selected ? accent : c.border,
                      size: 22,
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
