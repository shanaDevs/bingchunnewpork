import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../core/offer_outcomes.dart';
import '../../data/models/delivery_job.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../../state/jobs_controller.dart';
import '../../state/stats_controller.dart';
import '../components/driver_ops.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import '../../core/feedback.dart';
import 'delivered_orders_screen.dart';
import 'shifts_screen.dart';

/// Activity tab (QuickDrop `activity.tsx`): period control, live shift banner, stat tiles,
/// completed-jobs chart and shortcuts. Data comes from [StatsController] + job history.
class StatsScreen extends StatelessWidget {
  const StatsScreen({super.key, this.onOpenJobs});

  /// Switches the home shell to the Jobs tab ("Job history").
  final VoidCallback? onOpenJobs;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => StatsController(ctx.read<AppContainer>())..load(period: StatsPeriod.week),
      child: _StatsBody(onOpenJobs: onOpenJobs),
    );
  }
}

const _periods = [StatsPeriod.today, StatsPeriod.week, StatsPeriod.month];

String _periodLabel(StatsPeriod p) => switch (p) {
  StatsPeriod.today => tr('Today'),
  StatsPeriod.week => tr('Week'),
  _ => tr('Month'),
};

String _periodHint(StatsPeriod p) => switch (p) {
  StatsPeriod.today => tr('Today so far'),
  StatsPeriod.week => tr('Last 7 days'),
  _ => tr('Last 30 days'),
};

class _StatsBody extends StatefulWidget {
  const _StatsBody({this.onOpenJobs});
  final VoidCallback? onOpenJobs;

  @override
  State<_StatsBody> createState() => _StatsBodyState();
}

class _StatsBodyState extends State<_StatsBody> {
  DriverShiftEntry? _shift;
  bool? _lastOnline;

  @override
  void initState() {
    super.initState();
    final vm = context.read<JobsController>();
    vm.loadHistory();
    vm.load();
  }

  Future<void> _loadShift() async {
    final vm = context.read<JobsController>();
    try {
      final all = await vm.getShiftHistory();
      if (!mounted) return;
      final open = all.where((s) => s.endedAt == null).toList();
      setState(() => _shift = vm.isOnline && open.isNotEmpty ? open.first : null);
    } catch (_) {}
  }

