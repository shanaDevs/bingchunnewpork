import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../state/jobs_controller.dart';
import '../components/headers.dart';
import '../components/surfaces.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

enum _HistoryFilter {
  allTime('All Time'),
  today('Today'),
  thisWeek('This Week'),
  thisMonth('This Month');

  const _HistoryFilter(this.label);
  final String label;
}

/// Outcome narrowing picked from a summary tile (tap again or "View all" to clear).
enum _Outcome { completed, delivered, cancelled, vehicleFailure }

/// Driver Delivery History — port of HistoryScreen.kt.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.onOpenJob, this.onViewJobs});

  final void Function(JobSummary job) onOpenJob;
  final VoidCallback? onViewJobs;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  _HistoryFilter _filter = _HistoryFilter.allTime;
  _Outcome? _outcome;

  @override
  void initState() {
    super.initState();
    context.read<JobsController>().loadHistory();
  }

  void _setFilter(_HistoryFilter f) {
    BcFeedback.tap();
    setState(() => _filter = f);
  }

  void _toggleOutcome(_Outcome o) {
    BcFeedback.tap();
    setState(() => _outcome = _outcome == o ? null : o);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();

    final filtered = vm.history.where((r) {
      final at = r.completedAt ?? r.scheduledAt;
      return switch (_filter) {
        _HistoryFilter.allTime => true,
        _HistoryFilter.today => Format.isToday(at),
        _HistoryFilter.thisWeek => _withinWeek(at),
        _HistoryFilter.thisMonth => _withinMonth(at),
      };
    }).toList();

    final completedRuns = filtered.where(_isCompleted).length;
    final ordersDelivered = filtered.fold<int>(0, (s, r) => s + r.deliveredCount);
    final cancelledRuns = filtered.where(_isCancelled).length;
    final vehicleFailureRuns = filtered.where(_isVehicleFailure).length;
    final totalEarned = filtered.fold<int>(0, (s, r) => s + r.deliveredTotal);

    final listed = switch (_outcome) {
      null => filtered,
      _Outcome.completed => filtered.where(_isCompleted).toList(),
      _Outcome.delivered => filtered.where((r) => r.deliveredCount > 0).toList(),
      _Outcome.cancelled => filtered.where(_isCancelled).toList(),
      _Outcome.vehicleFailure => filtered.where(_isVehicleFailure).toList(),
    };
    final groups = _groupByDay(listed);

    Future<void> refresh() async {
      BcFeedback.refresh();
      await vm.loadHistory(force: true);
    }

    final dark = c.isDark;
    final children = <Widget>[
      _EarningsCard(
        totalEarned: totalEarned,
        completedRuns: completedRuns,
        filter: _filter,
        onFilter: _setFilter,
        dailyEarnings: _lastSevenDays(vm.history),
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _MetricTile(
              icon: Icons.check_rounded,
              bg: dark ? const Color(0xFF064E3B) : const Color(0xFFDCFCE7),
              tint: c.success,
              count: completedRuns,
              label: tr('Completed runs'),
              caption: tr('Successful deliveries'),
              selected: _outcome == _Outcome.completed,
              onTap: () => _toggleOutcome(_Outcome.completed),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MetricTile(
              icon: Icons.inventory_2_outlined,
              bg: c.brandSubtle,
              tint: c.brand,
              count: ordersDelivered,
              label: tr('Orders delivered'),
              caption: tr('Total orders'),
              selected: _outcome == _Outcome.delivered,
              onTap: () => _toggleOutcome(_Outcome.delivered),
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: _MetricTile(
              icon: Icons.close_rounded,
              bg: dark ? const Color(0xFF3B1E22) : const Color(0xFFFEE2E2),
              tint: c.danger,
              count: cancelledRuns,
              label: tr('Cancelled runs'),
              caption: tr('Cancelled by you'),
              selected: _outcome == _Outcome.cancelled,
              onTap: () => _toggleOutcome(_Outcome.cancelled),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _MetricTile(
              icon: Icons.warning_amber_rounded,
              bg: dark ? const Color(0xFF2E2415) : const Color(0xFFFEF3C7),
              tint: c.warning,
              count: vehicleFailureRuns,
              label: tr('Vehicle failures'),
              caption: tr('Reported issues'),
              selected: _outcome == _Outcome.vehicleFailure,
              onTap: () => _toggleOutcome(_Outcome.vehicleFailure),
            ),
          ),
        ],
      ),
      _RecentHeader(
        filter: _filter,
        onFilter: _setFilter,
        canReset: _filter != _HistoryFilter.allTime || _outcome != null,
        onViewAll: () {
          BcFeedback.tap();
          setState(() {
            _filter = _HistoryFilter.allTime;
            _outcome = null;
          });
        },
      ),
    ];
    if (vm.historyLoading && vm.history.isEmpty) {
      children.add(const BcJobsSkeleton());
    } else if (vm.historyError != null && vm.history.isEmpty) {
      children.add(
        SizedBox(
          height: 260,
          child: BcErrorState(message: vm.historyError!, onRetry: () => vm.loadHistory(force: true)),
        ),
      );
    } else if (listed.isEmpty) {
      children.add(
        _HistoryEmpty(
          title: switch (_outcome) {
            _Outcome.cancelled => tr('No cancelled runs'),
            _Outcome.vehicleFailure => tr('No vehicle failures'),
            _ when _filter != _HistoryFilter.allTime => tr('No runs for {p1}', {
              'p1': tr(_filter.label).toLowerCase(),
            }),
            _ => tr('No completed runs yet'),
          },
          onViewJobs: widget.onViewJobs,
        ),
      );
    } else {
      for (final g in groups) {
        children.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 14, 4, 8),
            child: Row(
              children: [
                Text(
                  g.label,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.textMuted),
                ),
                const SizedBox(width: 10),
                Expanded(child: Container(height: 1, color: c.border)),
              ],
            ),
          ),
        );
        for (final run in g.runs) {
          children.add(
            _HistoryItemCard(
              run: run,
              // A cancelled run has gone back to the branch pool — there is no ride left to open.
              onTap: _isCancelled(run)
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

    return BcTabScaffold(
      title: tr('Delivery History'),
      titleBar: true,
      heroArt: true,
      subtitle: tr('Track your completed runs and earnings'),
      actions: [BcHeaderIconButton(icon: Icons.refresh, tooltip: tr('Refresh'), onTap: refresh)],
      onRefresh: refresh,
      children: children,
    );
  }
}

/// Earnings per calendar day for the last 7 days (oldest first) — drives the mini bars.
List<int> _lastSevenDays(List<JobHistoryItem> history) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  return [
    for (var i = 6; i >= 0; i--)
      history
          .where((r) => _localDate(r.completedAt ?? r.scheduledAt) == today.subtract(Duration(days: i)))
          .fold<int>(0, (s, r) => s + r.deliveredTotal),
  ];
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({
    required this.totalEarned,
    required this.completedRuns,
    required this.filter,
    required this.onFilter,
    required this.dailyEarnings,
  });

  final int totalEarned;
  final int completedRuns;
  final _HistoryFilter filter;
  final ValueChanged<_HistoryFilter> onFilter;
  final List<int> dailyEarnings;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return BcCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(18)),
            child: Icon(Icons.account_balance_wallet_rounded, color: c.brand, size: 30),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tr('Total earned'), style: TextStyle(fontSize: 13, color: c.textMuted)),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    Format.money(totalEarned),
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: c.text),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  tr('Across {completedRuns} completed runs', {'completedRuns': completedRuns}),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12.5, color: c.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _PeriodDropdown(filter: filter, onFilter: onFilter),
              const SizedBox(height: 12),
              SizedBox(width: 92, height: 46, child: CustomPaint(painter: _MiniBarsPainter(dailyEarnings, c.brand))),
            ],
          ),
        ],
      ),
    );
  }
}

