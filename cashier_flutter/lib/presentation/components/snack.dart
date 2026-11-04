import 'package:flutter/material.dart';

import '../theme/pos_theme.dart';

enum PosSnackKind { error, success, info }

/// Floating toast (web react-hot-toast). Replaces any toast already showing.
void showPosSnack(
  BuildContext context,
  String message, {
  PosSnackKind kind = PosSnackKind.info,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  final (icon, tint) = switch (kind) {
    PosSnackKind.error => (Icons.error_outline_rounded, const Color(0xFFF87171)),
    PosSnackKind.success => (Icons.check_circle_rounded, const Color(0xFF4ADE80)),
    PosSnackKind.info => (Icons.info_outline_rounded, const Color(0xFF7CB7FF)),
  };
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        duration: duration,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        action: actionLabel == null || onAction == null
            ? null
            : SnackBarAction(label: actionLabel, textColor: tint, onPressed: onAction),
        content: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(PosRadius.button),
              ),
              child: Icon(icon, color: tint, size: 17),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: PosType.body.copyWith(color: Colors.white, fontSize: 13.5),
              ),
            ),
          ],
        ),
      ),
    );
}