  void _openShifts() {
    final vm = context.read<JobsController>();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChangeNotifierProvider<JobsController>.value(value: vm, child: const ShiftsScreen()),
      ),
    );
  }

  DateTime _rangeStart(StatsPeriod p) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return switch (p) {
      StatsPeriod.today => today,
      StatsPeriod.week => today.subtract(const Duration(days: 6)),
      _ => today.subtract(const Duration(days: 29)),
    };
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final s = context.watch<StatsController>();

    if (_lastOnline != vm.isOnline) {
      _lastOnline = vm.isOnline;
      if (!vm.isOnline) {
        _shift = null;
      } else {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _loadShift();
        });
      }
    }

    final totals = s.stats?.totals;
    final start = _rangeStart(s.period);
    final inRange = [
      for (final j in vm.history)
        if (Format.toLocal(j.completedAt ?? j.scheduledAt) case final t? when !t.isBefore(start)) j,
    ];
    final totalDelivered = totals?.deliveredStops ?? inRange.fold<int>(0, (a, r) => a + r.deliveredCount);
    final totalRuns = totals?.completedRuns ?? inRange.length;
    final totalEarnings = totals?.earningsLkr ?? inRange.fold<int>(0, (a, r) => a + r.deliveredTotal);
    final issues = inRange.fold<int>(0, (a, r) => a + r.complaintCount);
    final avgDelivery = totals?.averageDeliveryMinutes;
    final onlineMinutes = totals?.onlineMinutes;

    final pending = s.loading && s.stats == null;
    final error = s.stats == null ? s.error : null;

    final tiles = <Widget>[
      _StatTile(icon: Icons.route_rounded, label: tr('Completed jobs'), value: '$totalRuns'),
      _StatTile(
        icon: Icons.inventory_2_outlined,
        label: tr('Delivered orders'),
        value: '$totalDelivered',
        onTap: () {
          BcFeedback.tap();
          Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => DeliveredOrdersScreen(jobs: inRange)),
          );
        },
      ),
      _StatTile(
        icon: Icons.schedule_rounded,
        label: tr('Online time'),
        value: onlineMinutes == null ? '—' : Format.duration(onlineMinutes),
      ),
      _StatTile(
        icon: Icons.timer_outlined,
        label: tr('Avg. delivery time'),
        value: avgDelivery == null ? '—' : Format.minutes(avgDelivery),
      ),
      _StatTile(
        icon: Icons.account_balance_wallet_outlined,
        label: tr('Earnings'),
        value: Format.money(totalEarnings),
        valueColor: c.successStrong,
      ),
      _StatTile(icon: Icons.flag_outlined, label: tr('Reported issues'), value: '$issues'),
    ];

    return BcTabScaffold(
      title: tr('Activity'),
      onRefresh: () async {
        _loadShift();
        await s.load(force: true);
        await vm.loadHistory(force: true);
      },
      children: [
        _Segmented(selected: s.period, onSelect: (p) => s.load(period: p, force: true)),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Text(_periodHint(s.period), style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        ),
        if (_shift != null && Format.toLocal(_shift!.startedAt) != null) ...[
          const SizedBox(height: 16),
          _ShiftBanner(since: Format.toLocal(_shift!.startedAt)!, onTap: _openShifts),
        ],
        const SizedBox(height: 16),
        if (pending)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CircularProgressIndicator(color: c.primary)),
          )
        else if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 24),
            child: Text(error, style: TextStyle(color: c.mutedForeground, fontSize: 14)),
          )
        else
          for (var i = 0; i < tiles.length; i += 2)
            Padding(
              padding: EdgeInsets.only(bottom: i + 2 < tiles.length ? 10 : 0),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: tiles[i]),
                    const SizedBox(width: 10),
                    Expanded(child: i + 1 < tiles.length ? tiles[i + 1] : const SizedBox.shrink()),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 16),
        ListenableBuilder(
          listenable: OfferOutcomes.instance,
          builder: (_, _) {
            final local = OfferOutcomes.instance.counts(from: start);
            final server = s.stats?.offers;
            // The server counts accepted and declined offers; missed ones only exist on this phone.
            final counts = server == null
                ? local
                : OfferOutcomeCounts(
                    accepted: server.accepted,
                    declined: server.declined,
                    missed: server.missed + local.missed,
                  );
            return _AcceptanceCard(counts: counts);
          },
        ),
        const SizedBox(height: 24),
        _CompletedJobsChart(period: s.period, history: vm.history),
        const SizedBox(height: 24),
        QdGroup(
          children: [
            QdRow(
              icon: Icons.calendar_month_outlined,
              title: tr('Shift history'),
              subtitle: tr('Every online session, recorded automatically'),
              onTap: _openShifts,
            ),
            QdRow(
              icon: Icons.assignment_outlined,
              title: tr('Job history'),
              subtitle: tr('Search and filter past jobs'),
              onTap: widget.onOpenJobs,
            ),
          ],
        ),
        if (s.ratings.isNotEmpty || s.ratingsLoading) ...[
          const SizedBox(height: 24),
          RiderReviewsSection(ratings: s.ratings, loading: s.ratingsLoading),
        ],
      ],
    );
  }
}

/// Segmented control (QuickDrop SegmentedControl): recessed track, raised selected pill.
class _Segmented extends StatelessWidget {
  const _Segmented({required this.selected, required this.onSelect});

