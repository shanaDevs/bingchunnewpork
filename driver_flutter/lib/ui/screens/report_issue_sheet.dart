import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/events.dart';
import '../../core/feedback.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../../state/job_controllers.dart';
import '../components/sheet_kit.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import 'inbox_screens.dart';
import 'order_sheets.dart';

/// What the rider picked in the "Report an issue" sheet.
class IssueChoice {
  const IssueChoice.order(String this.orderId) : kind = 'order';
  const IssueChoice.breakdown() : kind = 'breakdown', orderId = null;
  const IssueChoice.support() : kind = 'support', orderId = null;

  final String kind;
  final String? orderId;
}

/// The orders a delivery failure can be reported for: collected from the branch and still
/// pending, in stop order. Nothing to report before pickup.
List<JobOrder> reportableOrders(DeliveryJobDetail? job) {
  if (job == null || !job.pickedUp) return const [];
  return job.orders.where((o) => o.isPending).toList()..sort((a, b) => a.sequence.compareTo(b.sequence));
}

/// QuickDrop "Report an Issue" sheet: a delivery-failure row per reportable order, then
/// vehicle breakdown and contact support.
Future<IssueChoice?> showReportIssueSheet(BuildContext context, {List<JobOrder> orders = const []}) {
  BcFeedback.tap();
  final c = context.bc;
  return showBcSheet<IssueChoice>(
    context,
    builder: (ctx) => BcSheetBody(
      header: BcSheetHeader(title: tr('Report an issue')),
      children: [
        BcGroupCard(
          children: [
            for (final o in orders)
              BcListRow(
                icon: Icons.inventory_2_outlined,
                iconBg: c.errorSoftBg,
                iconTint: c.error,
                title: tr('Report delivery failure'),
                subtitle: '#${o.sequence} · ${o.customerName.trim().isEmpty ? tr('Customer') : o.customerName}',
                onTap: () => Navigator.of(ctx).pop(IssueChoice.order(o.orderId)),
              ),
            BcListRow(
              icon: Icons.build_outlined,
              iconBg: c.errorSoftBg,
              iconTint: c.error,
              title: tr('Vehicle breakdown'),
              subtitle: tr('Hand the job over to another rider'),
              onTap: () => Navigator.of(ctx).pop(const IssueChoice.breakdown()),
            ),
            BcListRow(
              icon: Icons.headset_mic_outlined,
              iconBg: c.errorSoftBg,
              iconTint: c.error,
              title: tr('Contact support'),
              subtitle: tr('Customer, order or app problems'),
              onTap: () => Navigator.of(ctx).pop(const IssueChoice.support()),
            ),
          ],
        ),
      ],
    ),
  );
}

/// Opens the failure-reason sheet for [order] and sends the report; true once it was
/// accepted. Refreshes the job everywhere through [JobRefreshBus].
Future<bool> reportOrderDeliveryFailure(BuildContext context, {required String jobId, required JobOrder order}) async {
  final vm = OrderActionController(context.read<AppContainer>());
  var sent = false;
  await showFailureSheet(context, vm, (outcome, note) async {
    final updated = await vm.updateStatus(order.orderId, 'DELIVERY_FAILED', note: note, outcome: outcome.apiValue);
    if (updated == null) return false;
    sent = true;
    return true;
  }, orderNumber: order.orderNumber);
  if (sent) {
    BcFeedback.success();
    JobRefreshBus.refresh(jobId);
  }
  return sent;
}

/// Pushes the Help & Support screen.
Future<void> openSupport(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SupportScreen()));
