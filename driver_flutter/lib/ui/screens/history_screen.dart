import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../state/jobs_controller.dart';
import '../components/bc_dialog.dart';
import '../components/empty_state.dart';
import '../components/headers.dart';
import '../components/qd_kit.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

enum _DateFilter {
  all('All time'),
  today('Today'),
  week('Last 7 days'),
  month('Last 30 days');

  const _DateFilter(this.label);
  final String label;
}

enum _OutcomeFilter {
  all('All'),
  completed('Completed'),
  cancelled('Cancelled'),
  transferred('Transferred');

  const _OutcomeFilter(this.label);
  final String label;
}

/// Driver job history (QuickDrop Jobs tab): searchable, filterable, read-only list.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.onOpenJob, this.onViewJobs});

  final void Function(JobSummary job) onOpenJob;
  final VoidCallback? onViewJobs;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final _search = TextEditingController();
  _OutcomeFilter _outcome = _OutcomeFilter.all;
  _DateFilter _date = _DateFilter.all;

  @override
  void initState() {
    super.initState();
    context.read<JobsController>().loadHistory();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool _matchesOutcome(JobHistoryItem r) => switch (_outcome) {
    _OutcomeFilter.all => true,
    _OutcomeFilter.completed => _isCompleted(r),
    _OutcomeFilter.cancelled => _isCancelled(r),
    _OutcomeFilter.transferred => !_isCompleted(r) && !_isCancelled(r),
  };

  bool _matchesDate(JobHistoryItem r) {
    if (_date == _DateFilter.all) return true;
    final d = _localDate(r.completedAt ?? r.scheduledAt);
    if (d == null) return false;
    final now = DateTime.now();
    final days = DateTime(now.year, now.month, now.day).difference(d).inDays;
    return switch (_date) {
      _DateFilter.all => true,
      _DateFilter.today => days == 0,
      _DateFilter.week => days >= 0 && days < 7,
      _DateFilter.month => days >= 0 && days < 30,
    };
  }

  bool _matchesQuery(JobHistoryItem r) {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return true;
    return [
      Format.rideIdLabel(r.rideCode, r.id),
      r.rideCode ?? '',
      r.id,
      r.title,
      r.storeName,
      r.storeCity,
    ].any((s) => s.toLowerCase().contains(q));
  }

  @override
  Widget build(BuildContext context) {
    final vm = context.watch<JobsController>();

    final listed = vm.history.where((r) => _matchesOutcome(r) && _matchesDate(r) && _matchesQuery(r)).toList();
    final groups = _groupByDay(listed);
    final filtered = _search.text.trim().isNotEmpty || _outcome != _OutcomeFilter.all || _date != _DateFilter.all;

    Future<void> refresh() async {
      BcFeedback.refresh();
      await vm.loadHistory(force: true);
    }

    void clearFilters() {
      setState(() {
        _search.clear();
        _outcome = _OutcomeFilter.all;
        _date = _DateFilter.all;
      });
    }

    final c = context.bc;
    final children = <Widget>[];
    Widget? fill;

    if (vm.historyLoading && vm.history.isEmpty) {
      children.add(const BcJobsSkeleton());
    } else if (vm.historyError != null && vm.history.isEmpty) {
      children.add(
        SizedBox(
          height: 260,
          child: BcErrorState(message: vm.historyError!, onRetry: () => vm.loadHistory(force: true)),
        ),
      );
    } else if (vm.history.isEmpty) {
      fill = BcEmptyState(
        icon: Icons.assignment_outlined,
        badgeIcon: Icons.check_rounded,
        title: tr('No completed jobs yet'),
        message: tr('Jobs you finish will appear here.'),
        actionLabel: widget.onViewJobs != null ? tr('View available jobs') : null,
        actionIcon: Icons.local_shipping_outlined,
        onAction: widget.onViewJobs,
        secondaryLabel: tr('Refresh'),
        onSecondary: refresh,
      );
    } else {
      children.addAll([
        _SearchField(controller: _search, onChanged: (_) => setState(() {})),
        const SizedBox(height: 16),
        _ChipRow(
          children: [
            for (final o in _OutcomeFilter.values)
              _FilterChip(
                label: tr(o.label),
                selected: _outcome == o,
                onTap: () {
                  if (_outcome != o) BcFeedback.tap();
                  setState(() => _outcome = o);
                },
              ),
          ],
        ),
        const SizedBox(height: 8),
        _ChipRow(
          children: [
            for (final d in _DateFilter.values)
              _FilterChip(
                label: tr(d.label),
                selected: _date == d,
                onTap: () {
                  if (_date != d) BcFeedback.tap();
                  setState(() => _date = d);
                },
              ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          trn(listed.length, '{n} job', '{n} jobs'),
          style: TextStyle(fontSize: 14, color: c.mutedForeground),
        ),
        const SizedBox(height: 16),
      ]);
      if (listed.isEmpty) {
        fill = BcEmptyState(
          icon: Icons.manage_search_rounded,
          badgeIcon: Icons.close_rounded,
          tone: BcEmptyTone.neutral,
          title: tr('No jobs match your filters'),
          message: tr('Try a different search or clear the filters.'),
          actionLabel: filtered ? tr('Clear filters') : null,
          actionIcon: Icons.filter_alt_off_outlined,
          onAction: filtered ? clearFilters : null,
        );
      } else {
        for (var i = 0; i < groups.length; i++) {
          final g = groups[i];
          if (i > 0) children.add(const SizedBox(height: 16));
          children.add(
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                g.label,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.mutedForeground),
              ),
            ),
          );
          for (final run in g.runs) {
            children.add(
              _HistoryItemCard(
                run: run,
                // A run closed by an admin can't be opened as a live ride: show its closure details.
                // Other cancelled runs went back to the branch pool, so there is nothing to open.
                onTap: run.isAdminClosed
                    ? () {
                        BcFeedback.tap();
                        _showClosedRideDetails(context, run);
                      }
                    : _isCancelled(run)
                    ? null
                    : () {
                        BcFeedback.tap();
                        widget.onOpenJob(
                          JobSummary(
                            id: run.id,
                            title: run.title,
                            status: run.status,
                            scheduledAt: run.scheduledAt,
                            storeName: run.storeName,
                            storeCity: run.storeCity,
                            orderCount: run.orderCount,
                            rideCode: run.rideCode,
                          ),
                        );
                      },
              ),
            );
          }
        }
      }
    }

    return BcTabScaffold(title: tr('Jobs'), onRefresh: refresh, fill: fill, children: children);
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final radius = BorderRadius.circular(16);
    OutlineInputBorder border(Color color) =>
        OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: color));
    return SizedBox(
      height: 52,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        autocorrect: false,
        cursorColor: c.action,
        style: TextStyle(fontSize: 15, color: c.foreground),
        decoration: InputDecoration(
          hintText: tr('Search job, order, branch or customer'),
          hintStyle: TextStyle(fontSize: 15, color: c.mutedForeground),
          filled: true,
          fillColor: c.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
          prefixIcon: Icon(Icons.search_rounded, size: 20, color: c.mutedForeground),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: tr('Clear search'),
                  icon: Icon(Icons.close_rounded, size: 20, color: c.mutedForeground),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          border: border(c.border),
          enabledBorder: border(c.border),
          focusedBorder: border(c.action),
        ),
      ),
    );
  }
}

