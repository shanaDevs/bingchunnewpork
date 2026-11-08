import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/bc_theme.dart';

/// Colour family for a dialog's icon badge and primary button.
/// [call] is the solid call green used by every call action.
enum BcDialogTone { brand, danger, warning, success, call }

extension on BcDialogTone {
  Color color(BcColors c) => switch (this) {
    BcDialogTone.brand => c.primary,
    BcDialogTone.danger => c.error,
    BcDialogTone.warning => c.warning,
    BcDialogTone.success => c.success,
    BcDialogTone.call => c.call,
  };

  Color fill(BcColors c) => switch (this) {
    BcDialogTone.brand => c.action,
    BcDialogTone.danger => c.error,
    BcDialogTone.warning => c.warning,
    BcDialogTone.success => c.success,
    BcDialogTone.call => c.call,
  };
}

/// Opens [builder] as a centred dialog with a soft scale + fade entrance.
Future<T?> showBcDialog<T>(BuildContext context, {required WidgetBuilder builder, bool barrierDismissible = true}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: context.bc.scrim.withValues(alpha: 0.55),
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
    this.sideBySide = false,
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

  /// QuickDrop confirm layout: Cancel (outline) and the action side by side.
  final bool sideBySide;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final accent = tone.color(c);
    final mq = MediaQuery.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 20, 16, 20 + mq.viewInsets.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: mq.size.height * 0.88),
          child: Material(
            color: c.elevated,
            elevation: 0,
            borderRadius: BorderRadius.circular(BcRadius.xxl),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                SingleChildScrollView(
                  padding: EdgeInsets.all(sideBySide ? 24 : 18).copyWith(top: sideBySide ? 24 : 22, bottom: sideBySide ? 24 : 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (icon != null) ...[
                        Center(
                          child: BcDialogBadge(icon: icon!, color: accent, size: sideBySide ? 56 : 64),
                        ),
                        SizedBox(height: sideBySide ? 12 : 16),
                      ],
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
                          style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.45),
                        ),
                      ],
                      if (content != null) ...[const SizedBox(height: 16), content!],
                      if (sideBySide && primaryLabel != null) ...[
                        const SizedBox(height: 20),
                        Row(
                          children: [
                            if (secondaryLabel != null) ...[
                              Expanded(child: BcDialogButton(label: secondaryLabel!, onPressed: onSecondary, secondary: true)),
                              const SizedBox(width: 12),
                            ],
                            Expanded(
                              child: BcDialogButton(
                                label: primaryLabel!,
                                onPressed: onPrimary,
                                tone: tone,
                                enabled: primaryEnabled,
                                loading: primaryLoading,
                              ),
                            ),
                          ],
                        ),
                      ] else if (primaryLabel != null) ...[
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
                      if (!sideBySide && secondaryLabel != null) ...[
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
                      color: c.muted,
                      shape: const CircleBorder(),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => Navigator.of(context).maybePop(),
                        child: Tooltip(
                          message: tr('Close'),
                          child: SizedBox(
                            width: 36,
                            height: 36,
                            child: Icon(Icons.close_rounded, color: c.mutedForeground, size: 19),
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

/// Soft-tone circular icon tile.
class BcDialogBadge extends StatelessWidget {
  const BcDialogBadge({super.key, required this.icon, required this.color, this.size = 64});
  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.14)),
      child: Icon(icon, color: color, size: size * 0.46),
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
    final radius = BorderRadius.circular(BcRadius.full);
    final fg = secondary
        ? c.foreground
        : switch (tone) {
            BcDialogTone.brand => c.actionForeground,
            BcDialogTone.danger => c.errorForeground,
            BcDialogTone.warning => c.warningForeground,
            BcDialogTone.success => c.successForeground,
            BcDialogTone.call => c.callForeground,
          };
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.5,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          borderRadius: radius,
          color: secondary ? Colors.transparent : tone.fill(c),
          border: secondary ? Border.all(color: c.border, width: 1.5) : null,
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
  IconData? icon = Icons.help_outline_rounded,
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
      // QuickDrop ConfirmDialog: outline Cancel + action side by side. A plain "OK"
      // notice has just the one button.
      sideBySide: true,
      secondaryLabel: confirmLabel == tr('OK') ? null : (cancelLabel ?? tr('Cancel')),
      onSecondary: confirmLabel == tr('OK') ? null : () => Navigator.of(ctx).pop(false),
    ),
  );
  return result ?? false;
}

/// Selectable option card (QuickDrop choice list): bordered radius-14 card with a radio circle.
class BcChoiceTile extends StatelessWidget {
  const BcChoiceTile({super.key, required this.label, required this.selected, required this.onTap, this.tone});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final BcDialogTone? tone;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final danger = tone == BcDialogTone.danger;
    final accent = danger ? c.error : c.primary;
    final fill = danger ? c.error : c.action;
    final onFill = danger ? c.errorForeground : c.actionForeground;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        selected: selected,
        button: true,
        child: Material(
          color: selected ? (danger ? c.errorSoftBg : c.primarySoft) : c.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: selected ? accent : c.border, width: selected ? 1.5 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  BcRadioDot(selected: selected, fill: fill, onFill: onFill),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: c.foreground,
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

/// Radio circle: selected = filled with a check, otherwise an outlined ring.
class BcRadioDot extends StatelessWidget {
  const BcRadioDot({super.key, required this.selected, this.fill, this.onFill});
  final bool selected;
  final Color? fill;
  final Color? onFill;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final f = fill ?? c.action;
    return AnimatedContainer(
      duration: BcMotion.fast,
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? f : Colors.transparent,
        border: Border.all(color: selected ? f : c.border, width: 2),
      ),
      child: selected ? Icon(Icons.check_rounded, size: 14, color: onFill ?? c.actionForeground) : null,
    );
  }
}
