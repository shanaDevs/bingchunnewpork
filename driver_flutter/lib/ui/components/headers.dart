import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import 'surfaces.dart';
import '../../l10n/l10n.dart';

/// Load failure: soft illustrated badge, message, and a gradient Retry.
class BcErrorState extends StatelessWidget {
  const BcErrorState({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(shape: BoxShape.circle, color: c.errorSoftBg),
              alignment: Alignment.center,
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(shape: BoxShape.circle, color: c.errorSoftBg),
                child: Icon(Icons.cloud_off_rounded, color: c.errorStrong, size: 32),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              tr('Something went wrong'),
              textAlign: TextAlign.center,
              style: BcType.subtitle.copyWith(color: c.foreground),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.mutedForeground, fontSize: 14, height: 1.4),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: 200,
              child: FilledButton.icon(
                onPressed: onRetry,
                style: FilledButton.styleFrom(
                  backgroundColor: c.action,
                  foregroundColor: c.actionForeground,
                  minimumSize: const Size(0, 52),
                  shape: const StadiumBorder(),
                ),
                icon: const Icon(Icons.refresh_rounded, size: 20),
                label: Text(tr('Retry'), style: BcType.button),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Placeholder cards while a list loads.
class BcJobsSkeleton extends StatelessWidget {
  const BcJobsSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        children: [
          for (var i = 0; i < 4; i++) ...[if (i > 0) const SizedBox(height: 12), const BcSkeletonCard()],
        ],
      ),
    );
  }
}

/// Inline notice above a list: tinted icon chip, message, optional close.
class BcInlineBanner extends StatelessWidget {
  const BcInlineBanner({super.key, required this.message, this.color, this.icon, this.onClose});

  final String message;
  final Color? color;
  final IconData? icon;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final col = color ?? c.errorStrong;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: col.withValues(alpha: 0.35)),
        boxShadow: bcShadow(c),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: col.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
            child: Icon(icon ?? Icons.info_outline_rounded, size: 18, color: col),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: c.foreground, fontSize: 13, fontWeight: FontWeight.w500, height: 1.35),
            ),
          ),
          if (onClose != null)
            IconButton(
              tooltip: tr('Close'),
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: Icon(Icons.close_rounded, size: 18, color: c.mutedForeground),
            ),
        ],
      ),
    );
  }
}
