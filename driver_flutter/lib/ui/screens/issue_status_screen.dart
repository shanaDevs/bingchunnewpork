import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../l10n/l10n.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';

/// Where an issue report stands. The backend statuses are OPEN, CONFIRMED, DISMISSED and
/// RESOLVED; QuickDrop shows them as Pending, Under review and Resolved.
class IssueStage {
  const IssueStage(this.step, this.label, this.tone, {this.closed = false});

  /// 0 = Pending, 1 = Under review, 2 = Resolved / closed.
  final int step;
  final String label;
  final QdTone tone;
  final bool closed;

  static IssueStage of(String status) => switch (status.toUpperCase()) {
    'RESOLVED' || 'CLOSED' => IssueStage(2, tr('Resolved'), QdTone.success, closed: true),
    'DISMISSED' || 'REJECTED' => IssueStage(2, tr('Dismissed'), QdTone.neutral, closed: true),
    'CONFIRMED' || 'UNDER_REVIEW' || 'IN_REVIEW' => IssueStage(1, tr('Under review'), QdTone.warning),
    _ => IssueStage(0, tr('Pending'), QdTone.primary),
  };
}

/// QuickDrop "Issue Status": one report with its progress, outcome, description and updates.
class IssueStatusScreen extends StatefulWidget {
  const IssueStatusScreen({super.key, required this.complaint});

  final DriverComplaint complaint;

  @override
  State<IssueStatusScreen> createState() => _IssueStatusScreenState();
}

class _IssueStatusScreenState extends State<IssueStatusScreen> {
  JobOrder? _order;

  @override
  void initState() {
    super.initState();
    _loadOrder();
  }

  /// The order number and customer are nice to have; the page works without them.
  Future<void> _loadOrder() async {
    final id = widget.complaint.orderId;
    if (id == null || id.isEmpty) return;
    try {
      final o = await context.read<AppContainer>().jobsRepository.getOrder(id);
      if (mounted) setState(() => _order = o);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final item = widget.complaint;
    final stage = IssueStage.of(item.status);
    final order = _order;
    final orderLine = order == null
        ? null
        : [order.orderNumber, order.customerName].where((e) => e.trim().isNotEmpty).join(' · ');

    final updates = <_Update>[
      _Update(tr('You'), item.createdAt, tr('Report sent to support.')),
      if (stage.step >= 1 && !stage.closed) _Update(tr('Support'), null, tr('A support agent is reviewing your report.')),
      if (stage.closed)
        _Update(
          tr('Support'),
          item.resolvedAt,
          stage.tone == QdTone.success ? tr('Your report was marked as resolved.') : tr('Support closed your report without further action.'),
        ),
    ].reversed.toList();

    return QdPage(
      title: tr('Issue Status'),
      children: [
        QdCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(item.category, style: BcType.subtitle.copyWith(color: c.foreground, fontSize: 18))),
                  const SizedBox(width: 8),
                  QdBadge(stage.label, tone: stage.tone, dot: true),
                ],
              ),
              if (orderLine != null && orderLine.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(orderLine, style: TextStyle(fontSize: 15, color: c.mutedForeground, height: 1.35)),
              ],
              const SizedBox(height: 4),
              Text(
                tr('Reported {time}', {'time': Format.dateTime(item.createdAt)}),
                style: TextStyle(fontSize: 14, color: c.mutedForeground),
              ),
              const SizedBox(height: 16),
              _Stepper(step: stage.step, closedLabel: stage.closed ? stage.label : null),
            ],
          ),
        ),
        if (stage.closed) ...[
          const SizedBox(height: 12),
          _Outcome(stage: stage),
        ],
        const _Heading('Description'),
        QdCard(
          padding: const EdgeInsets.all(14),
          child: Text(item.description, style: TextStyle(fontSize: 15, color: c.foreground, height: 1.4)),
        ),
        const _Heading('Updates'),
        QdCard(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
          child: Column(
            children: [
              for (var i = 0; i < updates.length; i++) _Timeline(update: updates[i], first: i == 0, last: i == updates.length - 1),
            ],
          ),
        ),
      ],
    );
  }
}

class _Update {
  const _Update(this.who, this.iso, this.text);
  final String who;
  final String? iso;
  final String text;
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 20, 2, 10),
    child: Text(tr(text), style: BcType.section.copyWith(color: context.bc.foreground, fontSize: 17)),
  );
}

/// Pending → Under review → Resolved, with filled check circles up to the current step.
class _Stepper extends StatelessWidget {
  const _Stepper({required this.step, this.closedLabel});
  final int step;
  final String? closedLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final labels = [tr('Pending'), tr('Under review'), closedLabel ?? tr('Resolved')];
    Widget dot(int i) {
      final done = i <= step;
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done ? c.primary : Colors.transparent,
              border: Border.all(color: done ? c.primary : c.border, width: 2),
            ),
            child: done ? Icon(Icons.check_rounded, size: 17, color: c.primaryForeground) : null,
          ),
          const SizedBox(height: 6),
          Text(labels[i], style: TextStyle(fontSize: 13, color: done ? c.foreground : c.mutedForeground, fontWeight: FontWeight.w600)),
        ],
      );
    }

    // Same height as the circles (28), so the line runs through their exact centre.
    Widget line(bool on) => Expanded(
      child: SizedBox(
        height: 28,
        child: Center(child: Container(height: 2, color: on ? c.primary : c.border)),
      ),
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [dot(0), line(step >= 1), dot(1), line(step >= 2), dot(2)],
    );
  }
}

class _Outcome extends StatelessWidget {
  const _Outcome({required this.stage});
  final IssueStage stage;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final ok = stage.tone == QdTone.success;
    final fg = ok ? c.successStrong : c.mutedForeground;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ok ? c.successSoft : c.muted,
        borderRadius: BorderRadius.circular(BcRadius.lg),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(ok ? Icons.check_circle_outline_rounded : Icons.do_not_disturb_on_outlined, color: fg, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(stage.label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: c.foreground)),
                const SizedBox(height: 2),
                Text(
                  ok ? tr('Support marked this issue as resolved.') : tr('Support reviewed this report and closed it.'),
                  style: TextStyle(fontSize: 15, color: c.foreground, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.update, required this.first, required this.last});
  final _Update update;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final meta = [update.who, if (update.iso != null && update.iso!.isNotEmpty) Format.dateTime(update.iso)].join(' · ');
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 14,
            child: Column(
              children: [
                const SizedBox(height: 4),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: first ? c.primary : c.iconMuted),
                ),
                if (!last) Expanded(child: Container(width: 2, color: c.border)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(meta, style: TextStyle(fontSize: 12, color: c.mutedForeground, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    update.text,
                    style: TextStyle(fontSize: 15, color: c.foreground, fontWeight: first ? FontWeight.w800 : FontWeight.w500, height: 1.35),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
