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
    backgroundColor: context.bc.background,
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
                margin: const EdgeInsets.only(top: 10, bottom: 6),
                width: 42,
                height: 5,
                decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(99)),
              ),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(20, 8, 12, 12), child: header),
            Flexible(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(16, 4, 16, 20 + mq.padding.bottom),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Icon tile + title/subtitle + round close button.
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
    return Row(
      children: [
        leading ??
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: iconBg ?? c.brandSubtle, borderRadius: BorderRadius.circular(15)),
              child: Icon(icon, color: iconTint ?? c.brand, size: 24),
            ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text, height: 1.2),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(subtitle!, style: TextStyle(fontSize: 12.5, color: c.textMuted, height: 1.35)),
              ],
            ],
          ),
        ),
        const SizedBox(width: 8),
        Material(
          color: c.card,
          shape: CircleBorder(side: BorderSide(color: c.border)),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onClose ?? () => Navigator.of(context).maybePop(),
            child: Tooltip(
              message: tr('Close'),
              child: SizedBox(width: 38, height: 38, child: Icon(Icons.close_rounded, color: c.textMuted, size: 20)),
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
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text),
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
    this.padding = const EdgeInsets.all(16),
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
        color: color ?? c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: borderColor ?? c.border),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 14, offset: const Offset(0, 4))],
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
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color),
          ),
        ],
      ),
    );
  }
}

/// Full-width gradient primary button used in sheets.
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
  final List<Color>? colors;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final grad = colors ?? [c.brandLight, c.brand, c.brandDark];
    return AnimatedOpacity(
      duration: BcMotion.fast,
      opacity: active || loading ? 1 : 0.5,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(BcRadius.button + 2),
          gradient: LinearGradient(colors: grad),
          boxShadow: active
              ? [BoxShadow(color: grad[1].withValues(alpha: 0.32), blurRadius: 14, offset: const Offset(0, 6))]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(BcRadius.button + 2),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: active ? onPressed : null,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (icon != null) ...[Icon(icon, color: Colors.white, size: 19), const SizedBox(width: 8)],
                        Text(
                          label,
                          style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: Colors.white),
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
