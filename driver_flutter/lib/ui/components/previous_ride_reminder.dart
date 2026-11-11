import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../app_routes.dart';
import 'bc_dialog.dart';

/// Reminder shown when the rider tries to pick up / start a new ride while an earlier one is
/// still waiting for "Complete Ride". "Complete previous ride" opens that ride's screen, where
/// the (branch-geofenced) Complete button lives.
Future<void> showPreviousRideReminder(BuildContext context, JobSummary previous) async {
  final ride = Format.rideIdLabel(previous.rideCode, previous.id);
  final complete = await showBcConfirm(
    context,
    icon: Icons.assignment_late_outlined,
    title: tr('Complete your previous ride'),
    message: tr(
      '{ride} is not marked as completed yet. Complete it before starting or picking up your next ride.',
      {'ride': ride},
    ),
    confirmLabel: tr('Complete previous ride'),
    cancelLabel: tr('Not now'),
  );
  if (complete && context.mounted) AppRoutes.openDashboard(context, previous.id);
}
