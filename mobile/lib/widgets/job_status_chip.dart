import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

class JobStatusChip extends StatelessWidget {
  final String status;

  const JobStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'SCHEDULED' => ('Scheduled', BcColors.brandLight),
      'ASSIGNED' => ('To outlet', BcColors.accent),
      'IN_PROGRESS' => ('On run', BcColors.success),
      'COMPLETED' => ('Completed', BcColors.textMuted),
      _ => (status, BcColors.textMuted),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}
