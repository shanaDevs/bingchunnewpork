import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

enum BcSnackKind { error, warning, success, info }

/// Floating toast at the bottom of the screen: tinted icon chip + short message,
/// optional action. Replaces any toast already showing.
void showBcSnack(
  BuildContext context,
  String message, {
  BcSnackKind kind = BcSnackKind.info,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  final c = context.bc;
  final (icon, tint) = switch (kind) {
    BcSnackKind.error => (Icons.error_outline_rounded, const Color(0xFFF87171)),
    BcSnackKind.warning => (Icons.wifi_off_rounded, const Color(0xFFFBBF24)),
    BcSnackKind.success => (Icons.check_circle_rounded, const Color(0xFF34D399)),
    BcSnackKind.info => (Icons.info_outline_rounded, const Color(0xFF7CB7FF)),
  };
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        duration: duration,
        backgroundColor: c.isDark ? c.surfaceElevated : const Color(0xFF0B1F3F),
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        action: actionLabel == null || onAction == null
            ? null
            : SnackBarAction(label: actionLabel, textColor: tint, onPressed: onAction),
        content: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: tint, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w500, height: 1.35),
              ),
            ),
          ],
        ),
      ),
    );
}