/// One line of filter chips: they share the width and shrink their labels if needed.
class _ChipRow extends StatelessWidget {
  const _ChipRow({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (var i = 0; i < children.length; i++) ...[
        if (i > 0) const SizedBox(width: 6),
        Flexible(child: children[i]),
      ],
    ],
  );
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: selected ? c.action : c.surface,
            borderRadius: BorderRadius.circular(99),
            border: Border.all(color: selected ? c.action : c.border),
          ),
          // widthFactor: 1 keeps the chip as wide as its label (no Container alignment,
          // which would stretch it to the full row).
          child: Center(
            widthFactor: 1,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: selected ? c.actionForeground : c.foreground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryItemCard extends StatelessWidget {
  const _HistoryItemCard({required this.run, this.onTap});

  final JobHistoryItem run;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final earned = run.deliveredTotal;
    final at = Format.toLocal(run.completedAt ?? run.scheduledAt);
    final branch = run.storeName.trim().isEmpty ? '—' : run.storeName.trim();
    final place = at == null ? branch : '$branch · ${DateFormat('h:mm a', L10n.dateLocale).format(at)}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: QdCard(
        onTap: onTap,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          Format.rideIdLabel(run.rideCode, run.id),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.foreground),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        Format.money(earned),
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: earned > 0 ? (c.isDark ? c.success : c.successStrong) : c.mutedForeground,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 16,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _Meta(Icons.storefront_outlined, place),
                      _Meta(Icons.inventory_2_outlined, trn(run.orderCount, '{n} order', '{n} orders')),
                    ],
                  ),
                  if (run.isAdminClosed) ...[
                    const SizedBox(height: 8),
                    QdBadge(tr('Closed by admin'), tone: QdTone.error, dot: true),
                    if (_reasonOf(run) != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        '${tr('Reason')}: ${_reasonOf(run)!}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, color: c.mutedForeground),
                      ),
                    ],
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            Icon(Icons.chevron_right_rounded, size: 22, color: c.mutedForeground),
          ],
        ),
      ),
    );
  }
}