class _PeriodDropdown extends StatelessWidget {
  const _PeriodDropdown({required this.filter, required this.onFilter});
  final _HistoryFilter filter;
  final ValueChanged<_HistoryFilter> onFilter;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return PopupMenuButton<_HistoryFilter>(
      tooltip: tr('Period'),
      initialValue: filter,
      onSelected: onFilter,
      position: PopupMenuPosition.under,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      color: c.card,
      itemBuilder: (_) => [
        for (final f in _HistoryFilter.values)
          PopupMenuItem(
            value: f,
            child: Text(
              tr(f.label),
              style: TextStyle(
                color: f == filter ? c.brand : c.text,
                fontWeight: f == filter ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
        decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(10)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              tr(filter.label),
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.brand),
            ),
            Icon(Icons.arrow_drop_down_rounded, color: c.brand, size: 20),
          ],
        ),
      ),
    );
  }
}

/// Seven soft bars; real daily earnings when there are any, otherwise a faint placeholder rhythm.
class _MiniBarsPainter extends CustomPainter {
  _MiniBarsPainter(this.values, this.color);
  final List<int> values;
  final Color color;

  static const _placeholder = [0.3, 0.55, 0.85, 0.5, 0.42, 0.7, 0.35];

  @override
  void paint(Canvas canvas, Size size) {
    final maxV = values.fold<int>(0, math.max);
    final n = values.length;
    final gap = 5.0;
    final bw = (size.width - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) {
      final f = maxV == 0 ? _placeholder[i % _placeholder.length] : math.max(0.18, values[i] / maxV);
      final h = size.height * f;
      final rect = Rect.fromLTWH(i * (bw + gap), size.height - h, bw, h);
      final strong = maxV == 0 ? i == 5 : values[i] == maxV;
      canvas.drawRRect(
        RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(4), topRight: const Radius.circular(4)),
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              color.withValues(alpha: strong ? 0.75 : 0.28),
              color.withValues(alpha: strong ? 0.35 : 0.08),
            ],
          ).createShader(rect),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _MiniBarsPainter old) => old.values != values || old.color != color;
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.icon,
    required this.bg,
    required this.tint,
    required this.count,
    required this.label,
    required this.caption,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final Color bg;
  final Color tint;
  final int count;
  final String label;
  final String caption;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Semantics(
      button: true,
      selected: selected,
      child: AnimatedContainer(
        duration: BcMotion.standard,
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(BcRadius.card),
          border: Border.all(color: selected ? tint : c.border, width: selected ? 1.5 : 1),
          boxShadow: c.cardShadow.a == 0
              ? null
              : [BoxShadow(color: c.cardShadow, blurRadius: 16, offset: const Offset(0, 5))],
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(BcRadius.card),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Icon + count on top, chevron in the corner: the label below gets the full card width.
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
                        child: Icon(icon, color: tint, size: 22),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            '$count',
                            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: c.text, height: 1.1),
                          ),
                        ),
                      ),
                      Icon(
                        selected ? Icons.close_rounded : Icons.chevron_right_rounded,
                        color: selected ? tint : c.textMuted,
                        size: 20,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.text, height: 1.25),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    caption,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11.5, color: c.textMuted, height: 1.3),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RecentHeader extends StatelessWidget {
  const _RecentHeader({required this.filter, required this.onFilter, required this.canReset, required this.onViewAll});

  final _HistoryFilter filter;
  final ValueChanged<_HistoryFilter> onFilter;
  final bool canReset;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 24, 0, 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  tr('Recent history'),
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c.text),
                ),
              ),
              AnimatedOpacity(
                duration: BcMotion.fast,
                opacity: canReset ? 1 : 0.55,
                child: TextButton(
                  onPressed: canReset ? onViewAll : null,
                  style: TextButton.styleFrom(
                    foregroundColor: c.brand,
                    disabledForegroundColor: c.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(tr('View all'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 2),
                      const Icon(Icons.chevron_right_rounded, size: 20),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            children: [
              for (final f in _HistoryFilter.values) ...[
                Semantics(
                  button: true,
                  selected: f == filter,
                  child: GestureDetector(
                    onTap: () => onFilter(f),
                    child: AnimatedContainer(
                      duration: BcMotion.standard,
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                      decoration: BoxDecoration(
                        color: f == filter ? c.brand : c.card,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: f == filter ? c.brand : c.border),
                        boxShadow: f == filter
                            ? [
                                BoxShadow(
                                  color: c.brand.withValues(alpha: 0.28),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4),
                                ),
                              ]
                            : null,
                      ),
                      child: Text(
                        tr(f.label),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: f == filter ? FontWeight.w700 : FontWeight.w500,
                          color: f == filter ? Colors.white : c.text,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }
}

/// Empty history: soft blob with an open tray, clouds and trees, then a call to action.
class _HistoryEmpty extends StatelessWidget {
  const _HistoryEmpty({required this.title, required this.onViewJobs});
  final String title;
  final VoidCallback? onViewJobs;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Column(
        children: [
          SizedBox(
            height: 170,
            width: double.infinity,
            child: CustomPaint(
              painter: _EmptyScenePainter(c.brand, c.isDark),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.only(top: 34),
                  child: Icon(Icons.inbox_rounded, size: 84, color: c.brand.withValues(alpha: 0.55)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: c.text),
          ),
          const SizedBox(height: 6),
          Text(
            tr('Finished rides and deliveries will appear here.'),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: c.textMuted),
          ),
          if (onViewJobs != null) ...[
            const SizedBox(height: 20),
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(BcRadius.button + 2),
                gradient: LinearGradient(colors: [c.brandLight, c.brand, c.brandDark]),
                boxShadow: [
                  BoxShadow(color: c.brand.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 6)),
                ],
              ),
              child: Material(
                type: MaterialType.transparency,
                borderRadius: BorderRadius.circular(BcRadius.button + 2),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onViewJobs,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 15),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.manage_search_rounded, color: Colors.white, size: 22),
                        const SizedBox(width: 10),
                        Text(
                          tr('View available jobs'),
                          style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptyScenePainter extends CustomPainter {
  _EmptyScenePainter(this.brand, this.dark);
  final Color brand;
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final soft = Paint()..color = brand.withValues(alpha: dark ? 0.10 : 0.07);
    // Hill blob
    canvas.drawPath(
      Path()
        ..moveTo(cx - 150, h - 18)
        ..cubicTo(cx - 140, h - 120, cx - 60, h - 150, cx, h - 140)
        ..cubicTo(cx + 70, h - 150, cx + 140, h - 110, cx + 150, h - 18)
        ..close(),
      soft,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h - 16), width: 300, height: 6),
        const Radius.circular(3),
      ),
      soft,
    );
    // Clouds
    final cloud = Paint()..color = brand.withValues(alpha: dark ? 0.16 : 0.12);
    void puff(double x, double y, double s) {
      canvas.drawCircle(Offset(x, y), 8 * s, cloud);
      canvas.drawCircle(Offset(x + 10 * s, y - 5 * s), 10 * s, cloud);
      canvas.drawCircle(Offset(x + 21 * s, y), 8 * s, cloud);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x - 6 * s, y - 1 * s, 34 * s, 9 * s), Radius.circular(4 * s)),
        cloud,
      );
    }

    puff(cx - 120, h * 0.42, 1);
    puff(cx + 92, h * 0.25, 1.1);
    // Trees
    final tree = Paint()..color = brand.withValues(alpha: dark ? 0.22 : 0.18);
    for (final x in [cx - 98, cx + 104]) {
      canvas.drawOval(Rect.fromCenter(center: Offset(x, h - 52), width: 20, height: 34), tree);
      canvas.drawRect(Rect.fromLTWH(x - 1.5, h - 40, 3, 24), tree);
    }
    // Dots
    final dot = Paint()..color = brand.withValues(alpha: 0.3);
    for (final o in [
      Offset(cx - 130, h * 0.28),
      Offset(cx + 135, h * 0.55),
      Offset(cx - 80, h * 0.62),
      Offset(cx + 110, h * 0.7),
    ]) {
      canvas.drawCircle(o, 2.5, dot);
    }
    // "New" spark lines above the tray
    final spark = Paint()
      ..color = brand.withValues(alpha: 0.8)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx, h * 0.18), Offset(cx, h * 0.28), spark);
    canvas.drawLine(Offset(cx - 26, h * 0.26), Offset(cx - 18, h * 0.33), spark);
    canvas.drawLine(Offset(cx + 26, h * 0.26), Offset(cx + 18, h * 0.33), spark);
  }

  @override
  bool shouldRepaint(covariant _EmptyScenePainter old) => old.brand != brand || old.dark != dark;
}

