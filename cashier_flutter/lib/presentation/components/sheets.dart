import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';
import 'buttons.dart';
import 'layout.dart';

/// Modal bottom sheet with the drag handle, scroll-safe and keyboard-aware.
/// Tablets get a centred popup dialog with the same content instead.
Future<T?> showPosSheet<T>(BuildContext context, {required WidgetBuilder builder, bool expand = false}) {
  if (isTablet(context)) {
    return showDialog<T>(
      context: context,
      builder: (ctx) {
        final size = MediaQuery.sizeOf(ctx);
        return Dialog(
          backgroundColor: ctx.pos.card,
          surfaceTintColor: Colors.transparent,
          insetPadding: const EdgeInsets.all(PosSpacing.xxl),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          clipBehavior: Clip.antiAlias,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 520, maxHeight: size.height * 0.8),
            child: Padding(
              // Stands in for the sheet's drag-handle space above the header.
              padding: const EdgeInsets.only(top: PosSpacing.xl),
              child: expand ? SizedBox(height: size.height * 0.8 - PosSpacing.xl, child: builder(ctx)) : builder(ctx),
            ),
          ),
        );
      },
    );
  }
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    constraints: const BoxConstraints(maxWidth: 640),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: expand ? SizedBox(height: MediaQuery.sizeOf(ctx).height * 0.86, child: builder(ctx)) : builder(ctx),
    ),
  );
}

/// Title row at the top of a sheet.
class SheetHeader extends StatelessWidget {
  const SheetHeader({super.key, required this.title, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Padding(
      padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: PosType.heading.copyWith(color: c.text)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: PosType.caption.copyWith(color: c.textMuted)),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Picker sheet for a short list of options (replaces the web `<select>` filters).
Future<T?> showOptionSheet<T>(
  BuildContext context, {
  required String title,
  required List<(T value, String label)> options,
  T? selected,
}) {
  return showPosSheet<T>(
    context,
    builder: (ctx) {
      final c = ctx.pos;
      return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SheetHeader(title: title),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(PosSpacing.md, 0, PosSpacing.md, PosSpacing.lg),
                children: [
                  for (final (value, label) in options)
                    ListTile(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PosRadius.button)),
                      selected: value == selected,
                      selectedTileColor: c.brandSubtle,
                      title: Text(
                        label,
                        style: PosType.body.copyWith(
                          color: value == selected ? c.brand : c.text,
                          fontWeight: value == selected ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                      trailing: value == selected ? Icon(Icons.check_rounded, color: c.brand) : null,
                      onTap: () => Navigator.pop(ctx, value),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}

/// Confirm dialog (web confirmDialog). Resolves true when confirmed.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool danger = false,
  IconData icon = Icons.help_outline_rounded,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final c = ctx.pos;
      final tint = danger ? c.danger : c.brand;
      return AlertDialog(
        icon: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
          child: Icon(icon, color: tint),
        ),
        title: Text(
          title,
          style: PosType.heading.copyWith(color: c.text),
          textAlign: TextAlign.center,
        ),
        content: Text(
          message,
          style: PosType.body.copyWith(color: c.textMuted),
          textAlign: TextAlign.center,
        ),
        actionsPadding: const EdgeInsets.fromLTRB(PosSpacing.lg, 0, PosSpacing.lg, PosSpacing.lg),
        actions: [
          Row(
            children: [
              Expanded(
                child: PosButton(
                  label: tr('Cancel'),
                  variant: PosButtonVariant.outline,
                  onPressed: () => Navigator.pop(ctx, false),
                ),
              ),
              const SizedBox(width: PosSpacing.sm),
              Expanded(
                child: PosButton(
                  label: confirmLabel,
                  variant: danger ? PosButtonVariant.danger : PosButtonVariant.primary,
                  onPressed: () => Navigator.pop(ctx, true),
                ),
              ),
            ],
          ),
        ],
      );
    },
  );
  return result ?? false;
}
