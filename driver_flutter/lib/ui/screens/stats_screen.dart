import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/format.dart';
import '../../data/models/delivery_job.dart';
import '../../state/jobs_controller.dart';
import '../../state/stats_controller.dart';
import '../components/driver_ops.dart';
import '../components/surfaces.dart';
import '../components/tab_scaffold.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Driver performance and earnings statistics — port of StatsScreen.kt.
class StatsScreen extends StatelessWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => StatsController(ctx.read<AppContainer>())..load(period: StatsPeriod.month),
      child: const _StatsBody(),
    );
  }
}

class _StatsBody extends StatefulWidget {
  const _StatsBody();

  @override
  State<_StatsBody> createState() => _StatsBodyState();
}

class _StatsBodyState extends State<_StatsBody> {
  @override
  void initState() {
    super.initState();
    final vm = context.read<JobsController>();
    vm.loadHistory();
    vm.load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final s = context.watch<StatsController>();

    final totals = s.stats?.totals;
    final totalDelivered = totals?.deliveredStops ?? vm.history.fold<int>(0, (a, r) => a + r.deliveredCount);
    final totalRuns = totals?.completedRuns ?? vm.history.length;
    final totalEarnings = totals?.earningsLkr ?? vm.history.fold<int>(0, (a, r) => a + r.deliveredTotal);
    final distanceLabel = Format.km(totals?.totalDistanceKm ?? 0);
    final rating = s.ratingsAverage ?? s.stats?.rating.average ?? vm.profile?.avgRating ?? 5.0;
    final ratingCount = s.ratingsCount > 0 ? s.ratingsCount : (s.stats?.rating.count ?? vm.profile?.ratingCount ?? 0);
    final meritPoints = s.stats?.merit.points ?? vm.profile?.meritPoints;
    final rawStatus = s.stats?.merit.status ?? vm.profile?.meritStatus;
    final meritStatus = (rawStatus == null || rawStatus.trim().isEmpty) ? null : rawStatus.toUpperCase();
    final meritMissing = meritPoints == null && meritStatus == null;
    final meritValue = meritMissing ? '—' : '${meritPoints ?? 0}';
    final pending = s.loading && s.stats == null;
    final error = s.stats == null ? s.error : null;

    return BcTabScaffold(
      title: tr('Performance &'),
      titleAccent: tr('Stats'),
      titleBar: true,
      heroArt: true,
      subtitle: tr('Your delivery performance at a glance'),
      heroExtra: _PeriodChips(
        selected: s.period,
        onSelect: (p) => s.load(period: p, force: true),
      ),
      onRefresh: () => s.load(force: true),
      children: [
        if (pending)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CircularProgressIndicator(color: c.brand)),
          )
        else if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 32),
            child: Text(error, style: TextStyle(color: c.textMuted, fontSize: 14)),
          )
        else ...[
          _HeroEarnings(totalEarnings: totalEarnings, completedRuns: totalRuns),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  icon: Icons.inventory_2_outlined,
                  iconBg: c.brandSubtle,
                  iconTint: c.brand,
                  label: tr('Delivered Orders'),
                  value: '$totalDelivered',
                  subtitle: tr('{totalRuns} delivery runs', {'totalRuns': totalRuns}),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  icon: Icons.star_outline,
                  iconBg: c.warningSubtle,
                  iconTint: c.warning,
                  label: tr('Driver Rating'),
                  value: rating.toStringAsFixed(1),
                  subtitle: rating >= 4.8
                      ? tr('Top rated')
                      : ratingCount > 0
                      ? '$ratingCount reviews'
                      : tr('Top rated'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  icon: Icons.trending_up,
                  iconBg: c.accent.withValues(alpha: 0.16),
                  iconTint: c.accent,
                  label: tr('Merit Score'),
                  value: meritValue,
                  subtitle: meritStatus == null ? '—' : tr(meritStatus),
                  subtitleColor: meritStatus == null ? c.textMuted : c.accent,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  icon: Icons.local_shipping_outlined,
                  iconBg: c.successSubtle,
                  iconTint: c.success,
                  label: tr('Distance'),
                  value: distanceLabel,
                  subtitle: tr('In this period'),
                ),
              ),
            ],
          ),
          if (meritStatus != null) ...[const SizedBox(height: 16), _StandingBanner(meritStatus: meritStatus)],
        ],
        const SizedBox(height: 16),
        _PerformanceTrends(history: vm.history),
        if (s.ratings.isNotEmpty || s.ratingsLoading) ...[
          const SizedBox(height: 16),
          RiderReviewsSection(ratings: s.ratings, loading: s.ratingsLoading),
        ],
      ],
    );
  }
}

