import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';
import 'buttons.dart';

/// Loading state used on every page: the brand mascot in a white disc, ringed by
/// a brand spinner on a soft track, with an optional centred message. In tight
/// spaces (cards, list rows) it drops to the ring alone.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message});
  final String? message;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return LayoutBuilder(
      builder: (context, box) {
        final compact = box.maxHeight < 150 && message == null;
        final ring = compact ? 34.0 : 64.0;
        final mark = Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: ring,
              height: ring,
              decoration: BoxDecoration(
                color: c.card,
                shape: BoxShape.circle,
                boxShadow: compact || c.cardShadow.a == 0
                    ? null
                    : [BoxShadow(color: c.brand.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 6))],
              ),
            ),
            SizedBox(
              width: ring,
              height: ring,
              child: CircularProgressIndicator(
                strokeWidth: compact ? 3 : 3.5,
                strokeCap: StrokeCap.round,
                color: c.brand,
                backgroundColor: c.brandSubtle,
              ),
            ),
            if (!compact)
              SizedBox(
                width: ring - 24,
                height: ring - 24,
                child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
              ),
          ],
        );
        return Center(
          child: Padding(
            padding: EdgeInsets.all(compact ? PosSpacing.sm : PosSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                mark,
                if (message != null) ...[
                  const SizedBox(height: PosSpacing.lg),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 300),
                    child: Text(
                      message!,
                      textAlign: TextAlign.center,
                      style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    tr('Please wait'),
                    textAlign: TextAlign.center,
                    style: PosType.caption.copyWith(color: c.textMuted),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.message, this.icon = Icons.inbox_outlined, this.action});

  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: PosSpacing.xxl, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
              child: Icon(icon, color: c.brand, size: 30),
            ),
            const SizedBox(height: PosSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: PosType.body.copyWith(color: c.textMuted),
            ),
            if (action != null) ...[const SizedBox(height: PosSpacing.lg), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => EmptyView(
    message: message,
    icon: Icons.cloud_off_rounded,
    action: PosButton(label: tr('Try again'), icon: Icons.refresh_rounded, onPressed: onRetry, expand: false),
  );
}

/// Inline red notice (web `rounded-xl border-red-500/30 bg-red-500/10`).
class InlineNotice extends StatelessWidget {
  const InlineNotice({super.key, required this.message, this.tone = NoticeTone.danger, this.icon});

  final String message;
  final NoticeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final color = switch (tone) {
      NoticeTone.danger => c.dangerText,
      NoticeTone.warning => c.warningText,
      NoticeTone.success => c.successText,
      NoticeTone.info => c.brand,
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(PosRadius.button),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? Icons.info_outline_rounded, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: PosType.caption.copyWith(color: color, fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}

enum NoticeTone { danger, warning, success, info }

/// Pulsing placeholder block.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.height = 14, this.width, this.radius = 8});
  final double height;
  final double? width;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))
    ..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_ctrl),
      child: Container(
        height: widget.height,
        width: widget.width,
        decoration: BoxDecoration(
          color: c.border.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}
