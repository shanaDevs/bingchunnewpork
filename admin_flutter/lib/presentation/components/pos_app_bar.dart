import 'package:flutter/material.dart';

import '../theme/pos_theme.dart';

/// App bar for pushed pages: small uppercase context label over a bold title,
/// with the themed back chip (see `buildPosTheme`) and optional actions.
class PosAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PosAppBar({super.key, required this.title, this.eyebrow, this.actions = const []});

  final String title;

  /// Context line above the title, e.g. "Dehiwala · Branch Admin" or "Report".
  final String? eyebrow;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return AppBar(
      title: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (eyebrow != null)
            Text(
              eyebrow!.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: PosType.label.copyWith(color: c.textMuted, fontSize: 10.5),
            ),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: PosType.heading.copyWith(color: c.text, fontSize: 18),
          ),
        ],
      ),
      actions: [...actions, const SizedBox(width: PosSpacing.md)],
    );
  }
}