/// Period selector shown inside the gradient hero.
class _PeriodChips extends StatelessWidget {
  const _PeriodChips({required this.selected, required this.onSelect});

  final StatsPeriod selected;
  final ValueChanged<StatsPeriod> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          for (final p in StatsPeriod.values)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onSelect(p),
                child: AnimatedContainer(
                  duration: BcMotion.standard,
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: p == selected ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      tr(p.label),
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: p == selected ? FontWeight.w700 : FontWeight.w500,
                        color: p == selected ? c.brandDark : Colors.white,
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

class _HeroEarnings extends StatelessWidget {
  const _HeroEarnings({required this.totalEarnings, required this.completedRuns});
  final int totalEarnings;
  final int completedRuns;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(BcRadius.card),
        gradient: LinearGradient(
          colors: [c.brandLight, c.brand, c.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [BoxShadow(color: c.brand.withValues(alpha: 0.28), blurRadius: 20, offset: const Offset(0, 10))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _EarningsDecorPainter())),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        tr('Total earned'),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.88),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          Format.money(totalEarnings),
                          style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        tr('Across {completedRuns} completed runs', {'completedRuns': completedRuns}),
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const _CoinStack(),
                const SizedBox(width: 8),
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
                  ),
                  child: const Icon(Icons.account_balance_wallet_outlined, color: Colors.white, size: 27),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Faint rising bars + a circle in the earnings card background.
class _EarningsDecorPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final p = Paint()..color = Colors.white.withValues(alpha: 0.07);
    canvas.drawCircle(Offset(w * 0.98, h * 0.05), h * 0.55, p);
    const heights = [0.25, 0.4, 0.32, 0.55, 0.7];
    for (var i = 0; i < heights.length; i++) {
      final bh = h * heights[i];
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(w * 0.42 + i * 14, h - bh, 9, bh), const Radius.circular(3)),
        p,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Small stack of gold coins.
class _CoinStack extends StatelessWidget {
  const _CoinStack();

  @override
  Widget build(BuildContext context) {
    Widget coin(double bottom) => Positioned(
      bottom: bottom,
      left: 0,
      child: Container(
        width: 30,
        height: 10,
        decoration: BoxDecoration(
          color: const Color(0xFFFFC94D),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: const Color(0xFFE0A21B), width: 1.2),
        ),
      ),
    );
    return SizedBox(width: 30, height: 44, child: Stack(children: [coin(0), coin(7), coin(14), coin(21), coin(28)]));
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.iconBg,
    required this.iconTint,
    required this.label,
    required this.value,
    required this.subtitle,
    this.subtitleColor,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconTint;
  final String label;
  final String value;
  final String subtitle;
  final Color? subtitleColor;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return BcCard(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: iconTint, size: 21),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: c.textMuted, fontSize: 12, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    style: TextStyle(color: c.text, fontSize: 22, fontWeight: FontWeight.w800),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: subtitleColor ?? c.textMuted,
                    fontSize: 12,
                    fontWeight: subtitleColor != null && subtitle != '—' ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StandingBanner extends StatelessWidget {
  const _StandingBanner({required this.meritStatus});
  final String meritStatus;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final excellent = meritStatus.toUpperCase() == 'EXCELLENT';
    final lower = meritStatus.toLowerCase();
    final title = excellent
        ? tr('Great performance')
        : L10n.isZh
        ? tr(meritStatus.toUpperCase())
        : (lower.isEmpty ? lower : lower[0].toUpperCase() + lower.substring(1));
    final detail = excellent ? tr('Keep up the good work!') : tr('Your current merit standing');
    final bg = c.isDark ? const Color(0xFF16233B) : const Color(0xFFEBF3FD);
    final border = c.isDark ? const Color(0xFF1E3A5F) : const Color(0xFFE2EAF8);
    final wave = c.isDark ? const Color(0xFF1E304F) : const Color(0xFFDEEBFA);
    final trophyBg = c.isDark ? const Color(0xFF1E3A8A) : const Color(0xFFD6E7FD);
    final trophyTint = c.isDark ? const Color(0xFF60A5FA) : const Color(0xFF2563EB);
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: c.isDark ? const Color(0x33000000) : const Color(0x100F172A),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: CustomPaint(
        painter: _BannerWavePainter(wave),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(shape: BoxShape.circle, color: trophyBg),
                child: Icon(Icons.emoji_events_outlined, color: trophyTint, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(color: c.text, fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(detail, style: TextStyle(color: c.textMuted, fontSize: 13)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(width: 56, height: 40, child: CustomPaint(painter: _MiniChartPainter(trophyTint))),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tiny rising bar chart with a sparkle, used as the banner's trailing graphic.
class _MiniChartPainter extends CustomPainter {
  _MiniChartPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    const heights = [0.35, 0.55, 0.8];
    for (var i = 0; i < heights.length; i++) {
      final bh = h * heights[i];
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(i * 13.0, h - bh, 9, bh), const Radius.circular(3)),
        Paint()..color = color.withValues(alpha: 0.35 + i * 0.25),
      );
    }
    // Four-point sparkle.
    final cx = w - 9;
    final cy = h * 0.28;
    const r = 7.0;
    final star = Path()
      ..moveTo(cx, cy - r)
      ..quadraticBezierTo(cx, cy, cx + r, cy)
      ..quadraticBezierTo(cx, cy, cx, cy + r)
      ..quadraticBezierTo(cx, cy, cx - r, cy)
      ..quadraticBezierTo(cx, cy, cx, cy - r)
      ..close();
    canvas.drawPath(star, Paint()..color = const Color(0xFFFFC94D));
  }

  @override
  bool shouldRepaint(covariant _MiniChartPainter old) => old.color != color;
}

class _BannerWavePainter extends CustomPainter {
  _BannerWavePainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final path = Path()
      ..moveTo(w * 0.65, h)
      ..cubicTo(w * 0.78, h * 0.55, w * 0.90, h * 0.85, w, h * 0.40)
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _BannerWavePainter old) => old.color != color;
}

/// What the weekly chart is measuring.
enum _TrendMetric { stops, earnings }

/// Last 7 calendar days of delivered stops (or earnings). One series, one axis, real data only:
/// summary tiles on top, then a bar chart with recessive gridlines, selective value labels
/// (today + best day) and tap-for-detail. Empty weeks get an honest empty state, not fake bars.
class _PerformanceTrends extends StatefulWidget {
  const _PerformanceTrends({required this.history});
  final List<JobHistoryItem> history;

  @override
  State<_PerformanceTrends> createState() => _PerformanceTrendsState();
}

class _PerformanceTrendsState extends State<_PerformanceTrends> {
  _TrendMetric _metric = _TrendMetric.stops;
  int? _selected;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = [for (var i = 6; i >= 0; i--) today.subtract(Duration(days: i))];
    final values = days.map((d) {
      var sum = 0;
      for (final item in widget.history) {
        final t = Format.toLocal(item.completedAt ?? item.scheduledAt);
        if (t != null && DateTime(t.year, t.month, t.day) == d) {
          sum += _metric == _TrendMetric.stops ? item.deliveredCount : item.deliveredTotal;
        }
      }
      return sum;
    }).toList();
    final total = values.fold<int>(0, (a, b) => a + b);
    final hasActivity = total > 0;
    final best = values.fold<int>(0, (a, b) => b > a ? b : a);
    final bestIndex = hasActivity ? values.indexOf(best) : -1;
    final activeDays = values.where((v) => v > 0).length;
    final avg = activeDays == 0 ? 0 : (total / 7).round();
    final weekday = DateFormat('EEE', L10n.dateLocale);
    String fmt(int v) => _metric == _TrendMetric.stops ? '$v' : Format.money(v);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(BcRadius.card),
        border: Border.all(color: c.border),
        boxShadow: c.cardShadow.a == 0
            ? null
            : [BoxShadow(color: c.cardShadow, blurRadius: 16, offset: const Offset(0, 5))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.insights_rounded, color: c.brand, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tr('Last 7 days'),
                      style: TextStyle(color: c.text, fontSize: 16, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _metric == _TrendMetric.stops ? tr('Delivered stops by day') : tr('Earnings by day'),
                      style: TextStyle(color: c.textMuted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              _MetricToggle(
                value: _metric,
                onChanged: (m) => setState(() {
                  _metric = m;
                  _selected = null;
                }),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Headline numbers — the chart supports them, not the other way round.
          Row(
            children: [
              Expanded(
                child: _TrendStat(label: tr('Total'), value: fmt(total), emphasis: true),
              ),
              Expanded(
                child: _TrendStat(label: tr('Best day'), value: hasActivity ? weekday.format(days[bestIndex]) : '—'),
              ),
              Expanded(
                child: _TrendStat(label: tr('Daily avg'), value: hasActivity ? fmt(avg) : '—'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 168,
            child: hasActivity
                ? _WeekBars(
                    values: values,
                    labels: [for (final d in days) weekday.format(d)],
                    todayIndex: 6,
                    bestIndex: bestIndex,
                    selected: _selected,
                    format: fmt,
                    onSelect: (i) => setState(() => _selected = _selected == i ? null : i),
                  )
                : _WeekEmpty(labels: [for (final d in days) weekday.format(d)]),
          ),
        ],
      ),
    );
  }
}

/// Stops | Earnings segmented switch.
class _MetricToggle extends StatelessWidget {
  const _MetricToggle({required this.value, required this.onChanged});
  final _TrendMetric value;
  final ValueChanged<_TrendMetric> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    Widget seg(_TrendMetric m, String label) {
      final on = m == value;
      return Semantics(
        button: true,
        selected: on,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => onChanged(m),
          child: AnimatedContainer(
            duration: BcMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: on ? c.card : Colors.transparent,
              borderRadius: BorderRadius.circular(9),
              boxShadow: on ? const [BoxShadow(color: Color(0x140A2647), blurRadius: 6, offset: Offset(0, 2))] : null,
            ),
            child: Text(
              label,
              style: TextStyle(
                color: on ? c.text : c.textMuted,
                fontSize: 12,
                fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: c.isDark ? c.surfaceElevated : c.iconTile,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [seg(_TrendMetric.stops, tr('Stops')), seg(_TrendMetric.earnings, tr('Earnings'))],
      ),
    );
  }
}

class _TrendStat extends StatelessWidget {
  const _TrendStat({required this.label, required this.value, this.emphasis = false});
  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: c.textMuted, fontSize: 11.5, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: TextStyle(
              color: emphasis ? c.brand : c.text,
              fontSize: emphasis ? 20 : 17,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

/// Seven rounded bars on a recessive dashed grid. Labels only on today, the best day,
/// and the tapped bar; the rest stay quiet so the shape reads first.
class _WeekBars extends StatelessWidget {
  const _WeekBars({
    required this.values,
    required this.labels,
    required this.todayIndex,
    required this.bestIndex,
    required this.selected,
    required this.format,
    required this.onSelect,
  });

  final List<int> values;
  final List<String> labels;
  final int todayIndex;
  final int bestIndex;
  final int? selected;
  final String Function(int) format;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final maxV = values.fold<int>(0, (a, b) => b > a ? b : a);
    const labelBand = 20.0; // room for value labels above bars
    const axisBand = 22.0; // weekday labels
    return LayoutBuilder(
      builder: (context, box) {
        final plotH = box.maxHeight - labelBand - axisBand;
        return Stack(
          children: [
            // Gridlines at 0, ½ and max — recessive, dashed.
            for (final f in [0.0, 0.5, 1.0])
              Positioned(
                left: 0,
                right: 0,
                top: labelBand + plotH * (1 - f),
                child: CustomPaint(
                  size: const Size(double.infinity, 1),
                  painter: _DashPainter(c.border.withValues(alpha: f == 0 ? 1 : 0.7), dashed: f != 0),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < values.length; i++)
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque, // whole column is the hit target
                      onTap: () => onSelect(i),
                      child: Semantics(
                        label: '${labels[i]}: ${format(values[i])}',
                        button: true,
                        selected: selected == i,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            SizedBox(
                              height: labelBand,
                              child: (i == todayIndex || i == bestIndex || i == selected) && values[i] > 0
                                  ? FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Text(
                                        format(values[i]),
                                        style: TextStyle(
                                          color: i == selected || i == todayIndex ? c.text : c.textMuted,
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    )
                                  : null,
                            ),
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0, end: maxV == 0 ? 0 : values[i] / maxV),
                              duration: const Duration(milliseconds: 600),
                              curve: Curves.easeOutCubic,
                              builder: (_, f, _) {
                                final h = values[i] == 0 ? 3.0 : (plotH * f).clamp(6.0, plotH);
                                final strong = i == todayIndex || i == selected;
                                return Container(
                                  width: 22,
                                  height: h,
                                  decoration: BoxDecoration(
                                    // 4px rounded data end, anchored to the baseline.
                                    borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                                    color: values[i] == 0 ? c.border : null,
                                    gradient: values[i] == 0
                                        ? null
                                        : LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            colors: strong
                                                ? [c.brandLight, c.brand]
                                                : [c.brand.withValues(alpha: 0.45), c.brand.withValues(alpha: 0.28)],
                                          ),
                                  ),
                                );
                              },
                            ),
                            SizedBox(
                              height: axisBand,
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: i == todayIndex ? c.brand : Colors.transparent,
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                  child: Text(
                                    labels[i],
                                    style: TextStyle(
                                      color: i == todayIndex ? Colors.white : c.textMuted,
                                      fontSize: 11,
                                      fontWeight: i == todayIndex ? FontWeight.w800 : FontWeight.w500,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

/// No activity this week: a quiet baseline with weekday ticks and a short message.
class _WeekEmpty extends StatelessWidget {
  const _WeekEmpty({required this.labels});
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Column(
      children: [
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: c.brandSubtle),
                  child: Icon(Icons.show_chart_rounded, color: c.brand, size: 22),
                ),
                const SizedBox(height: 10),
                Text(
                  tr('No deliveries in the last 7 days'),
                  style: TextStyle(color: c.text, fontSize: 14, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  tr('Your daily progress will show up here.'),
                  style: TextStyle(color: c.textMuted, fontSize: 12.5),
                ),
              ],
            ),
          ),
        ),
        CustomPaint(size: const Size(double.infinity, 1), painter: _DashPainter(c.border, dashed: false)),
        const SizedBox(height: 6),
        Row(
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Center(
                  child: Text(
                    labels[i],
                    style: TextStyle(
                      color: i == labels.length - 1 ? c.brand : c.textMuted,
                      fontSize: 11,
                      fontWeight: i == labels.length - 1 ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _DashPainter extends CustomPainter {
  _DashPainter(this.color, {required this.dashed});
  final Color color;
  final bool dashed;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 1;
    if (!dashed) {
      canvas.drawLine(Offset.zero, Offset(size.width, 0), p);
      return;
    }
    for (var x = 0.0; x < size.width; x += 7) {
      canvas.drawLine(Offset(x, 0), Offset(x + 3.5, 0), p);
    }
  }

  @override
  bool shouldRepaint(covariant _DashPainter old) => old.color != color || old.dashed != dashed;
}