String? _reasonOf(JobHistoryItem r) {
  final t = r.cancelReason?.trim();
  return t == null || t.isEmpty ? null : t;
}

/// Read-only summary of a ride an admin closed: ride ID, status, reason and when it was closed.
Future<void> _showClosedRideDetails(BuildContext context, JobHistoryItem run) {
  final c = context.bc;
  final closed = run.completedAt ?? run.scheduledAt;
  Widget row(String label, String value) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.foreground)),
      ],
    ),
  );
  return showBcConfirm(
    context,
    icon: Icons.assignment_late_outlined,
    tone: BcDialogTone.danger,
    title: tr('Ride closed by admin'),
    confirmLabel: tr('OK'),
    content: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        row(tr('Ride ID'), Format.rideIdLabel(run.rideCode, run.id)),
        row(tr('Status'), tr('Closed by admin')),
        row(tr('Reason'), _reasonOf(run) ?? tr('No reason was given.')),
        row(tr('Closed on'), Format.dateTime(closed)),
        row(tr('Branch'), run.storeName.trim().isEmpty ? '—' : run.storeName.trim()),
      ],
    ),
  ).then((_) {});
}

class _Meta extends StatelessWidget {
  const _Meta(this.icon, this.label);
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: c.mutedForeground),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 14, color: c.mutedForeground),
          ),
        ),
      ],
    );
  }
}

class _DayGroup {
  final String label;
  final List<JobHistoryItem> runs;
  const _DayGroup(this.label, this.runs);
}

DateTime? _localDate(String? iso) {
  final t = Format.toLocal(iso);
  return t == null ? null : DateTime(t.year, t.month, t.day);
}

List<_DayGroup> _groupByDay(List<JobHistoryItem> items) {
  final map = <DateTime?, List<JobHistoryItem>>{};
  for (final r in items) {
    map.putIfAbsent(_localDate(r.completedAt ?? r.scheduledAt), () => []).add(r);
  }
  final keys = map.keys.toList()
    ..sort((a, b) {
      if (a == null) return 1;
      if (b == null) return -1;
      return b.compareTo(a);
    });
  final fmt = DateFormat('EEE, MMM d', L10n.dateLocale);
  return [for (final k in keys) _DayGroup(k == null ? tr('Earlier') : fmt.format(k), map[k]!)];
}

bool _isCompleted(JobHistoryItem i) =>
    i.status == 'COMPLETED' &&
    i.displayStatus != 'VEHICLE_FAILURE' &&
    i.displayStatus != 'ABANDONED' &&
    i.displayStatus != 'CANCELLED';

bool _isCancelled(JobHistoryItem i) =>
    i.isAdminClosed ||
    i.status == 'ABANDONED' ||
    i.status == 'CANCELLED' ||
    i.displayStatus == 'ABANDONED' ||
    i.displayStatus == 'CANCELLED' ||
    i.title.toLowerCase().contains('cancelled');
