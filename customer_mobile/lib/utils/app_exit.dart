import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/bc_theme.dart';

/// Shows a confirm dialog, then exits the app if the user agrees.
Future<void> confirmAppExit(BuildContext context) async {
  final shouldExit = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Close app?'),
      content: const Text('Are you sure you want to exit Bing Chun?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Exit', style: TextStyle(color: BcColors.error)),
        ),
      ],
    ),
  );

  if (shouldExit == true) {
    await SystemNavigator.pop();
  }
}