class _HistoryItemCard extends StatelessWidget {
  const _HistoryItemCard({required this.run, this.onTap});

  final JobHistoryItem run;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vehFailure = _isVehicleFailure(run);
    final cancelled = _isCancelled(run);
    final accent = vehFailure
        ? c.warning
        : cancelled
        ? c.danger
        : run.isIncomplete
        ? c.warning
        : c.success;
    final orders = trn(run.orderCount, '{n} order', '{n} orders');
    final titleText = vehFailure
        ? tr('Vehicle failure · {orders}', {'orders': orders})
        : cancelled
        ? tr('Cancelled · {orders}', {'orders': orders})
        : (run.title.trim().isEmpty ? tr('Delivery · {orders}', {'orders': orders}) : run.title);
    final place = [run.storeName, run.storeCity].where((s) => s.trim().isNotEmpty).join(' · ');
    final chipStatus = (run.displayStatus?.trim().isNotEmpty ?? false) ? run.displayStatus! : run.status;

    return BcCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 3, color: accent),
            const SizedBox(width: 12),
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
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.textMuted),
                        ),
                      ),
                      const SizedBox(width: 8),
                      StatusChip(chipStatus),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    titleText,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text),
                  ),
                  if (place.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      place,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: c.textMuted),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Container(height: 1, color: c.border),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              Format.dateTime(run.completedAt ?? run.scheduledAt),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 12, color: c.textMuted),
                            ),
                            const SizedBox(height: 2),
                            if (cancelled && (run.cancelReason?.trim().isNotEmpty ?? false))
                              Text(
                                tr('Reason: {reason}', {'reason': run.cancelReason!.trim()}),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.danger),
                              )
                            else
                              Text(
                                tr('{deliveredCount}/{orderCount} delivered', {
                                  'deliveredCount': run.deliveredCount,
                                  'orderCount': run.orderCount,
                                }),
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.text),
                              ),
                          ],
                        ),
                      ),
                      if (run.complaintCount > 0) ...[
                        Icon(Icons.warning, size: 14, color: c.warning),
                        const SizedBox(width: 3),
                        Text(
                          '${run.complaintCount}',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.warning),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        Format.money(run.deliveredTotal),
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.brand),
                      ),
                      if (onTap != null) ...[
                        const SizedBox(width: 4),
                        Icon(Icons.arrow_forward_ios, size: 12, color: c.textMuted),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
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
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
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
  final fmt = DateFormat('d MMM', L10n.dateLocale);
  return [
    for (final k in keys)
      _DayGroup(
        k == null
            ? tr('Earlier')
            : k == today
            ? tr('Today')
            : k == yesterday
            ? tr('Yesterday')
            : fmt.format(k),
        map[k]!,
      ),
  ];
}

bool _isCompleted(JobHistoryItem i) =>
    i.status == 'COMPLETED' &&
    i.displayStatus != 'VEHICLE_FAILURE' &&
    i.displayStatus != 'ABANDONED' &&
    i.displayStatus != 'CANCELLED';

bool _isCancelled(JobHistoryItem i) =>
    i.status == 'ABANDONED' ||
    i.status == 'CANCELLED' ||
    i.displayStatus == 'ABANDONED' ||
    i.displayStatus == 'CANCELLED' ||
    i.title.toLowerCase().contains('cancelled');

bool _isVehicleFailure(JobHistoryItem i) =>
    i.status == 'VEHICLE_FAILURE' ||
    i.displayStatus == 'VEHICLE_FAILURE' ||
    i.title.toLowerCase().contains('vehicle failure');

bool _withinWeek(String? iso) {
  final d = _localDate(iso);
  if (d == null) return false;
  final now = DateTime.now();
  final days = DateTime(now.year, now.month, now.day).difference(d).inDays;
  return days >= 0 && days <= 7;
}

bool _withinMonth(String? iso) {
  final d = _localDate(iso);
  if (d == null) return false;
  final now = DateTime.now();
  return d.year == now.year && d.month == now.month;
}