  final StatsPeriod selected;
  final ValueChanged<StatsPeriod> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.isDark ? c.surface : c.border,
        borderRadius: BorderRadius.circular(BcRadius.full),
        border: c.isDark ? Border.all(color: c.border) : null,
      ),
      child: Row(
        children: [
          for (final p in _periods)
            Expanded(
              child: Semantics(
                button: true,
                selected: p == selected,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    if (p != selected) onSelect(p);
                  },
                  child: AnimatedContainer(
                    duration: BcMotion.standard,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: p == selected ? (c.isDark ? c.elevated : c.surface) : Colors.transparent,
                      borderRadius: BorderRadius.circular(BcRadius.full),
                      boxShadow: p == selected ? bcShadow(c) : null,
                    ),
                    child: Text(
                      _periodLabel(p),
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: p == selected ? FontWeight.w700 : FontWeight.w500,
                        color: p == selected ? c.foreground : c.mutedForeground,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Yellow "on shift now" banner with the live elapsed clock.
class _ShiftBanner extends StatelessWidget {
  const _ShiftBanner({required this.since, required this.onTap});
  final DateTime since;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      label: tr('On shift now'),
      child: Material(
        color: c.accent,
        borderRadius: BorderRadius.circular(BcRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(BcRadius.md),
          onTap: onTap,
          child: Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: c.inverse, shape: BoxShape.circle)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    tr('On shift now'),
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.accentForeground),
                  ),
                ),
                ElapsedClock(
                  since: since,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.accentForeground),
                ),
                const SizedBox(width: 4),
                Icon(Icons.chevron_right_rounded, size: 24, color: c.accentForeground),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One headline number with its label (QuickDrop StatTile).
class _StatTile extends StatelessWidget {
  const _StatTile({required this.icon, required this.label, required this.value, this.valueColor, this.onTap});

  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.sm)),
            child: Icon(icon, color: c.primaryStrong, size: 22),
          ),
          const SizedBox(height: 12),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              maxLines: 1,
              style: TextStyle(fontSize: 22, height: 28 / 22, fontWeight: FontWeight.w700, color: valueColor ?? c.foreground),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c.mutedForeground, fontSize: 13, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

/// Offer outcomes for the period (QuickDrop OfferOutcomes): accepted share, segmented bar, legend.
class _AcceptanceCard extends StatelessWidget {
  const _AcceptanceCard({required this.counts});
  final OfferOutcomeCounts counts;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final dark = c.isDark;
    final okColor = dark ? const Color(0xFF34D399) : const Color(0xFF16845C);
    final declinedColor = dark ? const Color(0xFF3B9CFF) : const Color(0xFF2684FC);
    final missedColor = dark ? const Color(0xFFFBBF24) : const Color(0xFFE49A25);
    final total = counts.total;
    final pct = total == 0 ? null : (counts.accepted * 100 / total).round();

    final rows = [
      (Icons.check_circle_outline_rounded, tr('Accepted'), counts.accepted, okColor),
      (Icons.cancel_outlined, tr('Declined'), counts.declined, declinedColor),
      (Icons.schedule_rounded, tr('Missed'), counts.missed, missedColor),
    ];

