import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import 'run_kit.dart';
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
              decoration: BoxDecoration(shape: BoxShape.circle, color: c.danger.withValues(alpha: 0.08)),
              alignment: Alignment.center,
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(shape: BoxShape.circle, color: c.danger.withValues(alpha: 0.14)),
                child: Icon(Icons.cloud_off_rounded, color: c.danger, size: 32),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              tr('Something went wrong'),
              textAlign: TextAlign.center,
              style: TextStyle(color: c.text, fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: c.textMuted, fontSize: 13.5, height: 1.4),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: 200,
              child: RunPrimaryButton(label: tr('Retry'), icon: Icons.refresh_rounded, onPressed: onRetry),
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
    final col = color ?? c.danger;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: col.withValues(alpha: 0.35)),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 12, offset: const Offset(0, 4))],
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
              style: TextStyle(color: c.text, fontSize: 13, fontWeight: FontWeight.w500, height: 1.35),
            ),
          ),
          if (onClose != null)
            IconButton(
              tooltip: tr('Close'),
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: Icon(Icons.close_rounded, size: 18, color: c.textMuted),
            ),
        ],
      ),
    );
  }
}
