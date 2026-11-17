import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../app_routes.dart';
import '../components/headers.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

/// An order together with the job it belongs to (needed to open its details).
class _JobOrderRef {
  const _JobOrderRef(this.jobId, this.order);
  final String jobId;
  final JobOrder order;
}

/// "Orders delivered" drill-down: the period's orders split into Successfully Delivered and
/// Failed Delivery. Built from the job history already on the phone plus each job's detail,
/// so no extra backend support is needed. Tap an order to open its details.
class DeliveredOrdersScreen extends StatefulWidget {
  const DeliveredOrdersScreen({super.key, required this.jobs});

  final List<JobHistoryItem> jobs;

  @override
  State<DeliveredOrdersScreen> createState() => _DeliveredOrdersScreenState();
}

class _DeliveredOrdersScreenState extends State<DeliveredOrdersScreen> {
  bool _loading = true;
  bool _partial = false;
  List<_JobOrderRef> _delivered = const [];
  List<_JobOrderRef> _failed = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final repo = context.read<AppContainer>().jobsRepository;
    setState(() {
      _loading = true;
      _partial = false;
    });
    final delivered = <_JobOrderRef>[];
    final failed = <_JobOrderRef>[];
    var missed = false;

    final jobs = widget.jobs.where((j) => j.orderCount > 0).toList();
    const batch = 6;
    for (var i = 0; i < jobs.length; i += batch) {
      final chunk = jobs.skip(i).take(batch);
      final results = await Future.wait(
        chunk.map((j) async {
          try {
            return (j, await repo.getJob(j.id));
          } catch (_) {
            return (j, null);
          }
        }),
      );
      for (final (j, detail) in results) {
        if (detail == null) {
          missed = true;
          continue;
        }
        for (final o in detail.orders) {
          if (o.isDelivered) {
            delivered.add(_JobOrderRef(j.id, o));
          } else if (o.isFailed) {
            failed.add(_JobOrderRef(j.id, o));
          }
        }
      }
    }
    if (!mounted) return;
    setState(() {
      _delivered = delivered;
      _failed = failed;
      _partial = missed;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdPage(
      title: tr('Delivered orders'),
      children: [
        if (_loading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CircularProgressIndicator(color: c.primary)),
          )
        else ...[
          if (_partial)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: BcInlineBanner(message: tr('Some orders could not be loaded. Pull back and reopen to retry.')),
            ),
          _Section(
            title: tr('Successfully delivered'),
            icon: Icons.check_circle_outline_rounded,
            color: c.isDark ? c.success : c.successStrong,
            emptyText: tr('No successful deliveries in this period.'),
            items: _delivered,
          ),
          const SizedBox(height: 24),
          _Section(
            title: tr('Failed delivery'),
            icon: Icons.error_outline_rounded,
            color: c.errorStrong,
            emptyText: tr('No failed deliveries in this period.'),
            items: _failed,
            showReason: true,
          ),
        ],
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.color,
    required this.emptyText,
    required this.items,
    this.showReason = false,
  });

  final String title;
  final IconData icon;
  final Color color;
  final String emptyText;
  final List<_JobOrderRef> items;
  final bool showReason;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8, left: 2),
          child: Row(
            children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.foreground),
                ),
              ),
              Text(
                '${items.length}',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: color),
              ),
            ],
          ),
        ),
        if (items.isEmpty)
          BcEmptyState(compact: true, tone: BcEmptyTone.neutral, icon: icon, title: emptyText)
        else
          for (final r in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: QdCard(
                onTap: () {
                  BcFeedback.tap();
                  AppRoutes.openOrder(context, r.jobId, r.order.orderId);
                },
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r.order.orderNumber,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [r.order.customerName, r.order.shortAddress].where((s) => s.trim().isNotEmpty).join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, color: c.mutedForeground),
                          ),
                          if (showReason && (r.order.failureReason?.trim().isNotEmpty ?? false)) ...[
                            const SizedBox(height: 4),
                            Text(
                              '${tr('Reason')}: ${r.order.failureReason!.trim()}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, color: color),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Icon(Icons.chevron_right_rounded, size: 22, color: c.mutedForeground),
                  ],
                ),
              ),
            ),
      ],
    );
  }
}