    return QdCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(tr('Acceptance rate'), style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          const SizedBox(height: 2),
          Text(
            pct == null ? '—' : '$pct%',
            style: TextStyle(fontFamily: 'Inter', fontSize: 28, height: 34 / 28, fontWeight: FontWeight.w700, color: c.foreground),
          ),
          Text(
            total == 0
                ? tr('No offers in this period yet.')
                : tr('{accepted} of {total} offers accepted', {'accepted': counts.accepted, 'total': total}),
            style: TextStyle(fontSize: 14, color: c.mutedForeground),
          ),
          const SizedBox(height: 16),
          // Thin segmented bar: the outer ends are fully rounded, segments meet with a small gap.
          // With no offers yet it is just an empty track.
          SizedBox(
            height: 8,
            child: total == 0
                ? DecoratedBox(
                    decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(BcRadius.full)),
                  )
                : Row(
                    // Stretch: an empty DecoratedBox is zero-high unless the row gives it the bar height.
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: () {
                      final parts = rows.where((r) => r.$3 > 0).toList();
                      return [
                        for (var i = 0; i < parts.length; i++) ...[
                          if (i > 0) const SizedBox(width: 2),
                          Expanded(
                            flex: parts[i].$3,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: parts[i].$4,
                                borderRadius: BorderRadius.horizontal(
                                  left: Radius.circular(i == 0 ? 4 : 0),
                                  right: Radius.circular(i == parts.length - 1 ? 4 : 0),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ];
                    }(),
                  ),
          ),
          const SizedBox(height: 16),
          // Each outcome by name, icon and count, so nothing relies on colour alone.
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
              child: Row(
                children: [
                  Container(width: 10, height: 10, decoration: BoxDecoration(color: rows[i].$4, shape: BoxShape.circle)),
                  const SizedBox(width: 12),
                  Icon(rows[i].$1, size: 18, color: c.mutedForeground),
                  const SizedBox(width: 10),
                  Expanded(child: Text(rows[i].$2, style: TextStyle(fontSize: 16, color: c.foreground))),
                  Text(
                    '${rows[i].$3}',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Completed jobs per hour (today) or per day (week / month): flat bars, peak tick, tap a bar.
class _CompletedJobsChart extends StatefulWidget {
  const _CompletedJobsChart({required this.period, required this.history});
  final StatsPeriod period;
  final List<JobHistoryItem> history;

  @override
  State<_CompletedJobsChart> createState() => _CompletedJobsChartState();
}

class _CompletedJobsChartState extends State<_CompletedJobsChart> {
  int? _selected;

  @override
  void didUpdateWidget(covariant _CompletedJobsChart old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) _selected = null;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final hourly = widget.period == StatsPeriod.today;
    final n = hourly ? 24 : (widget.period == StatsPeriod.week ? 7 : 30);
    final starts = [
      for (var i = 0; i < n; i++)
        hourly
            ? DateTime(today.year, today.month, today.day, i)
            : DateTime(today.year, today.month, today.day - (n - 1 - i)),
    ];
    final counts = List<int>.filled(n, 0);
    for (final j in widget.history) {
      if (!(j.displayStatus ?? j.status).toUpperCase().contains('COMPLETED')) continue;
      final t = Format.toLocal(j.completedAt);
      if (t == null) continue;
      final idx = hourly
          ? (DateTime(t.year, t.month, t.day) == today ? t.hour : -1)
          : starts.indexWhere((d) => d.year == t.year && d.month == t.month && d.day == t.day);
      if (idx >= 0 && idx < n) counts[idx]++;
    }
    final max = counts.fold<int>(0, (a, b) => b > a ? b : a);
    final top = max < 1 ? 1 : max;
    final step = hourly ? 6 : (widget.period == StatsPeriod.week ? 1 : 5);
    final loc = L10n.dateLocale;
    String label(DateTime d) => hourly
        ? DateFormat('h a', loc).format(d)
        : widget.period == StatsPeriod.week
        ? DateFormat('EEE', loc).format(d)
        : DateFormat('MMM d', loc).format(d);

    final sel = _selected;
    final caption = sel != null
        ? tr('{label}: {count} completed', {'label': label(starts[sel]), 'count': counts[sel]})
        : max > 0
        ? tr('Tap a bar to see its total.')
        : tr('No completed jobs in this period yet.');

    const plotH = 128.0;
    const headroom = 18.0;
    const axisH = 22.0;

    return QdCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            hourly ? tr('Completed Jobs by Hour') : tr('Completed Jobs by Day'),
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.foreground),
          ),
          const SizedBox(height: 2),
          Text(caption, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, box) {
              final slot = box.maxWidth / n;
              final barW = (slot - 2).clamp(2.0, 24.0);
              return Column(
                children: [
                  SizedBox(
                    height: plotH,
                    child: Stack(
                      children: [
                        Positioned(left: 0, right: 0, top: headroom, child: Container(height: 1, color: c.border)),
                        Positioned(
                          left: 0,
                          top: 0,
                          child: Text('$top', style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                        ),
                        Positioned(left: 0, right: 0, bottom: 0, child: Container(height: 1, color: c.border)),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (var i = 0; i < n; i++)
                              GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => setState(() => _selected = _selected == i ? null : i),
                                child: Semantics(
                                  button: true,
                                  selected: sel == i,
                                  label: tr('{label}: {count} completed', {'label': label(starts[i]), 'count': counts[i]}),
                                  child: SizedBox(
                                    width: slot,
                                    height: plotH,
                                    child: Align(
                                      alignment: Alignment.bottomCenter,
                                      child: counts[i] == 0
                                          ? null
                                          : Container(
                                              width: barW,
                                              height: counts[i] / top * (plotH - headroom),
                                              decoration: BoxDecoration(
                                                borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                                                color: c.primary.withValues(alpha: sel != null && sel != i ? 0.35 : 1),
                                              ),
                                            ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: axisH,
                    child: Stack(
                      children: [
                        for (var i = 0; i < n; i += step)
                          Positioned(
                            left: (i * slot + slot / 2 - slot * step / 2).clamp(0.0, (box.maxWidth - slot * step).clamp(0.0, box.maxWidth)),
                            width: slot * step,
                            top: 4,
                            child: Text(
                              label(starts[i]),
                              maxLines: 1,
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: c.mutedForeground),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
